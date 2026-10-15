-- 정기 운동 팀 구성 / 라인업

CREATE TABLE IF NOT EXISTS public.practice_lineups (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('balance', 'position', 'draft')),
  format text NOT NULL CHECK (format IN ('5v5', '3v3')),
  team_count integer NOT NULL CHECK (team_count BETWEEN 1 AND 4),
  draft_turn integer NOT NULL DEFAULT 0,
  draft_complete boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, session_id)
);

CREATE TABLE IF NOT EXISTS public.practice_lineup_players (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  lineup_id text NOT NULL REFERENCES public.practice_lineups(id) ON DELETE CASCADE,
  team_index integer NOT NULL,
  source text NOT NULL CHECK (source IN ('member', 'guest')),
  user_id uuid,
  guest_id text,
  display_name text NOT NULL,
  position text NOT NULL DEFAULT 'ALL',
  rating integer NOT NULL DEFAULT 50,
  is_captain boolean NOT NULL DEFAULT false,
  is_starter boolean NOT NULL DEFAULT false,
  court_slot text,
  bench_order integer,
  pick_order integer,
  player_key text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS practice_lineup_players_key_uidx
  ON public.practice_lineup_players (lineup_id, player_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_lineups TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_lineup_players TO anon, authenticated;

ALTER TABLE public.practice_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_lineup_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_lineups_all ON public.practice_lineups;
CREATE POLICY practice_lineups_all ON public.practice_lineups FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS practice_lineup_players_all ON public.practice_lineup_players;
CREATE POLICY practice_lineup_players_all ON public.practice_lineup_players FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
