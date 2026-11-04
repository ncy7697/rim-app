import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { EmptyCard, Spinner } from './ui'
import { notifyUsers } from '../clubGames'
import { isRegularClubRole } from '../clubEvents'
import { clubRoleLabel } from '../clubMembership'
import { clubRowToSettings } from '../clubSettings'
import {
  currentMonthKey,
  defaultMemberRecord,
  loadClubRoster,
  monthLabel,
  saveClubDues,
  type ClubRoster,
  type DuesStatus,
} from '../clubRoster'

type DuesMember = {
  userId: string
  name: string
  role: string
}

export default function ClubDuesPanel({
  clubId,
  clubName,
}: {
  clubId: string
  clubName?: string
}) {
  const thisMonth = currentMonthKey()
  const [monthKey, setMonthKey] = useState(thisMonth)
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notifying, setNotifying] = useState(false)
  const [message, setMessage] = useState('')
  const [members, setMembers] = useState<DuesMember[]>([])
  const [roster, setRoster] = useState<ClubRoster | null>(null)
  const [duesAmount, setDuesAmount] = useState(0)
  const [duesDay, setDuesDay] = useState(1)

  const rows = useMemo(() => {
    const list = members.map((member) => {
      const record = roster?.members[member.userId] || defaultMemberRecord()
      const status: DuesStatus = record.dues[monthKey] === 'paid' ? 'paid' : 'unpaid'
      return { ...member, status }
    })
    if (filter === 'paid') return list.filter((item) => item.status === 'paid')
    if (filter === 'unpaid') return list.filter((item) => item.status === 'unpaid')
    return list
  }, [members, roster, monthKey, filter])

  const unpaid = members.filter((member) => (roster?.members[member.userId]?.dues[monthKey] || 'unpaid') !== 'paid')
  const paidCount = members.length - unpaid.length

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const [{ data, error }, nextRoster, clubRes] = await Promise.all([
        supabase.from('club_members').select('user_id, role, status, users:user_id ( name )').eq('club_id', clubId),
        loadClubRoster(clubId),
        supabase.from('clubs').select('*').eq('id', clubId).maybeSingle(),
      ])
      if (error) throw error
      const people = (data || [])
        .filter((row) => row.status === 'approved' || row.status == null)
        .filter((row) => isRegularClubRole(row.role))
        .map((row) => {
          const users = row.users as { name?: string } | { name?: string }[] | null
          const name = Array.isArray(users) ? users[0]?.name : users?.name
          return {
            userId: row.user_id,
            name: name || '이름 없음',
            role: row.role,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      setMembers(people)
      setRoster(nextRoster)
      const settings = clubRowToSettings(clubRes.data)
      setDuesAmount(settings?.duesAmount || 0)
      setDuesDay(settings?.duesDay || 1)
    } catch (err: any) {
      setMessage(err.message || '회비 현황을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [clubId])

  const setStatus = async (userId: string, status: DuesStatus) => {
    const current = roster?.members[userId] || defaultMemberRecord()
    const nextRoster: ClubRoster = {
      v: 1,
      sessions: roster?.sessions || [],
      guests: roster?.guests || [],
      members: {
        ...(roster?.members || {}),
        [userId]: { ...current, dues: { ...current.dues, [monthKey]: status } },
      },
    }
    const previous = roster
    setRoster(nextRoster)
    setSaving(true)
    setMessage('')
    try {
      await saveClubDues(clubId, userId, monthKey, status)
    } catch (err: any) {
      setRoster(previous)
      setMessage(err.message || '납입 여부를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const notifyUnpaid = async () => {
    if (!unpaid.length) {
      setMessage('미납 멤버가 없습니다.')
      return
    }
    setNotifying(true)
    setMessage('')
    try {
      const amountText = duesAmount ? `${duesAmount.toLocaleString('ko-KR')}원` : '회비'
      await notifyUsers({
        clubId,
        userIds: unpaid.map((item) => item.userId),
        title: `[림] ${clubName || '동아리'} 회비 미납 안내`,
        body: `${monthLabel(monthKey)}월 회비 ${amountText}가 아직 납부되지 않았습니다. 매월 ${duesDay}일까지 납부해 주세요.`,
        kind: 'dues_reminder',
      })
      setMessage(`미납 멤버 ${unpaid.length}명에게 알림을 보냈습니다.`)
    } catch (err: any) {
      setMessage(err.message || '알림을 보내지 못했습니다.')
    } finally {
      setNotifying(false)
    }
  }

  if (loading) {
    return <Spinner label="회비 현황을 불러오는 중..." />
  }

  return (
    <div className="space-y-3">
      {message && <p className="text-xs text-navy bg-white border border-line rounded-xl px-3 py-2">{message}</p>}

      <section className="bb-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">회비 납입</p>
            <p className="text-[11px] text-muted mt-1">
              매월 {duesDay}일{duesAmount ? ` · ${duesAmount.toLocaleString('ko-KR')}원` : ''}
            </p>
          </div>
          <input
            type="month"
            className="bb-input w-[9.5rem]"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value || thisMonth)}
          />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-canvas py-2">
            <p className="text-[10px] text-muted">대상</p>
            <p className="text-sm font-bold">{members.length}명</p>
          </div>
          <div className="rounded-xl bg-canvas py-2">
            <p className="text-[10px] text-muted">완납</p>
            <p className="text-sm font-bold text-emerald-700">{paidCount}명</p>
          </div>
          <div className="rounded-xl bg-canvas py-2">
            <p className="text-[10px] text-muted">미납</p>
            <p className="text-sm font-bold text-rose-700">{unpaid.length}명</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['all', '전체'],
            ['unpaid', '미납'],
            ['paid', '완납'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`py-2 rounded-xl text-xs font-semibold border ${
                filter === id ? 'bg-navy text-white border-navy' : 'bg-white border-line'
              }`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="bb-btn-accent"
          disabled={notifying || saving || unpaid.length === 0}
          onClick={() => void notifyUnpaid()}
        >
          {notifying ? '알림 보내는 중...' : `미납 ${unpaid.length}명에게 알림 보내기`}
        </button>
      </section>

      {rows.length === 0 ? (
        <EmptyCard
          title={filter === 'unpaid' ? '미납 멤버가 없습니다' : filter === 'paid' ? '완납 멤버가 없습니다' : '회비 대상이 없습니다'}
          description="게스트는 회비 명단에 넣지 않습니다."
        />
      ) : (
        rows.map((item) => (
          <section key={item.userId} className="bb-card p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{item.name}</p>
              <p className="text-[11px] text-muted mt-0.5">{clubRoleLabel(item.role)}</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                disabled={saving}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border ${
                  item.status === 'unpaid' ? 'bg-navy text-white border-navy' : 'bg-white border-line'
                }`}
                onClick={() => void setStatus(item.userId, 'unpaid')}
              >
                미납
              </button>
              <button
                type="button"
                disabled={saving}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border ${
                  item.status === 'paid' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-line'
                }`}
                onClick={() => void setStatus(item.userId, 'paid')}
              >
                완납
              </button>
            </div>
          </section>
        ))
      )}
    </div>
  )
}
