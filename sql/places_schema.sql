CREATE TABLE IF NOT EXISTS places (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name           text NOT NULL,
  latitude       float NOT NULL,
  longitude      float NOT NULL,
  location       geography(POINT, 4326) NOT NULL,
  venue_id       text,
  cover_post_id  uuid REFERENCES auras(id) ON DELETE SET NULL,
  verified_count int DEFAULT 0 NOT NULL,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE places DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_places_location ON places USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_places_venue_id ON places(venue_id) WHERE venue_id IS NOT NULL;
