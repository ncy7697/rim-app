import { useEffect, useState } from 'react'
import {
  clearClubNotice,
  fetchClubNotice,
  isNoticeActive,
  noticePeriodLabel,
  saveClubNotice,
  uploadNoticeImage,
  type ClubNotice,
} from '../clubNotice'

function defaultEnd() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function ClubNoticePanel({
  clubId,
  userId,
  canEdit,
}: {
  clubId: string
  userId?: string
  canEdit: boolean
}) {
  const [notice, setNotice] = useState<ClubNotice | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [startsOn, setStartsOn] = useState(todayKey())
  const [endsOn, setEndsOn] = useState(defaultEnd())
  const [imageUrl, setImageUrl] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = async () => {
    try {
      const next = await fetchClubNotice(clubId)
      setNotice(next)
      if (next) {
        setTitle(next.title)
        setBody(next.body)
        setStartsOn(next.startsOn)
        setEndsOn(next.endsOn)
        setImageUrl(next.imageUrl || '')
        setImageFile(null)
        setImagePreview(next.imageUrl || '')
      } else {
        setImageUrl('')
        setImageFile(null)
        setImagePreview('')
      }
    } catch {
      setNotice(null)
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    void load()
  }, [clubId])

  const submit = async () => {
    if (!userId) return
    if (!title.trim()) {
      setMessage('공지 제목을 입력해 주세요.')
      return
    }
    if (endsOn < startsOn) {
      setMessage('종료일은 시작일보다 빠를 수 없습니다.')
      return
    }
    if (!confirm('공지를 등록하면 회원에게 알림이 전송됩니다. 동호회당 공지는 1개만 유지됩니다.')) return
    setSaving(true)
    setMessage('')
    try {
      let nextImage = imageUrl
      if (imageFile) nextImage = await uploadNoticeImage(clubId, imageFile)
      await saveClubNotice({
        actorId: userId,
        clubId,
        title,
        body,
        startsOn,
        endsOn,
        imageUrl: nextImage,
      })
      setOpen(false)
      await load()
      setMessage('공지를 등록하고 회원에게 알림을 보냈습니다.')
    } catch (err: any) {
      setMessage(err.message || '공지를 등록하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!userId || !notice) return
    if (!confirm('등록된 공지를 내릴까요?')) return
    setSaving(true)
    setMessage('')
    try {
      await clearClubNotice(userId, clubId)
      setTitle('')
      setBody('')
      setStartsOn(todayKey())
      setEndsOn(defaultEnd())
      setImageUrl('')
      setImageFile(null)
      setImagePreview('')
      await load()
      setMessage('공지를 내렸습니다.')
    } catch (err: any) {
      setMessage(err.message || '공지를 내리지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const active = notice && isNoticeActive(notice)

  if (!loaded) return null
  if (!canEdit && !active) return null

  return (
    <div className="space-y-3">
      {active && notice && (
        <section className="bb-card p-5 space-y-2 border-navy/10 bg-navy/[0.03]">
          <p className="text-[11px] font-semibold tracking-wide text-navy uppercase">공지</p>
          <h3 className="text-sm font-semibold text-ink">{notice.title}</h3>
          {notice.imageUrl && (
            <img src={notice.imageUrl} alt="" className="w-full max-h-64 object-contain rounded-xl border border-line bg-white" />
          )}
          {notice.body && <p className="text-sm text-ink leading-relaxed whitespace-pre-line">{notice.body}</p>}
          <p className="text-[11px] text-muted">게시 기간 {noticePeriodLabel(notice)}</p>
        </section>
      )}

      {canEdit && userId && (
        <section className="bb-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">공지 등록</h3>
              <p className="text-[11px] text-muted mt-1">감독만 동호회당 1개를 기간 지정해 올릴 수 있습니다.</p>
            </div>
            <button type="button" className="bb-btn-ghost text-xs py-2 px-3" onClick={() => setOpen((prev) => !prev)}>
              {open ? '접기' : notice ? '수정' : '등록'}
            </button>
          </div>
          {notice && !active && (
            <p className="text-[11px] text-muted">저장된 공지의 게시 기간이 지났습니다. {noticePeriodLabel(notice)}</p>
          )}
          {open && (
            <div className="space-y-3">
              <label className="block">
                <span className="bb-label">제목</span>
                <input className="bb-input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 이번 주 코트 변경" />
              </label>
              <label className="block">
                <span className="bb-label">내용</span>
                <textarea
                  className="bb-input min-h-24 resize-y"
                  maxLength={800}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="회원에게 전달할 내용을 적어 주세요"
                />
              </label>
              <div className="space-y-2">
                <span className="bb-label">이미지 첨부 (1장)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="text-xs w-full"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    if (file && !file.type.startsWith('image/')) {
                      setMessage('이미지 파일만 첨부할 수 있습니다.')
                      e.target.value = ''
                      return
                    }
                    setImageFile(file)
                    setImagePreview(file ? URL.createObjectURL(file) : imageUrl)
                  }}
                />
                {imagePreview && (
                  <img src={imagePreview} alt="공지 미리보기" className="w-full max-h-48 object-contain rounded-xl border border-line bg-canvas" />
                )}
                {imagePreview && (
                  <button
                    type="button"
                    className="bb-btn-ghost w-full text-xs"
                    onClick={() => {
                      setImageFile(null)
                      setImageUrl('')
                      setImagePreview('')
                    }}
                  >
                    이미지 빼기
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="bb-label">시작일</span>
                  <input type="date" className="bb-input" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
                </label>
                <label className="block">
                  <span className="bb-label">종료일</span>
                  <input type="date" className="bb-input" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
                </label>
              </div>
              {message && <p className="text-xs text-brand">{message}</p>}
              <button type="button" className="bb-btn-primary" disabled={saving} onClick={() => void submit()}>
                {saving ? '저장 중...' : '공지 등록 · 알림 보내기'}
              </button>
              {notice && (
                <button type="button" className="bb-btn-ghost w-full" disabled={saving} onClick={() => void remove()}>
                  공지 내리기
                </button>
              )}
            </div>
          )}
          {!open && message && <p className="text-xs text-navy">{message}</p>}
        </section>
      )}
    </div>
  )
}
