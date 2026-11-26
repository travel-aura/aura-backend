CREATE TABLE IF NOT EXISTS notifications (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         text NOT NULL,  -- 'follow' for now, extensible later
  read         boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

-- RLS stays enabled on notifications (see security_lock_down_public_api.sql); the backend uses the service role.

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, created_at DESC);
