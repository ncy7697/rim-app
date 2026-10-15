import { supabase } from './supabaseClient'

export type BillingSettings = {
  bankName: string
  accountNumber: string
  accountHolder: string
  monthlyFee: number
  notice: string
}

export type ClubAccess = {
  accessUntil: string | null
  active: boolean
  unknown: boolean
}

export type ClubPayment = {
  id: string
  depositorName: string
  amount: number
  memo: string | null
  status: string
  createdAt: string
  accessUntilSet: string | null
}

export type AdminPayment = {
  id: string
  clubId: string
  clubName: string
  depositorName: string
  amount: number
  memo: string | null
  status: string
  createdAt: string
  accessUntil: string | null
}

export function formatAccessDate(iso?: string | null) {
  if (!iso) return '미설정'
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function accessLabel(access: ClubAccess) {
  if (access.unknown) return '이용 기간 정보를 불러오는 중'
  if (!access.accessUntil) return '이용 기간 미설정'
  if (access.active) return `${formatAccessDate(access.accessUntil)}까지 이용`
  return `${formatAccessDate(access.accessUntil)}에 만료됨`
}

export async function getClubAccess(clubId: string): Promise<ClubAccess> {
  const { data, error } = await supabase.rpc('get_club_access', { p_club_id: clubId })
  if (error) {
    const retry = await supabase.from('clubs').select('access_until').eq('id', clubId).maybeSingle()
    if (retry.error && /access_until/i.test(retry.error.message || '')) {
      return { accessUntil: null, active: true, unknown: true }
    }
    const until = (retry.data as { access_until?: string } | null)?.access_until || null
    return {
      accessUntil: until,
      active: until ? new Date(until).getTime() >= Date.now() : true,
      unknown: !until,
    }
  }
  const row = Array.isArray(data) ? data[0] : data
  const until = row?.access_until || null
  return {
    accessUntil: until,
    active: Boolean(row?.is_active ?? (until && new Date(until).getTime() >= Date.now())),
    unknown: false,
  }
}

export async function getBillingSettings(): Promise<BillingSettings> {
  const { data, error } = await supabase.rpc('get_billing_settings')
  if (error) {
    return {
      bankName: '',
      accountNumber: '',
      accountHolder: '',
      monthlyFee: 5000,
      notice: '개설 후 1개월은 무료입니다. 이후 매월 5,000원을 계좌이체한 뒤 운영자 확인이 필요합니다.',
    }
  }
  const row = Array.isArray(data) ? data[0] : data
  return {
    bankName: row?.bank_name || '',
    accountNumber: row?.account_number || '',
    accountHolder: row?.account_holder || '',
    monthlyFee: Number(row?.monthly_fee || 5000),
    notice: row?.notice || '',
  }
}

export async function requestClubPayment(input: {
  userId: string
  clubId: string
  depositorName: string
  amount: number
  memo?: string
}) {
  const { error } = await supabase.rpc('request_club_payment', {
    p_user_id: String(input.userId),
    p_club_id: String(input.clubId),
    p_depositor_name: input.depositorName.trim(),
    p_amount: Number(input.amount),
    p_memo: input.memo?.trim() || null,
  })
  if (error) throw error
}

export async function listClubPayments(userId: string, clubId: string): Promise<ClubPayment[]> {
  const { data, error } = await supabase.rpc('list_club_payments', {
    p_user_id: userId,
    p_club_id: clubId,
  })
  if (error) throw error
  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    depositorName: String(row.depositor_name || ''),
    amount: Number(row.amount || 0),
    memo: (row.memo as string) || null,
    status: String(row.status || ''),
    createdAt: String(row.created_at || ''),
    accessUntilSet: (row.access_until_set as string) || null,
  }))
}

export async function adminListPayments(actorId: string): Promise<AdminPayment[]> {
  const { data, error } = await supabase.rpc('admin_list_payments', { p_actor_id: actorId })
  if (error) throw error
  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    clubId: String(row.club_id || ''),
    clubName: String(row.club_name || ''),
    depositorName: String(row.depositor_name || ''),
    amount: Number(row.amount || 0),
    memo: (row.memo as string) || null,
    status: String(row.status || ''),
    createdAt: String(row.created_at || ''),
    accessUntil: (row.access_until as string) || null,
  }))
}

export async function adminSetClubAccess(actorId: string, clubId: string, accessUntil: string) {
  const { error } = await supabase.rpc('admin_set_club_access', {
    p_actor_id: actorId,
    p_club_id: clubId,
    p_access_until: accessUntil,
  })
  if (error) throw error
}

export async function adminReviewPayment(
  actorId: string,
  requestId: string,
  status: 'confirmed' | 'rejected',
  accessUntil?: string,
) {
  const { error } = await supabase.rpc('admin_review_payment', {
    p_actor_id: actorId,
    p_request_id: requestId,
    p_status: status,
    p_access_until: accessUntil || null,
  })
  if (error) throw error
}

export async function adminUpdateBillingSettings(
  actorId: string,
  settings: BillingSettings,
) {
  const { error } = await supabase.rpc('admin_update_billing_settings', {
    p_actor_id: actorId,
    p_bank_name: settings.bankName,
    p_account_number: settings.accountNumber,
    p_account_holder: settings.accountHolder,
    p_monthly_fee: settings.monthlyFee,
    p_notice: settings.notice,
  })
  if (error) throw error
}

export function paymentStatusLabel(status: string) {
  if (status === 'pending') return '확인 대기'
  if (status === 'confirmed') return '기간 반영됨'
  if (status === 'rejected') return '반려'
  return status
}

export function toDatetimeLocalEndOfDay(iso?: string | null) {
  const d = iso ? new Date(iso) : new Date()
  if (!iso) d.setMonth(d.getMonth() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:59`
}

export function fromDatetimeLocal(value: string) {
  const d = new Date(value)
  return d.toISOString()
}
