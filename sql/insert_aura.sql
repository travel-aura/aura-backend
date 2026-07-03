DROP FUNCTION IF EXISTS insert_aura(uuid, text, text[], text, double precision, double precision, double precision, double precision, boolean, text);
DROP FUNCTION IF EXISTS insert_aura(uuid, text, text[], text, double precision, double precision, double precision, double precision, boolean, text, uuid, text[], text);
DROP FUNCTION IF EXISTS insert_aura(uuid, text, text[], double precision, double precision, double precision, double precision, boolean, text, uuid, text[], text);
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
  p_gps_timestamp text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO auras (
    user_id, title, image_urls,
    heading, altitude, location, is_verified, description,
    parent_id, tags, city_name, archetype_tag,
    taken_at, tz_offset, gps_accuracy, gps_timestamp
  ) VALUES (
    p_user_id, p_title, p_image_urls,
    p_heading, p_altitude,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_is_verified, p_description,
    p_parent_id, p_tags, p_city_name, p_archetype_tag,
    p_taken_at, p_tz_offset, p_gps_accuracy, p_gps_timestamp
  );
END;
$$;
