-- 감독이 회원을 동호회에서 탈퇴 처리

DROP FUNCTION IF EXISTS public.remove_club_member(text, text, text);

CREATE OR REPLACE FUNCTION public.remove_club_member(
  p_actor_id text,
  p_club_id text,
  p_target_user_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_role text;
BEGIN
  IF p_actor_id = p_target_user_id THEN
    RAISE EXCEPTION '본인은 이 기능으로 탈퇴 처리할 수 없습니다.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id::text = p_club_id
      AND cm.user_id::text = p_actor_id
      AND lower(COALESCE(to_jsonb(cm)->>'role', '')) IN ('owner', 'leader')
      AND (
        to_jsonb(cm)->>'status' IS NULL
        OR to_jsonb(cm)->>'status' = 'approved'
      )
  ) THEN
    RAISE EXCEPTION '감독만 회원을 탈퇴 처리할 수 있습니다.';
  END IF;

  SELECT lower(COALESCE(to_jsonb(cm)->>'role', '')) INTO v_target_role
  FROM public.club_members cm
  WHERE cm.club_id::text = p_club_id
    AND cm.user_id::text = p_target_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION '해당 회원을 찾을 수 없습니다.';
  END IF;
  IF v_target_role IN ('owner', 'leader') THEN
    RAISE EXCEPTION '감독은 탈퇴 처리할 수 없습니다.';
  END IF;

  DELETE FROM public.club_members
  WHERE club_id::text = p_club_id
    AND user_id::text = p_target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_club_member(text, text, text) TO anon, authenticated;
