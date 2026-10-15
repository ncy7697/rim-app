-- 플랫폼 운영자 + 회원/동호회 관리 RPC

CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET search_path TO public, extensions;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.login_user(text, text);

CREATE OR REPLACE FUNCTION public.require_platform_admin(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_actor_id
      AND COALESCE(u.is_platform_admin, false) = true
  ) THEN
    RAISE EXCEPTION '운영자만 사용할 수 있습니다.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.login_user(p_login_id text, p_password text)
RETURNS TABLE (
  id uuid,
  name text,
  birthdate date,
  height double precision,
  weight double precision,
  "position" text,
  login_id text,
  is_platform_admin boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id text := public.normalize_login_id(p_login_id);
  rec record;
  stored text;
BEGIN
  FOR rec IN
    SELECT u.*
    FROM public.users u
    WHERE lower(u.login_id) = v_id
  LOOP
    stored := COALESCE(rec.password_hash, to_jsonb(rec)->>'password');
    IF stored IS NULL OR stored = '' THEN
      CONTINUE;
    END IF;
    IF stored = p_password
       OR stored = crypt(p_password::text, stored) THEN
      id := rec.id;
      name := rec.name;
      birthdate := rec.birthdate;
      height := rec.height;
      weight := rec.weight;
      "position" := rec.position;
      login_id := rec.login_id;
      is_platform_admin := COALESCE((to_jsonb(rec)->>'is_platform_admin')::boolean, false);
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_actor_id uuid,
  p_user_id uuid,
  p_name text,
  p_login_id text,
  p_email text,
  p_birthdate date,
  p_height numeric,
  p_weight numeric,
  p_position text,
  p_password text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id text := public.normalize_login_id(p_login_id);
  v_hash text;
BEGIN
  PERFORM public.require_platform_admin(p_actor_id);
  IF v_id IS NULL OR v_id !~ '^[a-z0-9_]{4,20}$' THEN
    RAISE EXCEPTION '아이디는 영문 소문자, 숫자, 밑줄만 사용해 4~20자로 입력해 주세요.';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION '이름을 입력해 주세요.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE lower(u.login_id) = v_id AND u.id <> p_user_id
  ) THEN
    RAISE EXCEPTION '이미 사용 중인 아이디입니다.';
  END IF;

  UPDATE public.users u
  SET
    name = btrim(p_name),
    login_id = v_id,
    email = NULLIF(btrim(COALESCE(p_email, '')), ''),
    birthdate = p_birthdate,
    height = p_height,
    weight = p_weight,
    "position" = COALESCE(NULLIF(p_position, ''), u."position")
  WHERE u.id = p_user_id;

  IF p_password IS NOT NULL AND char_length(p_password) >= 4 THEN
    v_hash := crypt(p_password::text, gen_salt('bf'::text));
    BEGIN
      UPDATE public.users SET password_hash = v_hash, password = v_hash WHERE id = p_user_id;
    EXCEPTION
      WHEN undefined_column THEN
        UPDATE public.users SET password_hash = v_hash WHERE id = p_user_id;
    END;
  END IF;
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

CREATE OR REPLACE FUNCTION public.admin_update_club(
  p_actor_id uuid,
  p_club_id uuid,
  p_name text,
  p_emoji text,
  p_region text,
  p_category text,
  p_description text,
  p_home_court text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_platform_admin(p_actor_id);
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION '동호회 이름을 입력해 주세요.';
  END IF;

  UPDATE public.clubs c
  SET
    name = btrim(p_name),
    emoji = COALESCE(NULLIF(btrim(COALESCE(p_emoji, '')), ''), c.emoji),
    region = NULLIF(btrim(COALESCE(p_region, '')), ''),
    category = NULLIF(btrim(COALESCE(p_category, '')), ''),
    description = p_description
  WHERE c.id = p_club_id;

  BEGIN
    UPDATE public.clubs SET home_court = NULLIF(btrim(COALESCE(p_home_court, '')), '') WHERE id = p_club_id;
  EXCEPTION
    WHEN undefined_column THEN
      NULL;
  END;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_club_members(uuid, uuid);

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

CREATE OR REPLACE FUNCTION public.admin_update_membership(
  p_actor_id uuid,
  p_membership_id text,
  p_role text,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club uuid;
  v_role text := lower(btrim(COALESCE(p_role, 'member')));
  v_status text := lower(btrim(COALESCE(p_status, 'approved')));
BEGIN
  PERFORM public.require_platform_admin(p_actor_id);
  IF v_role NOT IN ('owner', 'leader', 'admin', 'member', 'guest') THEN
    RAISE EXCEPTION '허용되지 않은 등급입니다.';
  END IF;
  IF v_status NOT IN ('approved', 'pending', 'rejected') THEN
    RAISE EXCEPTION '허용되지 않은 상태입니다.';
  END IF;

  SELECT club_id INTO v_club FROM public.club_members WHERE id::text = p_membership_id;
  IF v_club IS NULL THEN
    RAISE EXCEPTION '멤버십을 찾을 수 없습니다.';
  END IF;

  IF v_role IN ('owner', 'leader') THEN
    UPDATE public.club_members
    SET role = 'admin'
    WHERE club_id = v_club
      AND role IN ('owner', 'leader')
      AND id::text <> p_membership_id;
    v_role := 'owner';
  END IF;

  UPDATE public.club_members
  SET role = v_role, status = v_status
  WHERE id::text = p_membership_id;
END;
$$;

-- 지정 운영자 계정 (아이디 ncy7697)
DO $$
DECLARE
  v_hash text;
  v_uid uuid;
BEGIN
  v_hash := crypt('!qazxsw2', gen_salt('bf'::text));
  SELECT u.id INTO v_uid FROM public.users u WHERE lower(u.login_id) = 'ncy7697';

  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();
    BEGIN
      INSERT INTO public.users (id, login_id, name, email, password_hash, password, is_platform_admin, "position")
      VALUES (v_uid, 'ncy7697', '운영자', 'ncy7697@rim.local', v_hash, v_hash, true, 'ALL');
    EXCEPTION
      WHEN undefined_column THEN
        INSERT INTO public.users (id, login_id, name, email, password_hash, is_platform_admin)
        VALUES (v_uid, 'ncy7697', '운영자', 'ncy7697@rim.local', v_hash, true);
    END;
  ELSE
    UPDATE public.users
    SET is_platform_admin = true,
        password_hash = v_hash,
        password = v_hash
    WHERE id = v_uid;
  END IF;
EXCEPTION
  WHEN undefined_column THEN
    UPDATE public.users
    SET is_platform_admin = true
    WHERE lower(login_id) = 'ncy7697';
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_user(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.require_platform_admin(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user(uuid, uuid, text, text, text, date, numeric, numeric, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_clubs(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_club(uuid, uuid, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_club_members(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_membership(uuid, text, text, text) TO anon, authenticated;
