-- 감독이 자신이 개설한 동호회를 폐쇄

DROP FUNCTION IF EXISTS public.close_owned_club(text, text, text);

CREATE OR REPLACE FUNCTION public.close_owned_club(
  p_actor_id text,
  p_club_id text,
  p_confirm_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  t text;
BEGIN
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
    RAISE EXCEPTION '감독만 동호회를 폐쇄할 수 있습니다.';
  END IF;

  SELECT COALESCE(to_jsonb(c)->>'name', '') INTO v_name
  FROM public.clubs c
  WHERE c.id::text = p_club_id;

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION '동호회를 찾을 수 없습니다.';
  END IF;
  IF lower(btrim(COALESCE(p_confirm_name, ''))) <> lower(btrim(v_name)) THEN
    RAISE EXCEPTION '동호회 이름이 일치하지 않습니다.';
  END IF;

  BEGIN
    PERFORM public.notify_club_users(
      p_club_id,
      'join_rejected',
      '동호회가 폐쇄되었습니다',
      v_name || ' 동호회가 감독에 의해 폐쇄되었습니다.'
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  BEGIN
    DELETE FROM public.club_exchange_proposals
    WHERE from_club_id::text = p_club_id OR to_club_id::text = p_club_id;
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
    WHEN OTHERS THEN
      NULL;
  END;

  FOREACH t IN ARRAY ARRAY[
    'club_notices',
    'club_billing_requests',
    'user_notifications',
    'club_games',
    'club_ledger_entries',
    'club_venue_bookings',
    'club_venues',
    'practice_lineup_players',
    'practice_lineups',
    'attendance_records',
    'practice_sessions',
    'club_dues',
    'club_guests',
    'club_member_stats'
  ]
  LOOP
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE club_id::text = $1', t)
      USING p_club_id;
    EXCEPTION
      WHEN undefined_table THEN
        NULL;
      WHEN undefined_column THEN
        BEGIN
          EXECUTE format('DELETE FROM public.%I WHERE club_id = $1::uuid', t)
          USING p_club_id;
        EXCEPTION
          WHEN OTHERS THEN
            NULL;
        END;
      WHEN OTHERS THEN
        NULL;
    END;
  END LOOP;

  DELETE FROM public.club_members WHERE club_id::text = p_club_id;
  DELETE FROM public.clubs WHERE id::text = p_club_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_owned_club(text, text, text) TO anon, authenticated;
