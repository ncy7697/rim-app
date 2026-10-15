import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabaseClient'

let listenersReady = false
let currentUserId: string | null = null
let lastToken: string | null = null

function pushPrefKey(userId: string) {
  return `bb_push_enabled_${userId}`
}

export function isPushEnabled(userId?: string | null) {
  if (!userId || typeof localStorage === 'undefined') return true
  return localStorage.getItem(pushPrefKey(userId)) !== '0'
}

export function setPushEnabledPref(userId: string, enabled: boolean) {
  localStorage.setItem(pushPrefKey(userId), enabled ? '1' : '0')
}

export function isNativePushAvailable() {
  return Capacitor.isNativePlatform()
}

export async function getPushPermissionStatus(): Promise<'granted' | 'denied' | 'prompt' | 'unavailable'> {
  if (isNativePushAvailable()) {
    try {
      const perm = await PushNotifications.checkPermissions()
      if (perm.receive === 'granted') return 'granted'
      if (perm.receive === 'denied') return 'denied'
      return 'prompt'
    } catch {
      return 'unavailable'
    }
  }
  if (typeof Notification === 'undefined') return 'unavailable'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return 'prompt'
}

async function saveToken(userId: string, token: string) {
  lastToken = token
  const { error } = await supabase.rpc('upsert_user_fcm_token', {
    p_user_id: String(userId),
    p_token: token,
    p_platform: Capacitor.getPlatform(),
  })
  if (error) console.warn('FCM 토큰 저장 실패:', error.message)
}

async function ensureListeners() {
  if (listenersReady) return
  listenersReady = true
  await PushNotifications.addListener('registration', (event) => {
    if (currentUserId && event.value) void saveToken(currentUserId, event.value)
  })
  await PushNotifications.addListener('registrationError', (event) => {
    console.warn('FCM 등록 실패:', event.error)
  })
}

export async function registerPushForUser(userId?: string | null) {
  if (!userId || !isPushEnabled(userId)) return
  currentUserId = userId
  try {
    if (isNativePushAvailable()) {
      await ensureListeners()
      let perm = await PushNotifications.checkPermissions()
      if (perm.receive === 'prompt') {
        perm = await PushNotifications.requestPermissions()
      }
      if (perm.receive !== 'granted') return
      await PushNotifications.register()
      if (lastToken) await saveToken(userId, lastToken)
      return
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  } catch (err) {
    console.warn('푸시 등록을 건너뜁니다.', err)
  }
}

export async function enablePushForUser(userId: string) {
  setPushEnabledPref(userId, true)
  await registerPushForUser(userId)
}

export async function disablePushForUser(userId: string) {
  setPushEnabledPref(userId, false)
  await unregisterPushForUser(userId)
}

export async function unregisterPushForUser(userId?: string | null) {
  if (!userId) return
  try {
    await supabase.rpc('delete_user_fcm_token', {
      p_user_id: String(userId),
      p_token: lastToken || null,
    })
  } catch {
    /* ignore */
  }
  currentUserId = null
}

export async function dispatchFcmPush(input: {
  userIds: string[]
  title: string
  body: string
  data?: Record<string, string>
}) {
  const userIds = [...new Set(input.userIds.filter(Boolean))]
  if (!userIds.length) return
  try {
    const { error } = await supabase.functions.invoke('send-push', {
      body: {
        userIds,
        title: input.title,
        body: input.body,
        data: input.data || {},
      },
    })
    if (error) console.warn('FCM 발송 실패:', error.message)
  } catch (err) {
    console.warn('FCM 발송을 건너뜁니다.', err)
  }
}

export async function dispatchFcmToClubMembers(input: {
  clubId: string
  actorId?: string
  title: string
  body: string
  kind?: string
}) {
  const { data, error } = await supabase
    .from('club_members')
    .select('user_id, role, status')
    .eq('club_id', input.clubId)
  if (error) return
  const userIds = (data || [])
    .filter((row: any) => {
      if (String(row.user_id) === String(input.actorId || '')) return false
      if (row.role === 'guest') return false
      return row.status == null || row.status === 'approved' || row.role === 'owner' || row.role === 'leader' || row.role === 'admin'
    })
    .map((row: any) => String(row.user_id))
  await dispatchFcmPush({
    userIds,
    title: input.title,
    body: input.body,
    data: { clubId: input.clubId, kind: input.kind || 'club_notice' },
  })
}
