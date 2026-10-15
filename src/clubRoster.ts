import { supabase } from './supabaseClient'
import { appPageUrl, parseAppLink } from './appLinks'
import {
  ROSTER_MARK,
  SETTINGS_MARK,
  descriptionPreview,
  extractJsonObject,
  parseClubSettings,
} from './clubSettings'

export type DominantHand = '오른손' | '왼손' | '양손'
export type DuesStatus = 'paid' | 'unpaid'
export type InjuryStatus = 'active' | 'resting'
export type CheckInMethod = 'qr' | 'gps' | 'manual'
export type GuestListType = 'none' | 'white' | 'black'

export const PLAY_STYLE_TAGS = [
  '#3점슈터',
  '#허슬플레이어',
  '#리바운더',
  '#패스마스터',
  '#수비특화',
  '#슬래셔',
  '#포스트플레이',
  '#스피드',
  '#게임메이커',
  '#클라이머',
]

export type MemberStats = {
  points: number
  rebounds: number
  assists: number
  fgm: number
  fga: number
  games: number
}

export type MemberRecord = {
  jerseyNumber: number | null
  position: string
  height: number | null
  weight: number | null
  dominantHand: DominantHand
  tags: string[]
  stats: MemberStats
  attendedSessionIds: string[]
  dues: Record<string, DuesStatus>
  injury: {
    status: InjuryStatus
    returnDate?: string
    note?: string
  }
}

export type PracticeSession = {
  id: string
  date: string
  title: string
}

export type GuestRecord = {
  id: string
  name: string
  note: string
  list: GuestListType
  lastVisit?: string
}

export type ClubRoster = {
  v: 1
  sessions: PracticeSession[]
  members: Record<string, MemberRecord>
  guests: GuestRecord[]
}

export function emptyRoster(): ClubRoster {
  return { v: 1, sessions: [], members: {}, guests: [] }
}

export function defaultMemberRecord(seed?: {
  position?: string | null
  back_number?: number | null
  height?: number | null
  weight?: number | null
}): MemberRecord {
  return {
    jerseyNumber: seed?.back_number ?? null,
    position: seed?.position || 'ALL',
    height: seed?.height ?? null,
    weight: seed?.weight ?? null,
    dominantHand: '오른손',
    tags: [],
    stats: { points: 0, rebounds: 0, assists: 0, fgm: 0, fga: 0, games: 0 },
    attendedSessionIds: [],
    dues: {},
    injury: { status: 'active' },
  }
}

export function parseClubRoster(description?: string | null): ClubRoster {
  if (!description) return emptyRoster()
  const index = description.indexOf(ROSTER_MARK)
  if (index < 0) return emptyRoster()
  const raw = extractJsonObject(description, index + ROSTER_MARK.length)
  if (!raw) return emptyRoster()
  try {
    const parsed = JSON.parse(raw) as ClubRoster
    if (!parsed || parsed.v !== 1) return emptyRoster()
    return {
      v: 1,
      sessions: parsed.sessions || [],
      members: parsed.members || {},
      guests: parsed.guests || [],
    }
  } catch {
    return emptyRoster()
  }
}

export function writeRosterDescription(description: string, roster: ClubRoster): string {
  const intro = descriptionPreview(description)
  const settings = parseClubSettings(description)
  const settingsBlock = settings ? `${SETTINGS_MARK}\n${JSON.stringify(settings)}` : ''
  const rosterBlock = `${ROSTER_MARK}\n${JSON.stringify(roster)}`
  return [intro, settingsBlock, rosterBlock].filter(Boolean).join('\n\n')
}

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

export async function loadClubDescription(clubId: string): Promise<string> {
  const { data, error } = await supabase.from('clubs').select('description').eq('id', clubId).single()
  if (error) throw error
  return data?.description || ''
}

async function loadRosterFromTables(clubId: string): Promise<ClubRoster | null> {
  const [sessionsRes, membersRes, statsRes, duesRes, guestsRes] = await Promise.all([
    supabase.from('practice_sessions').select('id, session_date, title').eq('club_id', clubId).order('session_date', { ascending: false }),
    supabase.from('club_members').select('user_id, jersey_number, dominant_hand, play_tags, injury_status, injury_return_date, injury_note').eq('club_id', clubId),
    supabase.from('club_member_stats').select('*').eq('club_id', clubId),
    supabase.from('club_dues').select('user_id, month_key, status').eq('club_id', clubId),
    supabase.from('club_guests').select('id, name, note, list_type, last_visit').eq('club_id', clubId).order('created_at', { ascending: false }),
  ])

  if (
    isMissingSchema(sessionsRes.error) ||
    isMissingSchema(membersRes.error) ||
    isMissingSchema(statsRes.error) ||
    isMissingSchema(duesRes.error) ||
    isMissingSchema(guestsRes.error)
  ) {
    return null
  }
  if (sessionsRes.error) throw sessionsRes.error
  if (membersRes.error) throw membersRes.error
  if (statsRes.error) throw statsRes.error
  if (duesRes.error) throw duesRes.error
  if (guestsRes.error) throw guestsRes.error

  const sessions = (sessionsRes.data || []).map((row) => ({
    id: row.id as string,
    date: String(row.session_date).slice(0, 10),
    title: row.title as string,
  }))

  const sessionIds = sessions.map((item) => item.id)
  const attendance = sessionIds.length
    ? await supabase.from('attendance_records').select('session_id, user_id').in('session_id', sessionIds)
    : { data: [] as { session_id: string; user_id: string }[], error: null }
  if (isMissingSchema(attendance.error)) return null
  if (attendance.error) throw attendance.error

  const attendedByUser: Record<string, string[]> = {}
  for (const row of attendance.data || []) {
    attendedByUser[row.user_id] = [...(attendedByUser[row.user_id] || []), row.session_id]
  }

  const statsByUser = Object.fromEntries((statsRes.data || []).map((row) => [row.user_id, row]))
  const duesByUser: Record<string, Record<string, DuesStatus>> = {}
  for (const row of duesRes.data || []) {
    duesByUser[row.user_id] = {
      ...(duesByUser[row.user_id] || {}),
      [row.month_key]: row.status as DuesStatus,
    }
  }

  const members: Record<string, MemberRecord> = {}
  for (const row of membersRes.data || []) {
    const stats = statsByUser[row.user_id]
    members[row.user_id] = {
      jerseyNumber: row.jersey_number ?? null,
      position: 'ALL',
      height: null,
      weight: null,
      dominantHand: (row.dominant_hand as DominantHand) || '오른손',
      tags: row.play_tags || [],
      stats: {
        points: stats?.points || 0,
        rebounds: stats?.rebounds || 0,
        assists: stats?.assists || 0,
        fgm: stats?.fgm || 0,
        fga: stats?.fga || 0,
        games: stats?.games || 0,
      },
      attendedSessionIds: attendedByUser[row.user_id] || [],
      dues: duesByUser[row.user_id] || {},
      injury: {
        status: (row.injury_status as InjuryStatus) || 'active',
        returnDate: row.injury_return_date || undefined,
        note: row.injury_note || undefined,
      },
    }
  }

  return {
    v: 1,
    sessions,
    members,
    guests: (guestsRes.data || []).map((row) => ({
      id: row.id,
      name: row.name,
      note: row.note || '',
      list: (row.list_type as GuestListType) || 'none',
      lastVisit: row.last_visit || undefined,
    })),
  }
}

async function saveRosterToTables(clubId: string, roster: ClubRoster): Promise<boolean> {
  const existing = await supabase.from('practice_sessions').select('id').eq('club_id', clubId)
  if (isMissingSchema(existing.error)) return false
  if (existing.error) throw existing.error

  const keepIds = new Set(roster.sessions.map((item) => item.id))
  const stale = (existing.data || []).map((row) => row.id).filter((id) => !keepIds.has(id))
  if (stale.length) {
    const del = await supabase.from('practice_sessions').delete().in('id', stale)
    if (del.error) throw del.error
  }

  for (const session of roster.sessions) {
    const { error } = await supabase.from('practice_sessions').upsert({
      id: session.id,
      club_id: clubId,
      session_date: session.date,
      title: session.title,
    })
    if (error) throw error
  }

  const sessionIds = roster.sessions.map((item) => item.id)
  if (sessionIds.length) {
    const currentAttendance = await supabase.from('attendance_records').select('id, session_id, user_id').in('session_id', sessionIds)
    if (currentAttendance.error) throw currentAttendance.error
    const wanted = new Set<string>()
    for (const [userId, record] of Object.entries(roster.members)) {
      for (const sessionId of record.attendedSessionIds) {
        wanted.add(`${sessionId}:${userId}`)
      }
    }
    const extras = (currentAttendance.data || []).filter((row) => !wanted.has(`${row.session_id}:${row.user_id}`))
    if (extras.length) {
      const { error } = await supabase.from('attendance_records').delete().in('id', extras.map((row) => row.id))
      if (error) throw error
    }
    for (const [userId, record] of Object.entries(roster.members)) {
      for (const sessionId of record.attendedSessionIds) {
        const { error } = await supabase.from('attendance_records').upsert(
          { session_id: sessionId, user_id: userId, method: 'manual' },
          { onConflict: 'session_id,user_id' }
        )
        if (error) throw error
      }
    }
  }

  for (const [userId, record] of Object.entries(roster.members)) {
    const memberUpdate = await supabase
      .from('club_members')
      .update({
        jersey_number: record.jerseyNumber,
        dominant_hand: record.dominantHand,
        play_tags: record.tags,
        injury_status: record.injury.status,
        injury_return_date: record.injury.returnDate || null,
        injury_note: record.injury.note || null,
      })
      .eq('club_id', clubId)
      .eq('user_id', userId)
    if (memberUpdate.error) throw memberUpdate.error

    const statsUpdate = await supabase.from('club_member_stats').upsert({
      club_id: clubId,
      user_id: userId,
      points: record.stats.points,
      rebounds: record.stats.rebounds,
      assists: record.stats.assists,
      fgm: record.stats.fgm,
      fga: record.stats.fga,
      games: record.stats.games,
      updated_at: new Date().toISOString(),
    })
    if (statsUpdate.error) throw statsUpdate.error

    for (const [monthKey, status] of Object.entries(record.dues)) {
      const duesUpdate = await supabase.from('club_dues').upsert(
        { club_id: clubId, user_id: userId, month_key: monthKey, status, updated_at: new Date().toISOString() },
        { onConflict: 'club_id,user_id,month_key' }
      )
      if (duesUpdate.error) throw duesUpdate.error
    }
  }

  const existingGuests = await supabase.from('club_guests').select('id').eq('club_id', clubId)
  if (existingGuests.error) throw existingGuests.error
  const keepGuests = new Set(roster.guests.map((item) => item.id))
  const staleGuests = (existingGuests.data || []).map((row) => row.id).filter((id) => !keepGuests.has(id))
  if (staleGuests.length) {
    const { error } = await supabase.from('club_guests').delete().in('id', staleGuests)
    if (error) throw error
  }
  for (const guest of roster.guests) {
    const { error } = await supabase.from('club_guests').upsert({
      id: guest.id,
      club_id: clubId,
      name: guest.name,
      note: guest.note,
      list_type: guest.list,
      last_visit: guest.lastVisit || null,
    })
    if (error) throw error
  }

  return true
}

export async function loadClubRoster(clubId: string): Promise<ClubRoster> {
  const fromTables = await loadRosterFromTables(clubId)
  if (fromTables) {
    const description = await loadClubDescription(clubId)
    const fallback = parseClubRoster(description)
    return {
      v: 1,
      sessions: fromTables.sessions.length ? fromTables.sessions : fallback.sessions,
      members: { ...fallback.members, ...fromTables.members },
      guests: fromTables.guests.length ? fromTables.guests : fallback.guests,
    }
  }
  return parseClubRoster(await loadClubDescription(clubId))
}

export async function saveClubRoster(clubId: string, roster: ClubRoster): Promise<void> {
  const saved = await saveRosterToTables(clubId, roster)
  if (saved) return
  const current = await loadClubDescription(clubId)
  const next = writeRosterDescription(current, roster)
  const { error } = await supabase.from('clubs').update({ description: next }).eq('id', clubId)
  if (error) throw error
}

/** 경기·연습 세션 한 건만 저장. 같은 날 다른 세션이 있어도 id 기준으로 추가한다. */
export async function ensurePracticeSession(params: {
  clubId: string
  id: string
  date: string
  title: string
}): Promise<void> {
  const { error } = await supabase.from('practice_sessions').upsert({
    id: params.id,
    club_id: params.clubId,
    session_date: params.date,
    title: params.title,
  })
  if (!error || isMissingSchema(error)) return
  if (error.code === '23505') return
  throw error
}

export async function recordSessionAttendance(params: {
  clubId: string
  sessionId: string
  userId: string
  method?: CheckInMethod
  lat?: number
  lng?: number
}): Promise<void> {
  const session = await supabase.from('practice_sessions').select('id').eq('id', params.sessionId).maybeSingle()
  if (session.error && !isMissingSchema(session.error)) throw session.error
  if (!isMissingSchema(session.error) && !session.data) {
    throw new Error('유효하지 않은 출석 세션입니다.')
  }
  const { error } = await supabase.from('attendance_records').upsert(
    {
      session_id: params.sessionId,
      user_id: params.userId,
      method: params.method || 'qr',
      lat: params.lat ?? null,
      lng: params.lng ?? null,
    },
    { onConflict: 'session_id,user_id' }
  )
  if (!error) return
  if (!isMissingSchema(error)) throw error
  const roster = await loadClubRoster(params.clubId)
  const current = roster.members[params.userId] || defaultMemberRecord()
  if (current.attendedSessionIds.includes(params.sessionId)) return
  await saveClubRoster(params.clubId, {
    ...roster,
    members: {
      ...roster.members,
      [params.userId]: {
        ...current,
        attendedSessionIds: [...current.attendedSessionIds, params.sessionId],
      },
    },
  })
}

export async function findClubIdByInviteCode(code: string): Promise<string | null> {
  const normalized = code.trim().toUpperCase()
  const byColumn = await supabase.from('clubs').select('id').eq('invite_code', normalized).maybeSingle()
  if (!isMissingSchema(byColumn.error) && byColumn.data?.id) return byColumn.data.id
  const { data, error } = await supabase.from('clubs').select('id, description').ilike('description', `%${normalized}%`)
  if (error) throw error
  const match = (data || []).find((row) => parseClubSettings(row.description)?.inviteCode === normalized)
  return match?.id || null
}

export function fieldGoalPct(stats: MemberStats): string {
  if (!stats.fga) return '-'
  return `${Math.round((stats.fgm / stats.fga) * 1000) / 10}%`
}

export function attendanceRate(record: MemberRecord, sessionCount: number): string {
  if (!sessionCount) return '-'
  return `${Math.round((record.attendedSessionIds.length / sessionCount) * 100)}%`
}

export function currentMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function recentMonthKeys(count = 6): string[] {
  const keys: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(currentMonthKey(d))
  }
  return keys
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${y}.${Number(m)}`
}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function attendUrl(clubId: string, sessionId: string): string {
  return appPageUrl({ attend: clubId, session: sessionId })
}

export function readAttendFromLocation(): { clubId: string; sessionId: string } | null {
  if (typeof window === 'undefined') return null
  const link = parseAppLink(window.location.href)
  if (link?.kind !== 'attend') return null
  return { clubId: link.clubId, sessionId: link.sessionId }
}

export function guestListLabel(list: GuestListType): string {
  if (list === 'white') return '화이트리스트'
  if (list === 'black') return '블랙리스트'
  return '일반'
}
