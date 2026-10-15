import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { BackButton, EmptyCard, Spinner } from './ui'
import { WEEKDAYS, clubRowToSettings } from '../clubSettings'
import ClubLedgerPanel from './ClubLedgerPanel'
import {
  addDays,
  bookingStatusLabel,
  deleteClubBooking,
  deleteClubVenue,
  eventKindLabel,
  kakaoMapUrl,
  loadOpsCalendar,
  monthTitle,
  naverMapUrl,
  parseYmd,
  saveClubBooking,
  saveClubVenue,
  savePracticeSchedule,
  startOfWeekMonday,
  weekRangeLabel,
  weekdayLabel,
  ymdLocal,
  type BookingStatus,
  type ClubBooking,
  type ClubVenue,
  type OpsEvent,
} from '../clubOps'

type RangeMode = 'week' | 'month'
type OpsTab = 'schedule' | 'venues' | 'ledger' | 'receipts'

const emptyVenue = (clubId: string): ClubVenue => ({
  id: '',
  clubId,
  name: '',
  address: '',
  mapUrl: '',
  notes: '',
  isHome: false,
})

const emptyBooking = (clubId: string, date: string, venueId: string): ClubBooking => ({
  id: '',
  clubId,
  venueId,
  date,
  startTime: '20:00',
  endTime: '22:00',
  title: '체육관 대관',
  fee: null,
  confirmCode: '',
  notes: '',
  status: 'planned',
})

export default function ClubOpsScreen({
  clubId,
  clubName,
  userId,
  canEdit,
  onBack,
  onOpenGame,
}: {
  clubId: string
  clubName?: string
  userId?: string
  canEdit: boolean
  onBack?: () => void
  onOpenGame?: (gameId: string) => void
}) {
  const today = ymdLocal(new Date())
  const [tab, setTab] = useState<OpsTab>('schedule')
  const [range, setRange] = useState<RangeMode>('month')
  const [cursor, setCursor] = useState(today)
  const [selectedDate, setSelectedDate] = useState(today)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [practiceDays, setPracticeDays] = useState<string[]>([])
  const [practiceStart, setPracticeStart] = useState('20:00')
  const [practiceEnd, setPracticeEnd] = useState('22:00')
  const [homeCourt, setHomeCourt] = useState('')
  const [venues, setVenues] = useState<ClubVenue[]>([])
  const [bookings, setBookings] = useState<ClubBooking[]>([])
  const [events, setEvents] = useState<OpsEvent[]>([])
  const [venueForm, setVenueForm] = useState<ClubVenue | null>(null)
  const [bookingForm, setBookingForm] = useState<ClubBooking | null>(null)

  const windowRange = useMemo(() => {
    if (range === 'week') {
      const start = startOfWeekMonday(parseYmd(cursor))
      return { from: ymdLocal(start), to: ymdLocal(addDays(start, 6)), days: Array.from({ length: 7 }, (_, i) => addDays(start, i)) }
    }
    const monthDate = parseYmd(cursor)
    const gridStart = startOfWeekMonday(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1))
    const monthLast = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
    const gridEnd = addDays(startOfWeekMonday(monthLast), 6)
    const days: Date[] = []
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d)
    return { from: ymdLocal(gridStart), to: ymdLocal(gridEnd), days }
  }, [cursor, range])

  const dayEvents = events.filter((item) => item.date === selectedDate)
  const monthCursor = parseYmd(cursor)

  const refresh = async () => {
    setLoading(true)
    setMessage('')
    try {
      const { data } = await supabase.from('clubs').select('*').eq('id', clubId).single()
      const settings = clubRowToSettings(data)
      const days = settings?.practiceDays || []
      const start = settings?.practiceTimeStart || '20:00'
      const end = settings?.practiceTimeEnd || '22:00'
      setPracticeDays(days)
      setPracticeStart(start)
      setPracticeEnd(end)
      setHomeCourt(settings?.homeCourt || '')
      const next = await loadOpsCalendar({
        clubId,
        from: windowRange.from,
        to: windowRange.to,
        practiceDays: days,
        practiceTimeStart: start,
        practiceTimeEnd: end,
      })
      setVenues(next.venues)
      setBookings(next.bookings)
      setEvents(next.events)
    } catch (err: any) {
      setMessage(err.message || '운영 일정을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [clubId, windowRange.from, windowRange.to])

  useEffect(() => {
    if (canEdit && tab === 'receipts') setTab('ledger')
    if (!canEdit && tab === 'ledger') setTab('receipts')
  }, [canEdit, tab])

  const move = (dir: -1 | 1) => {
    const date = parseYmd(cursor)
    if (range === 'week') {
      const next = ymdLocal(addDays(date, dir * 7))
      setCursor(next)
      setSelectedDate(next)
      return
    }
    const next = new Date(date.getFullYear(), date.getMonth() + dir, 1)
    setCursor(ymdLocal(next))
    setSelectedDate(ymdLocal(next))
  }

  const savePractice = async () => {
    if (!canEdit) return
    if (!practiceDays.length) {
      setMessage('정기 운동 요일을 하나 이상 선택해 주세요.')
      return
    }
    if (practiceStart >= practiceEnd) {
      setMessage('종료 시간은 시작 시간보다 늦어야 합니다.')
      return
    }
    setSaving(true)
    try {
      await savePracticeSchedule(clubId, practiceDays, practiceStart, practiceEnd)
      setMessage('주간 정기 운동이 저장되었습니다. 월간 달력에 자동으로 채워집니다.')
      await refresh()
    } catch (err: any) {
      setMessage(err.message || '정기 운동을 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const saveVenue = async () => {
    if (!venueForm || !canEdit) return
    if (!venueForm.name.trim()) {
      setMessage('체육관 이름을 입력해 주세요.')
      return
    }
    setSaving(true)
    try {
      const saved = await saveClubVenue({
        ...venueForm,
        name: venueForm.name.trim(),
        address: venueForm.address.trim(),
        mapUrl: venueForm.mapUrl.trim(),
        notes: venueForm.notes.trim(),
      })
      setVenueForm(null)
      setMessage('대관처가 저장되었습니다.')
      if (saved.isHome && saved.address) {
        await supabase.from('clubs').update({ home_court: saved.name }).eq('id', clubId)
      }
      await refresh()
    } catch (err: any) {
      setMessage(err.message || '대관처를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const saveBooking = async () => {
    if (!bookingForm || !canEdit) return
    if (!bookingForm.venueId) {
      setMessage('대관할 체육관을 선택해 주세요.')
      return
    }
    if (!bookingForm.title.trim()) {
      setMessage('대관 제목을 입력해 주세요.')
      return
    }
    setSaving(true)
    try {
      await saveClubBooking({
        ...bookingForm,
        title: bookingForm.title.trim(),
        confirmCode: bookingForm.confirmCode.trim(),
        notes: bookingForm.notes.trim(),
        fee: bookingForm.fee == null || Number.isNaN(bookingForm.fee) ? null : Number(bookingForm.fee),
      })
      setBookingForm(null)
      setMessage('대관 일정이 저장되었습니다.')
      await refresh()
    } catch (err: any) {
      setMessage(err.message || '대관 일정을 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const eventsOn = (date: string) => events.filter((item) => item.date === date)

  if (loading && !venues.length && !events.length) {
    return (
      <div className="bb-screen">
        <Spinner label="운영 일정을 불러오는 중..." />
      </div>
    )
  }

  return (
    <div className="bb-screen pb-10">
      <header className="bb-header">
        <BackButton onClick={() => onBack?.()} />
        <div>
          <h1 className="text-base font-semibold text-ink">운영 · 대관</h1>
          <p className="text-[11px] text-muted">
            {clubName || '동아리 운영'}{canEdit ? ' · 장부' : ''}
          </p>
        </div>
      </header>

      <main className="p-5 space-y-3">
        {message && <p className="text-xs text-navy bg-white border border-line rounded-xl px-3 py-2">{message}</p>}

        <div className="grid grid-cols-3 gap-2">
          {(
            (canEdit
              ? [
                  ['schedule', '운동 일정'],
                  ['venues', '대관 · 약도'],
                  ['ledger', '장부'],
                ]
              : [
                  ['schedule', '운동 일정'],
                  ['venues', '대관 · 약도'],
                  ['receipts', '영수증'],
                ]) as [OpsTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`py-2 rounded-xl text-xs font-semibold border ${tab === id ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'schedule' && (
          <>
            <section className="bb-card p-4 space-y-3">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">주간 정기 운동</p>
              <p className="text-[11px] text-muted leading-relaxed">
                요일과 시간을 저장하면 월간·주간 달력에 정기 운동이 자동으로 표시됩니다.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    disabled={!canEdit || saving}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                      practiceDays.includes(day) ? 'bg-navy text-white border-navy' : 'bg-white border-line'
                    }`}
                    onClick={() =>
                      setPracticeDays((prev) => (prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day]))
                    }
                  >
                    {day}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="time" className="bb-input" value={practiceStart} disabled={!canEdit} onChange={(e) => setPracticeStart(e.target.value)} />
                <input type="time" className="bb-input" value={practiceEnd} disabled={!canEdit} onChange={(e) => setPracticeEnd(e.target.value)} />
              </div>
              {canEdit && (
                <button type="button" className="bb-btn-primary" disabled={saving} onClick={() => void savePractice()}>
                  {saving ? '저장 중...' : '정기 운동 저장'}
                </button>
              )}
            </section>

            <div className="grid grid-cols-2 gap-2">
              {(['month', 'week'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`py-2 rounded-xl text-xs font-semibold border ${range === id ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                  onClick={() => setRange(id)}
                >
                  {id === 'month' ? '월간' : '주간'}
                </button>
              ))}
            </div>

            <section className="bb-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <button type="button" className="bb-btn-ghost text-xs py-2" onClick={() => move(-1)}>이전</button>
                <div className="text-center">
                  <p className="text-sm font-semibold">{range === 'month' ? monthTitle(cursor) : weekRangeLabel(cursor)}</p>
                  <button type="button" className="text-[11px] text-navy font-semibold" onClick={() => { setCursor(today); setSelectedDate(today) }}>
                    오늘
                  </button>
                </div>
                <button type="button" className="bb-btn-ghost text-xs py-2" onClick={() => move(1)}>다음</button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS.map((day) => (
                  <p key={day} className="text-[10px] font-semibold text-muted py-1">{day}</p>
                ))}
                {windowRange.days.map((day) => {
                  const key = ymdLocal(day)
                  const inMonth = range === 'week' || day.getMonth() === monthCursor.getMonth()
                  const marks = eventsOn(key)
                  const selected = key === selectedDate
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`min-h-12 rounded-lg px-0.5 py-1 text-[11px] border ${
                        selected ? 'bg-navy text-white border-navy' : inMonth ? 'bg-white border-line' : 'bg-canvas border-transparent text-muted'
                      }`}
                      onClick={() => setSelectedDate(key)}
                    >
                      <span className="font-semibold">{day.getDate()}</span>
                      <span className="flex justify-center gap-0.5 mt-1 min-h-1.5">
                        {marks.some((item) => item.kind === 'practice') && <span className={`w-1 h-1 rounded-full ${selected ? 'bg-amber-200' : 'bg-amber-500'}`} />}
                        {marks.some((item) => item.kind === 'game') && <span className={`w-1 h-1 rounded-full ${selected ? 'bg-sky-200' : 'bg-sky-500'}`} />}
                        {marks.some((item) => item.kind === 'booking') && <span className={`w-1 h-1 rounded-full ${selected ? 'bg-emerald-200' : 'bg-emerald-500'}`} />}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-muted">노랑 정기운동 · 파랑 경기 · 초록 대관</p>
            </section>

            <section className="bb-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {selectedDate} {weekdayLabel(parseYmd(selectedDate))}
                </h3>
                {canEdit && (
                  <button
                    type="button"
                    className="bb-btn-ghost text-[11px] py-2"
                    onClick={() => {
                      setTab('venues')
                      setBookingForm(emptyBooking(clubId, selectedDate, venues[0]?.id || ''))
                    }}
                  >
                    대관 추가
                  </button>
                )}
              </div>
              {dayEvents.length === 0 ? (
                <EmptyCard title="이 날 일정이 없습니다" description="정기 운동 요일을 저장하거나 대관을 등록해 보세요." />
              ) : (
                dayEvents.map((item) => {
                  const body = (
                    <>
                      <p className="text-[11px] font-semibold text-muted">
                        {eventKindLabel(item.kind)}
                        {item.subtitle ? ` · ${item.subtitle}` : ''}
                      </p>
                      <p className="text-sm font-semibold mt-0.5">{item.title}</p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {item.startTime}{item.endTime ? `–${item.endTime}` : ''}
                        {item.venueName ? ` · ${item.venueName}` : ''}
                      </p>
                    </>
                  )
                  return item.gameId ? (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full rounded-xl border border-line bg-white p-3 text-left"
                      onClick={() => onOpenGame?.(item.gameId!)}
                    >
                      {body}
                    </button>
                  ) : (
                    <div key={item.id} className="w-full rounded-xl border border-line bg-white p-3 text-left">
                      {body}
                    </div>
                  )
                })
              )}
            </section>
          </>
        )}

        {tab === 'venues' && (
          <>
            {homeCourt && !venues.length && canEdit && (
              <button
                type="button"
                className="bb-card w-full p-4 text-left"
                onClick={() => setVenueForm({ ...emptyVenue(clubId), name: homeCourt, isHome: true })}
              >
                <p className="text-xs font-semibold text-navy">홈 코트를 대관처로 등록</p>
                <p className="text-[11px] text-muted mt-1">{homeCourt} · 주소와 약도를 추가하면 멤버가 바로 길을 찾을 수 있습니다.</p>
              </button>
            )}

            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold">체육관</h3>
              {canEdit && (
                <button type="button" className="bb-btn-ghost text-[11px] py-2" onClick={() => setVenueForm(emptyVenue(clubId))}>
                  대관처 추가
                </button>
              )}
            </div>

            {venueForm && canEdit && (
              <section className="bb-card p-4 space-y-2">
                <p className="text-sm font-semibold">{venueForm.id ? '대관처 수정' : '대관처 등록'}</p>
                <input className="bb-input" placeholder="체육관 이름" value={venueForm.name} onChange={(e) => setVenueForm({ ...venueForm, name: e.target.value })} />
                <input className="bb-input" placeholder="주소" value={venueForm.address} onChange={(e) => setVenueForm({ ...venueForm, address: e.target.value })} />
                <input className="bb-input" placeholder="약도 링크 (선택, 카카오/네이버)" value={venueForm.mapUrl} onChange={(e) => setVenueForm({ ...venueForm, mapUrl: e.target.value })} />
                <textarea className="bb-input min-h-20" placeholder="대관 메모 · 이용 규칙" value={venueForm.notes} onChange={(e) => setVenueForm({ ...venueForm, notes: e.target.value })} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-navy" checked={venueForm.isHome} onChange={(e) => setVenueForm({ ...venueForm, isHome: e.target.checked })} />
                  홈 코트
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="bb-btn-ghost" onClick={() => setVenueForm(null)}>취소</button>
                  <button type="button" className="bb-btn-primary" disabled={saving} onClick={() => void saveVenue()}>
                    저장
                  </button>
                </div>
              </section>
            )}

            {venues.length === 0 && !venueForm ? (
              <EmptyCard title="등록된 체육관이 없습니다" description="대관처 이름과 주소를 넣으면 카카오·네이버 약도로 연결됩니다." />
            ) : (
              venues.map((venue) => {
                const kakao = kakaoMapUrl(venue.address, venue.mapUrl)
                const naver = naverMapUrl(venue.address)
                return (
                  <section key={venue.id} className="bb-card p-4 space-y-2">
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{venue.name}{venue.isHome ? ' · 홈' : ''}</p>
                        <p className="text-[11px] text-muted mt-0.5">{venue.address || '주소 미입력'}</p>
                      </div>
                      {canEdit && (
                        <button type="button" className="text-[11px] font-semibold text-navy" onClick={() => setVenueForm(venue)}>
                          수정
                        </button>
                      )}
                    </div>
                    {venue.notes && <p className="text-xs text-ink whitespace-pre-line">{venue.notes}</p>}
                    <div className="grid grid-cols-2 gap-2">
                      <a className={`bb-btn-ghost text-center text-xs py-2 ${kakao ? '' : 'pointer-events-none opacity-40'}`} href={kakao || '#'} target="_blank" rel="noreferrer">
                        카카오맵
                      </a>
                      <a className={`bb-btn-ghost text-center text-xs py-2 ${naver ? '' : 'pointer-events-none opacity-40'}`} href={naver || '#'} target="_blank" rel="noreferrer">
                        네이버지도
                      </a>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        className="text-[11px] text-rose-700"
                        onClick={() => {
                          if (!confirm(`${venue.name}을(를) 삭제할까요? 연결된 대관 일정도 함께 삭제됩니다.`)) return
                          void deleteClubVenue(clubId, venue.id).then(() => refresh())
                        }}
                      >
                        대관처 삭제
                      </button>
                    )}
                  </section>
                )
              })
            )}

            <div className="flex justify-between items-center pt-2">
              <h3 className="text-sm font-semibold">대관 일정</h3>
              {canEdit && venues.length > 0 && (
                <button
                  type="button"
                  className="bb-btn-ghost text-[11px] py-2"
                  onClick={() => setBookingForm(emptyBooking(clubId, selectedDate, venues[0].id))}
                >
                  대관 등록
                </button>
              )}
            </div>

            {bookingForm && canEdit && (
              <section className="bb-card p-4 space-y-2">
                <p className="text-sm font-semibold">{bookingForm.id ? '대관 수정' : '대관 등록'}</p>
                <select className="bb-input" value={bookingForm.venueId} onChange={(e) => setBookingForm({ ...bookingForm, venueId: e.target.value })}>
                  <option value="">체육관 선택</option>
                  {venues.map((venue) => (
                    <option key={venue.id} value={venue.id}>{venue.name}</option>
                  ))}
                </select>
                <input className="bb-input" value={bookingForm.title} onChange={(e) => setBookingForm({ ...bookingForm, title: e.target.value })} />
                <input type="date" className="bb-input" value={bookingForm.date} onChange={(e) => setBookingForm({ ...bookingForm, date: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="time" className="bb-input" value={bookingForm.startTime} onChange={(e) => setBookingForm({ ...bookingForm, startTime: e.target.value })} />
                  <input type="time" className="bb-input" value={bookingForm.endTime} onChange={(e) => setBookingForm({ ...bookingForm, endTime: e.target.value })} />
                </div>
                <input
                  className="bb-input"
                  type="number"
                  min={0}
                  placeholder="대관료 (원)"
                  value={bookingForm.fee ?? ''}
                  onChange={(e) => setBookingForm({ ...bookingForm, fee: e.target.value === '' ? null : Number(e.target.value) })}
                />
                <input className="bb-input" placeholder="예약 번호 · 담당자" value={bookingForm.confirmCode} onChange={(e) => setBookingForm({ ...bookingForm, confirmCode: e.target.value })} />
                <select
                  className="bb-input"
                  value={bookingForm.status}
                  onChange={(e) => setBookingForm({ ...bookingForm, status: e.target.value as BookingStatus })}
                >
                  <option value="planned">예정</option>
                  <option value="confirmed">확정</option>
                  <option value="cancelled">취소</option>
                </select>
                <textarea className="bb-input min-h-16" placeholder="대관 메모" value={bookingForm.notes} onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="bb-btn-ghost" onClick={() => setBookingForm(null)}>취소</button>
                  <button type="button" className="bb-btn-primary" disabled={saving} onClick={() => void saveBooking()}>저장</button>
                </div>
              </section>
            )}

            {bookings.length === 0 && !bookingForm ? (
              <EmptyCard title="대관 일정이 없습니다" description="체육관을 등록한 뒤 날짜·시간·예약 번호를 남겨 두면 달력에 같이 보입니다." />
            ) : (
              bookings.map((item) => {
                const venue = venues.find((v) => v.id === item.venueId)
                return (
                  <section key={item.id} className="bb-card p-4 space-y-1">
                    <p className="text-[11px] font-semibold text-muted">
                      {item.date} · {bookingStatusLabel(item.status)}
                    </p>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-[11px] text-muted">
                      {item.startTime}–{item.endTime}
                      {venue ? ` · ${venue.name}` : ''}
                      {item.fee != null ? ` · ${item.fee.toLocaleString('ko-KR')}원` : ''}
                    </p>
                    {item.confirmCode && <p className="text-[11px] text-ink">예약 {item.confirmCode}</p>}
                    {canEdit && (
                      <div className="flex gap-3 pt-1">
                        <button type="button" className="text-[11px] font-semibold text-navy" onClick={() => setBookingForm(item)}>
                          수정
                        </button>
                        <button
                          type="button"
                          className="text-[11px] text-rose-700"
                          onClick={() => {
                            if (!confirm('이 대관 일정을 삭제할까요?')) return
                            void deleteClubBooking(clubId, item.id).then(() => refresh())
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </section>
                )
              })
            )}
          </>
        )}

        {tab === 'ledger' && canEdit && (
          <ClubLedgerPanel clubId={clubId} userId={userId} canManage />
        )}

        {tab === 'receipts' && !canEdit && (
          <ClubLedgerPanel clubId={clubId} userId={userId} canManage={false} />
        )}
      </main>
    </div>
  )
}
