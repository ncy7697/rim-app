import { useEffect, useMemo, useState } from 'react'
import { BackButton, EmptyCard, Spinner } from './ui'
import {
  LETTER_MAX_LENGTH,
  MESSAGE_KEEP_DAYS,
  formatLetterDate,
  formatMessageTime,
  letterPreview,
  listClubMessageMembers,
  listInboxLetters,
  listSentLetters,
  markLetterRead,
  messageRoleLabel,
  sendClubLetter,
  type ClubMessage,
  type ClubMessageMember,
} from '../clubMessages'

type View = 'inbox' | 'sent' | 'compose' | 'read'
type MailTab = 'inbox' | 'sent'

export default function ClubMessagesScreen({
  clubId,
  clubName,
  userId,
  userName,
  onBack,
}: {
  clubId: string
  clubName?: string
  userId: string
  userName?: string
  onBack?: () => void
}) {
  const [view, setView] = useState<View>('inbox')
  const [mailTab, setMailTab] = useState<MailTab>('inbox')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [members, setMembers] = useState<ClubMessageMember[]>([])
  const [inbox, setInbox] = useState<ClubMessage[]>([])
  const [sent, setSent] = useState<ClubMessage[]>([])
  const [selected, setSelected] = useState<ClubMessage | null>(null)
  const [replySource, setReplySource] = useState<ClubMessage | null>(null)
  const [recipientId, setRecipientId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const memberName = (id: string) => members.find((item) => item.userId === id)?.name || '멤버'
  const unreadCount = useMemo(() => inbox.filter((item) => !item.readAt).length, [inbox])
  const list = mailTab === 'inbox' ? inbox : sent

  const refresh = async () => {
    setLoading(true)
    setMessage('')
    try {
      const [nextMembers, nextInbox, nextSent] = await Promise.all([
        listClubMessageMembers(clubId, userId),
        listInboxLetters(clubId, userId),
        listSentLetters(clubId, userId),
      ])
      setMembers(nextMembers)
      setInbox(nextInbox)
      setSent(nextSent)
    } catch (err: any) {
      setMessage(err.message || '편지함을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [clubId, userId])

  const openLetter = async (letter: ClubMessage) => {
    setSelected(letter)
    setView('read')
    setMessage('')
    if (letter.recipientId === userId && !letter.readAt) {
      try {
        const marked = await markLetterRead(clubId, letter.id, userId)
        if (marked) {
          setSelected(marked)
          setInbox((prev) => prev.map((item) => (item.id === marked.id ? marked : item)))
        }
      } catch {
        /* ignore mark failures while reading */
      }
    }
  }

  const openCompose = (opts?: { replyTo?: ClubMessage; toUserId?: string }) => {
    const replyTo = opts?.replyTo || null
    setReplySource(replyTo)
    setRecipientId(opts?.toUserId || replyTo?.senderId || '')
    setSubject(replyTo ? (replyTo.subject.startsWith('RE:') ? replyTo.subject : `RE: ${replyTo.subject || '편지'}`) : '')
    setBody('')
    setSelected(null)
    setView('compose')
    setMessage('')
  }

  const send = async () => {
    if (sending) return
    setSending(true)
    setMessage('')
    try {
      const saved = await sendClubLetter({
        clubId,
        clubName,
        senderId: userId,
        senderName: userName || '회원',
        recipientId,
        subject,
        body,
        replyToId: replySource?.id,
      })
      setSent((prev) => [saved, ...prev])
      setReplySource(null)
      setRecipientId('')
      setSubject('')
      setBody('')
      setMailTab('sent')
      setView('sent')
      setMessage('편지를 보냈습니다.')
    } catch (err: any) {
      setMessage(err.message || '편지를 보내지 못했습니다.')
    } finally {
      setSending(false)
    }
  }

  const headerTitle =
    view === 'compose' ? (replySource ? '답장 쓰기' : '편지 쓰기') : view === 'read' ? '편지 읽기' : '편지함'
  const headerSub =
    view === 'read' && selected
      ? formatLetterDate(selected.createdAt)
      : `${clubName || '동아리'} · ${MESSAGE_KEEP_DAYS}일 보관`

  if (loading && !inbox.length && !sent.length && view !== 'compose') {
    return (
      <div className="bb-screen">
        <Spinner label="편지함을 불러오는 중..." />
      </div>
    )
  }

  return (
    <div className="bb-screen pb-10">
      <header className="bb-header">
        <BackButton
          onClick={() => {
            if (view === 'read' || view === 'compose') {
              setView(mailTab)
              setSelected(null)
              setReplySource(null)
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

        {(view === 'inbox' || view === 'sent') && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`py-2 rounded-xl text-xs font-semibold border ${
                  mailTab === 'inbox' ? 'bg-navy text-white border-navy' : 'bg-white border-line'
                }`}
                onClick={() => {
                  setMailTab('inbox')
                  setView('inbox')
                  void refresh()
                }}
              >
                받은 편지{unreadCount ? ` · ${unreadCount}` : ''}
              </button>
              <button
                type="button"
                className={`py-2 rounded-xl text-xs font-semibold border ${
                  mailTab === 'sent' ? 'bg-navy text-white border-navy' : 'bg-white border-line'
                }`}
                onClick={() => {
                  setMailTab('sent')
                  setView('sent')
                  void refresh()
                }}
              >
                보낸 편지
              </button>
            </div>
            <button type="button" className="bb-btn-primary" onClick={() => openCompose()}>
              새 편지 쓰기
            </button>
            <p className="text-[11px] text-muted">
              편지를 보내면 상대가 확인한 뒤 답장할 수 있습니다. {MESSAGE_KEEP_DAYS}일이 지난 편지는 자동으로 삭제됩니다.
            </p>
            {list.length === 0 ? (
              <EmptyCard
                title={mailTab === 'inbox' ? '받은 편지가 없습니다' : '보낸 편지가 없습니다'}
                description={mailTab === 'inbox' ? '멤버에게 첫 편지를 보내 보세요.' : '작성한 편지가 여기 쌓입니다.'}
              />
            ) : (
              list.map((item) => {
                const otherId = mailTab === 'inbox' ? item.senderId : item.recipientId
                const unread = mailTab === 'inbox' && !item.readAt
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`bb-card w-full p-4 text-left ${unread ? 'border-navy/40 bg-navy/[0.03]' : ''}`}
                    onClick={() => void openLetter(item)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {unread ? '● ' : ''}
                          {mailTab === 'inbox' ? `${memberName(otherId)} 님으로부터` : `${memberName(otherId)} 님에게`}
                        </p>
                        <p className="text-[11px] text-muted mt-0.5">
                          {members.find((row) => row.userId === otherId)
                            ? messageRoleLabel(members.find((row) => row.userId === otherId)?.role)
                            : '멤버'}
                        </p>
                      </div>
                      <p className="text-[10px] text-muted shrink-0">{formatMessageTime(item.createdAt)}</p>
                    </div>
                    <p className="text-sm font-semibold mt-2 truncate">{letterPreview(item)}</p>
                    <p className="text-xs text-ink/70 mt-1 line-clamp-2 whitespace-pre-line">{item.body}</p>
                    {mailTab === 'sent' && (
                      <p className="text-[10px] text-muted mt-2">{item.readAt ? '상대가 확인함' : '아직 읽지 않음'}</p>
                    )}
                  </button>
                )
              })
            )}
          </>
        )}

        {view === 'read' && selected && (
          <section className="bb-card overflow-hidden">
            <div className="bg-canvas border-b border-line px-4 py-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                {selected.recipientId === userId ? '받은 편지' : '보낸 편지'}
              </p>
              <p className="text-base font-semibold text-ink">{selected.subject || '제목 없음'}</p>
              <p className="text-[11px] text-muted">
                {selected.recipientId === userId
                  ? `보낸 사람 · ${memberName(selected.senderId)}`
                  : `받는 사람 · ${memberName(selected.recipientId)}`}
              </p>
              <p className="text-[11px] text-muted">{formatLetterDate(selected.createdAt)}</p>
              {selected.recipientId !== userId && (
                <p className="text-[11px] text-muted">{selected.readAt ? '상대가 확인함' : '아직 읽지 않음'}</p>
              )}
            </div>
            <div className="px-4 py-5 min-h-[12rem]">
              <p className="text-sm leading-relaxed whitespace-pre-line text-ink">{selected.body}</p>
            </div>
            {selected.recipientId === userId && (
              <div className="border-t border-line p-4">
                <button type="button" className="bb-btn-primary" onClick={() => openCompose({ replyTo: selected })}>
                  답장 쓰기
                </button>
              </div>
            )}
          </section>
        )}

        {view === 'compose' && (
          <section className="bb-card p-4 space-y-3">
            {replySource && (
              <div className="rounded-xl bg-canvas border border-line px-3 py-2.5 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">답장 대상</p>
                <p className="text-sm font-semibold">{replySource.subject || '편지'}</p>
                <p className="text-[11px] text-muted line-clamp-2">{replySource.body}</p>
              </div>
            )}
            <div>
              <label className="bb-label">받는 사람</label>
              <select
                className="bb-input"
                value={recipientId}
                disabled={Boolean(replySource)}
                onChange={(e) => setRecipientId(e.target.value)}
              >
                <option value="">멤버 선택</option>
                {members.map((item) => (
                  <option key={item.userId} value={item.userId}>
                    {item.name} · {messageRoleLabel(item.role)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="bb-label">제목</label>
              <input
                className="bb-input"
                value={subject}
                maxLength={80}
                placeholder="편지 제목"
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <label className="bb-label">내용</label>
              <textarea
                className="bb-input min-h-40"
                value={body}
                maxLength={LETTER_MAX_LENGTH}
                placeholder="전하고 싶은 내용을 편지로 적어 주세요"
                onChange={(e) => setBody(e.target.value)}
              />
              <p className="text-[10px] text-muted mt-1 text-right">
                {body.length}/{LETTER_MAX_LENGTH}
              </p>
            </div>
            <button type="button" className="bb-btn-primary" disabled={sending} onClick={() => void send()}>
              {sending ? '보내는 중...' : '편지 보내기'}
            </button>
          </section>
        )}
      </main>
    </div>
  )
}
