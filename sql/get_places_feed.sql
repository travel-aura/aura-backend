CREATE OR REPLACE FUNCTION get_places_feed(
  p_limit       int DEFAULT 10,
  p_offset      int DEFAULT 0,
  p_lat         float DEFAULT NULL,
  p_lng         float DEFAULT NULL,
  p_follower_id uuid DEFAULT NULL,
  p_tag         text DEFAULT NULL,
  p_query       text DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  cover_post_id   uuid,
  cover_image_url text,
  cover_title     text,
  shot_count      bigint,
  verified_count  int,
  distance_meters float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pl.id,
    pl.cover_post_id,
    (a.image_urls)[1]::text AS cover_image_url,
    a.title AS cover_title,
    (SELECT COUNT(*) FROM auras ap WHERE ap.place_id = pl.id)::bigint AS shot_count,
    (SELECT COUNT(*)::int FROM auras av WHERE av.place_id = pl.id AND av.is_verified = true) AS verified_count,
    CASE
      WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
        ST_Distance(
          pl.location,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        )::float
      ELSE NULL
    END AS distance_meters
  FROM places pl
  LEFT JOIN auras a ON a.id = pl.cover_post_id
  WHERE
    (p_query IS NULL OR pl.name ILIKE '%' || p_query || '%' OR a.title ILIKE '%' || p_query || '%')
    AND (p_tag IS NULL OR EXISTS (
      SELECT 1 FROM auras at2
      WHERE at2.place_id = pl.id AND p_tag = ANY(at2.tags)
    ))
    AND (p_follower_id IS NULL OR EXISTS (
      SELECT 1 FROM auras af
      WHERE af.place_id = pl.id
      AND af.user_id IN (SELECT following_id FROM follows WHERE follower_id = p_follower_id)
    ))
  ORDER BY
    CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
      ST_Distance(pl.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)
    END ASC NULLS LAST,
    pl.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
