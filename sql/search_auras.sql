-- GIST index for fast spatial queries (run once)
CREATE INDEX IF NOT EXISTS idx_auras_location ON auras USING GIST(location);

DROP FUNCTION IF EXISTS search_auras(integer, integer, double precision, double precision, double precision, text);
DROP FUNCTION IF EXISTS search_auras(integer, integer, double precision, double precision, double precision, text, uuid);
DROP FUNCTION IF EXISTS search_auras(integer, integer, double precision, double precision, double precision, text, uuid, uuid);
DROP FUNCTION IF EXISTS search_auras(integer, integer, double precision, double precision, double precision, text, uuid, uuid, text);

-- Unified search: global, spatial, archetype, and following feed
-- Only returns anchors (parent_id IS NULL) with perspective count
CREATE OR REPLACE FUNCTION search_auras(
  p_limit         int DEFAULT 10,
  p_offset        int DEFAULT 0,
  p_lat           float DEFAULT NULL,
  p_lng           float DEFAULT NULL,
  p_radius_meters float DEFAULT 5000,
  p_archetype     text DEFAULT NULL,
  p_follower_id   uuid DEFAULT NULL,
  p_viewer_id     uuid DEFAULT NULL,
  p_tag           text DEFAULT NULL
)
RETURNS TABLE (
  id                uuid,
  user_id           uuid,
  title             text,
  description       text,
  image_urls        text[],
  archetype_tag     text,
  heading           float,
  altitude          float,
  is_verified       boolean,
  created_at        timestamptz,
  lat               float,
  lng               float,
  parent_id         uuid,
  distance_meters   float,
  perspective_count bigint,
  like_count        bigint,
  is_liked          boolean,
  tags              text[]
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
    a.parent_id,
    CASE
      WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
        ST_Distance(
          a.location,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        )::float
      ELSE NULL
    END AS distance_meters,
    (SELECT COUNT(*) FROM auras c WHERE c.parent_id = a.id)::bigint AS perspective_count,
    (SELECT COUNT(*) FROM likes l WHERE l.aura_id = a.id)::bigint AS like_count,
    CASE
      WHEN p_viewer_id IS NOT NULL THEN
        EXISTS(SELECT 1 FROM likes l WHERE l.user_id = p_viewer_id AND l.aura_id = a.id)
      ELSE false
    END AS is_liked,
    COALESCE(a.tags, ARRAY[]::text[]) AS tags
  FROM auras a
  WHERE
    a.parent_id IS NULL
    AND (p_archetype IS NULL OR a.archetype_tag = p_archetype)
    AND (p_tag IS NULL OR p_tag = ANY(a.tags))
    AND (
      p_follower_id IS NULL OR
      a.user_id IN (
        SELECT following_id FROM follows WHERE follower_id = p_follower_id
      )
    )
  ORDER BY
    -- On following feed: friends (mutual follows) first, then one-way follows
    CASE WHEN p_follower_id IS NOT NULL THEN
      CASE WHEN EXISTS(
        SELECT 1 FROM follows f2
        WHERE f2.follower_id = a.user_id AND f2.following_id = p_follower_id
      ) THEN 0 ELSE 1 END
    END ASC NULLS LAST,
    -- On spatial feed only (not following feed): nearest first
    CASE WHEN p_follower_id IS NULL AND p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
      ST_Distance(a.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)
    END ASC NULLS LAST,
    a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
