CREATE TABLE IF NOT EXISTS public.club_polls (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  poll_type text NOT NULL DEFAULT 'single'
    CHECK (poll_type IN ('yesno', 'single', 'multi', 'rank')),
  audience text NOT NULL DEFAULT 'all'
    CHECK (audience IN ('all', 'staff')),
  anonymous boolean NOT NULL DEFAULT false,
  max_choices integer NOT NULL DEFAULT 1,
  result_visibility text NOT NULL DEFAULT 'live'
    CHECK (result_visibility IN ('live', 'after', 'staff')),
  closes_at timestamptz,
  min_voters integer NOT NULL DEFAULT 0,
  quorum_action text NOT NULL DEFAULT 'staff'
    CHECK (quorum_action IN ('void', 'staff', 'extend')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'void')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.club_poll_options (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  poll_id text NOT NULL REFERENCES public.club_polls(id) ON DELETE CASCADE,
  label text NOT NULL,
  option_kind text NOT NULL DEFAULT 'text'
    CHECK (option_kind IN ('text', 'datetime', 'place', 'link')),
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.club_poll_votes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  poll_id text NOT NULL REFERENCES public.club_polls(id) ON DELETE CASCADE,
  option_id text NOT NULL REFERENCES public.club_poll_options(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  rank_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id, option_id)
);

CREATE INDEX IF NOT EXISTS club_polls_club_idx ON public.club_polls (club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS club_poll_options_poll_idx ON public.club_poll_options (poll_id, sort_order);
CREATE INDEX IF NOT EXISTS club_poll_votes_poll_idx ON public.club_poll_votes (poll_id, user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_polls TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_poll_options TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_poll_votes TO anon, authenticated;

ALTER TABLE public.club_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_polls_all ON public.club_polls;
CREATE POLICY club_polls_all ON public.club_polls FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS club_poll_options_all ON public.club_poll_options;
CREATE POLICY club_poll_options_all ON public.club_poll_options FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS club_poll_votes_all ON public.club_poll_votes;
CREATE POLICY club_poll_votes_all ON public.club_poll_votes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
