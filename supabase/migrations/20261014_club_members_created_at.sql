ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
