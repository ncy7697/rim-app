import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function exchangeCode(code: string, redirectUri: string, clientId: string) {
  const restKey = clientId || Deno.env.get('KAKAO_REST_API_KEY') || ''
  const clientSecret = Deno.env.get('KAKAO_CLIENT_SECRET') || ''
  if (!restKey) {
    throw new Error('카카오 REST API 키가 없습니다.')
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: restKey,
    redirect_uri: redirectUri,
    code,
  })
  if (clientSecret) body.set('client_secret', clientSecret)
  const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body,
  })
  const tokenJson = await tokenRes.json()
  if (!tokenRes.ok || !tokenJson.access_token) {
    const kakaoError = String(tokenJson.error_description || tokenJson.error || '카카오 토큰을 받지 못했습니다.')
    if (/client credentials|invalid_client|client_secret/i.test(kakaoError)) {
      throw new Error(
        '카카오 Client Secret이 필요합니다. 카카오 디벨로퍼스 → 앱 → 플랫폼 키 → REST API 키에서 Client Secret을 만든 뒤 알려 주세요.'
      )
    }
    throw new Error(kakaoError)
  }
  return String(tokenJson.access_token)
}

async function fetchKakaoProfile(accessToken: string) {
  const res = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
  })
  const json = await res.json()
  if (!res.ok || json.id == null) {
    throw new Error(json.msg || json.message || '카카오 프로필을 읽지 못했습니다.')
  }
  const account = json.kakao_account || {}
  const profile = account.profile || {}
  const birthdayRaw = String(account.birthday || '')
  const birthyear = String(account.birthyear || '')
  const birthday =
    birthdayRaw.length === 4 ? `${birthdayRaw.slice(0, 2)}-${birthdayRaw.slice(2, 4)}` : ''
  const birthdate =
    /^\d{4}$/.test(birthyear) && /^\d{2}-\d{2}$/.test(birthday) ? `${birthyear}-${birthday}` : null
  return {
    kakaoId: String(json.id),
    name: String(profile.nickname || account.name || '카카오 회원').trim(),
    email: String(account.email || '').trim(),
    birthdate,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'POST만 허용됩니다.' })
  try {
    const body = await req.json().catch(() => ({}))
    const accessToken = String(body.accessToken || '').trim()
    const token = accessToken
      || (body.code
        ? await exchangeCode(String(body.code), String(body.redirectUri || ''), String(body.clientId || ''))
        : '')
    if (!token) return jsonResponse(400, { error: '카카오 인증 정보가 없습니다.' })

    const profile = await fetchKakaoProfile(token)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, serviceKey)
    const { data, error } = await supabase.rpc('login_or_register_kakao', {
      p_kakao_id: profile.kakaoId,
      p_name: profile.name,
      p_email: profile.email || null,
      p_birthdate: profile.birthdate,
    })
    if (error) return jsonResponse(500, { error: error.message })
    const user = Array.isArray(data) ? data[0] : data
    if (!user) return jsonResponse(500, { error: '카카오 회원 정보를 만들지 못했습니다.' })
    return jsonResponse(200, { user })
  } catch (err) {
    const message = err instanceof Error ? err.message : '카카오 로그인에 실패했습니다.'
    return jsonResponse(500, { error: message })
  }
})
