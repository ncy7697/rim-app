-- 경기 유형: 이벤트 (자유투 / 3점슛, 이후 종목 추가 예정)

ALTER TABLE public.club_games
  DROP CONSTRAINT IF EXISTS club_games_match_kind_check;

ALTER TABLE public.club_games
  ADD CONSTRAINT club_games_match_kind_check CHECK (match_kind IN ('internal', 'exchange', 'event'));

ALTER TABLE public.club_games ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE public.club_games ADD COLUMN IF NOT EXISTS event_set_count integer;
ALTER TABLE public.club_games ADD COLUMN IF NOT EXISTS event_attempt_count integer;
ALTER TABLE public.club_games ADD COLUMN IF NOT EXISTS event_board jsonb;
