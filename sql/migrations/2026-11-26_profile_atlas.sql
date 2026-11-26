-- 2026-11-26: profile Atlas and Guides.
-- Post lists now include city, country and whether the location is hidden,
-- so profiles can draw a map, passport stamps and city guides.
-- New columns are added at the end; the currently deployed app ignores them.
-- Run once in the Supabase SQL editor (safe before or after deploying).

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
  tags              text[],
  place_name        text,
  place_id          uuid,
  city_name         text,
  country_code      text,
  location_hidden   boolean
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
    COALESCE(a.tags, ARRAY[]::text[]) AS tags,
    a.place_name,
    a.place_id,
    a.city_name,
    a.country_code,
    COALESCE((SELECT pl.is_approximate FROM places pl WHERE pl.id = a.place_id), false) AS location_hidden
  FROM auras a
  WHERE a.user_id = p_user_id AND a.parent_id IS NULL
  ORDER BY a.created_at DESC;
END;
$$;

DROP FUNCTION IF EXISTS get_user_public_posts(uuid, uuid);
CREATE OR REPLACE FUNCTION get_user_public_posts(p_user_id uuid, p_viewer_id uuid DEFAULT NULL)
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
  tags              text[],
  place_name        text,
  place_id          uuid,
  city_name         text,
  country_code      text,
  location_hidden   boolean
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
    CASE
      WHEN p_viewer_id IS NOT NULL THEN
        EXISTS(SELECT 1 FROM likes l WHERE l.user_id = p_viewer_id AND l.aura_id = a.id)
      ELSE false
    END AS is_liked,
    COALESCE(a.tags, ARRAY[]::text[]) AS tags,
    a.place_name,
    a.place_id,
    a.city_name,
    a.country_code,
    COALESCE((SELECT pl.is_approximate FROM places pl WHERE pl.id = a.place_id), false) AS location_hidden
  FROM auras a
  WHERE a.user_id = p_user_id AND a.parent_id IS NULL
  ORDER BY a.created_at DESC;
END;
$$;

-- Backend (service_role) only, like every other function.
REVOKE EXECUTE ON FUNCTION get_user_auras(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_auras(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION get_user_public_posts(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_public_posts(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Check: your posts with a city (should be most of them)
SELECT COUNT(*) FILTER (WHERE city_name IS NOT NULL) AS with_city, COUNT(*) AS total
FROM get_user_auras((SELECT user_id FROM auras ORDER BY created_at DESC LIMIT 1));
