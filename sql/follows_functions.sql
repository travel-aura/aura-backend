-- Follow a user
CREATE OR REPLACE FUNCTION follow_user(p_follower_id uuid, p_following_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO follows (follower_id, following_id) VALUES (p_follower_id, p_following_id)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Unfollow a user
CREATE OR REPLACE FUNCTION unfollow_user(p_follower_id uuid, p_following_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM follows WHERE follower_id = p_follower_id AND following_id = p_following_id;
END;
$$;

-- Search users by name or email (case-insensitive), excludes self, includes is_following
CREATE OR REPLACE FUNCTION search_users(p_query text, p_current_user_id uuid DEFAULT NULL)
RETURNS TABLE (
  id           uuid,
  name         text,
  email        text,
  avatar_url   text,
  is_following boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    au.id,
    COALESCE(p.name, SPLIT_PART(au.email, '@', 1))::text AS name,
    au.email::text,
    p.avatar_url,
    CASE
      WHEN p_current_user_id IS NOT NULL THEN
        EXISTS(
          SELECT 1 FROM follows f
          WHERE f.follower_id = p_current_user_id AND f.following_id = au.id
        )
      ELSE false
    END AS is_following
  FROM auth.users au
  LEFT JOIN profiles p ON au.id = p.user_id
  WHERE
    (p_current_user_id IS NULL OR au.id != p_current_user_id)
    AND (
      COALESCE(p.name, '') ILIKE '%' || p_query || '%'
      OR au.email ILIKE '%' || p_query || '%'
    )
  ORDER BY name ASC
  LIMIT 20;
END;
$$;
