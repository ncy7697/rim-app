-- FCM 기기 토큰 저장

CREATE TABLE IF NOT EXISTS public.user_fcm_tokens (
  token text PRIMARY KEY,
  user_id text NOT NULL,
  platform text NOT NULL DEFAULT 'android',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_fcm_tokens_user_idx ON public.user_fcm_tokens (user_id);

ALTER TABLE public.user_fcm_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_fcm_tokens_all ON public.user_fcm_tokens;
CREATE POLICY user_fcm_tokens_all ON public.user_fcm_tokens FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_fcm_tokens TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.upsert_user_fcm_token(
  p_user_id text,
  p_token text,
  p_platform text DEFAULT 'android'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF btrim(COALESCE(p_user_id, '')) = '' OR btrim(COALESCE(p_token, '')) = '' THEN
    RAISE EXCEPTION '사용자와 토큰이 필요합니다.';
  END IF;
  INSERT INTO public.user_fcm_tokens (token, user_id, platform, updated_at)
  VALUES (btrim(p_token), btrim(p_user_id), COALESCE(NULLIF(btrim(p_platform), ''), 'android'), now())
  ON CONFLICT (token) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_fcm_token(
  p_user_id text,
  p_token text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NULLIF(btrim(COALESCE(p_token, '')), '') IS NOT NULL THEN
    DELETE FROM public.user_fcm_tokens
    WHERE token = btrim(p_token) AND user_id::text = p_user_id;
  ELSE
    DELETE FROM public.user_fcm_tokens WHERE user_id::text = p_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_user_fcm_tokens(p_user_ids text[])
RETURNS TABLE(user_id text, token text, platform text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.user_id, t.token, t.platform
  FROM public.user_fcm_tokens t
  WHERE t.user_id = ANY (p_user_ids);
$$;

GRANT EXECUTE ON FUNCTION public.upsert_user_fcm_token(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_fcm_token(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_fcm_tokens(text[]) TO anon, authenticated;
