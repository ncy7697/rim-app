ALTER TABLE public.club_member_messages
  ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS reply_to_id text;

CREATE INDEX IF NOT EXISTS club_member_messages_recipient_idx
  ON public.club_member_messages (club_id, recipient_id, created_at DESC);
