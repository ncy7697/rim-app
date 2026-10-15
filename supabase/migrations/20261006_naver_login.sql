ALTER TABLE public.users ADD COLUMN IF NOT EXISTS naver_id text;

CREATE UNIQUE INDEX IF NOT EXISTS users_naver_id_uidx
  ON public.users (naver_id)
  WHERE naver_id IS NOT NULL AND btrim(naver_id) <> '';

CREATE OR REPLACE FUNCTION public.login_or_register_naver(
  p_naver_id text,
  p_name text,
  p_email text,
  p_birthdate date
)
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
  rec record;
  v_uid uuid;
  v_login text;
  v_email text;
  v_hash text;
  v_base text;
  v_n int := 0;
BEGIN
  IF p_naver_id IS NULL OR btrim(p_naver_id) = '' THEN
    RAISE EXCEPTION '네이버 계정 정보가 없습니다.';
  END IF;

  SELECT u.* INTO rec
  FROM public.users u
  WHERE u.naver_id = btrim(p_naver_id)
  LIMIT 1;

  IF rec.id IS NOT NULL THEN
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

  v_base := 'nv' || left(regexp_replace(lower(btrim(p_naver_id)), '[^a-z0-9]', '', 'g'), 18);
  IF char_length(v_base) < 4 THEN
    v_base := 'nvuser';
  END IF;
  v_login := left(v_base, 20);
  WHILE EXISTS (SELECT 1 FROM public.users u WHERE lower(u.login_id) = v_login) LOOP
    v_n := v_n + 1;
    v_login := left(v_base, 16) || v_n::text;
  END LOOP;

  v_email := NULLIF(btrim(COALESCE(p_email, '')), '');
  IF v_email IS NULL THEN
    v_email := v_login || '@rim.naver';
  ELSIF EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = lower(v_email)) THEN
    v_email := v_login || '@rim.naver';
  END IF;

  v_hash := crypt(gen_random_uuid()::text, gen_salt('bf'::text));
  v_uid := gen_random_uuid();

  BEGIN
    INSERT INTO public.users (id, login_id, name, email, password_hash, password, birthdate, "position", naver_id)
    VALUES (
      v_uid,
      v_login,
      COALESCE(NULLIF(btrim(p_name), ''), '네이버 회원'),
      v_email,
      v_hash,
      v_hash,
      COALESCE(p_birthdate, DATE '2000-01-01'),
      'ALL',
      btrim(p_naver_id)
    );
  EXCEPTION
    WHEN undefined_column THEN
      INSERT INTO public.users (id, login_id, name, email, password_hash, birthdate, "position", naver_id)
      VALUES (
        v_uid,
        v_login,
        COALESCE(NULLIF(btrim(p_name), ''), '네이버 회원'),
        v_email,
        v_hash,
        COALESCE(p_birthdate, DATE '2000-01-01'),
        'ALL',
        btrim(p_naver_id)
      );
  END;

  SELECT u.* INTO rec FROM public.users u WHERE u.id = v_uid;
  id := rec.id;
  name := rec.name;
  birthdate := rec.birthdate;
  height := rec.height;
  weight := rec.weight;
  "position" := rec.position;
  login_id := rec.login_id;
  is_platform_admin := COALESCE((to_jsonb(rec)->>'is_platform_admin')::boolean, false);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_or_register_naver(text, text, text, date) TO anon, authenticated;
