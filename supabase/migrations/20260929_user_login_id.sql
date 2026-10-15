-- 로그인 아이디(고유) + 가입/로그인 RPC

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text;

UPDATE public.users u
SET password_hash = COALESCE(u.password_hash, to_jsonb(u)->>'password')
WHERE u.password_hash IS NULL;

WITH numbered AS (
  SELECT
    id,
    COALESCE(
      NULLIF(regexp_replace(lower(coalesce(login_id, '')), '[^a-z0-9_]', '', 'g'), ''),
      NULLIF(regexp_replace(lower(coalesce(name, '')), '[^a-z0-9_]', '', 'g'), ''),
      'user'
    ) AS base
  FROM public.users
),
ranked AS (
  SELECT
    id,
    base,
    row_number() OVER (PARTITION BY base ORDER BY id) AS n
  FROM numbered
)
UPDATE public.users u
SET login_id = CASE WHEN r.n = 1 THEN left(r.base, 20) ELSE left(r.base, 16) || r.n::text END
FROM ranked r
WHERE u.id = r.id
  AND (u.login_id IS NULL OR btrim(u.login_id) = '');

CREATE UNIQUE INDEX IF NOT EXISTS users_login_id_lower_uidx
  ON public.users (lower(login_id))
  WHERE login_id IS NOT NULL;

ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('login_user', 'register_user', 'check_login_id_available')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.normalize_login_id(p_login_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(COALESCE(p_login_id, '')));
$$;

CREATE OR REPLACE FUNCTION public.check_login_id_available(p_login_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text := public.normalize_login_id(p_login_id);
BEGIN
  IF v_id !~ '^[a-z0-9_]{4,20}$' THEN
    RETURN false;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.users u WHERE lower(u.login_id) = v_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_user(
  p_login_id text,
  p_name text,
  p_password text,
  p_birthdate date,
  p_height numeric,
  p_weight numeric,
  p_position text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id text := public.normalize_login_id(p_login_id);
  v_hash text;
  v_uid uuid;
  v_email text;
BEGIN
  IF v_id !~ '^[a-z0-9_]{4,20}$' THEN
    RAISE EXCEPTION '아이디는 영문 소문자, 숫자, 밑줄만 사용해 4~20자로 입력해 주세요.';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION '이름을 입력해 주세요.';
  END IF;
  IF p_password IS NULL OR char_length(p_password) < 4 THEN
    RAISE EXCEPTION '비밀번호는 4자 이상이어야 합니다.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users u WHERE lower(u.login_id) = v_id) THEN
    RAISE EXCEPTION '이미 사용 중인 아이디입니다.';
  END IF;

  v_hash := crypt(p_password::text, gen_salt('bf'::text));
  v_uid := gen_random_uuid();
  v_email := v_id || '@rim.local';

  BEGIN
    INSERT INTO public.users (id, login_id, name, email, password_hash, password, birthdate, height, weight, "position")
    VALUES (v_uid, v_id, btrim(p_name), v_email, v_hash, v_hash, p_birthdate, p_height, p_weight, COALESCE(NULLIF(p_position, ''), 'ALL'));
  EXCEPTION
    WHEN undefined_column THEN
      INSERT INTO public.users (id, login_id, name, email, password_hash, birthdate, height, weight, "position")
      VALUES (v_uid, v_id, btrim(p_name), v_email, v_hash, p_birthdate, p_height, p_weight, COALESCE(NULLIF(p_position, ''), 'ALL'));
  END;

  RETURN v_uid;
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

GRANT EXECUTE ON FUNCTION public.normalize_login_id(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_id_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_user(text, text, text, date, numeric, numeric, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_user(text, text) TO anon, authenticated;
