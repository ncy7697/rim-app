import { supabase } from './supabaseClient'
import { dispatchFcmToClubMembers } from './pushNotifications'

export type ClubNotice = {
  clubId: string
  title: string
  body: string
  startsOn: string
  endsOn: string
  imageUrl?: string
  updatedAt?: string
}

function todayKey() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isNoticeActive(notice: ClubNotice, day = todayKey()) {
  return notice.startsOn <= day && day <= notice.endsOn
}

export function noticePeriodLabel(notice: ClubNotice) {
  const start = notice.startsOn.replaceAll('-', '.')
  const end = notice.endsOn.replaceAll('-', '.')
  return `${start} – ${end}`
}

export async function fetchClubNotice(clubId: string): Promise<ClubNotice | null> {
  const { data, error } = await supabase.from('club_notices').select('*').eq('club_id', clubId).maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    clubId: String(data.club_id),
    title: data.title || '',
    body: data.body || '',
    startsOn: String(data.starts_on || '').slice(0, 10),
    endsOn: String(data.ends_on || '').slice(0, 10),
    imageUrl: data.image_url || undefined,
    updatedAt: data.updated_at,
  }
}

async function compressNoticeImage(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const max = 1280
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('이미지를 처리하지 못했습니다.'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error('이미지를 변환하지 못했습니다.'))
          else resolve(blob)
        },
        'image/jpeg',
        0.78
      )
    }
    img.onerror = () => reject(new Error('이미지를 열지 못했습니다.'))
    img.src = dataUrl
  })
}

export async function uploadNoticeImage(clubId: string, file: File): Promise<string> {
  const blob = await compressNoticeImage(file)
  const path = `${clubId}/notice.jpg`
  const uploaded = await supabase.storage.from('club-notices').upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
  })
  if (!uploaded.error) {
    const { data } = supabase.storage.from('club-notices').getPublicUrl(path)
    if (data.publicUrl) return `${data.publicUrl}?t=${Date.now()}`
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('이미지를 저장하지 못했습니다.'))
    reader.readAsDataURL(blob)
  })
  if (dataUrl.length > 700_000) {
    throw new Error('이미지가 너무 큽니다. 더 작은 사진으로 다시 첨부해 주세요.')
  }
  return dataUrl
}

export async function saveClubNotice(input: {
  actorId: string
  clubId: string
  title: string
  body: string
  startsOn: string
  endsOn: string
  imageUrl?: string
}) {
  const { error } = await supabase.rpc('upsert_club_notice', {
    p_actor_id: String(input.actorId),
    p_club_id: String(input.clubId),
    p_title: input.title.trim(),
    p_body: input.body.trim(),
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn,
    p_image_url: input.imageUrl || '',
  })
  if (error) throw error
  void dispatchFcmToClubMembers({
    clubId: input.clubId,
    actorId: input.actorId,
    title: `[림] 공지 · ${input.title.trim()}`,
    body: input.body.trim() || `${input.startsOn} – ${input.endsOn}`,
    kind: 'club_notice',
  })
}

export async function clearClubNotice(actorId: string, clubId: string) {
  const { error } = await supabase.rpc('clear_club_notice', {
    p_actor_id: String(actorId),
    p_club_id: String(clubId),
  })
  if (error) throw error
  await supabase.storage.from('club-notices').remove([`${clubId}/notice.jpg`])
}
