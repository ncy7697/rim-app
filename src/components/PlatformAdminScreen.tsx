import { useEffect, useMemo, useState } from 'react'
import {
  adminListClubMembers,
  adminListClubs,
  adminListUsers,
  adminUpdateClub,
  adminUpdateMembership,
  adminUpdateUser,
  roleLabel,
  type AdminClub,
  type AdminClubMember,
  type AdminUser,
} from '../platformAdmin'
import {
  adminListPayments,
  adminReviewPayment,
  adminSetClubAccess,
  adminUpdateBillingSettings,
  formatAccessDate,
  fromDatetimeLocal,
  getBillingSettings,
  paymentStatusLabel,
  toDatetimeLocalEndOfDay,
  type AdminPayment,
  type BillingSettings,
} from '../clubBilling'
import { BackButton, EmptyCard, Spinner } from './ui'

type Tab = 'users' | 'clubs' | 'billing'
type AdminView = 'list' | 'editUser' | 'editClub'

interface PlatformAdminScreenProps {
  actorId: string
  actorName: string
  onLogout: () => void
  onOpenApp: () => void
}

export default function PlatformAdminScreen({
  actorId,
  actorName,
  onLogout,
  onOpenApp,
}: PlatformAdminScreenProps) {
  const [tab, setTab] = useState<Tab>('users')
  const [view, setView] = useState<AdminView>('list')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [clubs, setClubs] = useState<AdminClub[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [members, setMembers] = useState<AdminClubMember[]>([])
  const [userForm, setUserForm] = useState({
    name: '',
    loginId: '',
    email: '',
    birthdate: '',
    height: '',
    weight: '',
    position: 'ALL',
    password: '',
  })
  const [clubForm, setClubForm] = useState({
    name: '',
    emoji: '🏀',
    region: '',
    category: '',
    description: '',
    homeCourt: '',
    accessUntil: '',
  })
  const [payments, setPayments] = useState<AdminPayment[]>([])
  const [billingForm, setBillingForm] = useState<BillingSettings>({
    bankName: '',
    accountNumber: '',
    accountHolder: '',
    monthlyFee: 5000,
    notice: '',
  })
  const [reviewUntil, setReviewUntil] = useState<Record<string, string>>({})

  const selectedUser = users.find((item) => item.id === selectedUserId) || null
  const selectedClub = clubs.find((item) => item.id === selectedClubId) || null

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((item) =>
      [item.name, item.login_id, item.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    )
  }, [users, query])

  const filteredClubs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clubs
    return clubs.filter((item) =>
      [item.name, item.region, item.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    )
  }, [clubs, query])

  const filteredPayments = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return payments
    return payments.filter((item) =>
      [item.clubName, item.depositorName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    )
  }, [payments, query])

  const loadAll = async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const results = await Promise.allSettled([
        adminListUsers(actorId),
        adminListClubs(actorId),
        adminListPayments(actorId),
        getBillingSettings(),
      ])
      const messages: string[] = []
      if (results[0].status === 'fulfilled') setUsers(results[0].value)
      else messages.push(results[0].reason?.message || '회원 목록을 불러오지 못했습니다.')
      if (results[1].status === 'fulfilled') setClubs(results[1].value)
      else messages.push(results[1].reason?.message || '동호회 목록을 불러오지 못했습니다.')
      if (results[2].status === 'fulfilled') setPayments(results[2].value)
      else messages.push(results[2].reason?.message || '입금 요청을 불러오지 못했습니다.')
      if (results[3].status === 'fulfilled') setBillingForm(results[3].value)
      else messages.push(results[3].reason?.message || '계좌 설정을 불러오지 못했습니다.')
      setErrorMessage(messages.join(' / '))
    } catch (err: any) {
      setErrorMessage(err.message || '운영 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [actorId])

  useEffect(() => {
    if (!selectedUser) return
    setUserForm({
      name: selectedUser.name || '',
      loginId: selectedUser.login_id || '',
      email: selectedUser.email || '',
      birthdate: selectedUser.birthdate?.slice(0, 10) || '',
      height: selectedUser.height != null ? String(selectedUser.height) : '',
      weight: selectedUser.weight != null ? String(selectedUser.weight) : '',
      position: selectedUser.position || 'ALL',
      password: '',
    })
  }, [selectedUserId, selectedUser?.id])

  useEffect(() => {
    if (!selectedClub) {
      setMembers([])
      return
    }
    setClubForm({
      name: selectedClub.name || '',
      emoji: selectedClub.emoji || '🏀',
      region: selectedClub.region || '',
      category: selectedClub.category || '',
      description: selectedClub.description || '',
      homeCourt: selectedClub.home_court || '',
      accessUntil: toDatetimeLocalEndOfDay(selectedClub.access_until),
    })
    adminListClubMembers(actorId, selectedClub.id)
      .then(setMembers)
      .catch((err) => setErrorMessage(err.message || '멤버 목록을 불러오지 못했습니다.'))
  }, [selectedClubId, selectedClub?.id, actorId])

  const saveUser = async () => {
    if (!selectedUserId) return
    setSaving(true)
    setErrorMessage('')
    try {
      await adminUpdateUser(actorId, {
        userId: selectedUserId,
        ...userForm,
        password: userForm.password.trim() || undefined,
      })
      await loadAll()
      alert('회원 정보를 저장했습니다.')
      setSelectedUserId(null)
      setView(selectedClubId ? 'editClub' : 'list')
    } catch (err: any) {
      setErrorMessage(err.message || '회원 정보를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const saveClub = async () => {
    if (!selectedClubId) return
    setSaving(true)
    setErrorMessage('')
    try {
      await adminUpdateClub(actorId, { clubId: selectedClubId, ...clubForm })
      if (clubForm.accessUntil) {
        await adminSetClubAccess(actorId, selectedClubId, fromDatetimeLocal(clubForm.accessUntil))
      }
      await loadAll()
      alert('동호회 정보를 저장했습니다.')
      setView('list')
      setSelectedClubId(null)
    } catch (err: any) {
      setErrorMessage(err.message || '동호회 정보를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const saveMembership = async (membershipId: string, role: string, status: string) => {
    setSaving(true)
    setErrorMessage('')
    try {
      await adminUpdateMembership(actorId, membershipId, role, status)
      if (selectedClubId) setMembers(await adminListClubMembers(actorId, selectedClubId))
      await loadAll()
    } catch (err: any) {
      setErrorMessage(err.message || '멤버 정보를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const saveBilling = async () => {
    setSaving(true)
    setErrorMessage('')
    try {
      await adminUpdateBillingSettings(actorId, billingForm)
      await loadAll()
      alert('입금 계좌 정보를 저장했습니다.')
    } catch (err: any) {
      setErrorMessage(err.message || '계좌 정보를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const reviewPayment = async (id: string, status: 'confirmed' | 'rejected') => {
    setSaving(true)
    setErrorMessage('')
    try {
      const until = reviewUntil[id]
      await adminReviewPayment(actorId, id, status, until ? fromDatetimeLocal(until) : undefined)
      await loadAll()
    } catch (err: any) {
      setErrorMessage(err.message || '처리에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const closeEdit = () => {
    setErrorMessage('')
    if (view === 'editUser' && selectedClubId) {
      setSelectedUserId(null)
      setView('editClub')
      return
    }
    setView('list')
    setSelectedUserId(null)
    setSelectedClubId(null)
  }

  if (view === 'editUser' && selectedUser) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col bg-canvas">
        <header className="bb-header shrink-0">
          <BackButton onClick={closeEdit} />
          <h1 className="text-base font-semibold text-ink">회원 정보 수정</h1>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <p className="text-[11px] text-muted">
            {selectedUser.login_id || '아이디 없음'}
            {selectedUser.is_platform_admin ? ' · 운영자' : ''}
          </p>
          {selectedUser.clubs.length > 0 && (
            <p className="text-[11px] text-muted">
              {selectedUser.clubs.map((club) => `${club.club_name}(${roleLabel(club.role)})`).join(' · ')}
            </p>
          )}
          {errorMessage && <p className="text-xs text-brand">{errorMessage}</p>}
          <label className="block">
            <span className="bb-label">이름</span>
            <input className="bb-input" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
          </label>
          <label className="block">
            <span className="bb-label">아이디</span>
            <input className="bb-input" value={userForm.loginId} onChange={(e) => setUserForm({ ...userForm, loginId: e.target.value })} />
          </label>
          <label className="block">
            <span className="bb-label">이메일</span>
            <input className="bb-input" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
          </label>
          <label className="block">
            <span className="bb-label">생년월일</span>
            <input type="date" className="bb-input" value={userForm.birthdate} onChange={(e) => setUserForm({ ...userForm, birthdate: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="bb-label">신장</span>
              <input className="bb-input" value={userForm.height} onChange={(e) => setUserForm({ ...userForm, height: e.target.value })} />
            </label>
            <label className="block">
              <span className="bb-label">체중</span>
              <input className="bb-input" value={userForm.weight} onChange={(e) => setUserForm({ ...userForm, weight: e.target.value })} />
            </label>
          </div>
          <label className="block">
            <span className="bb-label">포지션</span>
            <select className="bb-input" value={userForm.position} onChange={(e) => setUserForm({ ...userForm, position: e.target.value })}>
              {['PG', 'SG', 'SF', 'PF', 'C', 'ALL'].map((pos) => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="bb-label">비밀번호 재설정 (선택)</span>
            <input type="password" className="bb-input" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} placeholder="변경할 때만 입력" />
          </label>
          <button type="button" disabled={saving} onClick={() => void saveUser()} className="bb-btn-primary">
            {saving ? '저장 중...' : '저장하고 목록으로'}
          </button>
        </div>
      </div>
    )
  }

  if (view === 'editClub' && selectedClub) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col bg-canvas">
        <header className="bb-header shrink-0">
          <BackButton onClick={closeEdit} />
          <h1 className="text-base font-semibold text-ink">동호회 정보 수정</h1>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {errorMessage && <p className="text-xs text-brand">{errorMessage}</p>}
          <label className="block">
            <span className="bb-label">이름</span>
            <input className="bb-input" value={clubForm.name} onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })} />
          </label>
          <label className="block">
            <span className="bb-label">이모지</span>
            <input className="bb-input" value={clubForm.emoji} onChange={(e) => setClubForm({ ...clubForm, emoji: e.target.value })} />
          </label>
          <label className="block">
            <span className="bb-label">지역</span>
            <input className="bb-input" value={clubForm.region} onChange={(e) => setClubForm({ ...clubForm, region: e.target.value })} />
          </label>
          <label className="block">
            <span className="bb-label">홈 코트</span>
            <input className="bb-input" value={clubForm.homeCourt} onChange={(e) => setClubForm({ ...clubForm, homeCourt: e.target.value })} />
          </label>
          <label className="block">
            <span className="bb-label">분류</span>
            <input className="bb-input" value={clubForm.category} onChange={(e) => setClubForm({ ...clubForm, category: e.target.value })} />
          </label>
          <label className="block">
            <span className="bb-label">소개</span>
            <textarea className="bb-input min-h-24" value={clubForm.description} onChange={(e) => setClubForm({ ...clubForm, description: e.target.value })} />
          </label>
          <label className="block">
            <span className="bb-label">이용 종료일</span>
            <input
              type="datetime-local"
              className="bb-input"
              value={clubForm.accessUntil}
              onChange={(e) => setClubForm({ ...clubForm, accessUntil: e.target.value })}
            />
            <p className="text-[11px] text-muted mt-1">입금 확인 후 이 날짜까지 동호회 기능을 사용할 수 있습니다.</p>
          </label>
          <button type="button" disabled={saving} onClick={() => void saveClub()} className="bb-btn-primary">
            {saving ? '저장 중...' : '저장하고 목록으로'}
          </button>

          <h3 className="pt-2 text-sm font-semibold text-ink">소속 멤버</h3>
          {members.length === 0 ? (
            <p className="text-xs text-muted">멤버가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div key={member.membership_id} className="rounded-xl border border-line p-3 space-y-2">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      const user = users.find((item) => item.id === member.user_id)
                      if (!user) {
                        alert('회원 정보를 찾을 수 없습니다. 회원 탭에서 다시 열어 주세요.')
                        return
                      }
                      setSelectedUserId(user.id)
                      setView('editUser')
                    }}
                  >
                    <p className="text-sm font-medium text-ink">{member.user_name || '이름 없음'}</p>
                    <p className="text-[11px] text-muted">{member.login_id || '아이디 없음'} · 회원 정보 수정</p>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="bb-input"
                      value={member.role === 'leader' ? 'owner' : member.role}
                      onChange={(e) => void saveMembership(member.membership_id, e.target.value, member.status || 'approved')}
                    >
                      <option value="owner">감독</option>
                      <option value="admin">코치</option>
                      <option value="member">정회원</option>
                      <option value="guest">게스트</option>
                    </select>
                    <select
                      className="bb-input"
                      value={member.status || 'approved'}
                      onChange={(e) => void saveMembership(member.membership_id, member.role, e.target.value)}
                    >
                      <option value="approved">승인</option>
                      <option value="pending">대기</option>
                      <option value="rejected">거절</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-canvas">
      <header className="shrink-0 border-b border-line bg-navy px-5 py-3.5 text-white">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-white/45">운영 콘솔</p>
            <h1 className="text-[15px] font-semibold">림 관리자</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={onOpenApp} className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-white/80 hover:bg-white/10">
              앱 화면
            </button>
            <button type="button" onClick={onLogout} className="rounded-lg border border-white/20 px-2.5 py-1.5 text-[11px] font-medium text-white">
              로그아웃
            </button>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-white/55">{actorName} · 플랫폼 운영자</p>
      </header>

      <div className="flex shrink-0 gap-2 border-b border-line bg-white px-5 py-2">
        <button
          type="button"
          onClick={() => { setTab('users'); setQuery(''); closeEdit(); }}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === 'users' ? 'bg-navy text-white' : 'text-muted'}`}
        >
          회원 {users.length}
        </button>
        <button
          type="button"
          onClick={() => { setTab('clubs'); setQuery(''); closeEdit(); }}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === 'clubs' ? 'bg-navy text-white' : 'text-muted'}`}
        >
          동호회 {clubs.length}
        </button>
        <button
          type="button"
          onClick={() => { setTab('billing'); setQuery(''); closeEdit(); }}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === 'billing' ? 'bg-navy text-white' : 'text-muted'}`}
        >
          결제 {payments.filter((item) => item.status === 'pending').length}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="bb-input"
          placeholder={tab === 'users' ? '이름·아이디·이메일 검색' : tab === 'clubs' ? '동호회명·지역 검색' : '동호회·입금자 검색'}
        />

        {errorMessage && <p className="text-xs text-brand">{errorMessage}</p>}

        {loading ? (
          <Spinner label="운영 데이터를 불러오는 중..." />
        ) : tab === 'users' ? (
          filteredUsers.length === 0 ? (
            <EmptyCard title="회원이 없습니다" />
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    setSelectedClubId(null)
                    setSelectedUserId(user.id)
                    setView('editUser')
                  }}
                  className="bb-card w-full p-3 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{user.name || '이름 없음'}</p>
                      <p className="text-[11px] text-muted">{user.login_id || '아이디 없음'}</p>
                    </div>
                    {user.is_platform_admin && <span className="bb-chip bg-navy/10 text-navy">운영자</span>}
                  </div>
                  {user.clubs.length > 0 && (
                    <p className="mt-1 truncate text-[11px] text-muted">
                      {user.clubs.map((club) => `${club.club_name}(${roleLabel(club.role)})`).join(' · ')}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )
        ) : tab === 'billing' ? (
          <div className="space-y-4">
            <section className="bb-card p-4 space-y-3">
              <h2 className="text-sm font-semibold text-ink">입금 계좌</h2>
              <label className="block">
                <span className="bb-label">은행</span>
                <input className="bb-input" value={billingForm.bankName} onChange={(e) => setBillingForm({ ...billingForm, bankName: e.target.value })} />
              </label>
              <label className="block">
                <span className="bb-label">계좌번호</span>
                <input className="bb-input" value={billingForm.accountNumber} onChange={(e) => setBillingForm({ ...billingForm, accountNumber: e.target.value })} />
              </label>
              <label className="block">
                <span className="bb-label">예금주</span>
                <input className="bb-input" value={billingForm.accountHolder} onChange={(e) => setBillingForm({ ...billingForm, accountHolder: e.target.value })} />
              </label>
              <label className="block">
                <span className="bb-label">월 이용료 (원)</span>
                <input className="bb-input" type="number" min={0} value={billingForm.monthlyFee} onChange={(e) => setBillingForm({ ...billingForm, monthlyFee: Number(e.target.value) })} />
              </label>
              <label className="block">
                <span className="bb-label">안내 문구</span>
                <textarea className="bb-input min-h-20" value={billingForm.notice} onChange={(e) => setBillingForm({ ...billingForm, notice: e.target.value })} />
              </label>
              <button type="button" disabled={saving} className="bb-btn-primary" onClick={() => void saveBilling()}>
                {saving ? '저장 중...' : '계좌 정보 저장'}
              </button>
            </section>
            {filteredPayments.length === 0 ? (
              <EmptyCard title="입금 확인 요청이 없습니다" />
            ) : (
              filteredPayments.map((item) => (
                <div key={item.id} className="bb-card p-4 space-y-2">
                  <div className="flex justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{item.clubName}</p>
                    <span className="text-[11px] text-muted">{paymentStatusLabel(item.status)}</span>
                  </div>
                  <p className="text-xs text-muted">
                    {item.depositorName} · {item.amount.toLocaleString('ko-KR')}원
                    {item.memo ? ` · ${item.memo}` : ''}
                  </p>
                  <p className="text-[11px] text-muted">현재 이용 종료 {formatAccessDate(item.accessUntil)}</p>
                  {item.status === 'pending' && (
                    <>
                      <label className="block">
                        <span className="bb-label">승인 시 이용 종료일</span>
                        <input
                          type="datetime-local"
                          className="bb-input"
                          value={reviewUntil[item.id] || toDatetimeLocalEndOfDay(item.accessUntil)}
                          onChange={(e) => setReviewUntil((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        />
                      </label>
                      <div className="flex gap-2">
                        <button type="button" disabled={saving} className="bb-btn-primary flex-1" onClick={() => void reviewPayment(item.id, 'confirmed')}>
                          입금 확인 · 기간 반영
                        </button>
                        <button type="button" disabled={saving} className="bb-btn-ghost" onClick={() => void reviewPayment(item.id, 'rejected')}>
                          반려
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        ) : filteredClubs.length === 0 ? (
          <EmptyCard title="동호회가 없습니다" />
        ) : (
          <div className="space-y-2">
            {filteredClubs.map((club) => (
              <button
                key={club.id}
                type="button"
                onClick={() => {
                  setSelectedUserId(null)
                  setSelectedClubId(club.id)
                  setView('editClub')
                }}
                className="bb-card w-full p-3 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {club.emoji || '🏀'} {club.name}
                    </p>
                    <p className="text-[11px] text-muted">{club.region || '지역 미정'} · {formatAccessDate(club.access_until)}</p>
                  </div>
                  <span className="text-[11px] text-muted">
                    멤버 {club.member_count}
                    {club.pending_payments > 0 ? ` · 입금 ${club.pending_payments}` : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
