CREATE OR REPLACE FUNCTION check_nearby_auras(
  p_lat float,
  p_lng float,
  p_radius_meters float DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  title text,
  archetype_tag text,
  image_urls text[],
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
    a.title,
    a.archetype_tag,
    a.image_urls,
    ST_Distance(
      a.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    )::float AS distance_meters
  FROM auras a
  WHERE ST_DWithin(
    a.location,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_radius_meters
  )
  ORDER BY distance_meters ASC
  LIMIT 5;
END;
$$;
