CREATE TABLE IF NOT EXISTS user_cities (
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  city_name text NOT NULL,
  PRIMARY KEY (user_id, city_name)
);

ALTER TABLE user_cities DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_cities_user ON user_cities(user_id);
