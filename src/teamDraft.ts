export type CourtFormat = '5v5' | '3v3'
export type DraftMode = 'balance' | 'position' | 'draft'
export type PositionGroup = 'G' | 'F' | 'C'

export const TEAM_LABELS = ['A팀', 'B팀', 'C팀', 'D팀'] as const
export const TEAM_TONES = ['#0f172a', '#c2410c', '#047857', '#4338ca'] as const

export const FIVE_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
export const THREE_SLOTS = ['1', '2', '3'] as const

export type PoolPlayer = {
  key: string
  source: 'member' | 'guest'
  userId?: string
  guestId?: string
  name: string
  position: string
  group: PositionGroup
  rating: number
  jersey?: number | null
}

export type LineupPlayer = PoolPlayer & {
  teamIndex: number
  isCaptain: boolean
  isStarter: boolean
  courtSlot?: string
  benchOrder?: number
  pickOrder?: number
}

export type LineupBoard = {
  id: string
  clubId: string
  sessionId: string
  mode: DraftMode
  format: CourtFormat
  teamCount: number
  draftTurn: number
  draftComplete: boolean
  players: LineupPlayer[]
}

export function positionGroup(position?: string | null, height?: number | null): PositionGroup {
  const value = (position || 'ALL').toUpperCase()
  if (value === 'PG' || value === 'SG' || value === 'G') return 'G'
  if (value === 'C') return 'C'
  if (value === 'SF' || value === 'PF' || value === 'F') return 'F'
  if (height && height >= 188) return 'C'
  if (height && height <= 178) return 'G'
  return 'F'
}

export function ratingFromRecord(input: {
  stats?: { points: number; rebounds: number; assists: number; fgm: number; fga: number; games: number }
  tags?: string[]
}): number {
  const stats = input.stats || { points: 0, rebounds: 0, assists: 0, fgm: 0, fga: 0, games: 0 }
  const games = Math.max(stats.games, 1)
  const ppg = stats.points / games
  const rpg = stats.rebounds / games
  const apg = stats.assists / games
  const fg = stats.fga ? stats.fgm / stats.fga : 0.4
  let rating = 42 + ppg * 1.8 + rpg * 1.1 + apg * 1.4 + fg * 18 + Math.min(stats.games, 12)
  const tags = input.tags || []
  if (tags.some((tag) => tag.includes('3점'))) rating += 3
  if (tags.some((tag) => tag.includes('리바운드'))) rating += 2
  if (tags.some((tag) => tag.includes('패스') || tag.includes('게임메이커'))) rating += 3
  if (tags.some((tag) => tag.includes('수비'))) rating += 2
  return Math.max(20, Math.min(99, Math.round(rating)))
}

export function starterCount(format: CourtFormat): number {
  return format === '3v3' ? 3 : 5
}

export function courtSlots(format: CourtFormat): readonly string[] {
  return format === '3v3' ? THREE_SLOTS : FIVE_SLOTS
}

function snakeAssign<T>(items: T[], teamCount: number): T[][] {
  const teams = Array.from({ length: teamCount }, () => [] as T[])
  let index = 0
  let direction = 1
  for (const item of items) {
    teams[index].push(item)
    index += direction
    if (index === teamCount || index < 0) {
      direction *= -1
      index += direction
    }
  }
  return teams
}

function teamScore(players: PoolPlayer[]): number {
  const rating = players.reduce((sum, item) => sum + item.rating, 0)
  const g = players.filter((item) => item.group === 'G').length
  const f = players.filter((item) => item.group === 'F').length
  const c = players.filter((item) => item.group === 'C').length
  return rating + g * 6 + f * 6 + c * 8
}

function variance(values: number[]): number {
  if (!values.length) return 0
  const mean = values.reduce((sum, item) => sum + item, 0) / values.length
  return values.reduce((sum, item) => sum + (item - mean) ** 2, 0) / values.length
}

function rebalance(teams: PoolPlayer[][]): PoolPlayer[][] {
  const next = teams.map((team) => [...team])
  for (let step = 0; step < 80; step += 1) {
    const scores = next.map(teamScore)
    const current = variance(scores)
    const a = step % next.length
    const b = (a + 1 + (step % Math.max(next.length - 1, 1))) % next.length
    if (!next[a].length || !next[b].length) continue
    const i = step % next[a].length
    const j = (step * 3) % next[b].length
    const copy = next.map((team) => [...team])
    const pa = copy[a][i]
    const pb = copy[b][j]
    copy[a][i] = pb
    copy[b][j] = pa
    const improved = variance(copy.map(teamScore))
    if (improved + 0.4 < current) {
      next[a][i] = pb
      next[b][j] = pa
    }
  }
  return next
}

function toLineupPlayers(teams: PoolPlayer[][], format: CourtFormat, captains: Set<string> = new Set()): LineupPlayer[] {
  return teams.flatMap((team, teamIndex) => placeOnCourt(team, teamIndex, format, captains))
}

export function placeOnCourt(
  team: PoolPlayer[],
  teamIndex: number,
  format: CourtFormat,
  captains: Set<string> = new Set()
): LineupPlayer[] {
  const slots = [...courtSlots(format)]
  const remaining = [...team].sort((a, b) => b.rating - a.rating)
  const starters: LineupPlayer[] = []

  const takeForSlot = (slot: string): PoolPlayer | null => {
    const preferred =
      slot === 'C'
        ? remaining.findIndex((item) => item.group === 'C')
        : slot === 'PG' || slot === 'SG'
          ? remaining.findIndex((item) => item.group === 'G')
          : slot === 'SF' || slot === 'PF'
            ? remaining.findIndex((item) => item.group === 'F')
            : 0
    const index = preferred >= 0 ? preferred : 0
    if (!remaining.length) return null
    return remaining.splice(index, 1)[0]
  }

  slots.forEach((slot) => {
    const player = takeForSlot(slot)
    if (!player) return
    starters.push({
      ...player,
      teamIndex,
      isCaptain: captains.has(player.key),
      isStarter: true,
      courtSlot: slot,
    })
  })

  const bench = remaining.map((player, index) => ({
    ...player,
    teamIndex,
    isCaptain: captains.has(player.key),
    isStarter: false,
    benchOrder: index + 1,
  }))

  return [...starters, ...bench].map((player, index) => ({
    ...player,
    pickOrder: index + 1,
  }))
}

export function generateBalancedTeams(pool: PoolPlayer[], teamCount: number, format: CourtFormat): LineupPlayer[] {
  const ranked = [...pool].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name, 'ko'))
  const teams = rebalance(snakeAssign(ranked, teamCount))
  return toLineupPlayers(teams, format)
}

export function generatePositionTeams(pool: PoolPlayer[], teamCount: number, format: CourtFormat): LineupPlayer[] {
  const groups: Record<PositionGroup, PoolPlayer[]> = { G: [], F: [], C: [] }
  for (const player of pool) groups[player.group].push(player)
  ;(['C', 'G', 'F'] as PositionGroup[]).forEach((group) => {
    groups[group].sort((a, b) => b.rating - a.rating)
  })
  const teams = Array.from({ length: teamCount }, () => [] as PoolPlayer[])
  ;(['C', 'G', 'F'] as PositionGroup[]).forEach((group) => {
    snakeAssign(groups[group], teamCount).forEach((chunk, index) => {
      teams[index].push(...chunk)
    })
  })
  return toLineupPlayers(teams, format)
}

export function startDraftBoard(captains: PoolPlayer[], teamCount: number, format: CourtFormat): LineupPlayer[] {
  return captains.slice(0, teamCount).map((player, teamIndex) => ({
    ...player,
    teamIndex,
    isCaptain: true,
    isStarter: true,
    courtSlot: courtSlots(format)[0],
    pickOrder: 1,
  }))
}

export function teamDraftQuota(totalPlayers: number, teamCount: number, teamIndex: number): number {
  if (teamCount <= 0) return 0
  const base = Math.floor(totalPlayers / teamCount)
  const extra = totalPlayers % teamCount
  return base + (teamIndex < extra ? 1 : 0)
}

export function sequentialDraftTeam(assigned: LineupPlayer[], teamCount: number, totalPlayers: number): number {
  for (let index = 0; index < teamCount; index += 1) {
    const have = assigned.filter((item) => item.teamIndex === index).length
    if (have < teamDraftQuota(totalPlayers, teamCount, index)) return index
  }
  return Math.max(0, teamCount - 1)
}

export function applyDraftPick(
  board: LineupPlayer[],
  player: PoolPlayer,
  teamIndex: number,
  format: CourtFormat,
  pickOrder: number
): LineupPlayer[] {
  const team = lineupRotationOrder(
    board.filter((item) => item.teamIndex === teamIndex),
    format
  )
  const slots = courtSlots(format)
  const starterSlots = team.filter((item) => item.isStarter).length
  const isStarter = starterSlots < starterCount(format)
  return [
    ...board,
    {
      ...player,
      teamIndex,
      isCaptain: false,
      isStarter,
      courtSlot: isStarter ? slots[starterSlots] : undefined,
      benchOrder: isStarter ? undefined : team.filter((item) => !item.isStarter).length + 1,
      pickOrder: pickOrder || team.length + 1,
    },
  ]
}

export function playersOfTeam(players: LineupPlayer[], teamIndex: number): LineupPlayer[] {
  return players.filter((item) => item.teamIndex === teamIndex)
}

export function teamRating(players: LineupPlayer[]): number {
  if (!players.length) return 0
  return Math.round(players.reduce((sum, item) => sum + item.rating, 0) / players.length)
}

export type RotationEntry = {
  key: string
  userId?: string
  name: string
  order: number
}

export type RotationTeam = {
  label: string
  teamIndex: number
  team: 'h' | 'a'
  ordered: RotationEntry[]
  byQuarter: Record<number, RotationEntry[]>
}

export const THREE_TEAM_ROUNDS = [1, 2, 3] as const

export function threeTeamMatchup(round: number): { home: number; away: number; rest: number; round: number } {
  const cycle = ((Math.max(round, 1) - 1) % 3) as 0 | 1 | 2
  const table = [
    { home: 0, away: 1, rest: 2 },
    { home: 1, away: 2, rest: 0 },
    { home: 2, away: 0, rest: 1 },
  ] as const
  return { ...table[cycle], round: cycle + 1 }
}

export function lineupRotationOrder(players: LineupPlayer[], format: CourtFormat): LineupPlayer[] {
  const slots = [...courtSlots(format)]
  return [...players].sort((a, b) => {
    if (a.pickOrder != null && b.pickOrder != null && a.pickOrder !== b.pickOrder) {
      return a.pickOrder - b.pickOrder
    }
    const rank = (player: LineupPlayer) => {
      if (player.isStarter) {
        const index = player.courtSlot ? slots.indexOf(player.courtSlot as (typeof slots)[number]) : -1
        return index >= 0 ? index : slots.length
      }
      return 100 + (player.benchOrder ?? 99)
    }
    return rank(a) - rank(b) || a.name.localeCompare(b.name, 'ko')
  })
}

export function applyTeamRosterOrder(
  players: LineupPlayer[],
  teamIndex: number,
  ordered: LineupPlayer[],
  format: CourtFormat
): LineupPlayer[] {
  const slots = courtSlots(format)
  const courtSize = starterCount(format)
  const captains = new Set(players.filter((item) => item.isCaptain).map((item) => item.key))
  const updated = ordered.map((player, index) => {
    const starter = index < courtSize
    return {
      ...player,
      teamIndex,
      isCaptain: captains.has(player.key),
      isStarter: starter,
      courtSlot: starter ? slots[index] : undefined,
      benchOrder: starter ? undefined : index - courtSize + 1,
      pickOrder: index + 1,
    }
  })
  return [...players.filter((item) => item.teamIndex !== teamIndex), ...updated]
}

export function moveTeamOrder(
  players: LineupPlayer[],
  key: string,
  direction: -1 | 1,
  format: CourtFormat
): LineupPlayer[] {
  const target = players.find((item) => item.key === key)
  if (!target) return players
  const ordered = lineupRotationOrder(
    players.filter((item) => item.teamIndex === target.teamIndex),
    format
  )
  const index = ordered.findIndex((item) => item.key === key)
  return reorderTeam(players, target.teamIndex, index, index + direction, format)
}

export function reorderTeam(
  players: LineupPlayer[],
  teamIndex: number,
  fromIndex: number,
  toIndex: number,
  format: CourtFormat
): LineupPlayer[] {
  const ordered = lineupRotationOrder(
    players.filter((item) => item.teamIndex === teamIndex),
    format
  )
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ordered.length ||
    toIndex >= ordered.length
  ) {
    return players
  }
  const next = [...ordered]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return applyTeamRosterOrder(players, teamIndex, next, format)
}

export function onCourtForQuarter<T>(ordered: T[], courtSize: number, quarter: number): T[] {
  const n = ordered.length
  if (!n) return []
  const size = Math.min(Math.max(courtSize, 1), n)
  const start = ((Math.max(quarter, 1) - 1) * size) % n
  return Array.from({ length: size }, (_, i) => ordered[(start + i) % n])
}

export function toRotationEntries(ordered: LineupPlayer[]): RotationEntry[] {
  return ordered.map((player, index) => ({
    key: player.key,
    userId: player.userId,
    name: player.name,
    order: index + 1,
  }))
}

export function moveBenchOrder(players: LineupPlayer[], key: string, direction: -1 | 1): LineupPlayer[] {
  const target = players.find((item) => item.key === key)
  if (!target || target.isStarter || target.benchOrder == null) return players
  const currentOrder = target.benchOrder
  const swapWith = players.find(
    (item) => item.teamIndex === target.teamIndex && !item.isStarter && item.benchOrder === currentOrder + direction
  )
  if (!swapWith || swapWith.benchOrder == null) return players
  const swapOrder = swapWith.benchOrder
  return players.map((item) => {
    if (item.key === target.key) return { ...item, benchOrder: swapOrder }
    if (item.key === swapWith.key) return { ...item, benchOrder: currentOrder }
    return item
  })
}

export function swapStarterWithBench(players: LineupPlayer[], starterKey: string, benchKey: string): LineupPlayer[] {
  const starter = players.find((item) => item.key === starterKey)
  const bench = players.find((item) => item.key === benchKey)
  if (!starter || !bench || starter.teamIndex !== bench.teamIndex) return players
  const slot = starter.courtSlot
  return players.map((item) => {
    if (item.key === starterKey) {
      return { ...item, isStarter: false, courtSlot: undefined, benchOrder: bench.benchOrder || 1 }
    }
    if (item.key === benchKey) {
      return { ...item, isStarter: true, courtSlot: slot, benchOrder: undefined }
    }
    return item
  })
}

export function groupLabel(group: PositionGroup): string {
  if (group === 'G') return '가드'
  if (group === 'C') return '센터'
  return '포워드'
}

export function modeLabel(mode: DraftMode): string {
  if (mode === 'balance') return '밸런스'
  if (mode === 'position') return '포지션 우선'
  return '드래프트'
}
