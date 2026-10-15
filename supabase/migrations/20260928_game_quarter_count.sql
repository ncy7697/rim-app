ALTER TABLE public.club_games
  ADD COLUMN IF NOT EXISTS quarter_count integer NOT NULL DEFAULT 4;

ALTER TABLE public.club_games
  DROP CONSTRAINT IF EXISTS club_games_quarter_count_check;

ALTER TABLE public.club_games
  ADD CONSTRAINT club_games_quarter_count_check CHECK (quarter_count IN (2, 4));
