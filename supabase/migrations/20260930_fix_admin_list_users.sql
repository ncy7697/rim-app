-- admin_list_users 400: position 예약어, id/club_id 타입, 컬럼 직접 참조 수정

DROP FUNCTION IF EXISTS public.admin_list_users(uuid);

CREATE OR REPLACE FUNCTION public.admin_list_users(p_actor_id uuid)
RETURNS TABLE (
  id text,
  login_id text,
  name text,
  email text,
  birthdate date,
  height double precision,
  weight double precision,
  player_position text,
  is_platform_admin boolean,
  clubs jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_platform_admin(p_actor_id);
  RETURN QUERY
  SELECT
    u.id::text,
    NULLIF(to_jsonb(u)->>'login_id', ''),
    COALESCE(to_jsonb(u)->>'name', ''),
    NULLIF(to_jsonb(u)->>'email', ''),
    CASE
      WHEN to_jsonb(u)->>'birthdate' ~ '^\d{4}-\d{2}-\d{2}'
      THEN (to_jsonb(u)->>'birthdate')::date
      ELSE NULL
    END,
    NULLIF(to_jsonb(u)->>'height', '')::double precision,
    NULLIF(to_jsonb(u)->>'weight', '')::double precision,
    COALESCE(NULLIF(to_jsonb(u)->>'position', ''), 'ALL'),
    COALESCE((to_jsonb(u)->>'is_platform_admin')::boolean, false),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'club_id', c.id::text,
        'club_name', to_jsonb(c)->>'name',
        'role', to_jsonb(cm)->>'role',
        'status', to_jsonb(cm)->>'status'
      ))
      FROM public.club_members cm
      JOIN public.clubs c ON c.id::text = cm.club_id::text
      WHERE cm.user_id::text = u.id::text
    ), '[]'::jsonb)
  FROM public.users u
  ORDER BY 3 NULLS LAST, 2 NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users(uuid) TO anon, authenticated;
