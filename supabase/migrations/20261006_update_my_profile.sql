CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_user_id uuid,
  p_name text,
  p_birthdate date,
  p_height numeric,
  p_weight numeric,
  p_position text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION '이름을 입력해 주세요.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION '회원을 찾을 수 없습니다.';
  END IF;

  UPDATE public.users u
  SET
    name = btrim(p_name),
    birthdate = p_birthdate,
    height = p_height,
    weight = p_weight,
    "position" = COALESCE(NULLIF(btrim(COALESCE(p_position, '')), ''), u."position")
  WHERE u.id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_profile(uuid, text, date, numeric, numeric, text) TO anon, authenticated;
