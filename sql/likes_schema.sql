CREATE TABLE IF NOT EXISTS likes (
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  aura_id    uuid REFERENCES auras(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, aura_id)
);

-- RLS stays enabled on likes (see security_lock_down_public_api.sql); the backend uses the service role.

CREATE INDEX IF NOT EXISTS idx_likes_aura ON likes(aura_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id);
