CREATE TABLE IF NOT EXISTS public.club_member_messages (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  sender_id text NOT NULL,
  recipient_id text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS club_member_messages_club_created_idx
  ON public.club_member_messages (club_id, created_at);

CREATE INDEX IF NOT EXISTS club_member_messages_pair_idx
  ON public.club_member_messages (club_id, sender_id, recipient_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_member_messages TO anon, authenticated;

ALTER TABLE public.club_member_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_member_messages_all ON public.club_member_messages;
CREATE POLICY club_member_messages_all ON public.club_member_messages
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.purge_expired_club_member_messages()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.club_member_messages
  WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
