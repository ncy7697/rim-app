-- request_club_payment 400: user_id 타입, 알림 INSERT, 권한 비교 수정

DROP FUNCTION IF EXISTS public.request_club_payment(uuid, text, text, numeric, text);
DROP FUNCTION IF EXISTS public.request_club_payment(uuid, text, text, numeric);

CREATE OR REPLACE FUNCTION public.request_club_payment(
  p_user_id text,
  p_club_id text,
  p_depositor_name text,
  p_amount numeric,
  p_memo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text;
  v_staff boolean := false;
BEGIN
  IF p_depositor_name IS NULL OR btrim(p_depositor_name) = '' THEN
    RAISE EXCEPTION '입금자명을 입력해 주세요.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '입금 금액을 확인해 주세요.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id::text = p_club_id
      AND cm.user_id::text = p_user_id
      AND lower(COALESCE(to_jsonb(cm)->>'role', '')) IN ('owner', 'leader', 'admin')
      AND (
        to_jsonb(cm)->>'status' IS NULL
        OR to_jsonb(cm)->>'status' = 'approved'
      )
  ) INTO v_staff;

  IF NOT v_staff THEN
    SELECT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id::text = p_user_id
        AND COALESCE((to_jsonb(u)->>'is_platform_admin')::boolean, false)
    ) INTO v_staff;
  END IF;

  IF NOT v_staff THEN
    RAISE EXCEPTION '감독 또는 코치만 입금 확인을 요청할 수 있습니다.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.club_billing_requests r
    WHERE r.club_id::text = p_club_id AND r.status = 'pending'
  ) THEN
    RAISE EXCEPTION '이미 확인 대기 중인 입금 요청이 있습니다.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clubs c WHERE c.id::text = p_club_id) THEN
    RAISE EXCEPTION '동호회를 찾을 수 없습니다.';
  END IF;

  INSERT INTO public.club_billing_requests (club_id, depositor_name, amount, memo, status)
  VALUES (
    p_club_id,
    btrim(p_depositor_name),
    p_amount,
    NULLIF(btrim(COALESCE(p_memo, '')), ''),
    'pending'
  )
  RETURNING id INTO v_id;

  BEGIN
    UPDATE public.club_billing_requests
    SET user_id = p_user_id::uuid
    WHERE id = v_id;
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  SELECT COALESCE(to_jsonb(c)->>'name', '동호회') INTO v_name
  FROM public.clubs c WHERE c.id::text = p_club_id;

  BEGIN
    INSERT INTO public.user_notifications (user_id, kind, title, body)
    SELECT u.id, 'join_request',
      '입금 확인 요청',
      v_name || ' · ' || btrim(p_depositor_name) || ' · ' || trim(to_char(p_amount, 'FM999,999,999')) || '원'
    FROM public.users u
    WHERE COALESCE((to_jsonb(u)->>'is_platform_admin')::boolean, false);
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_club_payment(text, text, text, numeric, text) TO anon, authenticated;
