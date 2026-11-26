-- 2026-11-25: location privacy, real city counts, spot names, account deletion.
-- Run once in the Supabase SQL editor, BEFORE deploying the matching backend.
-- Safe with the currently deployed backend: every change is additive or keeps
-- the same inputs and outputs the old code uses.

-- ═══ 1. Location privacy ═════════════════════════════════════════════════════
-- Posts with "Hide exact location" get their own spot at a rounded (~1 km)
-- position. is_approximate keeps other uploads from joining those spots.

ALTER TABLE places ADD COLUMN IF NOT EXISTS is_approximate boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS create_place(text, float, float, text);
CREATE OR REPLACE FUNCTION create_place(
  p_name           text DEFAULT NULL,
  p_lat            float DEFAULT NULL,
  p_lng            float DEFAULT NULL,
  p_venue_id       text DEFAULT NULL,
  p_is_approximate boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO places (name, latitude, longitude, location, venue_id, is_approximate)
  VALUES (
    COALESCE(NULLIF(trim(p_name), ''), 'Unnamed Spot'),
    p_lat,
    p_lng,
    CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      ELSE NULL
    END,
    p_venue_id,
    p_is_approximate
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Same inputs and outputs as before; approximate spots are never matched.
CREATE OR REPLACE FUNCTION check_nearby_place(
  p_lat           float,
  p_lng           float,
  p_radius_meters float DEFAULT 20,
  p_venue_id      text DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  name            text,
  distance_meters float,
  verified_count  int,
  cover_image_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pl.id,
    pl.name,
    ST_Distance(pl.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)::float AS distance_meters,
    (SELECT COUNT(*)::int FROM auras av WHERE av.place_id = pl.id AND av.is_verified = true) AS verified_count,
    (a.image_urls)[1] AS cover_image_url
  FROM places pl
  LEFT JOIN auras a ON a.id = pl.cover_post_id
  WHERE NOT pl.is_approximate
    AND (
      (p_venue_id IS NOT NULL AND pl.venue_id = p_venue_id)
      OR (
        p_venue_id IS NULL AND
        ST_DWithin(pl.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_meters)
      )
    )
  ORDER BY distance_meters ASC
  LIMIT 10;
END;
$$;

-- Adds is_approximate to the result (new column at the end; old code ignores it).
DROP FUNCTION IF EXISTS get_place_by_id(uuid);
CREATE OR REPLACE FUNCTION get_place_by_id(p_place_id uuid)
RETURNS TABLE (
  id             uuid,
  name           text,
  latitude       float,
  longitude      float,
  venue_id       text,
  cover_post_id  uuid,
  verified_count int,
  created_at     timestamptz,
  is_approximate boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    pl.id, pl.name, pl.latitude, pl.longitude, pl.venue_id, pl.cover_post_id,
    (SELECT COUNT(*)::int FROM auras av WHERE av.place_id = pl.id AND av.is_verified = true),
    pl.created_at,
    pl.is_approximate
  FROM places pl
  WHERE pl.id = p_place_id;
$$;

-- ═══ 2. Real city counts ═════════════════════════════════════════════════════
-- Cities are now counted from posts (city + country), so deleting a post or
-- having two cities with the same name in different countries counts correctly.
-- The user_cities table is no longer read or written; it can be dropped later.

ALTER TABLE auras ADD COLUMN IF NOT EXISTS country_code text;

-- Same columns as before (old code keeps working) plus city_list at the end.
DROP FUNCTION IF EXISTS get_user_stats(uuid);
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id uuid)
RETURNS TABLE (
  city_count     int,
  verified_count bigint,
  follower_count bigint,
  friend_count   bigint,
  top_tags       text[],
  cities         text[],
  city_list      jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH user_cities_now AS (
    SELECT city_name, COALESCE(country_code, '') AS country_code, COUNT(*)::int AS post_count
    FROM auras
    WHERE user_id = p_user_id AND city_name IS NOT NULL AND trim(city_name) <> ''
    GROUP BY city_name, COALESCE(country_code, '')
  )
  SELECT
    (SELECT COUNT(*)::int FROM user_cities_now) AS city_count,
    (SELECT COUNT(*) FROM auras WHERE user_id = p_user_id AND is_verified = true AND parent_id IS NULL) AS verified_count,
    (SELECT COUNT(*) FROM follows WHERE following_id = p_user_id) AS follower_count,
    (
      SELECT COUNT(*) FROM follows f1
      WHERE f1.follower_id = p_user_id
      AND EXISTS (SELECT 1 FROM follows f2 WHERE f2.follower_id = f1.following_id AND f2.following_id = p_user_id)
    ) AS friend_count,
    (
      SELECT COALESCE(array_agg(tag ORDER BY cnt DESC), ARRAY[]::text[])
      FROM (
        SELECT tag, COUNT(*) AS cnt
        FROM auras, unnest(tags) AS tag
        WHERE user_id = p_user_id AND parent_id IS NULL
        GROUP BY tag ORDER BY cnt DESC LIMIT 3
      ) t
    ) AS top_tags,
    (SELECT COALESCE(array_agg(city_name ORDER BY city_name), ARRAY[]::text[]) FROM user_cities_now) AS cities,
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'city', city_name, 'country_code', NULLIF(country_code, ''), 'post_count', post_count
      ) ORDER BY country_code, city_name), '[]'::jsonb)
      FROM user_cities_now
    ) AS city_list;
$$;

-- Used once by scripts/backfill-cities.mjs to re-detect city and country for existing posts.
CREATE OR REPLACE FUNCTION get_auras_for_city_backfill()
RETURNS TABLE (id uuid, user_id uuid, city_name text, country_code text, lat float, lng float)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id, a.user_id, a.city_name, a.country_code,
         ST_Y(a.location::geometry)::float, ST_X(a.location::geometry)::float
  FROM auras a
  WHERE a.location IS NOT NULL
    AND NOT (ST_Y(a.location::geometry) = 0 AND ST_X(a.location::geometry) = 0);
$$;

-- ═══ 3. Spot names ═══════════════════════════════════════════════════════════
-- Replace "Unnamed Spot" / "Unnamed Venue" with the title of the spot's first post.
-- Shows what changed.

UPDATE places pl
SET name = sub.title
FROM (
  SELECT DISTINCT ON (a.place_id) a.place_id, trim(a.title) AS title
  FROM auras a
  WHERE a.place_id IS NOT NULL AND a.title IS NOT NULL AND trim(a.title) <> '' AND a.title <> 'Untitled'
  ORDER BY a.place_id, a.created_at ASC
) sub
WHERE pl.id = sub.place_id
  AND pl.name IN ('Unnamed Spot', 'Unnamed Venue');

-- ═══ 4. Account deletion ═════════════════════════════════════════════════════
-- Deletes everything a user owns in the database, in one transaction.
-- Other people's shots attached to this user's posts are detached, not deleted.
-- Storage files and the auth account are removed by the backend afterwards.

CREATE OR REPLACE FUNCTION delete_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_place_ids uuid[];
  v_place uuid;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT place_id), ARRAY[]::uuid[]) INTO v_place_ids
  FROM auras WHERE user_id = p_user_id AND place_id IS NOT NULL;

  -- Keep other users' shots that were added to this user's posts
  UPDATE auras SET parent_id = NULL
  WHERE parent_id IN (SELECT id FROM auras WHERE user_id = p_user_id)
    AND user_id <> p_user_id;

  DELETE FROM notifications WHERE recipient_id = p_user_id OR actor_id = p_user_id;
  DELETE FROM follows WHERE follower_id = p_user_id OR following_id = p_user_id;
  DELETE FROM likes WHERE user_id = p_user_id;
  DELETE FROM saves WHERE user_id = p_user_id;
  DELETE FROM user_cities WHERE user_id = p_user_id;
  DELETE FROM auras WHERE user_id = p_user_id;

  -- Spots left empty are removed; the rest get a new cover photo
  FOREACH v_place IN ARRAY v_place_ids LOOP
    IF EXISTS (SELECT 1 FROM auras WHERE place_id = v_place) THEN
      PERFORM refresh_place_cover(v_place);
    ELSE
      DELETE FROM places WHERE id = v_place;
    END IF;
  END LOOP;

  -- Profile row (table created in the dashboard; skip if it isn't there)
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.profiles WHERE user_id = $1' USING p_user_id;
  END IF;
END;
$$;

-- ═══ 5. Keep the lockdown in place ═══════════════════════════════════════════
-- New and re-created functions: backend (service_role) only.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Check: spot names fixed and new columns present
SELECT
  (SELECT COUNT(*) FROM places WHERE name IN ('Unnamed Spot', 'Unnamed Venue')) AS unnamed_spots_left,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'places' AND column_name = 'is_approximate') AS has_is_approximate,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'auras' AND column_name = 'country_code') AS has_country_code;
