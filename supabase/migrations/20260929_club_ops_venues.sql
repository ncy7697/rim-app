-- 체육관 대관처 · 대관 일정

CREATE TABLE IF NOT EXISTS public.club_venues (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  map_url text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  is_home boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.club_venue_bookings (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  venue_id text NOT NULL REFERENCES public.club_venues(id) ON DELETE CASCADE,
  booking_date date NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  title text NOT NULL,
  fee integer,
  confirm_code text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'confirmed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS club_venues_club_idx ON public.club_venues (club_id);
CREATE INDEX IF NOT EXISTS club_venue_bookings_club_date_idx ON public.club_venue_bookings (club_id, booking_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_venues TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_venue_bookings TO anon, authenticated;

ALTER TABLE public.club_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_venue_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_venues_all ON public.club_venues;
CREATE POLICY club_venues_all ON public.club_venues FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS club_venue_bookings_all ON public.club_venue_bookings;
CREATE POLICY club_venue_bookings_all ON public.club_venue_bookings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
