-- GIST index for fast spatial queries (run once)
CREATE INDEX IF NOT EXISTS idx_auras_location ON auras USING GIST(location);

-- Unified search function: global feed OR spatial + archetype filter
CREATE OR REPLACE FUNCTION search_auras(
  p_limit int DEFAULT 10,
  p_offset int DEFAULT 0,
  p_lat float DEFAULT NULL,
  p_lng float DEFAULT NULL,
  p_radius_meters float DEFAULT 5000,
  p_archetype text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  title text,
  description text,
  image_urls text[],
  archetype_tag text,
  heading float,
  altitude float,
  is_verified boolean,
  created_at timestamptz,
  lat float,
  lng float,
  distance_meters float
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
    CASE
      WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
        ST_Distance(
          a.location,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        )::float
      ELSE NULL
    END AS distance_meters
  FROM auras a
  WHERE
    -- spatial filter: only applies when lat/lng provided
    (
      p_lat IS NULL OR p_lng IS NULL OR
      ST_DWithin(
        a.location,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        p_radius_meters
      )
    )
    -- archetype filter: only applies when provided
    AND (p_archetype IS NULL OR a.archetype_tag = p_archetype)
  ORDER BY
    -- nearest first for spatial, newest first for global
    CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
      ST_Distance(a.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)
    END ASC NULLS LAST,
    a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
