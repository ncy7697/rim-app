import { useEffect, useState } from 'react'
import type { AppNotification } from '../clubGames'
import { listNotifications, markNotificationRead } from '../clubGames'
import { listStaffJoinAlerts, type StaffJoinAlert } from '../clubMembership'

export default function NotificationBell({
  userId,
  onOpenGame,
  onOpenJoin,
  onOpenClub,
  onOpenExchange,
}: {
  userId?: string
  onOpenGame: (clubId: string, gameId: string) => void
  onOpenJoin?: (clubId: string) => void
  onOpenClub?: (clubId: string) => void
  onOpenExchange?: (clubId: string, proposalId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<AppNotification[]>([])
  const [joins, setJoins] = useState<StaffJoinAlert[]>([])

  const refresh = async () => {
    if (!userId) return false
    try {
      const [nextNotes, nextJoins] = await Promise.all([
        listNotifications(userId),
        listStaffJoinAlerts(userId).catch(() => [] as StaffJoinAlert[]),
      ])
      setNotes(nextNotes)
      setJoins(nextJoins)
      return true
    } catch {
      setNotes([])
      setJoins([])
      return false
    }
  }

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    let timer = 0
    let delay = 20000

    const schedule = (nextDelay: number) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void tick()
      }, nextDelay)
    }

    const tick = async () => {
      if (cancelled) return
      if (document.visibilityState === 'hidden') {
        schedule(delay)
        return
      }
      const ok = await refresh()
      delay = ok ? 20000 : Math.min(delay * 2, 120000)
      if (!cancelled) schedule(delay)
    }

    void tick()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onOnline = () => {
      delay = 20000
      void tick()
    }
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId])

  const otherUnread = notes.filter((item) => !item.readAt && item.kind !== 'join_request').length
  const unread = otherUnread + joins.length

  if (!userId) return null

  return (
    <div className="relative">
      <button
        type="button"
        className="relative bb-icon-btn w-9 h-9"
        aria-label="알림"
        onClick={() => {
          setOpen((prev) => !prev)
          void refresh()
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" strokeLinecap="round" />
          <path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-brand text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 max-h-80 overflow-y-auto bb-card p-2 z-40">
          {joins.length === 0 && notes.filter((item) => item.kind !== 'join_request').length === 0 ? (
            <p className="text-xs text-muted p-3">받은 알림이 없습니다.</p>
          ) : (
            <>
              {joins.map((join) => (
                <button
                  key={`join-${join.id}`}
                  type="button"
                  className="w-full text-left rounded-xl p-3 bg-canvas mb-1"
                  onClick={() => {
                    setOpen(false)
                    onOpenJoin?.(join.clubId)
                  }}
                >
                  <p className="text-xs font-semibold">가입 신청 · {join.clubName}</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {join.applicantName} 님이 가입을 신청했습니다.
                    {join.reason ? ` · ${join.reason}` : ''}
                  </p>
                </button>
              ))}
              {notes
                .filter((item) => item.kind !== 'join_request')
                .map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className={`w-full text-left rounded-xl p-3 ${note.readAt ? 'opacity-70' : 'bg-canvas'}`}
                    onClick={() => {
                      void markNotificationRead(note)
                      setNotes((prev) => prev.map((item) => (item.id === note.id ? { ...item, readAt: new Date().toISOString() } : item)))
                      setOpen(false)
                      const proposalId =
                        note.proposalId ||
                        (note.gameId?.startsWith('proposal:') ? note.gameId.slice(9) : '')
                      if (note.kind === 'join_request' && note.clubId) onOpenJoin?.(note.clubId)
                      else if ((note.kind === 'join_approved' || note.kind === 'join_rejected' || note.kind === 'billing' || note.kind === 'club_notice') && note.clubId) onOpenClub?.(note.clubId)
                      else if (proposalId && note.clubId) onOpenExchange?.(note.clubId, proposalId)
                      else if (note.clubId && note.gameId) onOpenGame(note.clubId, note.gameId)
                      else if (note.clubId) onOpenClub?.(note.clubId)
                    }}
                  >
                    <p className="text-xs font-semibold">{note.title}</p>
                    <p className="text-[11px] text-muted mt-0.5">{note.body}</p>
                  </button>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
