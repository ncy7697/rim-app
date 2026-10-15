import { supabase } from './supabaseClient'

export const MAX_FAVORITE_VENUES = 3

function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = error.message || ''
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /does not exist|schema cache|Could not find/i.test(message)
  )
}

function storageKey(clubId: string) {
  return `bb_favorite_venues_${clubId}`
}

export function normalizeVenueName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

export function parseFavoriteVenues(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const next: string[] = []
  for (const item of value) {
    const name = normalizeVenueName(String(item || ''))
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    next.push(name)
    if (next.length >= MAX_FAVORITE_VENUES) break
  }
  return next
}

function readLocal(clubId: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey(clubId))
    return raw ? parseFavoriteVenues(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

function writeLocal(clubId: string, names: string[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(storageKey(clubId), JSON.stringify(parseFavoriteVenues(names)))
}

export function favoriteVenuesFromClubRow(row: { favorite_venues?: unknown } | null | undefined, clubId: string): string[] {
  if (row && 'favorite_venues' in row) return parseFavoriteVenues(row.favorite_venues)
  return readLocal(clubId)
}

export async function listFavoriteVenues(clubId: string): Promise<string[]> {
  const { data, error } = await supabase.from('clubs').select('favorite_venues').eq('id', clubId).maybeSingle()
  if (error && isMissingSchema(error)) return readLocal(clubId)
  if (error) throw error
  return favoriteVenuesFromClubRow(data, clubId)
}

export async function saveFavoriteVenues(clubId: string, names: string[]): Promise<string[]> {
  const next = parseFavoriteVenues(names)
  writeLocal(clubId, next)
  const { error } = await supabase.from('clubs').update({ favorite_venues: next }).eq('id', clubId)
  if (error && !isMissingSchema(error)) throw error
  return next
}

export function canAddFavoriteVenue(favorites: string[], name: string) {
  const normalized = normalizeVenueName(name)
  if (!normalized) return { ok: false as const, reason: '장소를 먼저 입력해 주세요.' }
  const exists = favorites.some((item) => item.toLowerCase() === normalized.toLowerCase())
  if (exists) return { ok: false as const, reason: '이미 즐겨찾기에 있는 장소입니다.' }
  if (favorites.length >= MAX_FAVORITE_VENUES) {
    return { ok: false as const, reason: `즐겨찾기는 최대 ${MAX_FAVORITE_VENUES}곳까지 등록할 수 있습니다.` }
  }
  return { ok: true as const, name: normalized }
}
