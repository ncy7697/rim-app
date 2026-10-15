-- 교류전 1팀 라인업 + 같은 날 경기/연습 세션 병행

ALTER TABLE public.practice_lineups DROP CONSTRAINT IF EXISTS practice_lineups_team_count_check;
ALTER TABLE public.practice_lineups
  ADD CONSTRAINT practice_lineups_team_count_check CHECK (team_count BETWEEN 1 AND 4);

ALTER TABLE public.practice_sessions
  DROP CONSTRAINT IF EXISTS practice_sessions_club_id_session_date_key;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
  INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'practice_sessions'
    AND con.contype = 'u'
    AND pg_get_constraintdef(con.oid) ILIKE '%session_date%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.practice_sessions DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;
