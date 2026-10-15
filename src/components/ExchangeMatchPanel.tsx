import { useEffect, useState } from 'react'
import { EmptyCard } from './ui'
import {
  MATCH_FORMATS,
  MATCH_TYPES,
  VENUE_CHOICES,
  cancelExchangeProposal,
  confirmExchangeProposal,
  counterExchangeProposal,
  emptyProposalDraft,
  exchangeStatusLabel,
  formatExchangeSlot,
  isWaitingOn,
  listClubProposals,
  matchTypeLabel,
  otherClubName,
  rejectExchangeProposal,
  resolveVenueText,
  searchRegisteredClubs,
  sendExchangeProposal,
  venueChoiceLabel,
  type ClubSearchHit,
  type ExchangeFormat,
  type ExchangeMatchType,
  type ExchangeProposal,
  type ExchangeSlot,
  type ExchangeVenueChoice,
} from '../clubExchange'

function SlotEditor({
  slots,
  onChange,
}: {
  slots: ExchangeSlot[]
  onChange: (slots: ExchangeSlot[]) => void
}) {
  return (
    <div className="space-y-2">
      {slots.map((slot, index) => (
        <div key={`${slot.date}-${index}`} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
          <input
            type="date"
            className="bb-input"
            value={slot.date}
            onChange={(e) => onChange(slots.map((item, i) => (i === index ? { ...item, date: e.target.value } : item)))}
          />
          <input
            type="time"
            className="bb-input w-[7.2rem]"
            value={slot.time}
            onChange={(e) => onChange(slots.map((item, i) => (i === index ? { ...item, time: e.target.value } : item)))}
          />
          <button
            type="button"
            className="text-[11px] text-rose-700"
            onClick={() => onChange(slots.filter((_, i) => i !== index))}
          >
            삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        className="bb-btn-ghost text-xs"
        onClick={() => onChange([...slots, { date: slots[slots.length - 1]?.date || new Date().toISOString().slice(0, 10), time: '14:00' }])}
      >
        희망 날짜 추가
      </button>
    </div>
  )
}

function ProposalFields({
  fromName,
  toName,
  matchType,
  format,
  slots,
  venueChoice,
  venueNote,
  message,
  onChange,
}: {
  fromName: string
  toName: string
  matchType: ExchangeMatchType
  format: ExchangeFormat
  slots: ExchangeSlot[]
  venueChoice: ExchangeVenueChoice
  venueNote: string
  message: string
  onChange: (patch: {
    matchType?: ExchangeMatchType
    format?: ExchangeFormat
    slots?: ExchangeSlot[]
    venueChoice?: ExchangeVenueChoice
    venueNote?: string
    message?: string
  }) => void
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-canvas border border-line px-3 py-2.5 space-y-1">
        <p className="text-[11px] text-muted">우리 팀 · {fromName}</p>
        <p className="text-sm font-semibold">상대 팀 · {toName}</p>
      </div>
      <div>
        <label className="bb-label">교류전 유형</label>
        <div className="grid grid-cols-3 gap-2">
          {MATCH_TYPES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`py-2 rounded-xl text-[11px] font-semibold border ${matchType === item.id ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
              onClick={() => onChange({ matchType: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="bb-label">희망 인원</label>
        <div className="grid grid-cols-2 gap-2">
          {MATCH_FORMATS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`py-2 rounded-xl text-xs font-semibold border ${format === item.id ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
              onClick={() => onChange({ format: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="bb-label">희망 날짜</label>
        <SlotEditor slots={slots} onChange={(next) => onChange({ slots: next })} />
      </div>
      <div>
        <label className="bb-label">장소</label>
        <div className="grid grid-cols-2 gap-2">
          {VENUE_CHOICES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`py-2 rounded-xl text-[11px] font-semibold border ${venueChoice === item.id ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
              onClick={() => onChange({ venueChoice: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
        {(venueChoice === 'neutral' || venueChoice === 'discuss') && (
          <input
            className="bb-input mt-2"
            placeholder={venueChoice === 'neutral' ? '중립 장소 이름' : '장소 협의 메모'}
            value={venueNote}
            onChange={(e) => onChange({ venueNote: e.target.value })}
          />
        )}
      </div>
      <div>
        <label className="bb-label">메시지</label>
        <textarea className="bb-input min-h-24" value={message} onChange={(e) => onChange({ message: e.target.value })} />
      </div>
    </div>
  )
}

export default function ExchangeMatchPanel({
  clubId,
  clubName,
  homeCourt,
  userId,
  canEdit,
  initialProposalId,
  onOpenGame,
}: {
  clubId: string
  clubName: string
  homeCourt: string
  userId?: string
  canEdit: boolean
  initialProposalId?: string | null
  onOpenGame?: (gameId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ClubSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [proposals, setProposals] = useState<ExchangeProposal[]>([])
  const [selected, setSelected] = useState<ExchangeProposal | null>(null)
  const [draft, setDraft] = useState<ReturnType<typeof emptyProposalDraft> | null>(null)
  const [editing, setEditing] = useState(false)
  const [pickIndex, setPickIndex] = useState(0)
  const [confirmVenue, setConfirmVenue] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = async () => {
    const list = await listClubProposals(clubId)
    setProposals(list)
    setSelected((prev) => {
      if (prev) return list.find((item) => item.id === prev.id) || prev
      if (initialProposalId) return list.find((item) => item.id === initialProposalId) || null
      return null
    })
  }

  useEffect(() => {
    const tick = () => void load().catch((err) => setMessage(err.message || '교류전 제안을 불러오지 못했습니다.'))
    tick()
    const timer = window.setInterval(tick, 8000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [clubId, initialProposalId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchRegisteredClubs(query, clubId)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setSearching(false))
    }, 250)
    setSearching(true)
    return () => window.clearTimeout(timer)
  }, [query, clubId])

  const incoming = proposals.filter((item) => isWaitingOn(item, clubId))
  const others = proposals.filter((item) => !isWaitingOn(item, clubId))

  const run = async (work: () => Promise<void>) => {
    setSaving(true)
    setMessage('')
    try {
      await work()
      await load()
    } catch (err: any) {
      setMessage(err.message || '처리하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (draft) {
    return (
      <section className="bb-card p-4 space-y-3">
        <p className="text-sm font-semibold">교류전 제안</p>
        {message && <p className="text-xs text-navy">{message}</p>}
        <ProposalFields
          fromName={draft.fromClubName}
          toName={draft.toClubName}
          matchType={draft.matchType}
          format={draft.format}
          slots={draft.slots}
          venueChoice={draft.venueChoice}
          venueNote={draft.venueNote}
          message={draft.message}
          onChange={(patch) => setDraft({ ...draft, ...patch })}
        />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="bb-btn-ghost" onClick={() => setDraft(null)}>취소</button>
          <button
            type="button"
            className="bb-btn-primary"
            disabled={saving}
            onClick={() =>
              void run(async () => {
                if (!draft.slots.length) throw new Error('희망 날짜를 하나 이상 넣어 주세요.')
                await sendExchangeProposal(draft)
                setDraft(null)
                setMessage('교류전 요청을 보냈습니다.')
              })
            }
          >
            {saving ? '전송 중...' : '요청 전송'}
          </button>
        </div>
      </section>
    )
  }

  if (selected) {
    const waiting = isWaitingOn(selected, clubId)
    const myGameId = selected.fromClubId === clubId ? selected.hostGameId : selected.guestGameId
    return (
      <section className="bb-card p-4 space-y-3">
        <button type="button" className="text-[11px] font-semibold text-navy" onClick={() => { setSelected(null); setEditing(false) }}>
          ← 목록
        </button>
        {message && <p className="text-xs text-navy">{message}</p>}
        <p className="text-[11px] font-semibold text-muted">{exchangeStatusLabel(selected.status)} · {matchTypeLabel(selected.matchType)} · {selected.format}</p>
        <h3 className="text-base font-semibold">{selected.fromClubName} vs {selected.toClubName}</h3>
        <p className="text-xs text-muted">{venueChoiceLabel(selected.venueChoice)} · {resolveVenueText(selected)}</p>
        {selected.message && <p className="text-sm whitespace-pre-line">{selected.message}</p>}
        <div className="space-y-1">
          {selected.slots.map((slot, index) => (
            <p key={`${slot.date}-${index}`} className="text-sm">
              {formatExchangeSlot(slot)}
              {selected.selectedSlot?.date === slot.date && selected.selectedSlot.time === slot.time ? ' · 확정' : ''}
            </p>
          ))}
        </div>
        {selected.rejectReason && <p className="text-xs text-rose-700">거절 사유: {selected.rejectReason}</p>}
        {selected.status === 'confirmed' && myGameId && (
          <button type="button" className="bb-btn-primary" onClick={() => onOpenGame?.(myGameId)}>
            확정된 일정 보기
          </button>
        )}

        {editing && canEdit && waiting && (
          <>
            <ProposalFields
              fromName={selected.fromClubId === clubId ? selected.fromClubName : selected.toClubName}
              toName={otherClubName(selected, clubId)}
              matchType={selected.matchType}
              format={selected.format}
              slots={selected.slots}
              venueChoice={selected.venueChoice}
              venueNote={selected.venueNote}
              message={selected.message}
              onChange={(patch) => setSelected({ ...selected, ...patch })}
            />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="bb-btn-ghost" onClick={() => setEditing(false)}>취소</button>
              <button
                type="button"
                className="bb-btn-primary"
                disabled={saving}
                onClick={() =>
                  void run(async () => {
                    const next = await counterExchangeProposal(selected, clubId, {
                      matchType: selected.matchType,
                      format: selected.format,
                      slots: selected.slots,
                      venueChoice: selected.venueChoice,
                      venueNote: selected.venueNote,
                      message: selected.message,
                    })
                    setSelected(next)
                    setEditing(false)
                    setMessage('수정 제안을 보냈습니다.')
                  })
                }
              >
                수정 전송
              </button>
            </div>
          </>
        )}

        {!editing && canEdit && waiting && (
          <>
            <p className="text-xs font-semibold text-muted">수락할 희망 날짜</p>
            {selected.slots.map((slot, index) => (
              <label key={`${slot.date}-${index}`} className="flex items-center gap-2 text-sm">
                <input type="radio" className="accent-navy" checked={pickIndex === index} onChange={() => setPickIndex(index)} />
                {formatExchangeSlot(slot)}
              </label>
            ))}
            <input
              className="bb-input"
              placeholder="확정 장소"
              value={confirmVenue || resolveVenueText(selected)}
              onChange={(e) => setConfirmVenue(e.target.value)}
            />
            <button
              type="button"
              className="bb-btn-primary"
              disabled={saving}
              onClick={() =>
                void run(async () => {
                  const slot = selected.slots[pickIndex]
                  if (!slot) throw new Error('희망 날짜를 선택해 주세요.')
                  const next = await confirmExchangeProposal({
                    proposal: selected,
                    clubId,
                    slot,
                    venueText: confirmVenue || resolveVenueText(selected),
                    userId,
                  })
                  setSelected(next)
                  setMessage('교류전 일정이 양쪽 동호회에 확정되었습니다.')
                })
              }
            >
              {saving ? '확정 중...' : '수락하고 일정 확정'}
            </button>
            <button type="button" className="bb-btn-ghost w-full" onClick={() => setEditing(true)}>
              조건 수정
            </button>
            <textarea className="bb-input min-h-16" placeholder="거절 사유 (선택)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <button
              type="button"
              className="text-sm font-semibold text-rose-700"
              disabled={saving}
              onClick={() =>
                void run(async () => {
                  const next = await rejectExchangeProposal(selected, clubId, rejectReason)
                  setSelected(next)
                  setMessage('교류전을 거절했습니다.')
                })
              }
            >
              거절
            </button>
          </>
        )}

        {canEdit && selected.fromClubId === clubId && (selected.status === 'pending' || selected.status === 'countered') && (
          <button
            type="button"
            className="text-[11px] text-muted"
            onClick={() =>
              void run(async () => {
                const next = await cancelExchangeProposal(selected, clubId)
                setSelected(next)
              })
            }
          >
            제안 취소
          </button>
        )}
      </section>
    )
  }

  return (
    <div className="space-y-3">
      {message && <p className="text-xs text-navy bg-white border border-line rounded-xl px-3 py-2">{message}</p>}

      {canEdit && (
        <section className="bb-card p-4 space-y-2">
          <p className="text-sm font-semibold">상대 동호회 검색</p>
          <p className="text-[11px] text-muted">앱에 등록된 동호회와 연결하면 일정·참가자·결과를 양쪽에서 함께 관리합니다.</p>
          <input className="bb-input" placeholder="동호회 이름 또는 지역" value={query} onChange={(e) => setQuery(e.target.value)} />
          {searching && <p className="text-[11px] text-muted">검색 중...</p>}
          {hits.length === 0 ? (
            <p className="text-[11px] text-muted">검색 결과가 없습니다.</p>
          ) : (
            hits.map((club) => (
              <button
                key={club.id}
                type="button"
                className="w-full rounded-xl border border-line bg-white p-3 text-left"
                onClick={() =>
                  setDraft(
                    emptyProposalDraft({
                      fromClubId: clubId,
                      fromClubName: clubName,
                      fromHomeCourt: homeCourt,
                      to: club,
                      userId,
                    })
                  )
                }
              >
                <p className="text-sm font-semibold">{club.name}</p>
                <p className="text-[11px] text-muted mt-0.5">{club.region || '지역 미정'}{club.homeCourt ? ` · ${club.homeCourt}` : ''}</p>
              </button>
            ))
          )}
        </section>
      )}

      <section className="space-y-2">
        <p className="text-sm font-semibold">대기 중인 요청 · {incoming.length}</p>
        {incoming.length === 0 ? (
          <EmptyCard title="응답할 교류전 요청이 없습니다" description="상대 팀이 제안을 보내면 여기서 수락·수정·거절합니다." />
        ) : (
          incoming.map((item) => (
            <button key={item.id} type="button" className="bb-card w-full p-4 text-left" onClick={() => { setSelected(item); setPickIndex(0); setConfirmVenue(resolveVenueText(item)); setEditing(false) }}>
              <p className="text-[11px] text-muted">{exchangeStatusLabel(item.status)} · {otherClubName(item, clubId)}</p>
              <p className="text-sm font-semibold mt-0.5">{matchTypeLabel(item.matchType)} · {item.format}</p>
              <p className="text-[11px] text-muted mt-0.5">{item.slots.map(formatExchangeSlot).join(' · ')}</p>
            </button>
          ))
        )}
      </section>

      <section className="space-y-2">
        <p className="text-sm font-semibold">보낸 · 지난 요청 · {others.length}</p>
        {others.map((item) => (
          <button key={item.id} type="button" className="bb-card w-full p-4 text-left" onClick={() => { setSelected(item); setEditing(false) }}>
            <p className="text-[11px] text-muted">{exchangeStatusLabel(item.status)} · {otherClubName(item, clubId)}</p>
            <p className="text-sm font-semibold mt-0.5">{matchTypeLabel(item.matchType)} · {item.format}</p>
          </button>
        ))}
      </section>
    </div>
  )
}
