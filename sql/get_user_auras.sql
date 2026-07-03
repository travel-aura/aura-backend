-- p_user_id doubles as the viewer since these are the user's own posts
DROP FUNCTION IF EXISTS get_user_auras(uuid);
CREATE OR REPLACE FUNCTION get_user_auras(p_user_id uuid)
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
    (SELECT COUNT(*) FROM auras c WHERE c.parent_id = a.id)::bigint AS perspective_count,
    (SELECT COUNT(*) FROM likes l WHERE l.aura_id = a.id)::bigint AS like_count,
    EXISTS(SELECT 1 FROM likes l WHERE l.user_id = p_user_id AND l.aura_id = a.id) AS is_liked,
    COALESCE(a.tags, ARRAY[]::text[]) AS tags
  FROM auras a
  WHERE a.user_id = p_user_id AND a.parent_id IS NULL
  ORDER BY a.created_at DESC;
END;
$$;
