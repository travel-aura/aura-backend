-- People who follow p_user_id, with is_following (does current user follow them back)
CREATE OR REPLACE FUNCTION get_followers(p_user_id uuid, p_current_user_id uuid)
RETURNS TABLE (
  id           uuid,
  name         text,
  avatar_url   text,
  is_following boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    au.id,
    COALESCE(p.name, SPLIT_PART(au.email, '@', 1))::text AS name,
    p.avatar_url,
    EXISTS(
      SELECT 1 FROM follows f2
      WHERE f2.follower_id = p_current_user_id AND f2.following_id = au.id
    ) AS is_following
  FROM follows f
  JOIN auth.users au ON f.follower_id = au.id
  LEFT JOIN profiles p ON au.id = p.user_id
  WHERE f.following_id = p_user_id
  ORDER BY f.created_at DESC;
$$;

-- People p_user_id follows
CREATE OR REPLACE FUNCTION get_following(p_user_id uuid)
RETURNS TABLE (
  id         uuid,
  name       text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    au.id,
    COALESCE(p.name, SPLIT_PART(au.email, '@', 1))::text AS name,
    p.avatar_url
  FROM follows f
  JOIN auth.users au ON f.following_id = au.id
  LEFT JOIN profiles p ON au.id = p.user_id
  WHERE f.follower_id = p_user_id
  ORDER BY f.created_at DESC;
$$;
