import { supabase } from './supabaseClient'
import { appPageUrl, parseAppLink } from './appLinks'
import { dispatchFcmPush } from './pushNotifications'
import { newId } from './clubRoster'
import {
  clampEventAttempts,
  clampEventSets,
  clampRelayMinutes,
  isEventType,
  isShootingRelay,
  normalizeEventBoard,
  type EventBoard,
  type EventTypeId,
} from './clubEvents'

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

function isNetworkError(error: { message?: string; details?: string } | unknown): boolean {
  const message = error && typeof error === 'object'
    ? `${(error as { message?: string }).message || ''} ${(error as { details?: string }).details || ''}`
    : String(error || '')
  return /failed to fetch|networkerror|load failed|name_not_resolved|err_name|dns|network request failed/i.test(message)
}

export type RsvpStatus = 'going' | 'maybe' | 'no'
export type ScoreSide = 'h' | 'a'
export type StatKind = 'pt1' | 'pt2' | 'pt3' | 'ptm1' | 'foul' | 'reb' | 'ast' | 'stl' | 'blk' | 'tfoul'

export type QuarterMap = Record<string, { h: number; a: number }>

export type QuarterCount = 2 | 4
export type GameMatchKind = 'internal' | 'exchange' | 'event'

export type ClubGame = {
  id: string
  clubId: string
  title: string
  gameDate: string
  startTime: string
  endTime: string
  venue: string
  notes: string
  opponent: string
  opponentContact: string
  opponentPhone: string
  opponentRegion: string
  matchKind: GameMatchKind
  homeName: string
  awayName: string
  quarterCount: QuarterCount
  currentQuarter: number
  scores: QuarterMap
  fouls: QuarterMap
  isLive: boolean
  createdBy?: string
  updatedAt: string
  opponentClubId?: string
  proposalId?: string
  eventType?: EventTypeId
  eventSetCount?: number
  eventAttemptCount?: number
  eventBoard?: EventBoard
}

export type GameRsvp = { userId: string; name: string; status: RsvpStatus }
export type GameVideo = { id: string; url: string; title: string }
export type PlayerStat = {
  playerKey: string
  userId?: string
  name: string
  team: ScoreSide
  pts: number
  foul: number
  reb: number
  ast: number
  stl: number
  blk: number
}
export type AppNotification = {
  id: string
  userId: string
  clubId?: string
  gameId?: string
  kind: string
  title: string
  body: string
  readAt?: string
  createdAt: string
  proposalId?: string
}

export const EMPTY_QUARTERS = (): QuarterMap => ({
  '1': { h: 0, a: 0 },
  '2': { h: 0, a: 0 },
  '3': { h: 0, a: 0 },
  '4': { h: 0, a: 0 },
  '5': { h: 0, a: 0 },
})

export const SCORE_SERIES_KEY = '__series'
export const MAX_EXCHANGE_SERIES = 8

export type ScoreSeriesBoard = {
  scores: QuarterMap
  fouls: QuarterMap
  currentQuarter: number
}

export type ScoreSeries = {
  active: number
  boards: ScoreSeriesBoard[]
}

export function cleanQuarterMap(map?: QuarterMap | null): QuarterMap {
  const next = EMPTY_QUARTERS()
  for (const [key, value] of Object.entries(map || {})) {
    if (key === SCORE_SERIES_KEY || key.startsWith('__')) continue
    if (!value || typeof value !== 'object') continue
    next[key] = { h: Number((value as { h?: number }).h) || 0, a: Number((value as { a?: number }).a) || 0 }
  }
  return next
}

function readSeriesMeta(scores?: QuarterMap | null): ScoreSeries | null {
  const raw = scores?.[SCORE_SERIES_KEY] as unknown as ScoreSeries | undefined
  if (!raw || !Array.isArray(raw.boards) || !raw.boards.length) return null
  return {
    active: Math.min(raw.boards.length - 1, Math.max(0, Number(raw.active) || 0)),
    boards: raw.boards.map((board) => ({
      scores: cleanQuarterMap(board.scores),
      fouls: cleanQuarterMap(board.fouls),
      currentQuarter: Number(board.currentQuarter) || 1,
    })),
  }
}

export function readScoreSeries(game: ClubGame): ScoreSeries {
  return (
    readSeriesMeta(game.scores) || {
      active: 0,
      boards: [
        {
          scores: cleanQuarterMap(game.scores),
          fouls: cleanQuarterMap(game.fouls),
          currentQuarter: game.currentQuarter || 1,
        },
      ],
    }
  )
}

export function withScoreSeries(game: ClubGame, series: ScoreSeries): ClubGame {
  const active = series.boards[series.active] || series.boards[0]
  const scores = {
    ...active.scores,
    [SCORE_SERIES_KEY]: {
      active: series.active,
      boards: series.boards,
    },
  } as unknown as QuarterMap
  return {
    ...game,
    scores,
    fouls: active.fouls,
    currentQuarter: active.currentQuarter,
  }
}

export function syncActiveSeriesBoard(game: ClubGame): ClubGame {
  if (game.matchKind !== 'exchange') return { ...game, scores: { ...game.scores } }
  const series = readScoreSeries(game)
  series.boards[series.active] = {
    scores: cleanQuarterMap(game.scores),
    fouls: cleanQuarterMap(game.fouls),
    currentQuarter: game.currentQuarter || 1,
  }
  return withScoreSeries(game, series)
}

export function addExchangeSeriesGame(game: ClubGame): ClubGame {
  const series = readScoreSeries(game)
  if (series.boards.length >= MAX_EXCHANGE_SERIES) return syncActiveSeriesBoard(game)
  series.boards[series.active] = {
    scores: cleanQuarterMap(game.scores),
    fouls: cleanQuarterMap(game.fouls),
    currentQuarter: game.currentQuarter || 1,
  }
  series.boards.push({
    scores: EMPTY_QUARTERS(),
    fouls: EMPTY_QUARTERS(),
    currentQuarter: 1,
  })
  series.active = series.boards.length - 1
  return withScoreSeries({ ...game, isLive: true }, series)
}

export function selectExchangeSeriesGame(game: ClubGame, index: number): ClubGame {
  const series = readScoreSeries(game)
  series.boards[series.active] = {
    scores: cleanQuarterMap(game.scores),
    fouls: cleanQuarterMap(game.fouls),
    currentQuarter: game.currentQuarter || 1,
  }
  series.active = Math.min(series.boards.length - 1, Math.max(0, index))
  return withScoreSeries(game, series)
}

export function seriesWins(series: ScoreSeries, quarterCount: QuarterCount) {
  let home = 0
  let away = 0
  for (const board of series.boards) {
    const h = totalScore(board.scores, 'h', quarterCount)
    const a = totalScore(board.scores, 'a', quarterCount)
    if (h > a) home += 1
    else if (a > h) away += 1
  }
  return { home, away }
}

function storageGames(clubId: string) {
  return `bb_games_${clubId}`
}
function storageRsvp(gameId: string) {
  return `bb_game_rsvp_${gameId}`
}
function storageVideos(gameId: string) {
  return `bb_game_videos_${gameId}`
}
function storageStats(gameId: string) {
  return `bb_game_stats_${gameId}`
}
function storageNotes(userId: string) {
  return `bb_notes_${userId}`
}

export function normalizeQuarterCount(value?: number | null): QuarterCount {
  return value === 2 ? 2 : 4
}

export function normalizeMatchKind(value?: string | null): GameMatchKind {
  if (value === 'exchange') return 'exchange'
  if (value === 'event') return 'event'
  return 'internal'
}

export function matchKindLabel(kind?: GameMatchKind | null) {
  if (kind === 'exchange') return '교류전'
  if (kind === 'event') return '이벤트'
  return '자체전'
}

function overlayMatchFields(game: ClubGame, extra?: Partial<ClubGame>): ClubGame {
  return {
    ...game,
    matchKind: extra?.matchKind || game.matchKind || 'internal',
    opponentContact: extra?.opponentContact ?? game.opponentContact ?? '',
    opponentPhone: extra?.opponentPhone ?? game.opponentPhone ?? '',
    opponentRegion: extra?.opponentRegion ?? game.opponentRegion ?? '',
    opponent: extra?.opponent ?? game.opponent ?? '',
    quarterCount: normalizeQuarterCount(extra?.quarterCount ?? game.quarterCount),
    opponentClubId: extra?.opponentClubId ?? game.opponentClubId,
    proposalId: extra?.proposalId ?? game.proposalId,
    eventType: extra?.eventType || game.eventType,
    eventSetCount: extra?.eventSetCount ?? game.eventSetCount,
    eventAttemptCount: extra?.eventAttemptCount ?? game.eventAttemptCount,
    eventBoard: extra?.eventBoard || game.eventBoard,
  }
}

function mergeLocalGames(clubId: string, games: ClubGame[]): ClubGame[] {
  if (typeof window === 'undefined') return games
  try {
    const raw = localStorage.getItem(storageGames(clubId))
    if (!raw) return games
    const local = JSON.parse(raw) as ClubGame[]
    const byId = Object.fromEntries(local.map((item) => [item.id, item]))
    return games.map((game) => overlayMatchFields(game, byId[game.id]))
  } catch {
    return games
  }
}

export function otQuarter(count: QuarterCount) {
  return count + 1
}

export function visibleQuarters(count: QuarterCount) {
  return [...Array.from({ length: count }, (_, index) => index + 1), otQuarter(count)]
}

export function slotKey(round: number, quarter: number) {
  return `${round}:${quarter}`
}

export function isPackedThreeTeamClock(currentQuarter: number) {
  return currentQuarter >= 10
}

export function parseThreeTeamClock(currentQuarter: number, quarterCount: QuarterCount = 4): { round: number; quarter: number } {
  const allowed = visibleQuarters(quarterCount)
  if (isPackedThreeTeamClock(currentQuarter)) {
    const round = Math.min(3, Math.max(1, Math.floor(currentQuarter / 10)))
    const quarter = currentQuarter % 10
    return { round, quarter: allowed.includes(quarter) ? quarter : 1 }
  }
  return { round: Math.min(3, Math.max(1, currentQuarter || 1)), quarter: 1 }
}

export function packThreeTeamClock(round: number, quarter: number) {
  return Math.min(3, Math.max(1, round)) * 10 + quarter
}

export function readScoreSlot(map: QuarterMap, round: number | null, quarter: number): { h: number; a: number } {
  if (round) {
    const nested = map[slotKey(round, quarter)]
    if (nested) return { h: nested.h || 0, a: nested.a || 0 }
    if (quarter === 1) {
      const legacy = map[String(round)]
      if (legacy && !map[slotKey(round, 1)]) return { h: legacy.h || 0, a: legacy.a || 0 }
    }
  }
  const flat = map[String(quarter)]
  return { h: flat?.h || 0, a: flat?.a || 0 }
}

export function roundTotal(map: QuarterMap, round: number, side: ScoreSide, quarterCount: QuarterCount = 4) {
  return visibleQuarters(quarterCount).reduce((sum, quarter) => sum + readScoreSlot(map, round, quarter)[side], 0)
}

function rowToGame(row: any): ClubGame {
  const quarterCount = normalizeQuarterCount(row.quarter_count ?? row.quarterCount)
  const maxQuarter = otQuarter(quarterCount)
  const current = Number(row.current_quarter || 1)
  return {
    id: row.id,
    clubId: row.club_id,
    title: row.title,
    gameDate: String(row.game_date).slice(0, 10),
    startTime: row.start_time,
    endTime: row.end_time || '',
    venue: row.venue,
    notes: row.notes || '',
    opponent: row.opponent || '',
    opponentContact: row.opponent_contact || row.opponentContact || '',
    opponentPhone: row.opponent_phone || row.opponentPhone || '',
    opponentRegion: row.opponent_region || row.opponentRegion || '',
    matchKind: normalizeMatchKind(row.match_kind || row.matchKind),
    homeName: row.home_name || '우리 팀',
    awayName: row.away_name || '상대 팀',
    quarterCount,
    currentQuarter: isPackedThreeTeamClock(current) ? current : current > maxQuarter ? 1 : current,
    scores: { ...EMPTY_QUARTERS(), ...(row.scores || {}) },
    fouls: { ...EMPTY_QUARTERS(), ...(row.fouls || {}) },
    isLive: Boolean(row.is_live),
    createdBy: row.created_by || undefined,
    updatedAt: row.updated_at || row.created_at,
    opponentClubId: row.opponent_club_id || row.opponentClubId || undefined,
    proposalId: row.proposal_id || row.proposalId || undefined,
    eventType: isEventType(row.event_type || row.eventType) ? (row.event_type || row.eventType) : undefined,
    eventSetCount: row.event_set_count || row.eventSetCount
      ? (isEventType(row.event_type || row.eventType) && isShootingRelay(row.event_type || row.eventType)
          ? clampRelayMinutes(row.event_set_count || row.eventSetCount)
          : clampEventSets(row.event_set_count || row.eventSetCount))
      : undefined,
    eventAttemptCount: row.event_attempt_count || row.eventAttemptCount ? clampEventAttempts(row.event_attempt_count || row.eventAttemptCount) : undefined,
    eventBoard: row.event_board || row.eventBoard || undefined,
  }
}

export function gameSessionId(gameId: string) {
  return `game-${gameId}`
}

export function youtubeId(url: string): string | null {
  const trimmed = url.trim()
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
    /[?&]v=([a-zA-Z0-9_-]{6,})/,
  ]
  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

export function youtubeEmbed(url: string): string | null {
  const id = youtubeId(url)
  return id ? `https://www.youtube.com/embed/${id}` : null
}

export function quarterLabel(quarter: number, quarterCount: QuarterCount = 4) {
  return quarter > quarterCount ? 'OT' : `Q${quarter}`
}

export function totalScore(map: QuarterMap, side: ScoreSide, quarterCount: QuarterCount = 4) {
  return visibleQuarters(quarterCount).reduce((sum, quarter) => sum + (map[String(quarter)]?.[side] || 0), 0)
}

export function isPastGame(game: ClubGame, now = new Date()) {
  const end = game.endTime || '23:59'
  return new Date(`${game.gameDate}T${end}:00`) < now
}

export async function listClubGames(clubId: string): Promise<ClubGame[]> {
  const { data, error } = await supabase.from('club_games').select('*').eq('club_id', clubId).order('game_date', { ascending: false }).order('start_time', { ascending: false })
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error) || !data) {
    const raw = localStorage.getItem(storageGames(clubId))
    const parsed = raw ? (JSON.parse(raw) as ClubGame[]) : []
    return parsed.map((game) => overlayMatchFields(game, game))
  }
  return mergeLocalGames(clubId, data.map(rowToGame))
}

export async function getGame(gameId: string): Promise<ClubGame | null> {
  const { data, error } = await supabase.from('club_games').select('*').eq('id', gameId).maybeSingle()
  if (error && !isMissingSchema(error)) throw error
  if (data) {
    const mapped = rowToGame(data)
    if (typeof window !== 'undefined') {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i)
        if (!key?.startsWith('bb_games_')) continue
        const games = JSON.parse(localStorage.getItem(key) || '[]') as ClubGame[]
        const found = games.find((item) => item.id === gameId)
        if (found) return overlayMatchFields(mapped, found)
      }
    }
    return mapped
  }
  if (typeof window === 'undefined') return null
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key?.startsWith('bb_games_')) continue
    const games = JSON.parse(localStorage.getItem(key) || '[]') as ClubGame[]
    const found = games.find((item) => item.id === gameId)
    if (found) return overlayMatchFields({ ...found, quarterCount: normalizeQuarterCount(found.quarterCount) }, found)
  }
  return null
}

export async function saveClubGame(game: ClubGame, notify: { clubName: string; memberIds: string[] } | null): Promise<ClubGame> {
  const next = syncActiveSeriesBoard({ ...game, id: game.id || newId(), updatedAt: new Date().toISOString() })
  const payload = {
    id: next.id,
    club_id: next.clubId,
    title: next.title,
    game_date: next.gameDate,
    start_time: next.startTime,
    end_time: next.endTime || null,
    venue: next.venue,
    notes: next.notes,
    opponent: next.opponent || null,
    opponent_contact: next.opponentContact || null,
    opponent_phone: next.opponentPhone || null,
    opponent_region: next.opponentRegion || null,
    match_kind: next.matchKind || 'internal',
    home_name: next.homeName,
    away_name: next.awayName,
    quarter_count: next.quarterCount,
    current_quarter: next.currentQuarter,
    scores: next.scores,
    fouls: next.fouls,
    is_live: next.isLive,
    created_by: next.createdBy || null,
    updated_at: next.updatedAt,
    opponent_club_id: next.opponentClubId || null,
    proposal_id: next.proposalId || null,
    event_type: next.matchKind === 'event' ? next.eventType || null : null,
    event_set_count: next.matchKind === 'event'
      ? (isShootingRelay(next.eventType) ? clampRelayMinutes(next.eventSetCount) : clampEventSets(next.eventSetCount))
      : null,
    event_attempt_count: next.matchKind === 'event' ? clampEventAttempts(next.eventAttemptCount) : null,
    event_board: next.matchKind === 'event' ? next.eventBoard || normalizeEventBoard(next.eventBoard, {
      type: next.eventType || 'free_throw',
      setCount: isShootingRelay(next.eventType) ? clampRelayMinutes(next.eventSetCount) : clampEventSets(next.eventSetCount),
      attemptCount: clampEventAttempts(next.eventAttemptCount),
      currentSet: 1,
      players: [],
    }) : null,
  }
  const { error } = await supabase.from('club_games').upsert(payload)
  if (error && /quarter_count|match_kind|opponent_contact|opponent_phone|opponent_region|opponent_club_id|proposal_id|event_type|event_set_count|event_attempt_count|event_board/i.test(error.message || '')) {
    const {
      quarter_count: _quarterCount,
      match_kind: _matchKind,
      opponent_contact: _contact,
      opponent_phone: _phone,
      opponent_region: _region,
      opponent_club_id: _oppClub,
      proposal_id: _proposal,
      event_type: _eventType,
      event_set_count: _eventSets,
      event_attempt_count: _eventAttempts,
      event_board: _eventBoard,
      ...withoutExtra
    } = payload as typeof payload & {
      quarter_count?: number
      match_kind?: string
      opponent_contact?: string | null
      opponent_phone?: string | null
      opponent_region?: string | null
      opponent_club_id?: string | null
      proposal_id?: string | null
      event_type?: string | null
      event_set_count?: number | null
      event_attempt_count?: number | null
      event_board?: EventBoard | null
    }
    const retry = await supabase.from('club_games').upsert(withoutExtra)
    if (retry.error && !isMissingSchema(retry.error)) throw retry.error
    if (isMissingSchema(retry.error)) {
      const list = await listClubGames(next.clubId)
      const merged = [next, ...list.filter((item) => item.id !== next.id)]
      localStorage.setItem(storageGames(next.clubId), JSON.stringify(merged))
    }
  } else if (error && !isMissingSchema(error)) {
    throw error
  } else if (isMissingSchema(error)) {
    const list = await listClubGames(next.clubId)
    const merged = [next, ...list.filter((item) => item.id !== next.id)]
    localStorage.setItem(storageGames(next.clubId), JSON.stringify(merged))
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(storageGames(next.clubId))
      const list = raw ? (JSON.parse(raw) as ClubGame[]) : []
      localStorage.setItem(storageGames(next.clubId), JSON.stringify([next, ...list.filter((item) => item.id !== next.id)]))
    } catch {
      /* ignore */
    }
  }
  if (notify) {
    await notifyMembers({
      clubId: next.clubId,
      clubName: notify.clubName,
      gameId: next.id,
      memberIds: notify.memberIds,
      title: `[림] ${notify.clubName} 경기 일정이 등록되었습니다`,
      body: `${next.gameDate} ${next.startTime} · ${next.venue} · ${next.title}`,
    })
  }
  return next
}

export async function notifyUsers(input: {
  clubId: string
  userIds: string[]
  title: string
  body: string
  kind: string
  gameId?: string
  proposalId?: string
}) {
  const userIds = [...new Set(input.userIds.filter(Boolean))]
  const rows = userIds.map((userId) => ({
    id: newId(),
    user_id: userId,
    club_id: input.clubId,
    game_id: input.gameId || null,
    proposal_id: input.proposalId || null,
    kind: input.kind,
    title: input.title,
    body: input.body,
  }))
  if (rows.length) {
    let { error } = await supabase.from('user_notifications').insert(rows)
    if (error && /proposal_id/i.test(error.message || '')) {
      const withoutProposal = rows.map(({ proposal_id: _ignored, ...row }) => row)
      const retry = await supabase.from('user_notifications').insert(withoutProposal)
      error = retry.error
    }
    if (error && /game_id/i.test(error.message || '')) {
      const withoutGame = rows.map(({ game_id: _ignored, ...row }) => row)
      const retry = await supabase.from('user_notifications').insert(withoutGame)
      error = retry.error
    }
    if (error && !isMissingSchema(error)) throw error
    if (isMissingSchema(error)) {
      for (const row of rows) {
        const list = JSON.parse(localStorage.getItem(storageNotes(row.user_id)) || '[]') as AppNotification[]
        list.unshift({
          id: row.id,
          userId: row.user_id,
          clubId: row.club_id || undefined,
          gameId: row.game_id || undefined,
          proposalId: row.proposal_id || input.proposalId,
          kind: row.kind,
          title: row.title,
          body: row.body,
          createdAt: new Date().toISOString(),
        })
        localStorage.setItem(storageNotes(row.user_id), JSON.stringify(list.slice(0, 80)))
      }
    }
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(input.title, { body: input.body })
    } catch {
      /* ignore */
    }
  }
  void dispatchFcmPush({
    userIds,
    title: input.title,
    body: input.body,
    data: {
      clubId: input.clubId,
      kind: input.kind,
      gameId: input.gameId || '',
      proposalId: input.proposalId || '',
    },
  })
}

export async function notifyMembers(input: {
  clubId: string
  clubName: string
  gameId: string
  memberIds: string[]
  title: string
  body: string
}) {
  await notifyUsers({
    clubId: input.clubId,
    userIds: input.memberIds,
    title: input.title,
    body: input.body,
    kind: 'game_schedule',
    gameId: input.gameId,
  })
}

function localNotifications(userId: string): AppNotification[] {
  return JSON.parse(localStorage.getItem(storageNotes(userId)) || '[]')
}

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return localNotifications(userId)
  }
  try {
    const { data, error } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(40)
    if (error && (isMissingSchema(error) || isNetworkError(error))) {
      return localNotifications(userId)
    }
    if (error) throw error
    if (!data) return localNotifications(userId)
    return data.map((row) => ({
      id: row.id,
      userId: row.user_id,
      clubId: row.club_id || undefined,
      gameId: row.game_id || undefined,
      proposalId: row.proposal_id || (typeof row.game_id === 'string' && String(row.game_id).startsWith('proposal:') ? String(row.game_id).slice(9) : undefined),
      kind: row.kind,
      title: row.title,
      body: row.body,
      readAt: row.read_at || undefined,
      createdAt: row.created_at,
    }))
  } catch (err) {
    if (isNetworkError(err)) return localNotifications(userId)
    throw err
  }
}

export async function markNotificationRead(note: AppNotification) {
  const { error } = await supabase.from('user_notifications').update({ read_at: new Date().toISOString() }).eq('id', note.id)
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error)) {
    const list = (JSON.parse(localStorage.getItem(storageNotes(note.userId)) || '[]') as AppNotification[]).map((item) =>
      item.id === note.id ? { ...item, readAt: new Date().toISOString() } : item
    )
    localStorage.setItem(storageNotes(note.userId), JSON.stringify(list))
  }
}

export async function listRsvps(gameId: string): Promise<Record<string, RsvpStatus>> {
  const { data, error } = await supabase.from('club_game_rsvps').select('user_id, status').eq('game_id', gameId)
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error) || !data) {
    return JSON.parse(localStorage.getItem(storageRsvp(gameId)) || '{}')
  }
  return Object.fromEntries(data.map((row) => [row.user_id, row.status as RsvpStatus]))
}

export async function setRsvp(gameId: string, userId: string, status: RsvpStatus) {
  const { error } = await supabase.from('club_game_rsvps').upsert({
    game_id: gameId,
    user_id: userId,
    status,
    updated_at: new Date().toISOString(),
  })
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error)) {
    const current = await listRsvps(gameId)
    current[userId] = status
    localStorage.setItem(storageRsvp(gameId), JSON.stringify(current))
  }
}

export async function listVideos(gameId: string): Promise<GameVideo[]> {
  const { data, error } = await supabase.from('club_game_videos').select('*').eq('game_id', gameId).order('sort_order')
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error) || !data) {
    return JSON.parse(localStorage.getItem(storageVideos(gameId)) || '[]')
  }
  return data.map((row) => ({ id: row.id, url: row.url, title: row.title || '' }))
}

export async function saveVideos(gameId: string, videos: GameVideo[]) {
  const next = videos.slice(0, 10)
  const { error: delErr } = await supabase.from('club_game_videos').delete().eq('game_id', gameId)
  if (delErr && !isMissingSchema(delErr)) throw delErr
  if (isMissingSchema(delErr)) {
    localStorage.setItem(storageVideos(gameId), JSON.stringify(next))
    return
  }
  if (!next.length) return
  const { error } = await supabase.from('club_game_videos').insert(
    next.map((item, index) => ({
      id: item.id || newId(),
      game_id: gameId,
      url: item.url,
      title: item.title,
      sort_order: index,
    }))
  )
  if (error) throw error
}

export async function listPlayerStats(gameId: string): Promise<PlayerStat[]> {
  const { data, error } = await supabase.from('club_game_player_stats').select('*').eq('game_id', gameId)
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error) || !data) {
    return JSON.parse(localStorage.getItem(storageStats(gameId)) || '[]')
  }
  return data.map((row) => ({
    playerKey: row.player_key,
    userId: row.user_id || undefined,
    name: row.player_name,
    team: row.team as ScoreSide,
    pts: row.pts,
    foul: row.foul,
    reb: row.reb,
    ast: row.ast,
    stl: row.stl,
    blk: row.blk,
  }))
}

async function persistStats(gameId: string, stats: PlayerStat[]) {
  const { error: delErr } = await supabase.from('club_game_player_stats').delete().eq('game_id', gameId)
  if (delErr && !isMissingSchema(delErr)) throw delErr
  if (isMissingSchema(delErr)) {
    localStorage.setItem(storageStats(gameId), JSON.stringify(stats))
    return
  }
  if (!stats.length) return
  const { error } = await supabase.from('club_game_player_stats').insert(
    stats.map((item) => ({
      game_id: gameId,
      player_key: item.playerKey,
      user_id: item.userId || null,
      player_name: item.name,
      team: item.team,
      pts: item.pts,
      foul: item.foul,
      reb: item.reb,
      ast: item.ast,
      stl: item.stl,
      blk: item.blk,
    }))
  )
  if (error) throw error
}

const POINT_KIND: Partial<Record<StatKind, number>> = { pt1: 1, pt2: 2, pt3: 3, ptm1: -1 }

export async function recordGameStat(game: ClubGame, input: {
  kind: StatKind
  team: ScoreSide
  player?: { playerKey: string; userId?: string; name: string }
}): Promise<{ game: ClubGame; stats: PlayerStat[] }> {
  const packed = isPackedThreeTeamClock(game.currentQuarter)
  const round = packed ? Math.floor(game.currentQuarter / 10) : null
  const quarterNum = packed ? game.currentQuarter % 10 : game.currentQuarter
  const quarter = packed ? slotKey(round || 1, quarterNum) : String(quarterNum)
  const scores = { ...game.scores, [quarter]: { ...(game.scores[quarter] || { h: 0, a: 0 }) } }
  const fouls = { ...game.fouls, [quarter]: { ...(game.fouls[quarter] || { h: 0, a: 0 }) } }
  const points = POINT_KIND[input.kind]
  if (points) scores[quarter][input.team] = Math.max(0, scores[quarter][input.team] + points)
  if (input.kind === 'foul' || input.kind === 'tfoul') fouls[quarter][input.team] += 1

  const stats = await listPlayerStats(game.id)
  if (input.player && input.kind !== 'tfoul') {
    const existing = stats.find((item) => item.playerKey === input.player!.playerKey)
    const row: PlayerStat = existing || {
      playerKey: input.player.playerKey,
      userId: input.player.userId,
      name: input.player.name,
      team: input.team,
      pts: 0,
      foul: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
    }
    if (points) row.pts = Math.max(0, row.pts + points)
    if (input.kind === 'foul') row.foul += 1
    if (input.kind === 'reb') row.reb += 1
    if (input.kind === 'ast') row.ast += 1
    if (input.kind === 'stl') row.stl += 1
    if (input.kind === 'blk') row.blk += 1
    const nextStats = existing ? stats.map((item) => (item.playerKey === row.playerKey ? row : item)) : [...stats, row]
    await persistStats(game.id, nextStats)
    const nextGame = await saveClubGame({ ...game, scores, fouls, isLive: true }, null)
    await supabase.from('club_game_events').insert({
      id: newId(),
      game_id: game.id,
      quarter: game.currentQuarter,
      player_key: input.player.playerKey,
      user_id: input.player.userId || null,
      player_name: input.player.name,
      team: input.team,
      kind: input.kind,
    }).then(({ error }) => {
      if (error && !isMissingSchema(error)) throw error
    })
    return { game: nextGame, stats: nextStats }
  }

  const nextGame = await saveClubGame({ ...game, scores, fouls, isLive: true }, null)
  await supabase.from('club_game_events').insert({
    id: newId(),
    game_id: game.id,
    quarter: game.currentQuarter,
    team: input.team,
    kind: input.kind,
  }).then(({ error }) => {
    if (error && !isMissingSchema(error)) throw error
  })
  return { game: nextGame, stats }
}

export function readGameFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  const link = parseAppLink(window.location.href)
  return link?.kind === 'game' ? link.gameId : null
}

export function gameUrl(gameId: string) {
  return appPageUrl({ game: gameId })
}

export type GameClubMember = { id: string; name: string; role: string }

export async function approvedMemberIds(clubId: string): Promise<GameClubMember[]> {
  const { data, error } = await supabase
    .from('club_members')
    .select('user_id, role, status, users:user_id(name)')
    .eq('club_id', clubId)
  if (error) throw error
  return (data || [])
    .filter((row: any) => row.role === 'leader' || row.role === 'owner' || row.role === 'admin' || row.status === 'approved' || row.status == null)
    .map((row: any) => ({ id: row.user_id, name: row.users?.name || '회원', role: row.role || 'member' }))
}

export async function requestBrowserNotifications() {
  if (typeof Notification === 'undefined') return
  if (Notification.permission === 'default') {
    await Notification.requestPermission()
  }
}
