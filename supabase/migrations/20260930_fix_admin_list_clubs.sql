-- admin_list_clubs 400: id/club_id 타입 불일치, 컬럼 타입 불일치 수정

DROP FUNCTION IF EXISTS public.admin_list_clubs(uuid);

CREATE OR REPLACE FUNCTION public.admin_list_clubs(p_actor_id uuid)
RETURNS TABLE (
  id text,
  name text,
  emoji text,
  region text,
  category text,
  description text,
  home_court text,
  member_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_platform_admin(p_actor_id);
  RETURN QUERY
  SELECT
    c.id::text,
    COALESCE(to_jsonb(c)->>'name', ''),
    NULLIF(to_jsonb(c)->>'emoji', ''),
    NULLIF(to_jsonb(c)->>'region', ''),
    NULLIF(to_jsonb(c)->>'category', ''),
    to_jsonb(c)->>'description',
    NULLIF(to_jsonb(c)->>'home_court', ''),
    (
      SELECT count(*)::bigint
      FROM public.club_members cm
      WHERE cm.club_id::text = c.id::text
        AND (
          to_jsonb(cm)->>'status' IS NULL
          OR to_jsonb(cm)->>'status' = 'approved'
          OR to_jsonb(cm)->>'role' IN ('leader', 'owner', 'admin')
        )
    )
  FROM public.clubs c
  ORDER BY 2 NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_clubs(uuid) TO anon, authenticated;
