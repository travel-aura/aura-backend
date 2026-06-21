-- Insert city for user, skip if already exists
CREATE OR REPLACE FUNCTION upsert_user_city(p_user_id uuid, p_city_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO user_cities (user_id, city_name)
  VALUES (p_user_id, p_city_name)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Get all cities for a user
CREATE OR REPLACE FUNCTION get_user_cities(p_user_id uuid)
RETURNS TABLE (city_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT city_name FROM user_cities WHERE user_id = p_user_id ORDER BY city_name ASC;
$$;

-- Get distinct city count for a user
CREATE OR REPLACE FUNCTION get_user_city_count(p_user_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::int FROM user_cities WHERE user_id = p_user_id;
$$;
