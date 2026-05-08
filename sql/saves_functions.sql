-- Save an aura
CREATE OR REPLACE FUNCTION save_aura(p_user_id uuid, p_aura_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO saves (user_id, aura_id) VALUES (p_user_id, p_aura_id)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Unsave an aura
CREATE OR REPLACE FUNCTION unsave_aura(p_user_id uuid, p_aura_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM saves WHERE user_id = p_user_id AND aura_id = p_aura_id;
END;
$$;

-- Get all saved auras for a user (same shape as feed)
CREATE OR REPLACE FUNCTION get_saved_auras(p_user_id uuid)
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
  saved_at          timestamptz
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
    NULL::float AS distance_meters,
    (SELECT COUNT(*) FROM auras c WHERE c.parent_id = a.id)::bigint AS perspective_count,
    s.created_at AS saved_at
  FROM saves s
  JOIN auras a ON s.aura_id = a.id
  WHERE s.user_id = p_user_id
  ORDER BY s.created_at DESC;
END;
$$;
