export const APP_URL_SCHEME = 'rim'
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.ncy.rim'
const PENDING_INVITE_KEY = 'bb_pending_invite'

export type AppDeepLink =
  | { kind: 'invite'; code: string }
  | { kind: 'attend'; clubId: string; sessionId: string }
  | { kind: 'game'; gameId: string }

function isPrivateHost(host: string) {
  const name = host.toLowerCase()
  return (
    name === 'localhost' ||
    name === '127.0.0.1' ||
    name === '0.0.0.0' ||
    name === '::1' ||
    name === '10.0.2.2' ||
    name.endsWith('.local')
  )
}

export function publicAppOrigin(): string {
  const fromEnv = String(import.meta.env.VITE_PUBLIC_APP_URL || '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (typeof window === 'undefined') return ''
  try {
    const origin = window.location.origin
    const host = new URL(origin).hostname
    if (!origin || isPrivateHost(host)) return ''
    return origin
  } catch {
    return ''
  }
}

export function appPageUrl(query: Record<string, string>): string {
  const origin = publicAppOrigin()
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value)
  }
  if (origin) return `${origin}/?${params.toString()}`
  if (query.invite && Object.keys(query).length === 1) {
    return `${APP_URL_SCHEME}://invite?code=${encodeURIComponent(query.invite)}`
  }
  if (query.attend) {
    return `${APP_URL_SCHEME}://attend?club=${encodeURIComponent(query.attend)}&session=${encodeURIComponent(query.session || '')}`
  }
  if (query.game) {
    return `${APP_URL_SCHEME}://game?id=${encodeURIComponent(query.game)}`
  }
  return `${APP_URL_SCHEME}://open?${params.toString()}`
}

export function parseAppLink(url: string | null | undefined): AppDeepLink | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const params = parsed.searchParams
  const invite = (params.get('invite') || params.get('code') || '').trim().toUpperCase()
  const attend = (params.get('attend') || params.get('club') || '').trim()
  const session = (params.get('session') || '').trim()
  const game = (params.get('game') || params.get('id') || '').trim()
  const host = parsed.hostname.toLowerCase()
  const pathParts = parsed.pathname.split('/').filter(Boolean)

  if (parsed.protocol === `${APP_URL_SCHEME}:`) {
    if (host === 'invite') {
      const fromPath = pathParts[0]?.trim().toUpperCase()
      if (invite || fromPath) return { kind: 'invite', code: invite || fromPath }
    }
    if (host === 'attend' && attend && session) {
      return { kind: 'attend', clubId: attend, sessionId: session }
    }
    if (host === 'game' && game) return { kind: 'game', gameId: game }
  }

  if (pathParts[0] === 'invite' && pathParts[1]) {
    return { kind: 'invite', code: pathParts[1].trim().toUpperCase() }
  }
  if (invite) return { kind: 'invite', code: invite }
  if (attend && session) return { kind: 'attend', clubId: attend, sessionId: session }
  if (game) return { kind: 'game', gameId: game }
  return null
}

export function rememberInviteCode(code: string) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(PENDING_INVITE_KEY, code.trim().toUpperCase())
}

export function peekPendingInviteCode(): string | null {
  if (typeof window === 'undefined') return null
  const code = window.sessionStorage.getItem(PENDING_INVITE_KEY)
  return code ? code.trim().toUpperCase() : null
}

export function takePendingInviteCode(): string | null {
  const code = peekPendingInviteCode()
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(PENDING_INVITE_KEY)
  return code
}

export function inviteShareText(clubName: string, code: string, url: string) {
  return [
    `[림] ${clubName} 동아리에 초대합니다.`,
    `초대 코드: ${code}`,
    url,
    `림 앱이 있으면 링크가 앱으로 열립니다. 없으면 Play 스토어에서 림을 설치한 뒤 초대 코드를 입력하세요.`,
    PLAY_STORE_URL,
  ].join('\n')
}

export async function readLaunchAppUrl(): Promise<string | null> {
  try {
    const { App } = await import('@capacitor/app')
    const launch = await App.getLaunchUrl()
    return launch?.url || null
  } catch {
    return null
  }
}

export async function subscribeAppUrlOpen(onUrl: (url: string) => void): Promise<() => void> {
  try {
    const { App } = await import('@capacitor/app')
    const handle = await App.addListener('appUrlOpen', (event) => {
      if (event?.url) onUrl(event.url)
    })
    return () => {
      void handle.remove()
    }
  } catch {
    return () => {}
  }
}
