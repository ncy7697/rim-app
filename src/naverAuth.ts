import { Capacitor } from '@capacitor/core'
import { supabase } from './supabaseClient'
import { saveCurrentUser } from './authSession'

const STATE_KEY = 'bb_naver_oauth_state'

export type NaverUser = {
  id: string
  name: string
  birthdate?: string
  height?: number | null
  weight?: number | null
  position?: string
  login_id?: string
  is_platform_admin?: boolean
}

export function naverClientId() {
  return String(import.meta.env.VITE_NAVER_CLIENT_ID || '').trim()
}

export function naverRedirectUri() {
  if (typeof window === 'undefined') return 'http://localhost:5173/'
  if (Capacitor.isNativePlatform()) return 'https://localhost/'
  return `${window.location.origin}/`
}

export function hasNaverCallback() {
  if (typeof window === 'undefined') return false
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const search = new URLSearchParams(window.location.search)
  const state = hash.get('state') || search.get('state') || ''
  if (state.startsWith('kk_')) return false
  return Boolean(hash.get('access_token') || (search.get('code') && state.startsWith('nv_')) || (search.get('error') && state.startsWith('nv_')))
}

export function startNaverLogin() {
  const clientId = naverClientId()
  if (!clientId) {
    throw new Error('네이버 애플리케이션 Client ID가 없습니다. .env의 VITE_NAVER_CLIENT_ID를 설정해 주세요.')
  }
  const state = `nv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  localStorage.setItem(STATE_KEY, state)
  const params = new URLSearchParams({
    response_type: 'token',
    client_id: clientId,
    redirect_uri: naverRedirectUri(),
    state,
  })
  window.location.assign(`https://nid.naver.com/oauth2.0/authorize?${params.toString()}`)
}

function clearNaverParams() {
  window.history.replaceState(null, '', window.location.pathname)
}

export async function consumeNaverCallback(): Promise<NaverUser | null> {
  if (typeof window === 'undefined') return null
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const search = new URLSearchParams(window.location.search)
  const error = hash.get('error') || search.get('error')
  const accessToken = hash.get('access_token')
  const code = search.get('code')
  const state = hash.get('state') || search.get('state') || ''
  if (state.startsWith('kk_')) return null
  if (!error && !accessToken && !code) return null
  if (code && !accessToken && !state.startsWith('nv_')) return null

  const expected = localStorage.getItem(STATE_KEY)
  localStorage.removeItem(STATE_KEY)
  clearNaverParams()

  if (error) {
    if (error === 'access_denied') throw new Error('네이버 로그인을 취소했습니다.')
    throw new Error('네이버 로그인을 완료하지 못했습니다.')
  }
  if (!expected || !state || expected !== state) {
    throw new Error('네이버 로그인 정보가 만료되었습니다. 다시 시도해 주세요.')
  }

  const { data, error: invokeError } = await supabase.functions.invoke('login-naver', {
    body: accessToken ? { accessToken } : { code, state, redirectUri: naverRedirectUri() },
  })
  if (invokeError) throw new Error(invokeError.message || '네이버 로그인에 실패했습니다.')
  const payload = data as { user?: NaverUser; error?: string } | null
  if (payload?.error) throw new Error(payload.error)
  if (!payload?.user?.id) throw new Error('네이버 회원 정보를 받지 못했습니다.')
  saveCurrentUser(payload.user)
  return payload.user
}
