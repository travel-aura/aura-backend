CREATE TABLE IF NOT EXISTS user_cities (
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  city_name text NOT NULL,
  PRIMARY KEY (user_id, city_name)
);

-- RLS stays enabled (see security_lock_down_public_api.sql); the backend uses the service role.

CREATE INDEX IF NOT EXISTS idx_user_cities_user ON user_cities(user_id);
