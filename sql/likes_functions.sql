CREATE OR REPLACE FUNCTION like_aura(p_user_id uuid, p_aura_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO likes (user_id, aura_id) VALUES (p_user_id, p_aura_id)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION unlike_aura(p_user_id uuid, p_aura_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM likes WHERE user_id = p_user_id AND aura_id = p_aura_id;
END;
$$;
