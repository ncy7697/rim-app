import { Capacitor } from '@capacitor/core'
import { supabase } from './supabaseClient'
import { saveCurrentUser } from './authSession'
import type { NaverUser } from './naverAuth'

const STATE_KEY = 'bb_kakao_oauth_state'

export function kakaoRestKey() {
  return String(import.meta.env.VITE_KAKAO_REST_API_KEY || import.meta.env.VITE_KAKAO_CLIENT_ID || '').trim()
}

export function kakaoRedirectUri() {
  if (typeof window === 'undefined') return 'http://localhost:5173/'
  if (Capacitor.isNativePlatform()) return 'https://localhost/'
  return `${window.location.origin}/`
}

export function hasKakaoCallback() {
  if (typeof window === 'undefined') return false
  const search = new URLSearchParams(window.location.search)
  const state = search.get('state') || ''
  return state.startsWith('kk_') && Boolean(search.get('code') || search.get('error'))
}

export function startKakaoLogin() {
  const clientId = kakaoRestKey()
  if (!clientId) {
    throw new Error('카카오 REST API 키가 없습니다. .env의 VITE_KAKAO_REST_API_KEY를 설정해 주세요.')
  }
  const redirectUri = kakaoRedirectUri()
  const state = `kk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  localStorage.setItem(STATE_KEY, state)
  localStorage.setItem(`${STATE_KEY}_uri`, redirectUri)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  })
  window.location.assign(`https://kauth.kakao.com/oauth/authorize?${params.toString()}`)
}

function clearOauthParams() {
  window.history.replaceState(null, '', window.location.pathname)
}

export async function consumeKakaoCallback(): Promise<NaverUser | null> {
  if (typeof window === 'undefined') return null
  const search = new URLSearchParams(window.location.search)
  const error = search.get('error')
  const code = search.get('code')
  const state = search.get('state') || ''
  if (!state.startsWith('kk_')) return null
  if (!error && !code) return null

  const expected = localStorage.getItem(STATE_KEY)
  const savedRedirect = localStorage.getItem(`${STATE_KEY}_uri`)
  localStorage.removeItem(STATE_KEY)
  localStorage.removeItem(`${STATE_KEY}_uri`)
  clearOauthParams()

  if (error) {
    if (error === 'access_denied') throw new Error('카카오 로그인을 취소했습니다.')
    throw new Error('카카오 로그인을 완료하지 못했습니다.')
  }
  if (!expected || expected !== state) {
    throw new Error('카카오 로그인 정보가 만료되었습니다. 다시 시도해 주세요.')
  }

  const { data, error: invokeError } = await supabase.functions.invoke('login-kakao', {
    body: {
      code,
      state,
      redirectUri: savedRedirect || kakaoRedirectUri(),
      clientId: kakaoRestKey(),
    },
  })
  if (invokeError) {
    let detail = invokeError.message || '카카오 로그인에 실패했습니다.'
    const ctx = (invokeError as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json()
        if (body?.error) detail = String(body.error)
      } catch {
        /* ignore */
      }
    } else if (data && typeof data === 'object' && 'error' in data) {
      detail = String((data as { error?: string }).error || detail)
    }
    throw new Error(detail)
  }
  const payload = data as { user?: NaverUser; error?: string } | null
  if (payload?.error) throw new Error(payload.error)
  if (!payload?.user?.id) throw new Error('카카오 회원 정보를 받지 못했습니다.')
  saveCurrentUser(payload.user)
  return payload.user
}
