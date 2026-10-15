import { supabase } from './supabaseClient'

export type AdminUserClub = {
  club_id: string
  club_name: string
  role: string
  status: string | null
}

export type AdminUser = {
  id: string
  login_id: string | null
  name: string
  email: string | null
  birthdate: string | null
  height: number | null
  weight: number | null
  position: string | null
  is_platform_admin: boolean
  clubs: AdminUserClub[]
}

export type AdminClub = {
  id: string
  name: string
  emoji: string | null
  region: string | null
  category: string | null
  description: string | null
  home_court: string | null
  member_count: number
  access_until: string | null
  pending_payments: number
}

export type AdminClubMember = {
  membership_id: string
  user_id: string
  user_name: string | null
  login_id: string | null
  role: string
  status: string | null
}

function asClubs(value: unknown): AdminUserClub[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => ({
    club_id: String(item?.club_id || ''),
    club_name: String(item?.club_name || ''),
    role: String(item?.role || ''),
    status: item?.status ?? null,
  }))
}

export async function adminListUsers(actorId: string): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users', { p_actor_id: actorId })
  if (error) throw error
  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    login_id: (row.login_id as string) || null,
    name: (row.name as string) || '',
    email: (row.email as string) || null,
    birthdate: (row.birthdate as string) || null,
    height: row.height == null ? null : Number(row.height),
    weight: row.weight == null ? null : Number(row.weight),
    position: (row.player_position as string) || (row.position as string) || null,
    is_platform_admin: Boolean(row.is_platform_admin),
    clubs: asClubs(row.clubs),
  }))
}

export async function adminUpdateUser(
  actorId: string,
  payload: {
    userId: string
    name: string
    loginId: string
    email: string
    birthdate: string
    height: string
    weight: string
    position: string
    password?: string
  },
) {
  const { error } = await supabase.rpc('admin_update_user', {
    p_actor_id: actorId,
    p_user_id: payload.userId,
    p_name: payload.name,
    p_login_id: payload.loginId,
    p_email: payload.email || null,
    p_birthdate: payload.birthdate || null,
    p_height: payload.height ? Number(payload.height) : null,
    p_weight: payload.weight ? Number(payload.weight) : null,
    p_position: payload.position || 'ALL',
    p_password: payload.password || null,
  })
  if (error) throw error
}

export async function adminListClubs(actorId: string): Promise<AdminClub[]> {
  const { data, error } = await supabase.rpc('admin_list_clubs', { p_actor_id: actorId })
  if (error) throw error
  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    name: (row.name as string) || '',
    emoji: (row.emoji as string) || null,
    region: (row.region as string) || null,
    category: (row.category as string) || null,
    description: (row.description as string) || null,
    home_court: (row.home_court as string) || null,
    member_count: Number(row.member_count || 0),
    access_until: (row.access_until as string) || null,
    pending_payments: Number(row.pending_payments || 0),
  }))
}

export async function adminUpdateClub(
  actorId: string,
  payload: {
    clubId: string
    name: string
    emoji: string
    region: string
    category: string
    description: string
    homeCourt: string
  },
) {
  const { error } = await supabase.rpc('admin_update_club', {
    p_actor_id: actorId,
    p_club_id: payload.clubId,
    p_name: payload.name,
    p_emoji: payload.emoji,
    p_region: payload.region,
    p_category: payload.category,
    p_description: payload.description,
    p_home_court: payload.homeCourt || null,
  })
  if (error) throw error
}

export async function adminListClubMembers(actorId: string, clubId: string): Promise<AdminClubMember[]> {
  const { data, error } = await supabase.rpc('admin_list_club_members', {
    p_actor_id: actorId,
    p_club_id: clubId,
  })
  if (error) throw error
  return (data || []).map((row: Record<string, unknown>) => ({
    membership_id: String(row.membership_id),
    user_id: String(row.user_id),
    user_name: (row.user_name as string) || null,
    login_id: (row.login_id as string) || null,
    role: (row.role as string) || 'member',
    status: (row.status as string) || null,
  }))
}

export async function adminUpdateMembership(
  actorId: string,
  membershipId: string,
  role: string,
  status: string,
) {
  const { error } = await supabase.rpc('admin_update_membership', {
    p_actor_id: actorId,
    p_membership_id: membershipId,
    p_role: role,
    p_status: status,
  })
  if (error) throw error
}

export function roleLabel(role?: string | null) {
  if (role === 'owner' || role === 'leader') return '감독'
  if (role === 'admin') return '코치'
  if (role === 'guest') return '게스트'
  return '정회원'
}
