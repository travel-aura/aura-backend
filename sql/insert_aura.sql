-- Updated insert_aura with parent_id support
DROP FUNCTION IF EXISTS insert_aura(uuid, text, text[], text, double precision, double precision, double precision, double precision, boolean, text);
CREATE OR REPLACE FUNCTION insert_aura(
  p_user_id      uuid,
  p_title        text,
  p_image_urls   text[],
  p_archetype_tag text,
  p_heading      float,
  p_altitude     float,
  p_lng          float,
  p_lat          float,
  p_is_verified  boolean,
  p_description  text DEFAULT '',
  p_parent_id    uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO auras (
    user_id, title, image_urls, archetype_tag,
    heading, altitude, location, is_verified, description, parent_id
  ) VALUES (
    p_user_id,
    p_title,
    p_image_urls,
    p_archetype_tag,
    p_heading,
    p_altitude,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_is_verified,
    p_description,
    p_parent_id
  );
END;
$$;
