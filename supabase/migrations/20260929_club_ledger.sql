-- 동아리 장부 · 영수증

CREATE TABLE IF NOT EXISTS public.club_ledger_entries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  side text NOT NULL CHECK (side IN ('in', 'out')),
  category text NOT NULL CHECK (category IN ('dues', 'venue', 'drinks', 'other')),
  title text NOT NULL,
  amount integer NOT NULL CHECK (amount >= 0),
  memo text NOT NULL DEFAULT '',
  receipt_url text,
  receipt_public boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS club_ledger_entries_club_date_idx
  ON public.club_ledger_entries (club_id, entry_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_ledger_entries TO anon, authenticated;

ALTER TABLE public.club_ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_ledger_entries_all ON public.club_ledger_entries;
CREATE POLICY club_ledger_entries_all ON public.club_ledger_entries
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('club-receipts', 'club-receipts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS club_receipts_select ON storage.objects;
CREATE POLICY club_receipts_select ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'club-receipts');

DROP POLICY IF EXISTS club_receipts_write ON storage.objects;
CREATE POLICY club_receipts_write ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'club-receipts');

DROP POLICY IF EXISTS club_receipts_update ON storage.objects;
CREATE POLICY club_receipts_update ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'club-receipts')
  WITH CHECK (bucket_id = 'club-receipts');

DROP POLICY IF EXISTS club_receipts_delete ON storage.objects;
CREATE POLICY club_receipts_delete ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'club-receipts');
