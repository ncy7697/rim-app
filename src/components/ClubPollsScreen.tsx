import { useEffect, useMemo, useState } from 'react'
import { BackButton, EmptyCard, Spinner } from './ui'
import { isStaffRole } from '../clubMembership'
import { supabase } from '../supabaseClient'
import {
  buildPollResults,
  canUserCreatePoll,
  canUserSeePoll,
  canViewPollResults,
  castPollVotes,
  closeClubPoll,
  createClubPoll,
  isPollClosed,
  listClubPolls,
  listEligibleVoterIds,
  listPollVotes,
  myVoteOptionIds,
  pollTypeLabel,
  remainingLabel,
  remindUnvotedMembers,
  voterCount,
  type ClubPoll,
  type ClubPollVote,
  type PollAudience,
  type PollOptionKind,
  type PollQuorumAction,
  type PollResultVisibility,
  type PollType,
} from '../clubPolls'

type View = 'list' | 'create' | 'detail'
type CreateStep = 1 | 2 | 3 | 4

const YESNO_OPTIONS = [
  { label: '찬성', optionKind: 'text' as PollOptionKind },
  { label: '반대', optionKind: 'text' as PollOptionKind },
]

export default function ClubPollsScreen({
  clubId,
  clubName,
  userId,
  userRole,
  onBack,
}: {
  clubId: string
  clubName?: string
  userId: string
  userRole?: string
  onBack?: () => void
}) {
  const [resolvedRole, setResolvedRole] = useState(userRole)
  const canCreate = canUserCreatePoll(resolvedRole)
  const [view, setView] = useState<View>('list')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [polls, setPolls] = useState<ClubPoll[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [votes, setVotes] = useState<ClubPollVote[]>([])
  const [eligibleCount, setEligibleCount] = useState(0)
  const [createStep, setCreateStep] = useState<CreateStep>(1)
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    pollType: 'single' as PollType,
    options: ['', ''],
    optionKind: 'text' as PollOptionKind,
    audience: 'all' as PollAudience,
    anonymous: false,
    maxChoices: 2,
    resultVisibility: 'live' as PollResultVisibility,
    closesAt: '',
    minVoters: 0,
    quorumAction: 'staff' as PollQuorumAction,
  })
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])

  const selected = polls.find((item) => item.id === selectedId) || null
  const visiblePolls = useMemo(
    () => polls.filter((item) => canUserSeePoll(item, resolvedRole)),
    [polls, resolvedRole]
  )
  const myChoices = selected ? myVoteOptionIds(votes, userId) : []
  const hasVoted = myChoices.length > 0
  const closed = selected ? isPollClosed(selected) : false
  const showResults = selected ? canViewPollResults(selected, resolvedRole, hasVoted) : false
  const results = selected && showResults ? buildPollResults(selected, votes) : []
  const participants = voterCount(votes)

  const refresh = async () => {
    setLoading(true)
    setMessage('')
    try {
      const [{ data: member }, next] = await Promise.all([
        supabase
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', userId)
          .maybeSingle(),
        listClubPolls(clubId),
      ])
      if (member?.role) setResolvedRole(member.role)
      else if (userRole) setResolvedRole(userRole)
      setPolls(next)
    } catch (err: any) {
      setMessage(err.message || '투표를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const openDetail = async (poll: ClubPoll) => {
    setSelectedId(poll.id)
    setView('detail')
    setMessage('')
    setSelectedOptions(myVoteOptionIds(await listPollVotes(poll.id).catch(() => []), userId))
    try {
      const [nextVotes, eligible] = await Promise.all([
        listPollVotes(poll.id),
        listEligibleVoterIds(clubId, poll.audience),
      ])
      setVotes(nextVotes)
      setEligibleCount(eligible.length)
      setSelectedOptions(myVoteOptionIds(nextVotes, userId))
    } catch (err: any) {
      setMessage(err.message || '투표 상세를 불러오지 못했습니다.')
    }
  }

  useEffect(() => {
    void refresh()
  }, [clubId])

  const startCreate = () => {
    setCreateStep(1)
    setDraft({
      title: '',
      description: '',
      pollType: 'single',
      options: ['', ''],
      optionKind: 'text',
      audience: 'all',
      anonymous: false,
      maxChoices: 2,
      resultVisibility: 'live',
      closesAt: '',
      minVoters: 0,
      quorumAction: 'staff',
    })
    setView('create')
    setMessage('')
  }

  const submitCreate = async () => {
    setSaving(true)
    setMessage('')
    try {
      const eligible = await listEligibleVoterIds(clubId, draft.audience)
      const saved = await createClubPoll({
        clubId,
        clubName,
        createdBy: userId,
        title: draft.title,
        description: draft.description,
        pollType: draft.pollType,
        audience: draft.audience,
        anonymous: draft.anonymous,
        maxChoices: draft.maxChoices,
        resultVisibility: draft.resultVisibility,
        closesAt: draft.closesAt ? new Date(draft.closesAt).toISOString() : undefined,
        minVoters: draft.minVoters,
        quorumAction: draft.quorumAction,
        options:
          draft.pollType === 'yesno'
            ? YESNO_OPTIONS
            : draft.options.map((label) => ({ label, optionKind: draft.optionKind })),
        notifyMemberIds: eligible.filter((id) => id !== userId),
      })
      setPolls((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)])
      setView('list')
      setMessage('투표를 만들고 멤버에게 알림을 보냈습니다.')
    } catch (err: any) {
      setMessage(err.message || '투표를 만들지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const toggleChoice = (optionId: string) => {
    if (!selected || closed || (hasVoted && !canCreate)) return
    if (selected.pollType === 'yesno' || selected.pollType === 'single') {
      setSelectedOptions([optionId])
      return
    }
    if (selected.pollType === 'rank') {
      setSelectedOptions((prev) =>
        prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
      )
      return
    }
    setSelectedOptions((prev) => {
      if (prev.includes(optionId)) return prev.filter((id) => id !== optionId)
      if (prev.length >= selected.maxChoices) return prev
      return [...prev, optionId]
    })
  }

  const moveRank = (optionId: string, dir: -1 | 1) => {
    setSelectedOptions((prev) => {
      const index = prev.indexOf(optionId)
      const nextIndex = index + dir
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[nextIndex]
      copy[nextIndex] = temp
      return copy
    })
  }

  const submitVote = async () => {
    if (!selected) return
    setSaving(true)
    setMessage('')
    try {
      const nextVotes = await castPollVotes({ poll: selected, userId, optionIds: selectedOptions })
      const all = await listPollVotes(selected.id)
      setVotes(all.length ? all : nextVotes)
      setMessage('투표가 완료되었습니다.')
    } catch (err: any) {
      setMessage(err.message || '투표에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const headerTitle =
    view === 'create' ? '투표 만들기' : view === 'detail' ? selected?.title || '투표' : '투표'
  const headerSub =
    view === 'create'
      ? `${createStep}/4 단계`
      : view === 'detail' && selected
        ? `${pollTypeLabel(selected.pollType)} · ${remainingLabel(selected.closesAt)}`
        : clubName || '동아리 투표'

  if (loading && !polls.length && view === 'list') {
    return (
      <div className="bb-screen">
        <Spinner label="투표를 불러오는 중..." />
      </div>
    )
  }

  return (
    <div className="bb-screen pb-10">
      <header className="bb-header">
        <BackButton
          onClick={() => {
            if (view !== 'list') {
              setView('list')
              setSelectedId(null)
              void refresh()
              return
            }
            onBack?.()
          }}
        />
        <div>
          <h1 className="text-base font-semibold text-ink">{headerTitle}</h1>
          <p className="text-[11px] text-muted">{headerSub}</p>
        </div>
      </header>

      <main className="p-5 space-y-3">
        {message && <p className="text-xs text-navy bg-white border border-line rounded-xl px-3 py-2">{message}</p>}

        {view === 'list' && (
          <>
            {canCreate && (
              <button type="button" className="bb-btn-primary" onClick={startCreate}>
                투표 만들기
              </button>
            )}
            <p className="text-[11px] text-muted">
              일정·장소·이벤트 등을 멤버 투표로 정할 수 있습니다. 게스트는 투표에 참여하지 않습니다.
            </p>
            {visiblePolls.length === 0 ? (
              <EmptyCard title="진행 중인 투표가 없습니다" description={canCreate ? '새 투표를 만들어 보세요.' : '운영진이 투표를 열면 여기에 표시됩니다.'} />
            ) : (
              visiblePolls.map((poll) => (
                <button
                  key={poll.id}
                  type="button"
                  className="bb-card w-full p-4 text-left"
                  onClick={() => void openDetail(poll)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{poll.title}</p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {pollTypeLabel(poll.pollType)} · {poll.anonymous ? '익명' : '공개'} · {poll.audience === 'staff' ? '운영진' : '전체 회원'}
                      </p>
                    </div>
                    <span className={`bb-chip shrink-0 ${isPollClosed(poll) ? 'bg-canvas text-muted' : 'bg-emerald-50 text-emerald-800'}`}>
                      {isPollClosed(poll) ? (poll.status === 'void' ? '무효' : '마감') : '진행 중'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted mt-2">{remainingLabel(poll.closesAt)}</p>
                </button>
              ))
            )}
          </>
        )}

        {view === 'create' && (
          <section className="bb-card p-4 space-y-3">
            {createStep === 1 && (
              <>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">1. 기본 정보</p>
                <div>
                  <label className="bb-label">제목</label>
                  <input className="bb-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="다음 정기 경기 날짜 정하기" />
                </div>
                <div>
                  <label className="bb-label">설명</label>
                  <textarea className="bb-input min-h-24" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="투표 결과를 바탕으로 일정을 확정합니다." />
                </div>
                <div>
                  <label className="bb-label">투표 유형</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['yesno', '찬반'],
                      ['single', '단일 선택'],
                      ['multi', '다중 선택'],
                      ['rank', '순위 투표'],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`py-2 rounded-xl text-xs font-semibold border ${draft.pollType === id ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                        onClick={() => setDraft({ ...draft, pollType: id })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {createStep === 2 && (
              <>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">2. 선택지</p>
                {draft.pollType === 'yesno' ? (
                  <p className="text-sm text-muted">찬반 투표는 찬성 / 반대가 자동으로 들어갑니다.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-1.5">
                      {([
                        ['text', '텍스트'],
                        ['datetime', '날짜·시간'],
                        ['place', '장소'],
                        ['link', '링크'],
                      ] as const).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          className={`py-2 rounded-xl text-[10px] font-semibold border ${draft.optionKind === id ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                          onClick={() => setDraft({ ...draft, optionKind: id })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {draft.options.map((value, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          className="bb-input"
                          type={draft.optionKind === 'datetime' ? 'datetime-local' : 'text'}
                          value={value}
                          placeholder={
                            draft.optionKind === 'place'
                              ? '장소'
                              : draft.optionKind === 'link'
                                ? 'https://'
                                : `선택지 ${index + 1}`
                          }
                          onChange={(e) => {
                            const next = [...draft.options]
                            next[index] = e.target.value
                            setDraft({ ...draft, options: next })
                          }}
                        />
                        {draft.options.length > 2 && (
                          <button
                            type="button"
                            className="bb-btn-danger shrink-0"
                            onClick={() => setDraft({ ...draft, options: draft.options.filter((_, i) => i !== index) })}
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="bb-btn-ghost w-full"
                      onClick={() => setDraft({ ...draft, options: [...draft.options, ''] })}
                    >
                      선택지 추가
                    </button>
                  </>
                )}
              </>
            )}

            {createStep === 3 && (
              <>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">3. 투표 규칙</p>
                <div>
                  <label className="bb-label">투표 대상</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['all', '전체 회원'],
                      ['staff', '운영진만'],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`py-2 rounded-xl text-xs font-semibold border ${draft.audience === id ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                        onClick={() => setDraft({ ...draft, audience: id })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="bb-label">투표 방식</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className={`py-2 rounded-xl text-xs font-semibold border ${draft.anonymous ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`} onClick={() => setDraft({ ...draft, anonymous: true })}>익명 투표</button>
                    <button type="button" className={`py-2 rounded-xl text-xs font-semibold border ${!draft.anonymous ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`} onClick={() => setDraft({ ...draft, anonymous: false })}>공개 투표</button>
                  </div>
                </div>
                {(draft.pollType === 'multi' || draft.pollType === 'rank') && (
                  <div>
                    <label className="bb-label">{draft.pollType === 'rank' ? '순위 개수(선택 수)' : '최대 선택 개수'}</label>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(2, draft.options.filter(Boolean).length)}
                      className="bb-input"
                      value={draft.maxChoices}
                      onChange={(e) => setDraft({ ...draft, maxChoices: Number(e.target.value) || 1 })}
                    />
                  </div>
                )}
                <div>
                  <label className="bb-label">결과 공개</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ['live', '실시간'],
                      ['after', '마감 후'],
                      ['staff', '운영진만'],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`py-2 rounded-xl text-[11px] font-semibold border ${draft.resultVisibility === id ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                        onClick={() => setDraft({ ...draft, resultVisibility: id })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {createStep === 4 && (
              <>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">4. 마감 설정</p>
                <div>
                  <label className="bb-label">마감 시간</label>
                  <input type="datetime-local" className="bb-input" value={draft.closesAt} onChange={(e) => setDraft({ ...draft, closesAt: e.target.value })} />
                </div>
                <div>
                  <label className="bb-label">최소 참가 인원(정족수)</label>
                  <input type="number" min={0} className="bb-input" value={draft.minVoters} onChange={(e) => setDraft({ ...draft, minVoters: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="bb-label">정족수 미달 시</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ['void', '무효'],
                      ['staff', '운영진 결정'],
                      ['extend', '마감 연장'],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`py-2 rounded-xl text-[11px] font-semibold border ${draft.quorumAction === id ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                        onClick={() => setDraft({ ...draft, quorumAction: id })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2 pt-1">
              {createStep > 1 && (
                <button type="button" className="bb-btn-ghost flex-1" onClick={() => setCreateStep((step) => (step - 1) as CreateStep)}>
                  이전
                </button>
              )}
              {createStep < 4 ? (
                <button
                  type="button"
                  className="bb-btn-primary flex-1"
                  onClick={() => {
                    if (createStep === 1 && !draft.title.trim()) {
                      setMessage('제목을 입력해 주세요.')
                      return
                    }
                    if (createStep === 2 && draft.pollType !== 'yesno' && draft.options.filter((item) => item.trim()).length < 2) {
                      setMessage('선택지를 2개 이상 입력해 주세요.')
                      return
                    }
                    setMessage('')
                    setCreateStep((step) => (step + 1) as CreateStep)
                  }}
                >
                  다음
                </button>
              ) : (
                <button type="button" className="bb-btn-primary flex-1" disabled={saving} onClick={() => void submitCreate()}>
                  {saving ? '만드는 중...' : '투표 만들기'}
                </button>
              )}
            </div>
          </section>
        )}

        {view === 'detail' && selected && (
          <>
            <section className="bb-card p-4 space-y-2">
              <p className="text-[11px] text-muted">{remainingLabel(selected.closesAt)}</p>
              <p className="text-sm text-ink whitespace-pre-line">{selected.description || '설명 없음'}</p>
              <p className="text-[11px] text-muted">
                참여 {participants}/{eligibleCount || '?'}명
                {selected.minVoters > 0 ? ` · 정족수 ${selected.minVoters}명` : ''}
                {selected.anonymous ? ' · 익명' : ' · 공개'}
              </p>
            </section>

            {!closed && (
              <section className="bb-card p-4 space-y-2">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                  {hasVoted ? '내 선택 수정' : '선택지'}
                </p>
                {selected.pollType === 'multi' && (
                  <p className="text-[11px] text-muted">최대 {selected.maxChoices}개까지 선택할 수 있습니다.</p>
                )}
                {selected.pollType === 'rank' && (
                  <p className="text-[11px] text-muted">선호 순서로 고른 뒤 위·아래로 순위를 바꾸세요.</p>
                )}
                {selected.options.map((option) => {
                  const active = selectedOptions.includes(option.id)
                  const rank = selected.pollType === 'rank' ? selectedOptions.indexOf(option.id) + 1 : 0
                  return (
                    <div key={option.id} className={`rounded-xl border px-3 py-3 ${active ? 'border-navy bg-canvas' : 'border-line bg-white'}`}>
                      <button type="button" className="w-full text-left" onClick={() => toggleChoice(option.id)}>
                        <p className="text-sm font-semibold">
                          {selected.pollType === 'multi' || selected.pollType === 'rank' ? (active ? '☑' : '☐') : active ? '●' : '○'}{' '}
                          {rank > 0 ? `${rank}순위 · ` : ''}
                          {option.label}
                        </p>
                      </button>
                      {selected.pollType === 'rank' && active && (
                        <div className="flex gap-1 mt-2">
                          <button type="button" className="bb-icon-btn w-8 h-8" onClick={() => moveRank(option.id, -1)}>↑</button>
                          <button type="button" className="bb-icon-btn w-8 h-8" onClick={() => moveRank(option.id, 1)}>↓</button>
                        </div>
                      )}
                    </div>
                  )
                })}
                <button type="button" className="bb-btn-primary" disabled={saving || selectedOptions.length === 0} onClick={() => void submitVote()}>
                  {saving ? '저장 중...' : hasVoted ? '다시 투표하기' : '투표하기'}
                </button>
              </section>
            )}

            {hasVoted && !showResults && (
              <section className="bb-card p-4 space-y-2">
                <p className="text-sm font-semibold">투표가 완료되었습니다.</p>
                <p className="text-[11px] text-muted">내 선택</p>
                <p className="text-sm">
                  {myChoices
                    .map((id, index) => {
                      const label = selected.options.find((item) => item.id === id)?.label || id
                      return selected.pollType === 'rank' ? `${index + 1}. ${label}` : label
                    })
                    .join(selected.pollType === 'rank' ? '\n' : ' · ')}
                </p>
                <p className="text-[11px] text-muted">현재 참여 {participants}/{eligibleCount || '?'}명</p>
                <p className="text-[11px] text-muted">
                  {selected.resultVisibility === 'after'
                    ? '결과는 마감 후 공개됩니다.'
                    : selected.resultVisibility === 'staff'
                      ? '결과는 운영진만 볼 수 있습니다.'
                      : '결과는 투표 후 확인할 수 있습니다.'}
                </p>
              </section>
            )}

            {showResults && (
              <section className="bb-card p-4 space-y-3">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">투표 결과</p>
                {results.map((item) => (
                  <div key={item.option.id} className="space-y-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="font-medium">{item.option.label}</span>
                      <span className="tabular-nums text-muted">
                        {selected.pollType === 'rank' ? `${item.score}점` : `${item.count}표`} · {item.percent}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-canvas overflow-hidden">
                      <div className="h-full bg-navy" style={{ width: `${item.percent}%` }} />
                    </div>
                    {!selected.anonymous && isStaffRole(resolvedRole) && item.voterIds.length > 0 && (
                      <p className="text-[10px] text-muted">참여자 {item.voterIds.length}명</p>
                    )}
                  </div>
                ))}
                <p className="text-[11px] text-muted">총 투표 {participants}명</p>
                {selected.minVoters > 0 && participants < selected.minVoters && (
                  <p className="text-[11px] text-brand">
                    정족수 {selected.minVoters}명 미달 ·{' '}
                    {selected.quorumAction === 'void' ? '무효 처리 가능' : selected.quorumAction === 'extend' ? '마감 연장 권장' : '운영진 최종 결정'}
                  </p>
                )}
              </section>
            )}

            {canCreate && (
              <div className="grid grid-cols-2 gap-2">
                {!closed && (
                  <button
                    type="button"
                    className="bb-btn-ghost"
                    disabled={saving}
                    onClick={() =>
                      void closeClubPoll(selected)
                        .then((next) => {
                          setPolls((prev) => prev.map((item) => (item.id === next.id ? next : item)))
                          setMessage('투표를 마감했습니다.')
                        })
                        .catch((err: any) => setMessage(err.message || '마감에 실패했습니다.'))
                    }
                  >
                    마감하기
                  </button>
                )}
                <button
                  type="button"
                  className="bb-btn-accent"
                  disabled={saving || closed}
                  onClick={() =>
                    void remindUnvotedMembers({ clubId, clubName, poll: selected, votes })
                      .then((count) => setMessage(`미참여 ${count}명에게 알림을 보냈습니다.`))
                      .catch((err: any) => setMessage(err.message || '알림을 보내지 못했습니다.'))
                  }
                >
                  미참여 알림
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
