import { supabase } from './supabaseClient'
import { newId } from './clubRoster'
import { listStaffUserIds } from './clubMembership'
import {
  EMPTY_QUARTERS,
  approvedMemberIds,
  notifyUsers,
  saveClubGame,
  type ClubGame,
} from './clubGames'

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

export type ExchangeMatchType = 'friendly' | 'practice' | 'league'
export type ExchangeFormat = '5v5' | '3v3'
export type ExchangeVenueChoice = 'home' | 'away' | 'neutral' | 'discuss'
export type ExchangeStatus = 'pending' | 'countered' | 'accepted' | 'rejected' | 'cancelled' | 'confirmed'

export type ExchangeSlot = {
  date: string
  time: string
}

export type ClubSearchHit = {
  id: string
  name: string
  region: string
  homeCourt: string
}

export type ExchangeProposal = {
  id: string
  fromClubId: string
  toClubId: string
  fromClubName: string
  toClubName: string
  fromHomeCourt: string
  toHomeCourt: string
  matchType: ExchangeMatchType
  format: ExchangeFormat
  slots: ExchangeSlot[]
  venueChoice: ExchangeVenueChoice
  venueNote: string
  message: string
  status: ExchangeStatus
  waitingClubId: string
  selectedSlot?: ExchangeSlot
  confirmedVenue: string
  rejectReason: string
  hostGameId?: string
  guestGameId?: string
  createdBy?: string
  updatedAt: string
}

const storageKey = 'bb_exchange_proposals'

export const MATCH_TYPES: { id: ExchangeMatchType; label: string }[] = [
  { id: 'friendly', label: '친선전' },
  { id: 'practice', label: '연습경기' },
  { id: 'league', label: '교류리그' },
]

export const MATCH_FORMATS: { id: ExchangeFormat; label: string }[] = [
  { id: '5v5', label: '5:5' },
  { id: '3v3', label: '3:3' },
]

export const VENUE_CHOICES: { id: ExchangeVenueChoice; label: string }[] = [
  { id: 'home', label: '우리 팀 홈' },
  { id: 'away', label: '상대 팀 홈' },
  { id: 'neutral', label: '중립 장소' },
  { id: 'discuss', label: '협의 필요' },
]

export function matchTypeLabel(type: ExchangeMatchType) {
  return MATCH_TYPES.find((item) => item.id === type)?.label || '친선전'
}

export function venueChoiceLabel(choice: ExchangeVenueChoice) {
  return VENUE_CHOICES.find((item) => item.id === choice)?.label || '협의 필요'
}

export function exchangeStatusLabel(status: ExchangeStatus) {
  if (status === 'pending') return '대기'
  if (status === 'countered') return '수정 제안'
  if (status === 'accepted') return '수락'
  if (status === 'rejected') return '거절'
  if (status === 'cancelled') return '취소'
  return '확정'
}

export function formatExchangeSlot(slot: ExchangeSlot) {
  const [y, m, d] = slot.date.split('-').map(Number)
  const date = new Date(y, (m || 1) - 1, d || 1)
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekday}요일 ${slot.time}`
}

export function defaultExchangeSlots(): ExchangeSlot[] {
  const slots: ExchangeSlot[] = []
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  let cursor = new Date(start)
  while (slots.length < 3) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
    const day = cursor.getDay()
    if (day === 6) {
      slots.push({ date: ymd(cursor), time: '14:00' })
    } else if (day === 0) {
      slots.push({ date: ymd(cursor), time: '16:00' })
    }
  }
  return slots
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function readAll(): ExchangeProposal[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '[]') as ExchangeProposal[]
  } catch {
    return []
  }
}

function writeAll(list: ExchangeProposal[]) {
  localStorage.setItem(storageKey, JSON.stringify(list.slice(0, 200)))
}

function rowToProposal(row: any): ExchangeProposal {
  const slots = Array.isArray(row.slots) ? row.slots : []
  return {
    id: row.id,
    fromClubId: row.from_club_id,
    toClubId: row.to_club_id,
    fromClubName: row.from_club_name,
    toClubName: row.to_club_name,
    fromHomeCourt: row.from_home_court || '',
    toHomeCourt: row.to_home_court || '',
    matchType: (row.match_type || 'friendly') as ExchangeMatchType,
    format: row.format === '3v3' ? '3v3' : '5v5',
    slots: slots.map((item: any) => ({ date: String(item.date).slice(0, 10), time: String(item.time).slice(0, 5) })),
    venueChoice: (row.venue_choice || 'discuss') as ExchangeVenueChoice,
    venueNote: row.venue_note || '',
    message: row.message || '',
    status: (row.status || 'pending') as ExchangeStatus,
    waitingClubId: row.waiting_club_id || row.to_club_id,
    selectedSlot: row.selected_date
      ? { date: String(row.selected_date).slice(0, 10), time: String(row.selected_time || '14:00').slice(0, 5) }
      : undefined,
    confirmedVenue: row.confirmed_venue || '',
    rejectReason: row.reject_reason || '',
    hostGameId: row.host_game_id || undefined,
    guestGameId: row.guest_game_id || undefined,
    createdBy: row.created_by || undefined,
    updatedAt: row.updated_at || row.created_at,
  }
}

function asUuid(value?: string | null) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

function toPayload(next: ExchangeProposal) {
  return {
    id: next.id,
    from_club_id: next.fromClubId,
    to_club_id: next.toClubId,
    from_club_name: next.fromClubName,
    to_club_name: next.toClubName,
    from_home_court: next.fromHomeCourt,
    to_home_court: next.toHomeCourt,
    match_type: next.matchType,
    format: next.format,
    slots: next.slots,
    venue_choice: next.venueChoice,
    venue_note: next.venueNote,
    message: next.message,
    status: next.status,
    waiting_club_id: asUuid(next.waitingClubId),
    selected_date: next.selectedSlot?.date || null,
    selected_time: next.selectedSlot?.time || null,
    confirmed_venue: next.confirmedVenue,
    reject_reason: next.rejectReason,
    host_game_id: next.hostGameId || null,
    guest_game_id: next.guestGameId || null,
    created_by: asUuid(next.createdBy),
    updated_at: next.updatedAt,
  }
}

export async function searchRegisteredClubs(query: string, excludeClubId: string): Promise<ClubSearchHit[]> {
  let req = supabase.from('clubs').select('id, name, region, home_court, region_sido, region_sigungu').neq('id', excludeClubId).order('name').limit(30)
  const q = query.trim().replace(/[%(),]/g, '')
  if (q) req = req.or(`name.ilike.%${q}%,region.ilike.%${q}%`)
  const { data, error } = await req
  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    region: row.region || `${row.region_sido || ''} ${row.region_sigungu || ''}`.trim(),
    homeCourt: row.home_court || '',
  }))
}

export async function listClubProposals(clubId: string): Promise<ExchangeProposal[]> {
  const { data, error } = await supabase
    .from('club_exchange_proposals')
    .select('*')
    .or(`from_club_id.eq.${clubId},to_club_id.eq.${clubId}`)
    .order('updated_at', { ascending: false })
  if (error && !isMissingSchema(error)) throw error
  const local = readAll().filter((item) => item.fromClubId === clubId || item.toClubId === clubId)
  if (isMissingSchema(error) || !data) return local
  const remote = data.map(rowToProposal)
  const byId = Object.fromEntries(local.map((item) => [item.id, item]))
  return remote.map((item) => byId[item.id] ? { ...item, ...byId[item.id] } : item)
}

export async function getProposal(id: string): Promise<ExchangeProposal | null> {
  const { data, error } = await supabase.from('club_exchange_proposals').select('*').eq('id', id).maybeSingle()
  if (error && !isMissingSchema(error)) throw error
  if (data) return rowToProposal(data)
  return readAll().find((item) => item.id === id) || null
}

async function persist(next: ExchangeProposal) {
  const payload = toPayload(next)
  const { error } = await supabase.from('club_exchange_proposals').upsert(payload)
  if (error && !isMissingSchema(error)) throw error
  writeAll([next, ...readAll().filter((item) => item.id !== next.id)])
  return next
}

async function notifyClubStaff(clubId: string, title: string, body: string, kind: string, proposalId: string) {
  const staffIds = await listStaffUserIds(clubId)
  await notifyUsers({
    clubId,
    userIds: staffIds,
    title,
    body,
    kind,
    gameId: `proposal:${proposalId}`,
    proposalId,
  })
}

export function otherClubName(proposal: ExchangeProposal, clubId: string) {
  return proposal.fromClubId === clubId ? proposal.toClubName : proposal.fromClubName
}

export function isWaitingOn(proposal: ExchangeProposal, clubId: string) {
  return (proposal.status === 'pending' || proposal.status === 'countered') && proposal.waitingClubId === clubId
}

export function resolveVenueText(proposal: ExchangeProposal, fromPerspective = true) {
  if (proposal.venueChoice === 'home') return proposal.fromHomeCourt || `${proposal.fromClubName} 홈`
  if (proposal.venueChoice === 'away') return proposal.toHomeCourt || `${proposal.toClubName} 홈`
  if (proposal.venueNote.trim()) return proposal.venueNote.trim()
  if (proposal.venueChoice === 'neutral') return '중립 장소'
  return fromPerspective ? '협의 필요' : '협의 필요'
}

export async function sendExchangeProposal(input: Omit<ExchangeProposal, 'id' | 'status' | 'waitingClubId' | 'updatedAt' | 'confirmedVenue' | 'rejectReason'>): Promise<ExchangeProposal> {
  if (!input.slots.length) throw new Error('희망 날짜를 하나 이상 선택해 주세요.')
  const next: ExchangeProposal = {
    ...input,
    id: newId(),
    status: 'pending',
    waitingClubId: input.toClubId,
    confirmedVenue: '',
    rejectReason: '',
    updatedAt: new Date().toISOString(),
  }
  await persist(next)
  await notifyClubStaff(
    next.toClubId,
    `[림] ${next.fromClubName} 교류전 제안`,
    `${matchTypeLabel(next.matchType)} · ${next.format} · ${next.slots.map(formatExchangeSlot).join(', ')}`,
    'exchange_request',
    next.id
  )
  return next
}

export async function counterExchangeProposal(
  proposal: ExchangeProposal,
  clubId: string,
  patch: Pick<ExchangeProposal, 'matchType' | 'format' | 'slots' | 'venueChoice' | 'venueNote' | 'message'>
): Promise<ExchangeProposal> {
  if (!isWaitingOn(proposal, clubId)) throw new Error('지금은 상대 팀 차례입니다. 응답을 기다려 주세요.')
  const waiting = clubId === proposal.fromClubId ? proposal.toClubId : proposal.fromClubId
  const next: ExchangeProposal = {
    ...proposal,
    ...patch,
    status: 'countered',
    waitingClubId: waiting,
    updatedAt: new Date().toISOString(),
  }
  await persist(next)
  await notifyClubStaff(
    waiting,
    `[림] ${otherClubName(next, waiting)} 교류전 수정 제안`,
    next.message || `${matchTypeLabel(next.matchType)} · ${next.format}`,
    'exchange_counter',
    next.id
  )
  return next
}

export async function rejectExchangeProposal(proposal: ExchangeProposal, clubId: string, reason: string): Promise<ExchangeProposal> {
  if (!isWaitingOn(proposal, clubId)) throw new Error('이 제안을 거절할 수 없습니다.')
  const next: ExchangeProposal = {
    ...proposal,
    status: 'rejected',
    waitingClubId: '',
    rejectReason: reason.trim(),
    updatedAt: new Date().toISOString(),
  }
  await persist(next)
  const other = clubId === proposal.fromClubId ? proposal.toClubId : proposal.fromClubId
  await notifyClubStaff(
    other,
    `[림] ${otherClubName(proposal, other)} 교류전 거절`,
    reason.trim() || '상대 팀이 교류전을 거절했습니다.',
    'exchange_rejected',
    next.id
  )
  return next
}

export async function cancelExchangeProposal(proposal: ExchangeProposal, clubId: string): Promise<ExchangeProposal> {
  if (proposal.fromClubId !== clubId || proposal.status === 'confirmed') throw new Error('이 제안을 취소할 수 없습니다.')
  const next: ExchangeProposal = {
    ...proposal,
    status: 'cancelled',
    waitingClubId: '',
    updatedAt: new Date().toISOString(),
  }
  await persist(next)
  if (proposal.status === 'pending' || proposal.status === 'countered') {
    await notifyClubStaff(
      proposal.toClubId,
      `[림] ${proposal.fromClubName} 교류전 취소`,
      '상대 팀이 교류전 제안을 취소했습니다.',
      'exchange_rejected',
      next.id
    )
  }
  return next
}

export async function confirmExchangeProposal(params: {
  proposal: ExchangeProposal
  clubId: string
  slot: ExchangeSlot
  venueText?: string
  userId?: string
}): Promise<ExchangeProposal> {
  const { proposal, clubId, slot } = params
  if (!isWaitingOn(proposal, clubId)) throw new Error('이 제안을 수락할 수 없습니다.')
  const venue = (params.venueText || proposal.venueNote || resolveVenueText(proposal)).trim()
  if (!venue || venue === '협의 필요') throw new Error('확정 장소를 입력해 주세요.')

  const quarterCount = proposal.format === '3v3' ? 2 : 4
  const endTime = addHours(slot.time, 2)
  const notes = [
    `${matchTypeLabel(proposal.matchType)} · ${proposal.format}`,
    proposal.message,
  ].filter(Boolean).join('\n')

  const fromGame: ClubGame = {
    id: newId(),
    clubId: proposal.fromClubId,
    title: `교류전 vs ${proposal.toClubName}`,
    gameDate: slot.date,
    startTime: slot.time,
    endTime,
    venue,
    notes,
    opponent: proposal.toClubName,
    opponentContact: '',
    opponentPhone: '',
    opponentRegion: '',
    matchKind: 'exchange',
    homeName: proposal.fromClubName,
    awayName: proposal.toClubName,
    quarterCount,
    currentQuarter: 1,
    scores: EMPTY_QUARTERS(),
    fouls: EMPTY_QUARTERS(),
    isLive: false,
    createdBy: params.userId,
    updatedAt: new Date().toISOString(),
    opponentClubId: proposal.toClubId,
    proposalId: proposal.id,
  }
  const toGame: ClubGame = {
    ...fromGame,
    id: newId(),
    clubId: proposal.toClubId,
    title: `교류전 vs ${proposal.fromClubName}`,
    opponent: proposal.fromClubName,
    homeName: proposal.toClubName,
    awayName: proposal.fromClubName,
    opponentClubId: proposal.fromClubId,
  }

  const [fromMembers, toMembers] = await Promise.all([
    approvedMemberIds(proposal.fromClubId),
    approvedMemberIds(proposal.toClubId),
  ])
  const savedFrom = await saveClubGame(fromGame, {
    clubName: proposal.fromClubName,
    memberIds: fromMembers.map((item) => item.id),
  })
  const savedTo = await saveClubGame(toGame, {
    clubName: proposal.toClubName,
    memberIds: toMembers.map((item) => item.id),
  })

  const next: ExchangeProposal = {
    ...proposal,
    status: 'confirmed',
    waitingClubId: '',
    selectedSlot: slot,
    confirmedVenue: venue,
    hostGameId: savedFrom.id,
    guestGameId: savedTo.id,
    updatedAt: new Date().toISOString(),
  }
  await persist(next)
  await notifyClubStaff(
    proposal.fromClubId === clubId ? proposal.toClubId : proposal.fromClubId,
    `[림] 교류전이 확정되었습니다`,
    `${formatExchangeSlot(slot)} · ${venue} · ${proposal.fromClubName} vs ${proposal.toClubName}`,
    'exchange_confirmed',
    next.id
  )
  return next
}

function addHours(time: string, hours: number) {
  const [h, m] = time.split(':').map(Number)
  const next = ((h || 0) + hours) % 24
  return `${String(next).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`
}

export function emptyProposalDraft(params: {
  fromClubId: string
  fromClubName: string
  fromHomeCourt: string
  to: ClubSearchHit
  userId?: string
}): Omit<ExchangeProposal, 'id' | 'status' | 'waitingClubId' | 'updatedAt' | 'confirmedVenue' | 'rejectReason'> {
  return {
    fromClubId: params.fromClubId,
    toClubId: params.to.id,
    fromClubName: params.fromClubName,
    toClubName: params.to.name,
    fromHomeCourt: params.fromHomeCourt,
    toHomeCourt: params.to.homeCourt,
    matchType: 'friendly',
    format: '5v5',
    slots: defaultExchangeSlots(),
    venueChoice: 'home',
    venueNote: '',
    message: '토요일 오후에 친선 경기 가능하실까요?',
    createdBy: params.userId,
  }
}
