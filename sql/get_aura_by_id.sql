-- Function to get a single aura by ID with user info
CREATE OR REPLACE FUNCTION get_aura_by_id(p_aura_id uuid)
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
  created_at timestamp with time zone,
  lat float,
  lng float,
  user_name text,
  user_email text,
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
    ST_Y(a.location::geometry) as lat,
    ST_X(a.location::geometry) as lng,
    COALESCE(p.name, SPLIT_PART(au.email, '@', 1)) as user_name,
    au.email::text as user_email,
    p.avatar_url as user_avatar_url
  FROM auras a
  LEFT JOIN auth.users au ON a.user_id = au.id
  LEFT JOIN profiles p ON a.user_id = p.user_id
  WHERE a.id = p_aura_id;
END;
$$;
