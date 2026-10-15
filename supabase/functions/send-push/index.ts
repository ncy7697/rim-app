import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ServiceAccount = {
  client_email: string
  private_key: string
  project_id: string
}

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

function b64url(data: ArrayBuffer | string) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let str = ''
  for (const byte of bytes) str += String.fromCharCode(byte)
  return btoa(str).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function getAccessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({
      iss: account.client_email,
      sub: account.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    })
  )
  const unsigned = `${header}.${payload}`
  const pem = account.private_key.replaceAll('\\n', '\n')
  const pkcs8 = pem.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '')
  const keyData = Uint8Array.from(atob(pkcs8), (ch) => ch.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const jwt = `${unsigned}.${b64url(signature)}`
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const tokenJson = await tokenRes.json()
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description || tokenJson.error || 'FCM 액세스 토큰을 받지 못했습니다.')
  }
  return tokenJson.access_token as string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return jsonResponse(405, { error: 'POST만 허용됩니다.' })

  try {
    return await handlePush(req)
  } catch (err) {
    const message = err instanceof Error ? err.message : '푸시 발송에 실패했습니다.'
    return jsonResponse(500, { error: message })
  }
})

async function handlePush(req: Request) {

  const secret = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
  if (!secret) {
    return jsonResponse(501, {
      error: 'FIREBASE_SERVICE_ACCOUNT_JSON 시크릿이 없습니다. Firebase 서비스 계정 JSON을 Edge Function 시크릿에 넣어 주세요.',
    })
  }

  let account: ServiceAccount
  try {
    account = JSON.parse(secret)
  } catch {
    return jsonResponse(500, { error: '서비스 계정 JSON을 읽지 못했습니다.' })
  }
  if (!account.client_email || !account.private_key || !account.project_id) {
    return jsonResponse(500, { error: '서비스 계정 JSON에 client_email, private_key, project_id가 필요합니다.' })
  }

  const body = await req.json().catch(() => ({}))
  const userIds = Array.isArray(body.userIds) ? body.userIds.map(String).filter(Boolean) : []
  const title = String(body.title || '').trim()
  const text = String(body.body || '').trim()
  const data = body.data && typeof body.data === 'object' ? body.data : {}
  if (!userIds.length || !title) return jsonResponse(400, { error: 'userIds와 title이 필요합니다.' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: tokens, error } = await supabase.rpc('list_user_fcm_tokens', { p_user_ids: userIds })
  if (error) return jsonResponse(500, { error: error.message })
  const list = (tokens || []) as { token: string }[]
  if (!list.length) return jsonResponse(200, { sent: 0, skipped: 'no_tokens' })

  const accessToken = await getAccessToken(account)
  let sent = 0
  const failed: string[] = []
  for (const row of list) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: row.token,
          notification: { title, body: text },
          data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value ?? '')])),
          android: { priority: 'HIGH' },
        },
      }),
    })
    if (res.ok) sent += 1
    else failed.push(await res.text())
  }
  return jsonResponse(200, { sent, failed: failed.slice(0, 3) })
}
