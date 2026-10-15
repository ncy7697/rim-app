import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { BackButton, EmptyCard, Spinner } from './ui'
import { qrImageUrl } from '../clubSettings'
import { clubRoleLabel, isOwnerRole, isStaffRole, setClubStaffRole } from '../clubMembership'
import { notifyUsers } from '../clubGames'
import {
  PLAY_STYLE_TAGS,
  attendanceRate,
  attendUrl,
  currentMonthKey,
  defaultMemberRecord,
  fieldGoalPct,
  guestListLabel,
  loadClubRoster,
  monthLabel,
  newId,
  parseClubRoster,
  recentMonthKeys,
  recordSessionAttendance,
  saveClubRoster,
  type ClubRoster,
  type DominantHand,
  type GuestListType,
  type MemberRecord,
  type PracticeSession,
} from '../clubRoster'

interface ClubManageScreenProps {
  clubId: string
  userId?: string
  onBack: () => void
}

type Tab = 'pending' | 'members' | 'guests' | 'attendance'

type ClubUser = {
  membershipId: string
  userId: string
  role: string
  status: string
  name: string
  email?: string
  position?: string | null
  back_number?: number | null
  height?: number | null
  weight?: number | null
  apply_reason?: string | null
  birthdate?: string | null
  joinedAt?: string | null
}

function ageFromBirthdate(birthdate?: string | null): number | null {
  const raw = String(birthdate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const [year, month, day] = raw.split('-').map(Number)
  const today = new Date()
  let age = today.getFullYear() - year
  const monthNow = today.getMonth() + 1
  const dayNow = today.getDate()
  if (monthNow < month || (monthNow === month && dayNow < day)) age -= 1
  return age >= 0 && age < 130 ? age : null
}

function formatMemberDate(value?: string | null): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime()) && /T|Z|\+/.test(value)) {
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return `${y}.${m}.${d}`
  }
  const raw = String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ''
  return raw.replaceAll('-', '.')
}

function mapClubUser(item: any): ClubUser {
  return {
    membershipId: item.id,
    userId: item.user_id,
    role: item.role,
    status: item.status,
    name: item.users?.name || '이름 없음',
    email: item.users?.email || '',
    position: item.users?.position,
    back_number: item.users?.back_number,
    height: item.users?.height,
    weight: item.users?.weight,
    apply_reason: item.apply_reason,
    birthdate: item.users?.birthdate ? String(item.users.birthdate).slice(0, 10) : '',
    joinedAt: item.created_at || item.joined_at || '',
  }
}

export default function ClubManageScreen({ clubId, userId, onBack }: ClubManageScreenProps) {
  const [tab, setTab] = useState<Tab>('members')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [people, setPeople] = useState<ClubUser[]>([])
  const [roster, setRoster] = useState<ClubRoster>(() => parseClubRoster(''))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestNote, setGuestNote] = useState('')
  const [guestFilter, setGuestFilter] = useState<'all' | GuestListType>('all')
  const [checkInMessage, setCheckInMessage] = useState('')
  const [clubName, setClubName] = useState('동아리')
  const [memberQuery, setMemberQuery] = useState('')

  const applicants = people.filter((item) => item.status === 'pending')
  const members = people.filter(
    (item) => item.status === 'approved' || item.status == null || isStaffRole(item.role)
  )
  const visibleMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase().replace(/\s+/g, '')
    if (!query) return members
    return members.filter((item) => item.name.toLowerCase().replace(/\s+/g, '').includes(query))
  }, [members, memberQuery])
  const myRole = people.find((item) => item.userId === userId)?.role
  const canAssignCoach = isOwnerRole(myRole)
  const coachCount = members.filter((item) => item.role === 'admin').length
  const selected = members.find((item) => item.userId === selectedId) || null
  const months = useMemo(() => recentMonthKeys(6), [])
  const thisMonth = currentMonthKey()
  const today = new Date().toISOString().slice(0, 10)
  const todaySession = roster.sessions.find((item) => item.date === today) || null

  const loadAll = async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const selectWithJoin = `
            id,
            user_id,
            role,
            status,
            apply_reason,
            created_at,
            users:user_id (
              name,
              email,
              position,
              back_number,
              height,
              weight,
              birthdate
            )
          `
      const { data, error } = await supabase
          .from('club_members')
          .select(selectWithJoin)
          .eq('club_id', clubId)
      const membersResult = error
        ? await supabase
            .from('club_members')
            .select(`
              id,
              user_id,
              role,
              status,
              apply_reason,
              users:user_id (
                name,
                email,
                position,
                back_number,
                height,
                weight,
                birthdate
              )
            `)
            .eq('club_id', clubId)
        : { data, error }
      if (membersResult.error) throw membersResult.error
      setPeople((membersResult.data || []).map(mapClubUser))
      setRoster(await loadClubRoster(clubId))
      const { data: clubRow } = await supabase.from('clubs').select('name').eq('id', clubId).maybeSingle()
      if (clubRow?.name) setClubName(clubRow.name)
    } catch (err: any) {
      console.error(err)
      setErrorMessage(err.message || '멤버 정보를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [clubId])

  const persistRoster = async (next: ClubRoster) => {
    setSaving(true)
    try {
      await saveClubRoster(clubId, next)
      setRoster(next)
    } catch (err: any) {
      console.error(err)
      alert(err.message || '저장에 실패했습니다. 권한을 확인해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  const memberRecord = (user: ClubUser): MemberRecord => {
    const stored = roster.members[user.userId]
    const seed = defaultMemberRecord({
      position: user.position,
      back_number: user.back_number,
      height: user.height,
      weight: user.weight,
    })
    if (!stored) return seed
    return {
      ...stored,
      position: stored.position && stored.position !== 'ALL' ? stored.position : seed.position,
      jerseyNumber: stored.jerseyNumber ?? seed.jerseyNumber,
      height: stored.height ?? seed.height,
      weight: stored.weight ?? seed.weight,
    }
  }

  const handleApprove = async (membershipId: string, applicantId: string, name: string) => {
    if (!confirm(`${name} 님의 가입을 승인하시겠습니까?`)) return
    setActionLoadingId(membershipId)
    try {
      const { error } = await supabase.from('club_members').update({ status: 'approved', role: 'member' }).eq('id', membershipId)
      if (error) throw error
      try {
        await notifyUsers({
          clubId,
          userIds: [applicantId],
          kind: 'join_approved',
          title: `[림] ${clubName} 가입이 승인되었습니다`,
          body: `${clubName} 가입 신청이 승인되었습니다. 이제 동호회 활동에 참여할 수 있습니다.`,
        })
      } catch (notifyErr) {
        console.error('가입 승인 알림 실패:', notifyErr)
      }
      await loadAll()
    } catch (err: any) {
      alert(err.message || '승인에 실패했습니다.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleRemove = async (membershipId: string, applicantId: string, name: string, pending: boolean) => {
    if (!confirm(pending ? `${name} 님의 신청을 거절할까요?` : `${name} 님을 동호회에서 탈퇴 처리할까요?\n더 이상 이 동호회 멤버로 활동할 수 없습니다.`)) return
    setActionLoadingId(membershipId)
    try {
      if (!pending && userId) {
        const { error: rpcError } = await supabase.rpc('remove_club_member', {
          p_actor_id: String(userId),
          p_club_id: String(clubId),
          p_target_user_id: String(applicantId),
        })
        if (rpcError && !/Could not find the function|PGRST202/i.test(rpcError.message || '')) {
          throw rpcError
        }
        if (rpcError) {
          const { error } = await supabase.from('club_members').delete().eq('id', membershipId)
          if (error) throw error
        }
      } else {
        const { error } = await supabase.from('club_members').delete().eq('id', membershipId)
        if (error) throw error
      }
      try {
        await notifyUsers({
          clubId,
          userIds: [applicantId],
          kind: pending ? 'join_rejected' : 'join_rejected',
          title: pending ? `[림] ${clubName} 가입 신청 결과` : `[림] ${clubName}에서 탈퇴 처리되었습니다`,
          body: pending
            ? `${clubName} 가입 신청이 거절되었습니다.`
            : `${clubName} 멤버에서 탈퇴 처리되었습니다.`,
        })
      } catch (notifyErr) {
        console.error('탈퇴/거절 알림 실패:', notifyErr)
      }
      if (selectedId) setSelectedId(null)
      await loadAll()
    } catch (err: any) {
      alert(err.message || '처리에 실패했습니다.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleSetCoach = async (item: ClubUser, makeCoach: boolean) => {
    if (!userId) return
    if (isOwnerRole(item.role)) {
      alert('감독 역할은 변경할 수 없습니다.')
      return
    }
    if (makeCoach && coachCount >= 3) {
      if (!confirm('코치는 2~3명이 적당합니다. 그래도 지정할까요?')) return
    } else if (
      !confirm(
        makeCoach
          ? `${item.name} 님을 코치로 지정할까요?\n일정·경기 기록·신입 승인을 함께 할 수 있습니다.`
          : `${item.name} 님의 코치 권한을 해제하고 정회원으로 내릴까요?`
      )
    ) {
      return
    }
    setActionLoadingId(item.membershipId)
    try {
      await setClubStaffRole({
        actorId: userId,
        clubId,
        targetUserId: item.userId,
        role: makeCoach ? 'admin' : 'member',
      })
      try {
        await notifyUsers({
          clubId,
          userIds: [item.userId],
          kind: 'join_approved',
          title: makeCoach ? `[림] ${clubName} 코치로 지정되었습니다` : `[림] ${clubName} 코치 권한이 해제되었습니다`,
          body: makeCoach
            ? `${clubName}에서 코치로 지정되었습니다. 일정·경기·신입 승인을 함께 관리할 수 있습니다.`
            : `${clubName} 코치 권한이 해제되어 정회원으로 변경되었습니다.`,
        })
      } catch (notifyErr) {
        console.error('코치 지정 알림 실패:', notifyErr)
      }
      await loadAll()
    } catch (err: any) {
      alert(err.message || '역할 변경에 실패했습니다.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const openTodaySession = async () => {
    if (todaySession) return
    const session: PracticeSession = { id: newId(), date: today, title: `정기 운동 ${today}` }
    await persistRoster({ ...roster, sessions: [session, ...roster.sessions] })
  }

  const markAttendance = async (targetUserId: string, session: PracticeSession, present: boolean) => {
    const user = people.find((item) => item.userId === targetUserId)
    const current = user ? memberRecord(user) : defaultMemberRecord()
    const attended = new Set(current.attendedSessionIds)
    if (present) attended.add(session.id)
    else attended.delete(session.id)
    await persistRoster({
      ...roster,
      members: {
        ...roster.members,
        [targetUserId]: { ...current, attendedSessionIds: [...attended] },
      },
    })
  }

  const checkInGps = async () => {
    if (!userId) return
    if (!todaySession) {
      setCheckInMessage('먼저 오늘 출석 세션을 열어 주세요.')
      return
    }
    if (!navigator.geolocation) {
      setCheckInMessage('이 기기에서 GPS를 사용할 수 없습니다.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await markAttendance(userId, todaySession, true)
        await recordSessionAttendance({
          clubId,
          sessionId: todaySession.id,
          userId,
          method: 'gps',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }).catch(() => undefined)
        setCheckInMessage('GPS 출석이 기록되었습니다.')
      },
      () => setCheckInMessage('위치 권한을 허용해야 GPS 출석이 가능합니다.'),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  const addGuest = async () => {
    const name = guestName.trim()
    if (!name) return
    await persistRoster({
      ...roster,
      guests: [{ id: newId(), name, note: guestNote.trim(), list: 'none' }, ...roster.guests],
    })
    setGuestName('')
    setGuestNote('')
  }

  const guestFilters: { id: 'all' | GuestListType; label: string }[] = [
    { id: 'all', label: '전체' },
    { id: 'none', label: '일반' },
    { id: 'white', label: '화이트리스트' },
    { id: 'black', label: '블랙리스트' },
  ]
  const guestCounts = {
    all: roster.guests.length,
    none: roster.guests.filter((item) => item.list === 'none').length,
    white: roster.guests.filter((item) => item.list === 'white').length,
    black: roster.guests.filter((item) => item.list === 'black').length,
  }
  const visibleGuests =
    guestFilter === 'all' ? roster.guests : roster.guests.filter((item) => item.list === guestFilter)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'members', label: '멤버' },
    { id: 'pending', label: '가입 신청' },
    { id: 'attendance', label: '출석' },
    { id: 'guests', label: '게스트' },
  ]

  return (
    <div className="bb-screen pb-10">
      <header className="bb-header">
        <BackButton onClick={selected ? () => setSelectedId(null) : onBack} />
        <div>
          <h1 className="text-base font-semibold text-ink">{selected ? selected.name : '멤버 관리'}</h1>
          <p className="text-[11px] text-muted">{selected ? '프로필 · 기량 · 활동' : '신상, 출석, 회비, 게스트'}</p>
        </div>
      </header>

      {errorMessage && (
        <p className="mx-5 mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{errorMessage}</p>
      )}

      {!selected && (
        <div className="flex bg-white border-b border-line px-2 overflow-x-auto">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex-1 min-w-[72px] py-3 text-xs font-semibold border-b-2 cursor-pointer ${
                tab === item.id ? 'border-navy text-navy' : 'border-transparent text-muted'
              }`}
            >
              {item.label}
              {item.id === 'pending' && applicants.length > 0 && (
                <span className="ml-1 bg-navy text-white text-[10px] px-1.5 py-0.5 rounded-full">{applicants.length}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <main className="p-5 space-y-3 flex-1">
        {loading ? (
          <Spinner label="멤버 정보를 불러오는 중..." />
        ) : selected ? (
          <MemberEditor
            clubUser={selected}
            record={memberRecord(selected)}
            sessionCount={roster.sessions.length}
            months={months}
            saving={saving}
            onCancel={() => setSelectedId(null)}
            canAssignCoach={canAssignCoach && !isOwnerRole(selected.role) && selected.userId !== userId}
            onSetCoach={() => void handleSetCoach(selected, selected.role !== 'admin')}
            onRemove={
              canAssignCoach && !isOwnerRole(selected.role) && selected.userId !== userId
                ? () => void handleRemove(selected.membershipId, selected.userId, selected.name, false)
                : undefined
            }
            onSave={async (next, profile) => {
              await supabase
                .from('users')
                .update({
                  name: profile.name,
                  back_number: profile.jerseyNumber,
                  position: next.position,
                  height: next.height,
                  weight: next.weight,
                  dominant_hand: next.dominantHand,
                })
                .eq('id', selected.userId)
              await persistRoster({
                ...roster,
                members: { ...roster.members, [selected.userId]: next },
              })
              await loadAll()
              setSelectedId(null)
            }}
          />
        ) : tab === 'pending' ? (
          applicants.length === 0 ? (
            <EmptyCard title="대기 중인 신청이 없습니다" />
          ) : (
            applicants.map((item) => (
              <div key={item.membershipId} className="bb-card p-4 flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <h4 className="font-semibold text-sm text-ink">{item.name}</h4>
                  <p className="text-[11px] text-muted">{item.apply_reason || item.position || '포지션 미입력'}</p>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" className="bb-btn-ghost text-xs px-3 py-2" disabled={actionLoadingId === item.membershipId} onClick={() => void handleRemove(item.membershipId, item.userId, item.name, true)}>거절</button>
                  <button type="button" className="px-3.5 py-2 bg-navy text-white text-xs font-semibold rounded-xl cursor-pointer" disabled={actionLoadingId === item.membershipId} onClick={() => void handleApprove(item.membershipId, item.userId, item.name)}>승인</button>
                </div>
              </div>
            ))
          )
        ) : tab === 'members' ? (
          members.length === 0 ? (
            <EmptyCard title="등록된 멤버가 없습니다" />
          ) : (
            <>
              <input
                className="bb-input"
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                placeholder="멤버 이름 검색"
                autoComplete="off"
              />
              {canAssignCoach && (
                <p className="text-[11px] text-muted">
                  정회원 중에서 코치를 지정할 수 있습니다. 2~3명이 적당합니다. 현재 코치 {coachCount}명.
                </p>
              )}
              {visibleMembers.length === 0 ? (
                <EmptyCard title="검색 결과가 없습니다" description="다른 이름으로 찾아 보세요." />
              ) : visibleMembers.map((item) => {
              const record = memberRecord(item)
              const dues = record.dues[thisMonth] === 'paid' ? '완납' : '미납'
              const showCoachAction = canAssignCoach && !isOwnerRole(item.role) && item.userId !== userId
              const showRemoveAction = canAssignCoach && !isOwnerRole(item.role) && item.userId !== userId
              return (
                <div key={item.userId} className="bb-card p-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.userId)}
                    className="w-full text-left cursor-pointer"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {record.jerseyNumber != null ? `#${record.jerseyNumber} ` : ''}
                          {item.name}
                        </p>
                        <p className="text-[11px] text-muted mt-0.5">
                          {record.position} · 출석 {attendanceRate(record, roster.sessions.length)} · 회비 {dues}
                        </p>
                      </div>
                      <span className={`bb-chip ${record.injury.status === 'resting' ? 'bg-amber-50 text-brand' : item.role === 'admin' ? 'bg-navy/10 text-navy' : 'bg-canvas text-muted'}`}>
                        {record.injury.status === 'resting' ? '휴식 중' : clubRoleLabel(item.role)}
                      </span>
                    </div>
                  </button>
                  {showCoachAction && (
                    <button
                      type="button"
                      className={item.role === 'admin' ? 'bb-btn-ghost w-full text-xs' : 'bb-btn-primary w-full text-xs py-2'}
                      disabled={actionLoadingId === item.membershipId}
                      onClick={() => void handleSetCoach(item, item.role !== 'admin')}
                    >
                      {actionLoadingId === item.membershipId
                        ? '처리 중...'
                        : item.role === 'admin'
                          ? '코치 해제 · 정회원으로'
                          : '코치로 지정'}
                    </button>
                  )}
                  {showRemoveAction && (
                    <button
                      type="button"
                      className="bb-btn-danger w-full text-xs"
                      disabled={actionLoadingId === item.membershipId}
                      onClick={() => void handleRemove(item.membershipId, item.userId, item.name, false)}
                    >
                      {actionLoadingId === item.membershipId ? '처리 중...' : '탈퇴 처리'}
                    </button>
                  )}
                </div>
              )
            })}
            </>
          )
        ) : tab === 'attendance' ? (
          <div className="space-y-4">
            <div className="bb-card p-4 space-y-3">
              <p className="text-sm font-semibold text-ink">오늘 출석 · {today}</p>
              {todaySession ? (
                <>
                  <img src={qrImageUrl(attendUrl(clubId, todaySession.id))} alt="출석 QR" className="w-36 h-36 mx-auto rounded-xl border border-line" />
                  <p className="text-[11px] text-muted break-all">{attendUrl(clubId, todaySession.id)}</p>
                  <button type="button" className="bb-btn-ghost w-full" onClick={() => void checkInGps()}>GPS 출석 (현재 기기)</button>
                  {checkInMessage && <p className="text-xs text-navy">{checkInMessage}</p>}
                </>
              ) : (
                <button type="button" className="bb-btn-primary" disabled={saving} onClick={() => void openTodaySession()}>
                  오늘 출석 세션 열기
                </button>
              )}
            </div>
            {roster.sessions.length === 0 ? (
              <EmptyCard title="출석 세션이 없습니다" description="정기 운동 당일 세션을 열면 QR/GPS 출석과 참석률이 집계됩니다." />
            ) : (
              roster.sessions.slice(0, 8).map((session) => (
                <div key={session.id} className="bb-card p-4 space-y-2">
                  <p className="text-sm font-semibold text-ink">{session.title}</p>
                  <div className="space-y-1.5">
                    {members.map((item) => {
                      const present = memberRecord(item).attendedSessionIds.includes(session.id)
                      return (
                        <label key={item.userId} className="flex items-center justify-between text-sm">
                          <span>{item.name}</span>
                          <input
                            type="checkbox"
                            className="accent-navy"
                            checked={present}
                            onChange={(e) => void markAttendance(item.userId, session, e.target.checked)}
                          />
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bb-card p-4 space-y-2">
              <p className="text-sm font-semibold text-ink">게스트 등록</p>
              <input className="bb-input" placeholder="이름" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
              <input className="bb-input" placeholder="메모 (선택)" value={guestNote} onChange={(e) => setGuestNote(e.target.value)} />
              <button type="button" className="bb-btn-primary" disabled={saving} onClick={() => void addGuest()}>추가</button>
            </div>
            <div className="grid grid-cols-2 gap-1.5" role="tablist" aria-label="게스트 목록 필터">
              {guestFilters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={guestFilter === item.id}
                  className={`py-2 px-2 rounded-xl text-[11px] font-semibold border cursor-pointer ${
                    guestFilter === item.id ? 'bg-navy text-white border-navy' : 'bg-white border-line text-muted'
                  }`}
                  onClick={() => setGuestFilter(item.id)}
                >
                  {item.label} {guestCounts[item.id]}
                </button>
              ))}
            </div>
            {roster.guests.length === 0 ? (
              <EmptyCard title="등록된 게스트가 없습니다" />
            ) : visibleGuests.length === 0 ? (
              <EmptyCard title="해당 필터에 게스트가 없습니다" description="다른 목록을 선택해 보세요." />
            ) : (
              visibleGuests.map((guest) => (
                <div key={guest.id} className="bb-card p-4 space-y-2">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink">{guest.name}</p>
                      {guest.note && <p className="text-[11px] text-muted">{guest.note}</p>}
                    </div>
                    <span className={`bb-chip ${guest.list === 'black' ? 'bg-rose-50 text-rose-700' : guest.list === 'white' ? 'bg-emerald-50 text-emerald-800' : 'bg-canvas text-muted'}`}>
                      {guestListLabel(guest.list)}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {(['none', 'white', 'black'] as GuestListType[]).map((list) => (
                      <button
                        key={list}
                        type="button"
                        className={`flex-1 py-2 text-[11px] font-semibold rounded-lg border cursor-pointer ${guest.list === list ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                        onClick={() => void persistRoster({
                          ...roster,
                          guests: roster.guests.map((item) => item.id === guest.id ? { ...item, list } : item),
                        })}
                      >
                        {guestListLabel(list)}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="bb-btn-danger w-full"
                    onClick={() => void persistRoster({ ...roster, guests: roster.guests.filter((item) => item.id !== guest.id) })}
                  >
                    삭제
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function MemberEditor({
  clubUser,
  record,
  sessionCount,
  months,
  saving,
  canAssignCoach,
  onCancel,
  onSetCoach,
  onRemove,
  onSave,
}: {
  clubUser: ClubUser
  record: MemberRecord
  sessionCount: number
  months: string[]
  saving: boolean
  canAssignCoach?: boolean
  onCancel: () => void
  onSetCoach?: () => void
  onRemove?: () => void
  onSave: (record: MemberRecord, profile: { name: string; jerseyNumber: number | null }) => Promise<void>
}) {
  const [draft, setDraft] = useState<MemberRecord>(record)
  const [name, setName] = useState(clubUser.name)

  useEffect(() => {
    setDraft(record)
    setName(clubUser.name)
  }, [clubUser.userId])

  const toggleTag = (tag: string) => {
    setDraft((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((item) => item !== tag) : [...prev.tags, tag],
    }))
  }

  const fg = fieldGoalPct(draft.stats)
  const age = ageFromBirthdate(clubUser.birthdate)
  const birthLabel = formatMemberDate(clubUser.birthdate)
  const joinedLabel = formatMemberDate(clubUser.joinedAt)

  return (
    <div className="space-y-4">
      <section className="bb-card p-4 space-y-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">기본 정보</h3>
        <p className="text-[11px] text-muted">현재 등급 · {clubRoleLabel(clubUser.role)}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="bb-label">나이</p>
            <p className="text-sm text-ink">{age != null ? `만 ${age}세` : '미입력'}</p>
            {birthLabel && (
              <p className="text-[11px] text-muted mt-0.5">생년월일 {birthLabel}</p>
            )}
          </div>
          <div>
            <p className="bb-label">가입 날짜</p>
            <p className="text-sm text-ink">{joinedLabel || '미확인'}</p>
          </div>
        </div>
        {canAssignCoach && onSetCoach && (
          <button type="button" className={clubUser.role === 'admin' ? 'bb-btn-ghost w-full' : 'bb-btn-primary'} onClick={onSetCoach}>
            {clubUser.role === 'admin' ? '코치 해제 · 정회원으로' : '이 선수를 코치로 지정'}
          </button>
        )}
        {onRemove && (
          <button type="button" className="bb-btn-danger w-full" onClick={onRemove}>
            탈퇴 처리
          </button>
        )}
        <div>
          <label className="bb-label">이름</label>
          <input className="bb-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="bb-label">등번호</label>
            <input type="number" className="bb-input" value={draft.jerseyNumber ?? ''} onChange={(e) => setDraft({ ...draft, jerseyNumber: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
          <div>
            <label className="bb-label">주 포지션</label>
            <select className="bb-input" value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value })}>
              {['PG', 'SG', 'SF', 'PF', 'C', 'ALL'].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label className="bb-label">키 (cm)</label>
            <input type="number" className="bb-input" value={draft.height ?? ''} onChange={(e) => setDraft({ ...draft, height: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
          <div>
            <label className="bb-label">몸무게 (kg)</label>
            <input type="number" className="bb-input" value={draft.weight ?? ''} onChange={(e) => setDraft({ ...draft, weight: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
        </div>
        <div>
          <label className="bb-label">주력 손</label>
          <div className="grid grid-cols-3 gap-2">
            {(['오른손', '왼손', '양손'] as DominantHand[]).map((item) => (
              <button key={item} type="button" className={`py-2 rounded-xl text-xs font-semibold border ${draft.dominantHand === item ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`} onClick={() => setDraft({ ...draft, dominantHand: item })}>
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="bb-card p-4 space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">플레이 스타일</h3>
        <div className="flex flex-wrap gap-1.5">
          {PLAY_STYLE_TAGS.map((tag) => (
            <button key={tag} type="button" className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${draft.tags.includes(tag) ? 'bg-navy text-white border-navy' : 'bg-white border-line text-muted'}`} onClick={() => toggleTag(tag)}>
              {tag}
            </button>
          ))}
        </div>
      </section>

      <section className="bb-card p-4 space-y-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">경기 스탯 요약</h3>
        <div className="grid grid-cols-2 gap-3">
          {([
            ['points', '통산 득점'],
            ['rebounds', '리바운드'],
            ['assists', '어시스트'],
            ['games', '참가 횟수'],
            ['fgm', '야투 성공'],
            ['fga', '야투 시도'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label className="bb-label">{label}</label>
              <input type="number" min={0} className="bb-input" value={draft.stats[key]} onChange={(e) => setDraft({ ...draft, stats: { ...draft.stats, [key]: Number(e.target.value) || 0 } })} />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">야투율 {fg} · 출석률 {attendanceRate(draft, sessionCount)}</p>
      </section>

      <section className="bb-card p-4 space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">회비 (월별)</h3>
        {months.map((key) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm">{monthLabel(key)}</span>
            <div className="flex gap-1.5">
              {(['unpaid', 'paid'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border ${ (draft.dues[key] || 'unpaid') === status ? (status === 'paid' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-navy text-white border-navy') : 'bg-white border-line'}`}
                  onClick={() => setDraft({ ...draft, dues: { ...draft.dues, [key]: status } })}
                >
                  {status === 'paid' ? '완납' : '미납'}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="bb-card p-4 space-y-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">부상 상태</h3>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={`py-2 rounded-xl text-xs font-semibold border ${draft.injury.status === 'active' ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`} onClick={() => setDraft({ ...draft, injury: { ...draft.injury, status: 'active' } })}>활동 중</button>
          <button type="button" className={`py-2 rounded-xl text-xs font-semibold border ${draft.injury.status === 'resting' ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`} onClick={() => setDraft({ ...draft, injury: { ...draft.injury, status: 'resting' } })}>휴식 중</button>
        </div>
        {draft.injury.status === 'resting' && (
          <>
            <div>
              <label className="bb-label">복귀 예정일</label>
              <input type="date" className="bb-input" value={draft.injury.returnDate || ''} onChange={(e) => setDraft({ ...draft, injury: { ...draft.injury, returnDate: e.target.value } })} />
            </div>
            <div>
              <label className="bb-label">메모</label>
              <input className="bb-input" value={draft.injury.note || ''} onChange={(e) => setDraft({ ...draft, injury: { ...draft.injury, note: e.target.value } })} />
            </div>
          </>
        )}
      </section>

      <div className="flex gap-2">
        <button type="button" className="bb-btn-ghost flex-1" onClick={onCancel}>취소</button>
        <button type="button" className="bb-btn-primary flex-1" disabled={saving} onClick={() => void onSave(draft, { name, jerseyNumber: draft.jerseyNumber })}>
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}
