CREATE OR REPLACE FUNCTION get_user_stats(p_user_id uuid)
RETURNS TABLE (
  photo_spots    bigint,
  wanderings     bigint,
  indoor_vibes   bigint,
  city_count     int,
  verified_count bigint,
  follower_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COUNT(*) FILTER (WHERE archetype_tag = 'Photo Spots' AND parent_id IS NULL) AS photo_spots,
    COUNT(*) FILTER (WHERE archetype_tag = 'Wanderings'  AND parent_id IS NULL) AS wanderings,
    COUNT(*) FILTER (WHERE archetype_tag = 'Indoor Vibes' AND parent_id IS NULL) AS indoor_vibes,
    (SELECT COUNT(*)::int FROM user_cities  WHERE user_id    = p_user_id) AS city_count,
    COUNT(*) FILTER (WHERE is_verified = true AND parent_id IS NULL)      AS verified_count,
    (SELECT COUNT(*)       FROM follows     WHERE following_id = p_user_id) AS follower_count
  FROM auras
  WHERE user_id = p_user_id;
$$;
