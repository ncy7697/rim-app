-- 입금 확인/기간 연장 시 동호회 사용자에게 알림

CREATE OR REPLACE FUNCTION public.notify_club_users(
  p_club_id text,
  p_kind text,
  p_title text,
  p_body text,
  p_extra_user_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text;
BEGIN
  FOR v_uid IN
    SELECT DISTINCT uid FROM (
      SELECT cm.user_id::text AS uid
      FROM public.club_members cm
      WHERE cm.club_id::text = p_club_id
        AND (
          to_jsonb(cm)->>'status' IS NULL
          OR to_jsonb(cm)->>'status' = 'approved'
          OR lower(COALESCE(to_jsonb(cm)->>'role', '')) IN ('owner', 'leader', 'admin')
        )
      UNION
      SELECT NULLIF(btrim(COALESCE(p_extra_user_id, '')), '')
    ) s
    WHERE uid IS NOT NULL AND uid <> ''
  LOOP
    BEGIN
      INSERT INTO public.user_notifications (user_id, club_id, kind, title, body)
      VALUES (v_uid::uuid, p_club_id::uuid, p_kind, p_title, p_body);
    EXCEPTION
      WHEN OTHERS THEN
        BEGIN
          INSERT INTO public.user_notifications (user_id, club_id, kind, title, body)
          VALUES (v_uid, p_club_id, p_kind, p_title, p_body);
        EXCEPTION
          WHEN OTHERS THEN
            BEGIN
              INSERT INTO public.user_notifications (user_id, kind, title, body)
              VALUES (v_uid::uuid, p_kind, p_title, p_body);
            EXCEPTION
              WHEN OTHERS THEN
                NULL;
            END;
        END;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_payment(
  p_actor_id uuid,
  p_request_id uuid,
  p_status text,
  p_access_until timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club text;
  v_until timestamptz;
  v_name text;
  v_requester text;
  v_until_label text;
BEGIN
  PERFORM public.require_platform_admin(p_actor_id);
  IF p_status NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'confirmed 또는 rejected만 가능합니다.';
  END IF;
  SELECT r.club_id::text, r.user_id::text
  INTO v_club, v_requester
  FROM public.club_billing_requests r
  WHERE r.id = p_request_id;
  IF v_club IS NULL THEN
    RAISE EXCEPTION '요청을 찾을 수 없습니다.';
  END IF;

  SELECT COALESCE(to_jsonb(c)->>'name', '동호회') INTO v_name
  FROM public.clubs c WHERE c.id::text = v_club;

  v_until := p_access_until;
  IF p_status = 'confirmed' THEN
    IF v_until IS NULL THEN
      SELECT GREATEST(COALESCE(access_until, now()), now()) + interval '1 month'
      INTO v_until FROM public.clubs WHERE id::text = v_club;
    END IF;
    UPDATE public.clubs SET access_until = v_until WHERE id::text = v_club;
    v_until_label := to_char(v_until AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD');
    PERFORM public.notify_club_users(
      v_club,
      'join_approved',
      '이용 기간이 연장되었습니다',
      v_name || ' 입금이 확인되어 ' || COALESCE(v_until_label, '지정일') || '까지 이용할 수 있습니다.',
      v_requester
    );
  ELSIF p_status = 'rejected' THEN
    PERFORM public.notify_club_users(
      v_club,
      'join_rejected',
      '입금 확인이 반려되었습니다',
      v_name || ' 입금 확인 요청이 반려되었습니다. 입금 내역을 확인한 뒤 다시 요청해 주세요.',
      v_requester
    );
  END IF;

  UPDATE public.club_billing_requests
  SET
    status = p_status,
    reviewed_at = now(),
    reviewed_by = p_actor_id,
    access_until_set = CASE WHEN p_status = 'confirmed' THEN v_until ELSE access_until_set END
  WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_club_access(
  p_actor_id uuid,
  p_club_id text,
  p_access_until timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_until_label text;
BEGIN
  PERFORM public.require_platform_admin(p_actor_id);
  IF p_access_until IS NULL THEN
    RAISE EXCEPTION '이용 종료일을 입력해 주세요.';
  END IF;
  UPDATE public.clubs SET access_until = p_access_until WHERE id::text = p_club_id;
  SELECT COALESCE(to_jsonb(c)->>'name', '동호회') INTO v_name
  FROM public.clubs c WHERE c.id::text = p_club_id;
  v_until_label := to_char(p_access_until AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD');
  PERFORM public.notify_club_users(
    p_club_id,
    'join_approved',
    '이용 기간이 연장되었습니다',
    v_name || ' 이용 기간이 ' || COALESCE(v_until_label, '지정일') || '까지로 변경되었습니다.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_club_users(text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_payment(uuid, uuid, text, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_club_access(uuid, text, timestamptz) TO anon, authenticated;
