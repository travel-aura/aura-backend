CREATE TABLE IF NOT EXISTS follows (
  follower_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, following_id)
);

-- RLS stays enabled on follows (see security_lock_down_public_api.sql); the backend uses the service role.

CREATE INDEX IF NOT EXISTS idx_follows_follower  ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
