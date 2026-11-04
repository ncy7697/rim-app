import { supabase } from './supabaseClient'
import { notifyUsers } from './clubGames'
import { newId } from './clubRoster'
import { isRegularClubRole } from './clubEvents'
import { clubRoleLabel } from './clubMembership'

export const MESSAGE_KEEP_DAYS = 30
export const LETTER_MAX_LENGTH = 2000
const MESSAGE_KEEP_MS = MESSAGE_KEEP_DAYS * 24 * 60 * 60 * 1000
const SUBJECT_BODY_PREFIX = '@@LETTER@@\n'

export type ClubMessageMember = {
  userId: string
  name: string
  role: string
}

export type ClubMessage = {
  id: string
  clubId: string
  senderId: string
  recipientId: string
  subject: string
  body: string
  createdAt: string
  readAt?: string
  replyToId?: string
}

function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = error.message || ''
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /relation .* does not exist|Could not find the table|schema cache/i.test(message)
  )
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = error.message || ''
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    /Could not find the '.*' column|column .* does not exist/i.test(message)
  )
}

function storageKey(clubId: string) {
  return `bb_club_messages_${clubId}`
}

function keepAfter() {
  return new Date(Date.now() - MESSAGE_KEEP_MS).toISOString()
}

function isFresh(createdAt: string) {
  return new Date(createdAt).getTime() >= Date.now() - MESSAGE_KEEP_MS
}

function sameUser(a?: string | null, b?: string | null) {
  return String(a || '') === String(b || '')
}

function encodeLegacyBody(subject: string, body: string, replyToId?: string) {
  return `${SUBJECT_BODY_PREFIX}${JSON.stringify({ subject, replyToId: replyToId || null })}\n${body}`
}

function decodeLegacyBody(raw: string): { subject: string; body: string; replyToId?: string } {
  if (raw.startsWith(SUBJECT_BODY_PREFIX)) {
    const rest = raw.slice(SUBJECT_BODY_PREFIX.length)
    const nl = rest.indexOf('\n')
    if (nl > 0) {
      try {
        const meta = JSON.parse(rest.slice(0, nl)) as { subject?: string; replyToId?: string | null }
        return {
          subject: meta.subject || '',
          body: rest.slice(nl + 1),
          replyToId: meta.replyToId || undefined,
        }
      } catch {
        /* fall through */
      }
    }
  }
  const match = raw.match(/^\[([^\]]*)\]\n\n([\s\S]*)$/)
  if (match) return { subject: match[1], body: match[2] }
  return { subject: '', body: raw }
}

function rowToMessage(row: any): ClubMessage {
  const rawBody = row.body || ''
  const decoded = decodeLegacyBody(rawBody)
  return {
    id: String(row.id),
    clubId: String(row.club_id || row.clubId || ''),
    senderId: String(row.sender_id || row.senderId || ''),
    recipientId: String(row.recipient_id || row.recipientId || ''),
    subject: row.subject || decoded.subject || '',
    body: row.subject ? rawBody : decoded.body || rawBody,
    createdAt: row.created_at || row.createdAt,
    readAt: row.read_at || row.readAt || undefined,
    replyToId: row.reply_to_id || row.replyToId || decoded.replyToId || undefined,
  }
}

function localMessages(clubId: string): ClubMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey(clubId))
    const list = raw ? (JSON.parse(raw) as ClubMessage[]) : []
    return list.filter((item) => isFresh(item.createdAt))
  } catch {
    return []
  }
}

function writeLocal(clubId: string, messages: ClubMessage[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(storageKey(clubId), JSON.stringify(messages.filter((item) => isFresh(item.createdAt))))
}

export async function purgeExpiredClubMessages(clubId: string) {
  const cutoff = keepAfter()
  const { error } = await supabase.from('club_member_messages').delete().eq('club_id', clubId).lt('created_at', cutoff)
  if (error && !isMissingSchema(error) && !isMissingColumn(error)) throw error
  writeLocal(clubId, localMessages(clubId))
}

export async function listClubMessageMembers(clubId: string, userId: string): Promise<ClubMessageMember[]> {
  const { data, error } = await supabase
    .from('club_members')
    .select('user_id, role, status, users:user_id ( name )')
    .eq('club_id', clubId)
  if (error) throw error
  return (data || [])
    .filter((row) => !sameUser(row.user_id, userId))
    .filter((row) => row.status === 'approved' || row.status == null)
    .filter((row) => isRegularClubRole(row.role))
    .map((row) => {
      const users = row.users as { name?: string } | { name?: string }[] | null
      const name = Array.isArray(users) ? users[0]?.name : users?.name
      return {
        userId: String(row.user_id),
        name: name || '이름 없음',
        role: row.role,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

async function loadAllMessages(clubId: string): Promise<ClubMessage[]> {
  await purgeExpiredClubMessages(clubId)
  const cutoff = keepAfter()
  const { data, error } = await supabase
    .from('club_member_messages')
    .select('*')
    .eq('club_id', clubId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error) || !data) return localMessages(clubId)
  return data.map(rowToMessage).filter((item) => isFresh(item.createdAt))
}

export async function listInboxLetters(clubId: string, userId: string): Promise<ClubMessage[]> {
  const uid = String(userId)
  return (await loadAllMessages(clubId)).filter((item) => sameUser(item.recipientId, uid))
}

export async function listSentLetters(clubId: string, userId: string): Promise<ClubMessage[]> {
  const uid = String(userId)
  return (await loadAllMessages(clubId)).filter((item) => sameUser(item.senderId, uid))
}

export async function getClubLetter(clubId: string, letterId: string): Promise<ClubMessage | null> {
  const all = await loadAllMessages(clubId)
  return all.find((item) => item.id === letterId) || null
}

export async function markLetterRead(clubId: string, letterId: string, userId: string): Promise<ClubMessage | null> {
  const letter = await getClubLetter(clubId, letterId)
  if (!letter || !sameUser(letter.recipientId, userId)) return letter
  if (letter.readAt) return letter
  const readAt = new Date().toISOString()
  const { error } = await supabase.from('club_member_messages').update({ read_at: readAt }).eq('id', letterId)
  if (error && !isMissingSchema(error) && !isMissingColumn(error)) throw error
  if (isMissingSchema(error) || isMissingColumn(error)) {
    writeLocal(
      clubId,
      localMessages(clubId).map((item) => (item.id === letterId ? { ...item, readAt } : item))
    )
  }
  return { ...letter, readAt }
}

async function insertLetterRow(next: ClubMessage): Promise<void> {
  const basic = {
    id: next.id,
    club_id: next.clubId,
    sender_id: next.senderId,
    recipient_id: next.recipientId,
    body: encodeLegacyBody(next.subject, next.body, next.replyToId),
    created_at: next.createdAt,
  }
  const full = {
    ...basic,
    subject: next.subject,
    body: next.body,
    reply_to_id: next.replyToId || null,
    read_at: null,
  }

  const first = await supabase.from('club_member_messages').insert(full)
  if (!first.error) return

  if (isMissingColumn(first.error) || /subject|reply_to_id|read_at/i.test(first.error.message || '')) {
    const second = await supabase.from('club_member_messages').insert(basic)
    if (!second.error) return
    if (isMissingSchema(second.error)) {
      throw new Error('편지함 테이블이 아직 준비되지 않았습니다. DB 마이그레이션을 적용해 주세요.')
    }
    throw second.error
  }

  if (isMissingSchema(first.error)) {
    throw new Error('편지함 테이블이 아직 준비되지 않았습니다. DB 마이그레이션을 적용해 주세요.')
  }
  throw first.error
}

export async function sendClubLetter(input: {
  clubId: string
  clubName?: string
  senderId: string
  senderName: string
  recipientId: string
  subject: string
  body: string
  replyToId?: string
}): Promise<ClubMessage> {
  const subject = input.subject.trim()
  const body = input.body.trim()
  if (!input.recipientId) throw new Error('받는 사람을 선택해 주세요.')
  if (!subject) throw new Error('제목을 입력해 주세요.')
  if (!body) throw new Error('편지 내용을 입력해 주세요.')
  if (body.length > LETTER_MAX_LENGTH) throw new Error(`편지는 ${LETTER_MAX_LENGTH}자까지 보낼 수 있습니다.`)
  await purgeExpiredClubMessages(input.clubId)
  const next: ClubMessage = {
    id: newId(),
    clubId: String(input.clubId),
    senderId: String(input.senderId),
    recipientId: String(input.recipientId),
    subject,
    body,
    createdAt: new Date().toISOString(),
    replyToId: input.replyToId,
  }
  await insertLetterRow(next)
  await notifyUsers({
    clubId: input.clubId,
    userIds: [input.recipientId],
    title: `[림] ${input.clubName || '동아리'} 새 편지`,
    body: `${input.senderName}: ${subject}`,
    kind: 'club_message',
  })
  return next
}

/** @deprecated use sendClubLetter */
export async function sendClubMessage(input: {
  clubId: string
  clubName?: string
  senderId: string
  senderName: string
  recipientId: string
  body: string
}) {
  return sendClubLetter({ ...input, subject: '편지' })
}

export function messageRoleLabel(role?: string | null) {
  return clubRoleLabel(role)
}

export function letterPreview(letter: ClubMessage) {
  return letter.subject || letter.body.replace(/\s+/g, ' ').slice(0, 40)
}

export function formatMessageTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}.${day} ${hour}:${minute}`
}

export function formatLetterDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}
