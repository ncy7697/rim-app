-- 감독이 동호회당 공지 1개를 기간 지정해 등록하고 회원에게 알림

CREATE TABLE IF NOT EXISTS public.club_notices (
  club_id uuid PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  image_url text,
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.club_notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS club_notices_all ON public.club_notices;
CREATE POLICY club_notices_all ON public.club_notices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_notices TO anon, authenticated;

DROP FUNCTION IF EXISTS public.upsert_club_notice(text, text, text, text, date, date);
DROP FUNCTION IF EXISTS public.upsert_club_notice(text, text, text, text, date, date, text);
DROP FUNCTION IF EXISTS public.notify_club_notice_members(text, text, text, text, text, date, date);
DROP FUNCTION IF EXISTS public.clear_club_notice(text, text);

CREATE OR REPLACE FUNCTION public.notify_club_notice_members(
  p_club_id text,
  p_actor_id text,
  p_club_name text,
  p_title text,
  p_body text,
  p_starts_on date,
  p_ends_on date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text;
  v_kind text := 'club_notice';
  v_title text;
  v_body text;
BEGIN
  v_title := '[림] ' || COALESCE(p_club_name, '동호회') || ' 공지';
  v_body := p_title || ' · ' || to_char(p_starts_on, 'YYYY.MM.DD') || '–' || to_char(p_ends_on, 'YYYY.MM.DD');
  IF COALESCE(p_body, '') <> '' THEN
    v_body := v_body || ' · ' || left(p_body, 80);
  END IF;

  FOR v_uid IN
    SELECT DISTINCT cm.user_id::text
    FROM public.club_members cm
    WHERE cm.club_id::text = p_club_id
      AND cm.user_id::text IS DISTINCT FROM p_actor_id
      AND lower(COALESCE(to_jsonb(cm)->>'role', '')) NOT IN ('guest')
      AND (
        to_jsonb(cm)->>'status' IS NULL
        OR to_jsonb(cm)->>'status' = 'approved'
        OR lower(COALESCE(to_jsonb(cm)->>'role', '')) IN ('owner', 'leader', 'admin')
      )
  LOOP
    BEGIN
      INSERT INTO public.user_notifications (user_id, club_id, kind, title, body)
      VALUES (v_uid::uuid, p_club_id::uuid, v_kind, v_title, v_body);
    EXCEPTION
      WHEN OTHERS THEN
        BEGIN
          INSERT INTO public.user_notifications (user_id, club_id, kind, title, body)
          VALUES (v_uid, p_club_id, v_kind, v_title, v_body);
        EXCEPTION
          WHEN OTHERS THEN
            NULL;
        END;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_club_notice(
  p_actor_id text,
  p_club_id text,
  p_title text,
  p_body text,
  p_starts_on date,
  p_ends_on date,
  p_image_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_body text;
  v_name text;
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
    RAISE EXCEPTION '감독만 공지를 등록할 수 있습니다.';
  END IF;

  v_title := btrim(COALESCE(p_title, ''));
  v_body := btrim(COALESCE(p_body, ''));
  IF v_title = '' THEN
    RAISE EXCEPTION '공지 제목을 입력해 주세요.';
  END IF;
  IF char_length(v_title) > 80 THEN
    RAISE EXCEPTION '제목은 80자 이하여야 합니다.';
  END IF;
  IF char_length(v_body) > 800 THEN
    RAISE EXCEPTION '내용은 800자 이하여야 합니다.';
  END IF;
  IF p_starts_on IS NULL OR p_ends_on IS NULL THEN
    RAISE EXCEPTION '게시 기간을 선택해 주세요.';
  END IF;
  IF p_ends_on < p_starts_on THEN
    RAISE EXCEPTION '종료일은 시작일보다 빠를 수 없습니다.';
  END IF;

  INSERT INTO public.club_notices (club_id, title, body, starts_on, ends_on, image_url, created_by, updated_at)
  VALUES (p_club_id::uuid, v_title, v_body, p_starts_on, p_ends_on, NULLIF(btrim(COALESCE(p_image_url, '')), ''), p_actor_id, now())
  ON CONFLICT (club_id) DO UPDATE SET
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    starts_on = EXCLUDED.starts_on,
    ends_on = EXCLUDED.ends_on,
    image_url = EXCLUDED.image_url,
    created_by = EXCLUDED.created_by,
    updated_at = now();

  SELECT COALESCE(to_jsonb(c)->>'name', '동호회') INTO v_name
  FROM public.clubs c
  WHERE c.id::text = p_club_id;

  PERFORM public.notify_club_notice_members(p_club_id, p_actor_id, v_name, v_title, v_body, p_starts_on, p_ends_on);
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_club_notice(
  p_actor_id text,
  p_club_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id::text = p_club_id
      AND cm.user_id::text = p_actor_id
      AND lower(COALESCE(to_jsonb(cm)->>'role', '')) IN ('owner', 'leader')
  ) THEN
    RAISE EXCEPTION '감독만 공지를 내릴 수 있습니다.';
  END IF;

  DELETE FROM public.club_notices WHERE club_id::text = p_club_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_club_notice(text, text, text, text, date, date, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_club_notice_members(text, text, text, text, text, date, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_club_notice(text, text) TO anon, authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('club-notices', 'club-notices', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS club_notices_select ON storage.objects;
CREATE POLICY club_notices_select ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'club-notices');

DROP POLICY IF EXISTS club_notices_write ON storage.objects;
CREATE POLICY club_notices_write ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'club-notices');

DROP POLICY IF EXISTS club_notices_update ON storage.objects;
CREATE POLICY club_notices_update ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'club-notices')
  WITH CHECK (bucket_id = 'club-notices');

DROP POLICY IF EXISTS club_notices_delete ON storage.objects;
CREATE POLICY club_notices_delete ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'club-notices');

