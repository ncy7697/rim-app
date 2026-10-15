import { useState } from 'react'
import { closeOwnedClub } from '../clubMembership'

export default function CloseClubPanel({
  clubId,
  clubName,
  userId,
  onClosed,
}: {
  clubId: string
  clubName: string
  userId?: string
  onClosed: () => void
}) {
  const [confirmName, setConfirmName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const submit = async () => {
    if (!userId) return
    if (confirmName.trim() !== clubName.trim()) {
      setMessage('동호회 이름을 정확히 입력해 주세요.')
      return
    }
    if (!confirm(`${clubName} 동호회를 폐쇄할까요?\n멤버·일정·경기 기록이 삭제되며 되돌릴 수 없습니다.`)) return
    setSaving(true)
    setMessage('')
    try {
      await closeOwnedClub({ actorId: userId, clubId, confirmName })
      alert('동호회가 폐쇄되었습니다.')
      onClosed()
    } catch (err: any) {
      setMessage(err.message || '동호회를 폐쇄하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bb-card p-5 space-y-3 border-rose-100">
      <h3 className="text-xs font-semibold tracking-wide text-brand uppercase">동호회 폐쇄</h3>
      <p className="text-xs text-muted leading-relaxed">
        감독만 자신이 개설한 동호회를 폐쇄할 수 있습니다. 폐쇄하면 멤버와 운영 기록이 삭제되고, 이후 새 동호회를 개설할 수 있습니다.
      </p>
      <label className="block">
        <span className="bb-label">확인을 위해 동호회 이름을 입력</span>
        <input className="bb-input" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={clubName} />
      </label>
      {message && <p className="text-xs text-brand">{message}</p>}
      <button type="button" className="bb-btn-danger w-full" disabled={saving} onClick={() => void submit()}>
        {saving ? '폐쇄 중...' : '동호회 폐쇄'}
      </button>
    </section>
  )
}
