-- Public profile: user info + posts + stats + follow counts + is_following
CREATE OR REPLACE FUNCTION get_user_public_profile(
  p_profile_user_id uuid,
  p_viewer_id       uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id          uuid,
  name             text,
  bio              text,
  avatar_url       text,
  follower_count   bigint,
  following_count  bigint,
  is_following     boolean,
  post_count       bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    au.id AS user_id,
    COALESCE(p.name, SPLIT_PART(au.email, '@', 1))::text AS name,
    p.bio,
    p.avatar_url,
    (SELECT COUNT(*) FROM follows f WHERE f.following_id = au.id)::bigint AS follower_count,
    (SELECT COUNT(*) FROM follows f WHERE f.follower_id = au.id)::bigint AS following_count,
    CASE
      WHEN p_viewer_id IS NOT NULL THEN
        EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = au.id)
      ELSE false
    END AS is_following,
    (SELECT COUNT(*) FROM auras a WHERE a.user_id = au.id AND a.parent_id IS NULL)::bigint AS post_count
  FROM auth.users au
  LEFT JOIN profiles p ON au.id = p.user_id
  WHERE au.id = p_profile_user_id;
END;
$$;

-- Get public posts for a user (anchors only, same shape as feed)
CREATE OR REPLACE FUNCTION get_user_public_posts(p_user_id uuid)
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
  perspective_count bigint
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
    (SELECT COUNT(*) FROM auras c WHERE c.parent_id = a.id)::bigint AS perspective_count
  FROM auras a
  WHERE a.user_id = p_user_id AND a.parent_id IS NULL
  ORDER BY a.created_at DESC;
END;
$$;
