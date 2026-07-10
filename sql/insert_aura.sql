DROP FUNCTION IF EXISTS insert_aura(uuid, text, text[], text, double precision, double precision, double precision, double precision, boolean, text);
DROP FUNCTION IF EXISTS insert_aura(uuid, text, text[], text, double precision, double precision, double precision, double precision, boolean, text, uuid, text[], text);
DROP FUNCTION IF EXISTS insert_aura(uuid, text, text[], double precision, double precision, double precision, double precision, boolean, text, uuid, text[], text);
DROP FUNCTION IF EXISTS insert_aura(uuid, text, text[], double precision, double precision, double precision, double precision, boolean, text, uuid, text[], text, text, text, text, double precision, text);
DROP FUNCTION IF EXISTS insert_aura(uuid, text, text[], double precision, double precision, double precision, double precision, boolean, text, uuid, text[], text, text, text, text, double precision, text, text);

CREATE OR REPLACE FUNCTION insert_aura(
  p_user_id       uuid,
  p_title         text,
  p_image_urls    text[],
  p_heading       float,
  p_altitude      float,
  p_lng           float,
  p_lat           float,
  p_is_verified   boolean,
  p_description   text DEFAULT '',
  p_parent_id     uuid DEFAULT NULL,
  p_tags          text[] DEFAULT NULL,
  p_city_name     text DEFAULT NULL,
  p_archetype_tag text DEFAULT NULL,
  p_taken_at      text DEFAULT NULL,
  p_tz_offset     text DEFAULT NULL,
  p_gps_accuracy  float DEFAULT NULL,
  p_gps_timestamp text DEFAULT NULL,
  p_place_name    text DEFAULT NULL,
  p_place_id      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO auras (
    user_id, title, image_urls,
    heading, altitude, location, is_verified, description,
    parent_id, tags, city_name, archetype_tag,
    taken_at, tz_offset, gps_accuracy, gps_timestamp,
    place_name, place_id
  ) VALUES (
    p_user_id, p_title, p_image_urls,
    p_heading, p_altitude,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_is_verified, p_description,
    p_parent_id, p_tags, p_city_name, p_archetype_tag,
    p_taken_at, p_tz_offset, p_gps_accuracy, p_gps_timestamp,
    p_place_name, p_place_id
  )
  RETURNING id INTO v_id;

  -- Set cover_post_id on the place if it hasn't been set yet
  IF p_place_id IS NOT NULL THEN
    UPDATE places SET cover_post_id = v_id
    WHERE id = p_place_id AND cover_post_id IS NULL;
  END IF;

  RETURN v_id;
END;
$$;
