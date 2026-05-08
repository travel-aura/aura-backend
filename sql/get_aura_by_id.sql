-- Single aura detail: includes perspectives + is_saved
CREATE OR REPLACE FUNCTION get_aura_by_id(
  p_aura_id   uuid,
  p_viewer_id uuid DEFAULT NULL
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
  user_name         text,
  user_email        text,
  user_avatar_url   text,
  perspective_count bigint,
  perspectives      json,
  is_saved          boolean
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
    COALESCE(p.name, SPLIT_PART(au.email, '@', 1)) AS user_name,
    au.email::text AS user_email,
    p.avatar_url AS user_avatar_url,
    (SELECT COUNT(*) FROM auras c WHERE c.parent_id = a.id)::bigint AS perspective_count,
    (
      SELECT COALESCE(
        json_agg(json_build_object(
          'id',              c.id,
          'image_urls',      c.image_urls,
          'archetype_tag',   c.archetype_tag,
          'created_at',      c.created_at,
          'user_name',       COALESCE(cp.name, SPLIT_PART(cu.email, '@', 1)),
          'user_avatar_url', cp.avatar_url
        ) ORDER BY c.created_at ASC),
        '[]'::json
      )
      FROM auras c
      LEFT JOIN auth.users cu ON c.user_id = cu.id
      LEFT JOIN profiles cp ON c.user_id = cp.user_id
      WHERE c.parent_id = a.id
    ) AS perspectives,
    CASE
      WHEN p_viewer_id IS NOT NULL THEN
        EXISTS(SELECT 1 FROM saves s WHERE s.user_id = p_viewer_id AND s.aura_id = a.id)
      ELSE false
    END AS is_saved
  FROM auras a
  LEFT JOIN auth.users au ON a.user_id = au.id
  LEFT JOIN profiles p ON a.user_id = p.user_id
  WHERE a.id = p_aura_id;
END;
$$;
