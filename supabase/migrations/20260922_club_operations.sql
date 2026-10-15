-- 림(RIM): 클럽 운영 컬럼/테이블. 앱은 커스텀 로그인(anon 키)이라
-- 새 테이블은 RLS를 켜되 anon/authenticated 모두 허용(기존 clubs와 동일한 접근).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS dominant_hand text;

ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS emblem_url text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS region_sido text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS region_sigungu text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS home_court text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS practice_days text[] DEFAULT '{}';
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS practice_time_start text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS practice_time_end text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS purpose text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS age_group text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS skill_tier text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS dues_amount numeric;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS dues_day integer;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS penalty_rules text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS invite_code text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE UNIQUE INDEX IF NOT EXISTS clubs_invite_code_uidx
  ON public.clubs (invite_code)
  WHERE invite_code IS NOT NULL;

ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS apply_reason text;
ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS jersey_number integer;
ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS dominant_hand text;
ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS play_tags text[] DEFAULT '{}';
ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS injury_status text DEFAULT 'active';
ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS injury_return_date date;
ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS injury_note text;

DELETE FROM public.club_members a
USING public.club_members b
WHERE a.club_id = b.club_id
  AND a.user_id = b.user_id
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS club_members_club_user_uidx
  ON public.club_members (club_id, user_id);

DELETE FROM public.club_members a
USING public.club_members b
WHERE a.user_id = b.user_id
  AND a.role IN ('owner', 'leader')
  AND b.role IN ('owner', 'leader')
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS club_members_one_owned_club_uidx
  ON public.club_members (user_id)
  WHERE role IN ('owner', 'leader');

CREATE TABLE IF NOT EXISTS public.club_member_stats (
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  rebounds integer NOT NULL DEFAULT 0,
  assists integer NOT NULL DEFAULT 0,
  fgm integer NOT NULL DEFAULT 0,
  fga integer NOT NULL DEFAULT 0,
  games integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.practice_sessions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, session_date)
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL REFERENCES public.practice_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'manual',
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.club_dues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  month_key text NOT NULL,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, user_id, month_key)
);

CREATE TABLE IF NOT EXISTS public.club_guests (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  note text NOT NULL DEFAULT '',
  list_type text NOT NULL DEFAULT 'none' CHECK (list_type IN ('none', 'white', 'black')),
  last_visit date,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_member_stats TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_sessions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_dues TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_guests TO anon, authenticated;

ALTER TABLE public.club_member_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_member_stats_all ON public.club_member_stats;
CREATE POLICY club_member_stats_all ON public.club_member_stats FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS practice_sessions_all ON public.practice_sessions;
CREATE POLICY practice_sessions_all ON public.practice_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS attendance_records_all ON public.attendance_records;
CREATE POLICY attendance_records_all ON public.attendance_records FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS club_dues_all ON public.club_dues;
CREATE POLICY club_dues_all ON public.club_dues FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS club_guests_all ON public.club_guests;
CREATE POLICY club_guests_all ON public.club_guests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.bb_extract_json_object(src text, marker text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  start_at int;
  i int;
  depth int := 0;
  in_string boolean := false;
  escape boolean := false;
  ch text;
BEGIN
  IF src IS NULL OR marker IS NULL THEN
    RETURN NULL;
  END IF;
  start_at := strpos(src, marker);
  IF start_at = 0 THEN
    RETURN NULL;
  END IF;
  start_at := start_at + length(marker);
  i := position('{' IN substr(src, start_at));
  IF i = 0 THEN
    RETURN NULL;
  END IF;
  start_at := start_at + i - 1;
  FOR i IN start_at..length(src) LOOP
    ch := substr(src, i, 1);
    IF in_string THEN
      IF escape THEN
        escape := false;
      ELSIF ch = '\' THEN
        escape := true;
      ELSIF ch = '"' THEN
        in_string := false;
      END IF;
    ELSE
      IF ch = '"' THEN
        in_string := true;
      ELSIF ch = '{' THEN
        depth := depth + 1;
      ELSIF ch = '}' THEN
        depth := depth - 1;
        IF depth = 0 THEN
          RETURN substr(src, start_at, i - start_at + 1);
        END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.bb_migrate_embedded_club_data()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  rec record;
  settings jsonb;
  roster jsonb;
  intro text;
  member_id text;
  member jsonb;
  session jsonb;
  guest jsonb;
  dues_key text;
  attended text;
BEGIN
  FOR rec IN SELECT id, description FROM public.clubs LOOP
    settings := NULL;
    roster := NULL;
    BEGIN
      settings := public.bb_extract_json_object(rec.description, '@@BB@@')::jsonb;
    EXCEPTION WHEN others THEN
      settings := NULL;
    END;
    BEGIN
      roster := public.bb_extract_json_object(rec.description, '@@BB_ROSTER@@')::jsonb;
    EXCEPTION WHEN others THEN
      roster := NULL;
    END;

    IF settings IS NOT NULL THEN
      UPDATE public.clubs SET
        emblem_url = COALESCE(emblem_url, settings->>'emblemDataUrl'),
        region_sido = COALESCE(region_sido, settings->>'regionSido'),
        region_sigungu = COALESCE(region_sigungu, settings->>'regionSigungu'),
        home_court = COALESCE(home_court, settings->>'homeCourt'),
        practice_days = COALESCE(practice_days, ARRAY(SELECT jsonb_array_elements_text(COALESCE(settings->'practiceDays', '[]'::jsonb)))),
        practice_time_start = COALESCE(practice_time_start, settings->>'practiceTimeStart'),
        practice_time_end = COALESCE(practice_time_end, settings->>'practiceTimeEnd'),
        purpose = COALESCE(purpose, settings->>'purpose'),
        age_group = COALESCE(age_group, settings->>'ageGroup'),
        gender = COALESCE(gender, settings->>'gender'),
        skill_tier = COALESCE(skill_tier, settings->>'skillTier'),
        dues_amount = COALESCE(dues_amount, NULLIF(settings->>'duesAmount','')::numeric),
        dues_day = COALESCE(dues_day, NULLIF(settings->>'duesDay','')::integer),
        penalty_rules = COALESCE(penalty_rules, settings->>'penaltyRules'),
        invite_code = COALESCE(invite_code, settings->>'inviteCode')
      WHERE id = rec.id;
    END IF;

    intro := rec.description;
    IF strpos(intro, '@@BB@@') > 0 THEN
      intro := trim(split_part(intro, '@@BB@@', 1));
    END IF;
    IF strpos(intro, '@@BB_ROSTER@@') > 0 THEN
      intro := trim(split_part(intro, '@@BB_ROSTER@@', 1));
    END IF;
    UPDATE public.clubs SET description = intro WHERE id = rec.id AND intro IS DISTINCT FROM description;

    IF roster IS NULL THEN
      CONTINUE;
    END IF;

    FOR session IN SELECT * FROM jsonb_array_elements(COALESCE(roster->'sessions', '[]'::jsonb)) LOOP
      INSERT INTO public.practice_sessions (id, club_id, session_date, title)
      VALUES (
        COALESCE(session->>'id', gen_random_uuid()::text),
        rec.id,
        COALESCE(NULLIF(session->>'date','')::date, CURRENT_DATE),
        COALESCE(session->>'title', '정기 운동')
      )
      ON CONFLICT (id) DO NOTHING;
    END LOOP;

    FOR member_id, member IN SELECT * FROM jsonb_each(COALESCE(roster->'members', '{}'::jsonb)) LOOP
      UPDATE public.club_members SET
        jersey_number = COALESCE(jersey_number, NULLIF(member->>'jerseyNumber','')::integer),
        dominant_hand = COALESCE(dominant_hand, member->>'dominantHand'),
        play_tags = COALESCE(play_tags, ARRAY(SELECT jsonb_array_elements_text(COALESCE(member->'tags', '[]'::jsonb)))),
        injury_status = COALESCE(NULLIF(member->'injury'->>'status',''), injury_status, 'active'),
        injury_return_date = COALESCE(injury_return_date, NULLIF(member->'injury'->>'returnDate','')::date),
        injury_note = COALESCE(injury_note, member->'injury'->>'note')
      WHERE club_id = rec.id AND user_id = member_id::uuid;

      INSERT INTO public.club_member_stats (club_id, user_id, points, rebounds, assists, fgm, fga, games)
      VALUES (
        rec.id,
        member_id::uuid,
        COALESCE((member->'stats'->>'points')::int, 0),
        COALESCE((member->'stats'->>'rebounds')::int, 0),
        COALESCE((member->'stats'->>'assists')::int, 0),
        COALESCE((member->'stats'->>'fgm')::int, 0),
        COALESCE((member->'stats'->>'fga')::int, 0),
        COALESCE((member->'stats'->>'games')::int, 0)
      )
      ON CONFLICT (club_id, user_id) DO UPDATE SET
        points = EXCLUDED.points,
        rebounds = EXCLUDED.rebounds,
        assists = EXCLUDED.assists,
        fgm = EXCLUDED.fgm,
        fga = EXCLUDED.fga,
        games = EXCLUDED.games;

      FOR dues_key IN SELECT jsonb_object_keys(COALESCE(member->'dues', '{}'::jsonb)) LOOP
        INSERT INTO public.club_dues (club_id, user_id, month_key, status)
        VALUES (rec.id, member_id::uuid, dues_key, COALESCE(member->'dues'->>dues_key, 'unpaid'))
        ON CONFLICT (club_id, user_id, month_key) DO UPDATE SET status = EXCLUDED.status;
      END LOOP;

      FOR attended IN SELECT jsonb_array_elements_text(COALESCE(member->'attendedSessionIds', '[]'::jsonb)) LOOP
        INSERT INTO public.attendance_records (session_id, user_id, method)
        VALUES (attended, member_id::uuid, 'manual')
        ON CONFLICT (session_id, user_id) DO NOTHING;
      END LOOP;
    END LOOP;

    FOR guest IN SELECT * FROM jsonb_array_elements(COALESCE(roster->'guests', '[]'::jsonb)) LOOP
      INSERT INTO public.club_guests (id, club_id, name, note, list_type, last_visit)
      VALUES (
        COALESCE(guest->>'id', gen_random_uuid()::text),
        rec.id,
        COALESCE(guest->>'name', '게스트'),
        COALESCE(guest->>'note', ''),
        COALESCE(guest->>'list', 'none'),
        NULLIF(guest->>'lastVisit','')::date
      )
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

SELECT public.bb_migrate_embedded_club_data();

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_club'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END $$;

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

  INSERT INTO public.club_members (club_id, user_id, role, status)
  VALUES (v_club_id, p_leader_id, 'leader', 'approved');

  RETURN v_club_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_club(text, text, text, text, text, uuid, jsonb) TO anon, authenticated;
