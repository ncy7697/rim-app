CREATE TABLE IF NOT EXISTS public.club_game_video_comments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  game_id text NOT NULL REFERENCES public.club_games(id) ON DELETE CASCADE,
  video_id text NOT NULL,
  user_id text NOT NULL,
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS club_game_video_comments_game_idx
  ON public.club_game_video_comments (game_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_game_video_comments TO anon, authenticated;

ALTER TABLE public.club_game_video_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_game_video_comments_all ON public.club_game_video_comments;
CREATE POLICY club_game_video_comments_all ON public.club_game_video_comments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
