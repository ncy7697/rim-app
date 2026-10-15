const AUTH_KEY = 'currentUser'

export function readSavedUser<T = unknown>(): T | null {
  if (typeof window === 'undefined') return null
  const fromLocal = localStorage.getItem(AUTH_KEY)
  const fromSession = sessionStorage.getItem(AUTH_KEY)
  const raw = fromLocal || fromSession
  if (!raw) return null
  try {
    const user = JSON.parse(raw) as T
    if (!fromLocal && fromSession) localStorage.setItem(AUTH_KEY, fromSession)
    if (fromSession) sessionStorage.removeItem(AUTH_KEY)
    return user
  } catch {
    localStorage.removeItem(AUTH_KEY)
    sessionStorage.removeItem(AUTH_KEY)
    return null
  }
}

export function saveCurrentUser(user: unknown) {
  if (typeof window === 'undefined') return
  localStorage.setItem(AUTH_KEY, JSON.stringify(user))
  sessionStorage.removeItem(AUTH_KEY)
}

export function clearCurrentUser() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(AUTH_KEY)
  sessionStorage.removeItem(AUTH_KEY)
}
