CREATE OR REPLACE FUNCTION get_user_stats(p_user_id uuid)
RETURNS TABLE (
  city_count     int,
  verified_count bigint,
  follower_count bigint,
  friend_count   bigint,
  top_tags       text[],
  cities         text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT COUNT(*)::int FROM user_cities WHERE user_id = p_user_id) AS city_count,
    COUNT(*) FILTER (WHERE is_verified = true AND parent_id IS NULL)  AS verified_count,
    (SELECT COUNT(*) FROM follows WHERE following_id = p_user_id)     AS follower_count,
    (
      SELECT COUNT(*) FROM follows f1
      WHERE f1.follower_id = p_user_id
      AND EXISTS (
        SELECT 1 FROM follows f2
        WHERE f2.follower_id = f1.following_id AND f2.following_id = p_user_id
      )
    ) AS friend_count,
    (
      SELECT COALESCE(array_agg(tag ORDER BY cnt DESC), ARRAY[]::text[])
      FROM (
        SELECT tag, COUNT(*) AS cnt
        FROM auras, unnest(tags) AS tag
        WHERE user_id = p_user_id AND parent_id IS NULL
        GROUP BY tag
        ORDER BY cnt DESC
        LIMIT 3
      ) t
    ) AS top_tags,
    (
      SELECT COALESCE(array_agg(city_name ORDER BY city_name), ARRAY[]::text[])
      FROM user_cities
      WHERE user_id = p_user_id
    ) AS cities
  FROM auras
  WHERE user_id = p_user_id;
$$;
