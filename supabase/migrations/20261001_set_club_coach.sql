-- 감독이 정회원을 코치(admin)로 지정/해제

DROP FUNCTION IF EXISTS public.set_club_staff_role(text, text, text, text);
DROP FUNCTION IF EXISTS public.set_club_staff_role(uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.set_club_staff_role(
  p_actor_id text,
  p_club_id text,
  p_target_user_id text,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := lower(btrim(COALESCE(p_role, '')));
  v_target_role text;
BEGIN
  IF v_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION '코치 또는 정회원만 지정할 수 있습니다.';
  END IF;
  IF p_actor_id = p_target_user_id THEN
    RAISE EXCEPTION '본인 역할은 이 기능으로 바꿀 수 없습니다.';
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
    RAISE EXCEPTION '감독만 코치를 지정할 수 있습니다.';
  END IF;

  SELECT lower(COALESCE(to_jsonb(cm)->>'role', '')) INTO v_target_role
  FROM public.club_members cm
  WHERE cm.club_id::text = p_club_id
    AND cm.user_id::text = p_target_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION '해당 선수를 찾을 수 없습니다.';
  END IF;
  IF v_target_role IN ('owner', 'leader') THEN
    RAISE EXCEPTION '감독 역할은 변경할 수 없습니다.';
  END IF;

  UPDATE public.club_members
  SET
    role = v_role,
    status = COALESCE(NULLIF(status, 'pending'), 'approved')
  WHERE club_id::text = p_club_id
    AND user_id::text = p_target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_club_staff_role(text, text, text, text) TO anon, authenticated;
