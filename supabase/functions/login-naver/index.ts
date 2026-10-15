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

async function exchangeCode(code: string, redirectUri: string, state: string) {
  const clientId = Deno.env.get('NAVER_CLIENT_ID') || ''
  const clientSecret = Deno.env.get('NAVER_CLIENT_SECRET') || ''
  if (!clientId || !clientSecret) {
    throw new Error('네이버 Client Secret이 없습니다. Edge Function 시크릿 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET을 넣어 주세요.')
  }
  const tokenRes = await fetch('https://nid.naver.com/oauth2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      state,
      redirect_uri: redirectUri,
    }),
  })
  const tokenJson = await tokenRes.json()
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description || tokenJson.error || '네이버 토큰을 받지 못했습니다.')
  }
  return String(tokenJson.access_token)
}

async function fetchNaverProfile(accessToken: string) {
  const res = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const json = await res.json()
  if (!res.ok || json.resultcode !== '00' || !json.response?.id) {
    throw new Error(json.message || '네이버 프로필을 읽지 못했습니다.')
  }
  const profile = json.response as {
    id: string
    name?: string
    nickname?: string
    email?: string
    birthyear?: string
    birthday?: string
  }
  const birthdate =
    profile.birthyear && profile.birthday && /^\d{4}$/.test(profile.birthyear) && /^\d{2}-\d{2}$/.test(profile.birthday)
      ? `${profile.birthyear}-${profile.birthday}`
      : null
  return {
    naverId: String(profile.id),
    name: String(profile.name || profile.nickname || '네이버 회원').trim(),
    email: String(profile.email || '').trim(),
    birthdate,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'POST만 허용됩니다.' })
  try {
    const body = await req.json().catch(() => ({}))
    let accessToken = String(body.accessToken || '').trim()
    if (!accessToken && body.code) {
      accessToken = await exchangeCode(String(body.code), String(body.redirectUri || ''), String(body.state || ''))
    }
    if (!accessToken) return jsonResponse(400, { error: '네이버 인증 정보가 없습니다.' })

    const profile = await fetchNaverProfile(accessToken)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, serviceKey)
    const { data, error } = await supabase.rpc('login_or_register_naver', {
      p_naver_id: profile.naverId,
      p_name: profile.name,
      p_email: profile.email || null,
      p_birthdate: profile.birthdate,
    })
    if (error) return jsonResponse(500, { error: error.message })
    const user = Array.isArray(data) ? data[0] : data
    if (!user) return jsonResponse(500, { error: '네이버 회원 정보를 만들지 못했습니다.' })
    return jsonResponse(200, { user })
  } catch (err) {
    const message = err instanceof Error ? err.message : '네이버 로그인에 실패했습니다.'
    return jsonResponse(500, { error: message })
  }
})
