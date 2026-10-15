-- 경기 일정, 참석, 알림, 스코어, 영상

CREATE TABLE IF NOT EXISTS public.club_games (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  title text NOT NULL,
  game_date date NOT NULL,
  start_time text NOT NULL,
  end_time text,
  venue text NOT NULL,
  notes text NOT NULL DEFAULT '',
  opponent text,
  home_name text NOT NULL DEFAULT '우리 팀',
  away_name text NOT NULL DEFAULT '상대 팀',
  current_quarter integer NOT NULL DEFAULT 1,
  scores jsonb NOT NULL DEFAULT '{"1":{"h":0,"a":0},"2":{"h":0,"a":0},"3":{"h":0,"a":0},"4":{"h":0,"a":0},"5":{"h":0,"a":0}}'::jsonb,
  fouls jsonb NOT NULL DEFAULT '{"1":{"h":0,"a":0},"2":{"h":0,"a":0},"3":{"h":0,"a":0},"4":{"h":0,"a":0},"5":{"h":0,"a":0}}'::jsonb,
  is_live boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS club_games_club_date_idx ON public.club_games (club_id, game_date DESC);

CREATE TABLE IF NOT EXISTS public.club_game_rsvps (
  game_id text NOT NULL REFERENCES public.club_games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('going', 'maybe', 'no')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  game_id text,
  kind text NOT NULL DEFAULT 'game_schedule',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_notifications_user_idx
  ON public.user_notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.club_game_videos (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  game_id text NOT NULL REFERENCES public.club_games(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.club_game_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  game_id text NOT NULL REFERENCES public.club_games(id) ON DELETE CASCADE,
  quarter integer NOT NULL DEFAULT 1,
  player_key text,
  user_id uuid,
  player_name text,
  team text NOT NULL CHECK (team IN ('h', 'a')),
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.club_game_player_stats (
  game_id text NOT NULL REFERENCES public.club_games(id) ON DELETE CASCADE,
  player_key text NOT NULL,
  user_id uuid,
  player_name text NOT NULL,
  team text NOT NULL CHECK (team IN ('h', 'a')),
  pts integer NOT NULL DEFAULT 0,
  foul integer NOT NULL DEFAULT 0,
  reb integer NOT NULL DEFAULT 0,
  ast integer NOT NULL DEFAULT 0,
  stl integer NOT NULL DEFAULT 0,
  blk integer NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, player_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_games TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_game_rsvps TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notifications TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_game_videos TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_game_events TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_game_player_stats TO anon, authenticated;

ALTER TABLE public.club_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_game_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_game_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_game_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_game_player_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_games_all ON public.club_games;
CREATE POLICY club_games_all ON public.club_games FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS club_game_rsvps_all ON public.club_game_rsvps;
CREATE POLICY club_game_rsvps_all ON public.club_game_rsvps FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS user_notifications_all ON public.user_notifications;
CREATE POLICY user_notifications_all ON public.user_notifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS club_game_videos_all ON public.club_game_videos;
CREATE POLICY club_game_videos_all ON public.club_game_videos FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS club_game_events_all ON public.club_game_events;
CREATE POLICY club_game_events_all ON public.club_game_events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS club_game_player_stats_all ON public.club_game_player_stats;
CREATE POLICY club_game_player_stats_all ON public.club_game_player_stats FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
