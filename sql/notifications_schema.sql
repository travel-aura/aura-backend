CREATE TABLE IF NOT EXISTS notifications (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         text NOT NULL,  -- 'follow' for now, extensible later
  read         boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, created_at DESC);
