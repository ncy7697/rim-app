-- 등록 동호회 간 교류전 제안

CREATE TABLE IF NOT EXISTS public.club_exchange_proposals (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  from_club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  to_club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  from_club_name text NOT NULL,
  to_club_name text NOT NULL,
  from_home_court text NOT NULL DEFAULT '',
  to_home_court text NOT NULL DEFAULT '',
  match_type text NOT NULL DEFAULT 'friendly',
  format text NOT NULL DEFAULT '5v5',
  slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  venue_choice text NOT NULL DEFAULT 'discuss',
  venue_note text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  waiting_club_id uuid,
  selected_date date,
  selected_time text,
  confirmed_venue text NOT NULL DEFAULT '',
  reject_reason text NOT NULL DEFAULT '',
  host_game_id text,
  guest_game_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS club_exchange_waiting_idx ON public.club_exchange_proposals (waiting_club_id, status);
CREATE INDEX IF NOT EXISTS club_exchange_from_idx ON public.club_exchange_proposals (from_club_id);
CREATE INDEX IF NOT EXISTS club_exchange_to_idx ON public.club_exchange_proposals (to_club_id);

ALTER TABLE public.club_games ADD COLUMN IF NOT EXISTS opponent_club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL;
ALTER TABLE public.club_games ADD COLUMN IF NOT EXISTS proposal_id text;

ALTER TABLE public.user_notifications ADD COLUMN IF NOT EXISTS proposal_id text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_exchange_proposals TO anon, authenticated;
ALTER TABLE public.club_exchange_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS club_exchange_proposals_all ON public.club_exchange_proposals;
CREATE POLICY club_exchange_proposals_all ON public.club_exchange_proposals
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
