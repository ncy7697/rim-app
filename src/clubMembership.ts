import { supabase } from './supabaseClient'

export const OWNER_ROLES = ['leader', 'owner'] as const

export type OwnedClub = {
  id: string
  name: string
}

export function isOwnerRole(role?: string | null): boolean {
  return role === 'leader' || role === 'owner'
}

export function isStaffRole(role?: string | null): boolean {
  return isOwnerRole(role) || role === 'admin'
}

export function clubRoleLabel(role?: string | null): string {
  if (isOwnerRole(role)) return '감독'
  if (role === 'admin') return '코치'
  if (role === 'guest') return '게스트'
  return '정회원'
}

export async function setClubStaffRole(input: {
  actorId: string
  clubId: string
  targetUserId: string
  role: 'admin' | 'member'
}) {
  const { error } = await supabase.rpc('set_club_staff_role', {
    p_actor_id: String(input.actorId),
    p_club_id: String(input.clubId),
    p_target_user_id: String(input.targetUserId),
    p_role: input.role,
  })
  if (!error) return
  if (!/Could not find the function|PGRST202/i.test(error.message || '')) {
    throw error
  }
  const { error: fallbackError } = await supabase
    .from('club_members')
    .update({ role: input.role, status: 'approved' })
    .eq('club_id', input.clubId)
    .eq('user_id', input.targetUserId)
  if (fallbackError) throw fallbackError
}

export async function listStaffUserIds(clubId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('club_members')
    .select('user_id, role, status')
    .eq('club_id', clubId)
  if (error) throw error
  return [...new Set(
    (data || [])
      .filter((row) => isStaffRole(row.role) && row.status !== 'pending')
      .map((row) => row.user_id)
      .filter(Boolean)
  )]
}

export type StaffJoinAlert = {
  id: string
  clubId: string
  clubName: string
  applicantName: string
  reason?: string
}

export async function listStaffJoinAlerts(userId: string): Promise<StaffJoinAlert[]> {
  const { data: staffRows, error: staffError } = await supabase
    .from('club_members')
    .select('club_id')
    .eq('user_id', userId)
    .in('role', [...OWNER_ROLES, 'admin'])
  if (staffError) throw staffError
  const clubIds = [...new Set((staffRows || []).map((row) => row.club_id).filter(Boolean))]
  if (!clubIds.length) return []

  const selectWithReason = `
    id,
    club_id,
    apply_reason,
    clubs:club_id ( name ),
    users:user_id ( name )
  `
  const selectPlain = `
    id,
    club_id,
    clubs:club_id ( name ),
    users:user_id ( name )
  `
  let { data, error } = await supabase
    .from('club_members')
    .select(selectWithReason)
    .in('club_id', clubIds)
    .eq('status', 'pending')
    .order('id', { ascending: false })
  if (error && /apply_reason/i.test(error.message || '')) {
    const retry = await supabase
      .from('club_members')
      .select(selectPlain)
      .in('club_id', clubIds)
      .eq('status', 'pending')
      .order('id', { ascending: false })
    data = retry.data as typeof data
    error = retry.error
  }
  if (error) throw error

  return (data || []).map((row: any) => ({
    id: String(row.id),
    clubId: row.club_id,
    clubName: row.clubs?.name || '동아리',
    applicantName: row.users?.name || '회원',
    reason: row.apply_reason || undefined,
  }))
}

export async function fetchOwnedClub(userId: string): Promise<OwnedClub | null> {
  const { data, error } = await supabase
    .from('club_members')
    .select(`
      club_id,
      role,
      clubs:club_id (
        id,
        name
      )
    `)
    .eq('user_id', userId)
    .in('role', [...OWNER_ROLES])
    .order('id', { ascending: true })
    .limit(1)

  if (error) throw error

  const row = data?.[0] as any
  if (!row) return null

  return {
    id: row.clubs?.id || row.club_id,
    name: row.clubs?.name || '동아리',
  }
}

export async function closeOwnedClub(input: {
  actorId: string
  clubId: string
  confirmName: string
}) {
  const { error } = await supabase.rpc('close_owned_club', {
    p_actor_id: String(input.actorId),
    p_club_id: String(input.clubId),
    p_confirm_name: input.confirmName.trim(),
  })
  if (error) throw error
}
