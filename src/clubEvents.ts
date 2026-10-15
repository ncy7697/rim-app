import type { ClubGame } from './clubGames'

export const EVENT_TYPES = [
  {
    id: 'free_throw',
    label: '자유투',
    spot: '자유투라인',
    description: '자유투라인에서 선수마다 셋트별로 지정된 횟수만큼 슛을 시도합니다.',
  },
  {
    id: 'three_point',
    label: '3점슛',
    spot: '지정된 3점라인',
    description: '지정된 3점라인 자리에서 선수마다 셋트별로 지정된 횟수만큼 슛을 시도합니다.',
  },
  {
    id: 'shooting_relay',
    label: '슈팅 릴레이',
    spot: '골밑 · 자유투 · 3점',
    description: '팀별로 순서대로 골밑(1점)·자유투(2점)·3점(3점)을 시도하고, 제한 시간 동안 점수를 합산합니다.',
  },
] as const

export type EventTypeId = (typeof EVENT_TYPES)[number]['id']

export const EVENT_MAX_SETS = 5
export const EVENT_MAX_ATTEMPTS = 10
export const RELAY_MAX_TEAMS = 5
export const RELAY_MIN_ROSTER = 3
export const RELAY_MAX_ROSTER = 5
export const RELAY_MAX_MINUTES = 10
export const RELAY_SPOTS = [
  { id: 'layup', label: '골밑', points: 1 },
  { id: 'free_throw', label: '자유투', points: 2 },
  { id: 'three', label: '3점', points: 3 },
] as const

export type RelaySpotId = (typeof RELAY_SPOTS)[number]['id']

export type RelayLog = {
  userId: string
  name: string
  spot: RelaySpotId
  made: boolean
  points: number
  at: string
}

export type RelayTeam = {
  id: string
  name: string
  playerIds: string[]
  currentOrder: number
  currentSpot: number
  remainingMs: number
  running: boolean
  startedAt: number | null
  finished: boolean
  logs: RelayLog[]
}

export type RelayState = {
  timeLimitSec: number
  activeTeamId: string | null
  teams: RelayTeam[]
}

export type EventShot = boolean | null

export type EventPlayer = {
  userId: string
  name: string
  eliminated: boolean
  sets: EventShot[][]
}

export type EventBoard = {
  type: EventTypeId
  setCount: number
  attemptCount: number
  currentSet: number
  players: EventPlayer[]
  relay?: RelayState
}

export function isEventType(value?: string | null): value is EventTypeId {
  return EVENT_TYPES.some((item) => item.id === value)
}

export function isShootingRelay(id?: string | null) {
  return id === 'shooting_relay'
}

export function clampRelayMinutes(value?: number | null) {
  const n = Number(value || 3)
  return Math.min(RELAY_MAX_MINUTES, Math.max(1, Number.isFinite(n) ? Math.round(n) : 3))
}

export function eventTypeMeta(id?: string | null) {
  return EVENT_TYPES.find((item) => item.id === id) || EVENT_TYPES[0]
}

export function eventTypeLabel(id?: string | null) {
  return eventTypeMeta(id).label
}

export function clampEventSets(value?: number | null) {
  const n = Number(value || 1)
  return Math.min(EVENT_MAX_SETS, Math.max(1, Number.isFinite(n) ? Math.round(n) : 1))
}

export function clampEventAttempts(value?: number | null) {
  const n = Number(value || 1)
  return Math.min(EVENT_MAX_ATTEMPTS, Math.max(1, Number.isFinite(n) ? Math.round(n) : 1))
}

export function isRegularClubRole(role?: string | null) {
  return Boolean(role) && role !== 'guest'
}

function resizeSets(player: EventPlayer, setCount: number, attemptCount: number): EventPlayer {
  const sets = Array.from({ length: setCount }, (_, setIndex) => {
    const prev = player.sets[setIndex] || []
    return Array.from({ length: attemptCount }, (_, attempt) => (attempt < prev.length ? prev[attempt] : null))
  })
  return { ...player, sets }
}

export function emptyEventBoard(input: { type: EventTypeId; setCount: number; attemptCount: number }): EventBoard {
  const setCount = input.type === 'shooting_relay' ? clampRelayMinutes(input.setCount) : clampEventSets(input.setCount)
  const attemptCount = clampEventAttempts(input.attemptCount)
  return {
    type: input.type,
    setCount,
    attemptCount,
    currentSet: 1,
    players: [],
    relay: input.type === 'shooting_relay' ? emptyRelayState(setCount * 60) : undefined,
  }
}

export function normalizeEventBoard(raw: unknown, fallback: EventBoard): EventBoard {
  if (!raw || typeof raw !== 'object') return fallback
  const data = raw as Partial<EventBoard>
  const type = isEventType(data.type) ? data.type : fallback.type
  const setCount = type === 'shooting_relay' ? clampRelayMinutes(data.setCount ?? fallback.setCount) : clampEventSets(data.setCount ?? fallback.setCount)
  const attemptCount = clampEventAttempts(data.attemptCount ?? fallback.attemptCount)
  const players = Array.isArray(data.players)
    ? data.players
        .filter((item) => item && item.userId)
        .map((item) =>
          resizeSets(
            {
              userId: String(item.userId),
              name: item.name || '회원',
              eliminated: Boolean(item.eliminated),
              sets: Array.isArray(item.sets) ? item.sets : [],
            },
            setCount,
            attemptCount
          )
        )
    : []
  const currentSet = Math.min(setCount, Math.max(1, Number(data.currentSet || 1)))
  const relay = type === 'shooting_relay' ? normalizeRelayState((data as EventBoard).relay, fallback.relay || emptyRelayState(setCount * 60)) : undefined
  return { type, setCount, attemptCount, currentSet, players, relay }
}

export function emptyRelayState(timeLimitSec: number): RelayState {
  const sec = Math.min(RELAY_MAX_MINUTES * 60, Math.max(60, timeLimitSec || 180))
  return { timeLimitSec: sec, activeTeamId: null, teams: [] }
}

function normalizeRelayTeam(raw: Partial<RelayTeam>, timeLimitSec: number): RelayTeam | null {
  if (!raw?.id) return null
  const logs = Array.isArray(raw.logs)
    ? raw.logs
        .filter((item) => item && item.userId)
        .map((item) => ({
          userId: String(item.userId),
          name: item.name || '회원',
          spot: RELAY_SPOTS.some((spot) => spot.id === item.spot) ? item.spot : 'layup',
          made: Boolean(item.made),
          points: Number(item.points) || 0,
          at: item.at || new Date().toISOString(),
        }))
    : []
  return {
    id: String(raw.id),
    name: raw.name || '팀',
    playerIds: Array.isArray(raw.playerIds) ? raw.playerIds.map(String).slice(0, RELAY_MAX_ROSTER) : [],
    currentOrder: Math.max(0, Number(raw.currentOrder) || 0),
    currentSpot: Math.min(2, Math.max(0, Number(raw.currentSpot) || 0)),
    remainingMs: raw.remainingMs == null ? timeLimitSec * 1000 : Math.max(0, Number(raw.remainingMs) || 0),
    running: Boolean(raw.running),
    startedAt: raw.startedAt ? Number(raw.startedAt) : null,
    finished: Boolean(raw.finished),
    logs,
  }
}

export function normalizeRelayState(raw: unknown, fallback: RelayState): RelayState {
  if (!raw || typeof raw !== 'object') return fallback
  const data = raw as Partial<RelayState>
  const timeLimitSec = Math.min(RELAY_MAX_MINUTES * 60, Math.max(60, Number(data.timeLimitSec || fallback.timeLimitSec || 180)))
  const teams = Array.isArray(data.teams)
    ? data.teams.map((item) => normalizeRelayTeam(item, timeLimitSec)).filter((item): item is RelayTeam => Boolean(item)).slice(0, RELAY_MAX_TEAMS)
    : []
  return {
    timeLimitSec,
    activeTeamId: data.activeTeamId && teams.some((item) => item.id === data.activeTeamId) ? data.activeTeamId : teams[0]?.id || null,
    teams,
  }
}

export function relayTeamScore(team: RelayTeam) {
  return team.logs.reduce((sum, item) => sum + (item.points || 0), 0)
}

export function relayRemainingMs(team: RelayTeam, now = Date.now()) {
  if (team.finished) return 0
  if (team.running && team.startedAt) {
    return Math.max(0, team.remainingMs - (now - team.startedAt))
  }
  return Math.max(0, team.remainingMs)
}

export function formatRelayClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const min = Math.floor(total / 60)
  const sec = total % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

export function currentRelayShooter(team: RelayTeam, people: { userId: string; name: string }[]) {
  if (!team.playerIds.length) return null
  const userId = team.playerIds[team.currentOrder % team.playerIds.length]
  const person = people.find((item) => item.userId === userId)
  return { userId, name: person?.name || '선수' }
}

export function applyRelayShot(team: RelayTeam, made: boolean, people: { userId: string; name: string }[]): RelayTeam {
  const shooter = currentRelayShooter(team, people)
  const spot = RELAY_SPOTS[team.currentSpot] || RELAY_SPOTS[0]
  if (!shooter) return team
  const nextSpot = team.currentSpot + 1
  const wrapPlayer = nextSpot >= RELAY_SPOTS.length
  return {
    ...team,
    currentSpot: wrapPlayer ? 0 : nextSpot,
    currentOrder: wrapPlayer ? (team.currentOrder + 1) % team.playerIds.length : team.currentOrder,
    logs: [
      ...team.logs,
      {
        userId: shooter.userId,
        name: shooter.name,
        spot: spot.id,
        made,
        points: made ? spot.points : 0,
        at: new Date().toISOString(),
      },
    ],
  }
}

export function relayStanding(relay: RelayState) {
  return [...relay.teams].sort((a, b) => relayTeamScore(b) - relayTeamScore(a) || a.name.localeCompare(b.name, 'ko'))
}

export function gameEventBoard(game: ClubGame): EventBoard {
  const type = isEventType(game.eventType) ? game.eventType : 'free_throw'
  const fallback = emptyEventBoard({
    type,
    setCount: type === 'shooting_relay' ? clampRelayMinutes(game.eventSetCount || 3) : game.eventSetCount || 3,
    attemptCount: game.eventAttemptCount || 5,
  })
  return normalizeEventBoard(game.eventBoard, fallback)
}

export function syncEventPlayers(
  board: EventBoard,
  people: { userId: string; name: string }[]
): EventBoard {
  const byId = new Map(board.players.map((item) => [item.userId, item]))
  const players = people.map((person) => {
    const prev = byId.get(person.userId)
    return resizeSets(
      {
        userId: person.userId,
        name: person.name,
        eliminated: prev?.eliminated || false,
        sets: prev?.sets || [],
      },
      board.setCount,
      board.attemptCount
    )
  })
  for (const prev of board.players) {
    if (!players.some((item) => item.userId === prev.userId)) {
      players.push(resizeSets(prev, board.setCount, board.attemptCount))
    }
  }
  return { ...board, players }
}

export function cycleEventShot(value: EventShot): EventShot {
  if (value == null) return true
  if (value === true) return false
  return null
}

export function setMakes(shots: EventShot[]) {
  return shots.filter((item) => item === true).length
}

export function setTaken(shots: EventShot[]) {
  return shots.filter((item) => item != null).length
}

export function playerEventTotals(player: EventPlayer) {
  const makes = player.sets.reduce((sum, set) => sum + setMakes(set), 0)
  const taken = player.sets.reduce((sum, set) => sum + setTaken(set), 0)
  return { makes, taken, pct: taken ? Math.round((makes / taken) * 100) : 0 }
}

export function activeEventPlayers(board: EventBoard) {
  return board.players.filter((item) => !item.eliminated)
}

export function eventStanding(board: EventBoard) {
  return [...activeEventPlayers(board)].sort((a, b) => {
    const left = playerEventTotals(a)
    const right = playerEventTotals(b)
    if (right.makes !== left.makes) return right.makes - left.makes
    if (right.pct !== left.pct) return right.pct - left.pct
    return a.name.localeCompare(b.name, 'ko')
  })
}
