import { supabase } from './supabaseClient'
import { newId } from './clubRoster'
import { isStaffRole } from './clubMembership'
import { isRegularClubRole } from './clubEvents'
import { notifyUsers } from './clubGames'

export type PollType = 'yesno' | 'single' | 'multi' | 'rank'
export type PollAudience = 'all' | 'staff'
export type PollResultVisibility = 'live' | 'after' | 'staff'
export type PollQuorumAction = 'void' | 'staff' | 'extend'
export type PollStatus = 'open' | 'closed' | 'void'
export type PollOptionKind = 'text' | 'datetime' | 'place' | 'link'

export type ClubPollOption = {
  id: string
  pollId: string
  label: string
  optionKind: PollOptionKind
  sortOrder: number
}

export type ClubPoll = {
  id: string
  clubId: string
  title: string
  description: string
  pollType: PollType
  audience: PollAudience
  anonymous: boolean
  maxChoices: number
  resultVisibility: PollResultVisibility
  closesAt?: string
  minVoters: number
  quorumAction: PollQuorumAction
  status: PollStatus
  createdBy?: string
  createdAt: string
  options: ClubPollOption[]
}

export type ClubPollVote = {
  id: string
  pollId: string
  optionId: string
  userId: string
  rankOrder?: number
  createdAt: string
}

export type PollOptionResult = {
  option: ClubPollOption
  count: number
  percent: number
  voterIds: string[]
  score?: number
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

function storageKey(clubId: string) {
  return `bb_club_polls_${clubId}`
}

function votesKey(pollId: string) {
  return `bb_club_poll_votes_${pollId}`
}

function localBundle(clubId: string): { polls: ClubPoll[]; votes: Record<string, ClubPollVote[]> } {
  if (typeof window === 'undefined') return { polls: [], votes: {} }
  try {
    return JSON.parse(localStorage.getItem(storageKey(clubId)) || '{"polls":[],"votes":{}}')
  } catch {
    return { polls: [], votes: {} }
  }
}

function writeLocal(clubId: string, bundle: { polls: ClubPoll[]; votes: Record<string, ClubPollVote[]> }) {
  if (typeof window === 'undefined') return
  localStorage.setItem(storageKey(clubId), JSON.stringify(bundle))
}

function rowToPoll(row: any, options: ClubPollOption[] = []): ClubPoll {
  return {
    id: String(row.id),
    clubId: String(row.club_id || row.clubId),
    title: row.title || '',
    description: row.description || '',
    pollType: (row.poll_type || row.pollType || 'single') as PollType,
    audience: (row.audience || 'all') as PollAudience,
    anonymous: Boolean(row.anonymous),
    maxChoices: Number(row.max_choices ?? row.maxChoices ?? 1) || 1,
    resultVisibility: (row.result_visibility || row.resultVisibility || 'live') as PollResultVisibility,
    closesAt: row.closes_at || row.closesAt || undefined,
    minVoters: Number(row.min_voters ?? row.minVoters ?? 0) || 0,
    quorumAction: (row.quorum_action || row.quorumAction || 'staff') as PollQuorumAction,
    status: (row.status || 'open') as PollStatus,
    createdBy: row.created_by || row.createdBy || undefined,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    options,
  }
}

function rowToOption(row: any): ClubPollOption {
  return {
    id: String(row.id),
    pollId: String(row.poll_id || row.pollId),
    label: row.label || '',
    optionKind: (row.option_kind || row.optionKind || 'text') as PollOptionKind,
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0) || 0,
  }
}

function rowToVote(row: any): ClubPollVote {
  return {
    id: String(row.id),
    pollId: String(row.poll_id || row.pollId),
    optionId: String(row.option_id || row.optionId),
    userId: String(row.user_id || row.userId),
    rankOrder: row.rank_order ?? row.rankOrder ?? undefined,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  }
}

export function pollTypeLabel(type: PollType) {
  if (type === 'yesno') return '찬반'
  if (type === 'multi') return '다중 선택'
  if (type === 'rank') return '순위 투표'
  return '단일 선택'
}

export function isPollClosed(poll: ClubPoll, now = new Date()) {
  if (poll.status !== 'open') return true
  if (poll.closesAt && new Date(poll.closesAt).getTime() <= now.getTime()) return true
  return false
}

export function canUserSeePoll(poll: ClubPoll, role?: string | null) {
  if (!isRegularClubRole(role)) return false
  if (poll.audience === 'staff') return isStaffRole(role)
  return true
}

export function canUserCreatePoll(role?: string | null) {
  return isStaffRole(role)
}

export function remainingLabel(closesAt?: string, now = new Date()) {
  if (!closesAt) return '마감 없음'
  const end = new Date(closesAt).getTime()
  const diff = end - now.getTime()
  if (diff <= 0) return '마감됨'
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  if (days > 0) return `마감까지 ${days}일 ${remHours}시간`
  const mins = Math.floor((diff % 3600000) / 60000)
  if (hours > 0) return `마감까지 ${hours}시간 ${mins}분`
  return `마감까지 ${Math.max(1, mins)}분`
}

export async function listClubPolls(clubId: string): Promise<ClubPoll[]> {
  const { data, error } = await supabase
    .from('club_polls')
    .select('*')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error) || !data) {
    return localBundle(clubId).polls.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  const ids = data.map((row) => row.id)
  const optionsRes = ids.length
    ? await supabase.from('club_poll_options').select('*').in('poll_id', ids).order('sort_order')
    : { data: [] as any[], error: null }
  if (optionsRes.error && !isMissingSchema(optionsRes.error)) throw optionsRes.error
  const byPoll: Record<string, ClubPollOption[]> = {}
  for (const row of optionsRes.data || []) {
    const option = rowToOption(row)
    byPoll[option.pollId] = [...(byPoll[option.pollId] || []), option]
  }
  return data.map((row) => rowToPoll(row, (byPoll[row.id] || []).sort((a, b) => a.sortOrder - b.sortOrder)))
}

export async function listPollVotes(pollId: string): Promise<ClubPollVote[]> {
  const { data, error } = await supabase.from('club_poll_votes').select('*').eq('poll_id', pollId)
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error) || !data) {
    if (typeof window === 'undefined') return []
    try {
      return JSON.parse(localStorage.getItem(votesKey(pollId)) || '[]')
    } catch {
      return []
    }
  }
  return data.map(rowToVote)
}

export async function createClubPoll(input: {
  clubId: string
  clubName?: string
  createdBy: string
  title: string
  description: string
  pollType: PollType
  audience: PollAudience
  anonymous: boolean
  maxChoices: number
  resultVisibility: PollResultVisibility
  closesAt?: string
  minVoters: number
  quorumAction: PollQuorumAction
  options: { label: string; optionKind?: PollOptionKind }[]
  notifyMemberIds?: string[]
}): Promise<ClubPoll> {
  const title = input.title.trim()
  if (!title) throw new Error('투표 제목을 입력해 주세요.')
  let optionLabels = input.options.map((item) => ({ ...item, label: item.label.trim() })).filter((item) => item.label)
  if (input.pollType === 'yesno') {
    optionLabels = [
      { label: '찬성', optionKind: 'text' },
      { label: '반대', optionKind: 'text' },
    ]
  }
  if (optionLabels.length < 2) throw new Error('선택지를 2개 이상 입력해 주세요.')
  const maxChoices =
    input.pollType === 'single' || input.pollType === 'yesno'
      ? 1
      : Math.max(1, Math.min(optionLabels.length, input.maxChoices || 1))

  const poll: ClubPoll = {
    id: newId(),
    clubId: input.clubId,
    title,
    description: input.description.trim(),
    pollType: input.pollType,
    audience: input.audience,
    anonymous: input.anonymous,
    maxChoices,
    resultVisibility: input.resultVisibility,
    closesAt: input.closesAt || undefined,
    minVoters: Math.max(0, input.minVoters || 0),
    quorumAction: input.quorumAction,
    status: 'open',
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
    options: optionLabels.map((item, index) => ({
      id: newId(),
      pollId: '',
      label: item.label,
      optionKind: item.optionKind || 'text',
      sortOrder: index,
    })),
  }
  poll.options = poll.options.map((item) => ({ ...item, pollId: poll.id }))

  const pollPayload = {
    id: poll.id,
    club_id: poll.clubId,
    title: poll.title,
    description: poll.description,
    poll_type: poll.pollType,
    audience: poll.audience,
    anonymous: poll.anonymous,
    max_choices: poll.maxChoices,
    result_visibility: poll.resultVisibility,
    closes_at: poll.closesAt || null,
    min_voters: poll.minVoters,
    quorum_action: poll.quorumAction,
    status: poll.status,
    created_by: poll.createdBy || null,
    created_at: poll.createdAt,
    updated_at: poll.createdAt,
  }
  const { error } = await supabase.from('club_polls').insert(pollPayload)
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error)) {
    const bundle = localBundle(input.clubId)
    bundle.polls = [poll, ...bundle.polls.filter((item) => item.id !== poll.id)]
    writeLocal(input.clubId, bundle)
  } else {
    const { error: optError } = await supabase.from('club_poll_options').insert(
      poll.options.map((item) => ({
        id: item.id,
        poll_id: poll.id,
        label: item.label,
        option_kind: item.optionKind,
        sort_order: item.sortOrder,
      }))
    )
    if (optError) throw optError
  }

  if (input.notifyMemberIds?.length) {
    await notifyUsers({
      clubId: input.clubId,
      userIds: input.notifyMemberIds,
      title: `[림] ${input.clubName || '동아리'} 새 투표`,
      body: poll.title,
      kind: 'club_poll',
    })
  }
  return poll
}

export async function closeClubPoll(poll: ClubPoll, status: PollStatus = 'closed'): Promise<ClubPoll> {
  const next = { ...poll, status }
  const { error } = await supabase
    .from('club_polls')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', poll.id)
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error)) {
    const bundle = localBundle(poll.clubId)
    bundle.polls = bundle.polls.map((item) => (item.id === poll.id ? next : item))
    writeLocal(poll.clubId, bundle)
  }
  return next
}

export async function castPollVotes(input: {
  poll: ClubPoll
  userId: string
  optionIds: string[]
}): Promise<ClubPollVote[]> {
  const poll = input.poll
  if (isPollClosed(poll)) throw new Error('마감된 투표입니다.')
  const unique = [...new Set(input.optionIds.map(String))]
  if (!unique.length) throw new Error('선택지를 골라 주세요.')
  if (poll.pollType === 'yesno' || poll.pollType === 'single') {
    if (unique.length !== 1) throw new Error('하나만 선택할 수 있습니다.')
  } else if (poll.pollType === 'multi') {
    if (unique.length > poll.maxChoices) throw new Error(`최대 ${poll.maxChoices}개까지 선택할 수 있습니다.`)
  } else if (poll.pollType === 'rank') {
    if (unique.length < 2) throw new Error('순위 투표는 2개 이상 골라 주세요.')
  }
  const valid = new Set(poll.options.map((item) => item.id))
  if (unique.some((id) => !valid.has(id))) throw new Error('잘못된 선택지입니다.')

  const now = new Date().toISOString()
  const votes: ClubPollVote[] = unique.map((optionId, index) => ({
    id: newId(),
    pollId: poll.id,
    optionId,
    userId: String(input.userId),
    rankOrder: poll.pollType === 'rank' ? index + 1 : undefined,
    createdAt: now,
  }))

  const del = await supabase.from('club_poll_votes').delete().eq('poll_id', poll.id).eq('user_id', input.userId)
  if (del.error && !isMissingSchema(del.error)) throw del.error
  if (isMissingSchema(del.error)) {
    const prev = await listPollVotes(poll.id)
    const next = [...prev.filter((item) => item.userId !== input.userId), ...votes]
    localStorage.setItem(votesKey(poll.id), JSON.stringify(next))
    const bundle = localBundle(poll.clubId)
    bundle.votes[poll.id] = next
    writeLocal(poll.clubId, bundle)
    return votes
  }
  const { error } = await supabase.from('club_poll_votes').insert(
    votes.map((item) => ({
      id: item.id,
      poll_id: item.pollId,
      option_id: item.optionId,
      user_id: item.userId,
      rank_order: item.rankOrder ?? null,
      created_at: item.createdAt,
    }))
  )
  if (error) throw error
  return votes
}

export function voterCount(votes: ClubPollVote[]) {
  return new Set(votes.map((item) => item.userId)).size
}

export function myVoteOptionIds(votes: ClubPollVote[], userId: string) {
  return votes
    .filter((item) => item.userId === userId)
    .sort((a, b) => (a.rankOrder || 0) - (b.rankOrder || 0))
    .map((item) => item.optionId)
}

export function canViewPollResults(poll: ClubPoll, role?: string | null, hasVoted = false) {
  if (isStaffRole(role)) return true
  if (poll.resultVisibility === 'staff') return false
  if (poll.resultVisibility === 'after') return isPollClosed(poll)
  if (poll.resultVisibility === 'live') return hasVoted || isPollClosed(poll)
  return false
}

export function buildPollResults(poll: ClubPoll, votes: ClubPollVote[]): PollOptionResult[] {
  const totalVoters = Math.max(1, voterCount(votes))
  if (poll.pollType === 'rank') {
    const optionCount = poll.options.length
    const scores: Record<string, number> = {}
    const voterIds: Record<string, string[]> = {}
    for (const option of poll.options) {
      scores[option.id] = 0
      voterIds[option.id] = []
    }
    for (const vote of votes) {
      const points = optionCount - ((vote.rankOrder || 1) - 1)
      scores[vote.optionId] = (scores[vote.optionId] || 0) + Math.max(1, points)
      voterIds[vote.optionId] = [...(voterIds[vote.optionId] || []), vote.userId]
    }
    const maxScore = Math.max(1, ...Object.values(scores))
    return poll.options.map((option) => ({
      option,
      count: voterIds[option.id]?.length || 0,
      percent: Math.round(((scores[option.id] || 0) / maxScore) * 100),
      voterIds: [...new Set(voterIds[option.id] || [])],
      score: scores[option.id] || 0,
    }))
  }

  return poll.options.map((option) => {
    const matched = votes.filter((item) => item.optionId === option.id)
    return {
      option,
      count: matched.length,
      percent: Math.round((matched.length / totalVoters) * 100),
      voterIds: matched.map((item) => item.userId),
    }
  })
}

export async function listEligibleVoterIds(clubId: string, audience: PollAudience): Promise<string[]> {
  const { data, error } = await supabase.from('club_members').select('user_id, role, status').eq('club_id', clubId)
  if (error) throw error
  return (data || [])
    .filter((row) => row.status === 'approved' || row.status == null)
    .filter((row) => isRegularClubRole(row.role))
    .filter((row) => (audience === 'staff' ? isStaffRole(row.role) : true))
    .map((row) => String(row.user_id))
}

export async function remindUnvotedMembers(input: {
  clubId: string
  clubName?: string
  poll: ClubPoll
  votes: ClubPollVote[]
}) {
  const eligible = await listEligibleVoterIds(input.clubId, input.poll.audience)
  const voted = new Set(input.votes.map((item) => item.userId))
  const targets = eligible.filter((id) => !voted.has(id))
  if (!targets.length) throw new Error('미참여 멤버가 없습니다.')
  await notifyUsers({
    clubId: input.clubId,
    userIds: targets,
    title: `[림] ${input.clubName || '동아리'} 투표 독려`,
    body: `${input.poll.title} · 아직 참여하지 않았습니다.`,
    kind: 'club_poll_reminder',
  })
  return targets.length
}
