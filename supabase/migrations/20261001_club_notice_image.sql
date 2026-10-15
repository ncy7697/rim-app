-- 공지 이미지 1장 (이미 club_notices를 적용한 DB용)

ALTER TABLE public.club_notices ADD COLUMN IF NOT EXISTS image_url text;

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

DROP FUNCTION IF EXISTS public.upsert_club_notice(text, text, text, text, date, date);
DROP FUNCTION IF EXISTS public.upsert_club_notice(text, text, text, text, date, date, text);

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

GRANT EXECUTE ON FUNCTION public.upsert_club_notice(text, text, text, text, date, date, text) TO anon, authenticated;
