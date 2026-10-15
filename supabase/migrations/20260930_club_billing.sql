-- 동호회 이용: 개설 후 1개월 무료, 이후 계좌이체 + 운영자 기간 승인

ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS access_until timestamptz;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE public.clubs
SET access_until = COALESCE(created_at, now()) + interval '1 month'
WHERE access_until IS NULL;

CREATE TABLE IF NOT EXISTS public.app_billing_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bank_name text,
  account_number text,
  account_holder text,
  monthly_fee numeric NOT NULL DEFAULT 5000,
  notice text
);

INSERT INTO public.app_billing_settings (id, bank_name, account_number, account_holder, monthly_fee, notice)
VALUES (
  1,
  '카카오뱅크',
  '3333-02-0001234',
  '림',
  5000,
  '개설 후 1개월은 무료입니다. 이후 매월 5,000원을 아래 계좌로 이체한 뒤 입금 확인을 요청해 주세요. 운영자가 입금을 확인하면 이용 기간이 연장됩니다. (계좌는 임시 번호이며 추후 변경됩니다.)'
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.club_billing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id text NOT NULL,
  user_id uuid,
  depositor_name text NOT NULL,
  amount numeric NOT NULL,
  memo text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  access_until_set timestamptz
);

CREATE INDEX IF NOT EXISTS club_billing_requests_status_idx
  ON public.club_billing_requests (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.club_access_active(p_until timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_until IS NOT NULL AND p_until >= now();
$$;

CREATE OR REPLACE FUNCTION public.get_billing_settings()
RETURNS TABLE (
  bank_name text,
  account_number text,
  account_holder text,
  monthly_fee numeric,
  notice text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.bank_name, s.account_number, s.account_holder, s.monthly_fee, s.notice
  FROM public.app_billing_settings s
  WHERE s.id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_club_access(p_club_id text)
RETURNS TABLE (
  access_until timestamptz,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.access_until,
    public.club_access_active(c.access_until)
  FROM public.clubs c
  WHERE c.id::text = p_club_id
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_club_payment(
  p_user_id uuid,
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
BEGIN
  IF p_depositor_name IS NULL OR btrim(p_depositor_name) = '' THEN
    RAISE EXCEPTION '입금자명을 입력해 주세요.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '입금 금액을 확인해 주세요.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id::text = p_club_id
      AND cm.user_id = p_user_id
      AND cm.role IN ('owner', 'leader', 'admin')
      AND (cm.status IS NULL OR cm.status = 'approved')
  ) THEN
    RAISE EXCEPTION '감독 또는 코치만 입금 확인을 요청할 수 있습니다.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.club_billing_requests r
    WHERE r.club_id::text = p_club_id AND r.status = 'pending'
  ) THEN
    RAISE EXCEPTION '이미 확인 대기 중인 입금 요청이 있습니다.';
  END IF;

  INSERT INTO public.club_billing_requests (club_id, user_id, depositor_name, amount, memo, status)
  SELECT c.id::text, p_user_id, btrim(p_depositor_name), p_amount, NULLIF(btrim(COALESCE(p_memo, '')), ''), 'pending'
  FROM public.clubs c
  WHERE c.id::text = p_club_id
  RETURNING id INTO v_id;

  SELECT COALESCE(to_jsonb(c)->>'name', '동호회') INTO v_name
  FROM public.clubs c WHERE c.id::text = p_club_id;

  BEGIN
    INSERT INTO public.user_notifications (user_id, club_id, kind, title, body)
    SELECT u.id, p_club_id, 'billing',
      '입금 확인 요청',
      v_name || ' · ' || btrim(p_depositor_name) || ' · ' || trim(to_char(p_amount, '999,999,999')) || '원'
    FROM public.users u
    WHERE COALESCE(u.is_platform_admin, false) = true;
  EXCEPTION
    WHEN undefined_table THEN NULL;
    WHEN undefined_column THEN NULL;
  END;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_club_payments(p_user_id uuid, p_club_id text)
RETURNS TABLE (
  id uuid,
  depositor_name text,
  amount numeric,
  memo text,
  status text,
  created_at timestamptz,
  access_until_set timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id::text = p_club_id
      AND cm.user_id = p_user_id
      AND cm.role IN ('owner', 'leader', 'admin')
  ) THEN
    RAISE EXCEPTION '권한이 없습니다.';
  END IF;
  RETURN QUERY
  SELECT r.id, r.depositor_name, r.amount, r.memo, r.status, r.created_at, r.access_until_set
  FROM public.club_billing_requests r
  WHERE r.club_id::text = p_club_id
  ORDER BY r.created_at DESC
  LIMIT 20;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_billing_settings(
  p_actor_id uuid,
  p_bank_name text,
  p_account_number text,
  p_account_holder text,
  p_monthly_fee numeric,
  p_notice text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_platform_admin(p_actor_id);
  INSERT INTO public.app_billing_settings (id, bank_name, account_number, account_holder, monthly_fee, notice)
  VALUES (1, btrim(COALESCE(p_bank_name, '')), btrim(COALESCE(p_account_number, '')), btrim(COALESCE(p_account_holder, '')), COALESCE(p_monthly_fee, 5000), p_notice)
  ON CONFLICT (id) DO UPDATE SET
    bank_name = excluded.bank_name,
    account_number = excluded.account_number,
    account_holder = excluded.account_holder,
    monthly_fee = excluded.monthly_fee,
    notice = excluded.notice;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_payments(p_actor_id uuid)
RETURNS TABLE (
  id uuid,
  club_id text,
  club_name text,
  depositor_name text,
  amount numeric,
  memo text,
  status text,
  created_at timestamptz,
  access_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_platform_admin(p_actor_id);
  RETURN QUERY
  SELECT
    r.id,
    r.club_id,
    COALESCE(to_jsonb(c)->>'name', ''),
    r.depositor_name,
    r.amount,
    r.memo,
    r.status,
    r.created_at,
    c.access_until
  FROM public.club_billing_requests r
  LEFT JOIN public.clubs c ON c.id::text = r.club_id
  ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC
  LIMIT 80;
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
BEGIN
  PERFORM public.require_platform_admin(p_actor_id);
  IF p_access_until IS NULL THEN
    RAISE EXCEPTION '이용 종료일을 입력해 주세요.';
  END IF;
  UPDATE public.clubs SET access_until = p_access_until WHERE id::text = p_club_id;
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
BEGIN
  PERFORM public.require_platform_admin(p_actor_id);
  IF p_status NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'confirmed 또는 rejected만 가능합니다.';
  END IF;
  SELECT club_id INTO v_club FROM public.club_billing_requests WHERE id = p_request_id;
  IF v_club IS NULL THEN
    RAISE EXCEPTION '요청을 찾을 수 없습니다.';
  END IF;

  v_until := p_access_until;
  IF p_status = 'confirmed' THEN
    IF v_until IS NULL THEN
      SELECT GREATEST(COALESCE(access_until, now()), now()) + interval '1 month'
      INTO v_until FROM public.clubs WHERE id::text = v_club;
    END IF;
    UPDATE public.clubs SET access_until = v_until WHERE id::text = v_club;
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
  member_count bigint,
  access_until timestamptz,
  pending_payments bigint
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
    ),
    c.access_until,
    (
      SELECT count(*)::bigint
      FROM public.club_billing_requests r
      WHERE r.club_id = c.id::text AND r.status = 'pending'
    )
  FROM public.clubs c
  ORDER BY 2 NULLS LAST;
END;
$$;

DROP FUNCTION IF EXISTS public.create_club(text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.create_club(text, text, text, text, text, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.create_club(
  p_name text,
  p_region text,
  p_category text,
  p_description text,
  p_emoji text,
  p_leader_id uuid,
  p_settings jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owned int;
  v_club_id uuid;
  v_code text;
  v_intro text;
BEGIN
  SELECT count(*) INTO v_owned
  FROM public.club_members
  WHERE user_id = p_leader_id AND role IN ('owner', 'leader');

  IF v_owned > 0 THEN
    RAISE EXCEPTION '감독은 동아리를 1개만 개설할 수 있습니다.';
  END IF;

  v_code := COALESCE(NULLIF(p_settings->>'inviteCode', ''), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));
  v_intro := COALESCE(NULLIF(trim(p_description), ''), p_settings->>'penaltyRules', '');
  IF strpos(v_intro, '@@BB@@') > 0 THEN
    v_intro := trim(split_part(v_intro, '@@BB@@', 1));
  END IF;

  INSERT INTO public.clubs (
    name, region, category, description, emoji,
    emblem_url, region_sido, region_sigungu, home_court,
    practice_days, practice_time_start, practice_time_end,
    purpose, age_group, gender, skill_tier,
    dues_amount, dues_day, penalty_rules, invite_code, created_by
  ) VALUES (
    p_name,
    p_region,
    p_category,
    v_intro,
    p_emoji,
    NULLIF(p_settings->>'emblemDataUrl', ''),
    p_settings->>'regionSido',
    p_settings->>'regionSigungu',
    p_settings->>'homeCourt',
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_settings->'practiceDays', '[]'::jsonb))),
    p_settings->>'practiceTimeStart',
    p_settings->>'practiceTimeEnd',
    p_settings->>'purpose',
    p_settings->>'ageGroup',
    p_settings->>'gender',
    p_settings->>'skillTier',
    NULLIF(p_settings->>'duesAmount', '')::numeric,
    NULLIF(p_settings->>'duesDay', '')::integer,
    p_settings->>'penaltyRules',
    v_code,
    p_leader_id
  )
  RETURNING id INTO v_club_id;

  UPDATE public.clubs
  SET access_until = now() + interval '1 month'
  WHERE id = v_club_id;

  INSERT INTO public.club_members (club_id, user_id, role, status)
  VALUES (v_club_id, p_leader_id, 'leader', 'approved');

  RETURN v_club_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_billing_settings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_club_access(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_club_payment(uuid, text, text, numeric, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_club_payments(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_billing_settings(uuid, text, text, text, numeric, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_payments(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_club_access(uuid, text, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_payment(uuid, uuid, text, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_clubs(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_club(text, text, text, text, text, uuid, jsonb) TO anon, authenticated;
