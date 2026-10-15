ALTER TABLE public.club_games
  ADD COLUMN IF NOT EXISTS match_kind text NOT NULL DEFAULT 'internal';

ALTER TABLE public.club_games
  ADD COLUMN IF NOT EXISTS opponent_contact text;

ALTER TABLE public.club_games
  ADD COLUMN IF NOT EXISTS opponent_phone text;

ALTER TABLE public.club_games
  ADD COLUMN IF NOT EXISTS opponent_region text;

ALTER TABLE public.club_games
  DROP CONSTRAINT IF EXISTS club_games_match_kind_check;

ALTER TABLE public.club_games
  ADD CONSTRAINT club_games_match_kind_check CHECK (match_kind IN ('internal', 'exchange'));
