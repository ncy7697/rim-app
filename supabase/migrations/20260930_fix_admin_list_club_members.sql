-- admin_list_club_members 400: p_club_id uuid vs text, user_id/club_id 타입 불일치

DROP FUNCTION IF EXISTS public.admin_list_club_members(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_list_club_members(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_list_club_members(p_actor_id uuid, p_club_id text)
RETURNS TABLE (
  membership_id text,
  user_id text,
  user_name text,
  login_id text,
  role text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_platform_admin(p_actor_id);
  RETURN QUERY
  SELECT
    cm.id::text,
    cm.user_id::text,
    COALESCE(to_jsonb(u)->>'name', ''),
    NULLIF(to_jsonb(u)->>'login_id', ''),
    COALESCE(to_jsonb(cm)->>'role', 'member'),
    to_jsonb(cm)->>'status'
  FROM public.club_members cm
  LEFT JOIN public.users u ON u.id::text = cm.user_id::text
  WHERE cm.club_id::text = p_club_id
  ORDER BY
    CASE
      WHEN to_jsonb(cm)->>'role' IN ('owner', 'leader') THEN 0
      WHEN to_jsonb(cm)->>'role' = 'admin' THEN 1
      ELSE 2
    END,
    3 NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_club_members(uuid, text) TO anon, authenticated;
