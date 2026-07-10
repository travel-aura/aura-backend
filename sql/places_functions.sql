-- Find nearby places within radius OR by venue_id (returns NearbyPlace shape)
CREATE OR REPLACE FUNCTION check_nearby_place(
  p_lat           float,
  p_lng           float,
  p_radius_meters float DEFAULT 20,
  p_venue_id      text DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  name            text,
  distance_meters float,
  verified_count  int,
  cover_image_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pl.id,
    pl.name,
    ST_Distance(
      pl.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    )::float AS distance_meters,
    (SELECT COUNT(*)::int FROM auras av WHERE av.place_id = pl.id AND av.is_verified = true) AS verified_count,
    (a.image_urls)[1] AS cover_image_url
  FROM places pl
  LEFT JOIN auras a ON a.id = pl.cover_post_id
  WHERE
    (p_venue_id IS NOT NULL AND pl.venue_id = p_venue_id)
    OR (
      p_venue_id IS NULL AND
      ST_DWithin(
        pl.location,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        p_radius_meters
      )
    )
  ORDER BY distance_meters ASC
  LIMIT 10;
END;
$$;

-- Create a new place, return its id
CREATE OR REPLACE FUNCTION create_place(
  p_name     text,
  p_lat      float,
  p_lng      float,
  p_venue_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO places (name, latitude, longitude, location, venue_id)
  VALUES (
    COALESCE(p_name, 'Unnamed Spot'),
    p_lat,
    p_lng,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_venue_id
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Index for fast verified_count queries
CREATE INDEX IF NOT EXISTS idx_auras_place_verified ON auras(place_id) WHERE is_verified = true;

-- Get a single place by id (used by GET /api/places/:id)
CREATE OR REPLACE FUNCTION get_place_by_id(p_place_id uuid)
RETURNS TABLE (
  id             uuid,
  name           text,
  latitude       float,
  longitude      float,
  venue_id       text,
  cover_post_id  uuid,
  verified_count int,
  created_at     timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    pl.id,
    pl.name,
    pl.latitude,
    pl.longitude,
    pl.venue_id,
    pl.cover_post_id,
    (SELECT COUNT(*)::int FROM auras av WHERE av.place_id = pl.id AND av.is_verified = true),
    pl.created_at
  FROM places pl
  WHERE pl.id = p_place_id;
$$;

-- Find place by venue_id (used during upload)
CREATE OR REPLACE FUNCTION find_place_by_venue_id(p_venue_id text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM places WHERE venue_id = p_venue_id LIMIT 1;
$$;

-- Set cover_post_id on a place (used after first post upload)
CREATE OR REPLACE FUNCTION update_place_cover(p_place_id uuid, p_post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE places SET cover_post_id = p_post_id WHERE id = p_place_id AND cover_post_id IS NULL;
$$;

-- Get all posts at a place (for PlaceResponse.posts)
CREATE OR REPLACE FUNCTION get_place_posts(
  p_place_id  uuid,
  p_viewer_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  user_id         uuid,
  title           text,
  description     text,
  image_urls      text[],
  archetype_tag   text,
  heading         float,
  altitude        float,
  is_verified     boolean,
  created_at      timestamptz,
  lat             float,
  lng             float,
  place_id        uuid,
  place_name      text,
  like_count      bigint,
  is_liked        boolean,
  is_saved        boolean,
  tags            text[],
  user_name       text,
  user_avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.user_id,
    a.title,
    a.description,
    a.image_urls,
    a.archetype_tag,
    a.heading,
    a.altitude,
    a.is_verified,
    a.created_at,
    ST_Y(a.location::geometry)::float AS lat,
    ST_X(a.location::geometry)::float AS lng,
    a.place_id,
    a.place_name,
    (SELECT COUNT(*) FROM likes l WHERE l.aura_id = a.id)::bigint AS like_count,
    CASE
      WHEN p_viewer_id IS NOT NULL THEN
        EXISTS(SELECT 1 FROM likes l WHERE l.user_id = p_viewer_id AND l.aura_id = a.id)
      ELSE false
    END AS is_liked,
    CASE
      WHEN p_viewer_id IS NOT NULL THEN
        EXISTS(SELECT 1 FROM saves s WHERE s.user_id = p_viewer_id AND s.aura_id = a.id)
      ELSE false
    END AS is_saved,
    COALESCE(a.tags, ARRAY[]::text[]) AS tags,
    COALESCE(p.name, SPLIT_PART(au.email, '@', 1))::text AS user_name,
    p.avatar_url AS user_avatar_url
  FROM auras a
  LEFT JOIN auth.users au ON a.user_id = au.id
  LEFT JOIN profiles p ON a.user_id = p.user_id
  WHERE a.place_id = p_place_id
  ORDER BY a.created_at ASC;
END;
$$;
