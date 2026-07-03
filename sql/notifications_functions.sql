-- Get all notifications for a user, newest first, with actor info
DROP FUNCTION IF EXISTS get_notifications(uuid);
CREATE OR REPLACE FUNCTION get_notifications(p_user_id uuid)
RETURNS TABLE (
  id           uuid,
  type         text,
  read         boolean,
  created_at   timestamptz,
  actor_id     uuid,
  actor_name   text,
  actor_avatar text,
  is_following boolean,
  aura_id      uuid,
  aura_title   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.type,
    n.read,
    n.created_at,
    n.actor_id,
    COALESCE(p.name, SPLIT_PART(au.email, '@', 1))::text AS actor_name,
    p.avatar_url::text AS actor_avatar,
    EXISTS(
      SELECT 1 FROM follows f
      WHERE f.follower_id = p_user_id AND f.following_id = n.actor_id
    ) AS is_following,
    n.aura_id,
    a.title AS aura_title
  FROM notifications n
  LEFT JOIN auth.users au ON n.actor_id = au.id
  LEFT JOIN profiles p ON n.actor_id = p.user_id
  LEFT JOIN auras a ON n.aura_id = a.id
  WHERE n.recipient_id = p_user_id
  ORDER BY n.created_at DESC
  LIMIT 50;
END;
$$;

-- Mark all notifications as read for a user
CREATE OR REPLACE FUNCTION mark_notifications_read(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE notifications SET read = true
  WHERE recipient_id = p_user_id AND read = false;
END;
$$;

-- Create a notification
DROP FUNCTION IF EXISTS create_notification(uuid, uuid, text);
CREATE OR REPLACE FUNCTION create_notification(
  p_recipient_id uuid,
  p_actor_id     uuid,
  p_type         text,
  p_aura_id      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_recipient_id = p_actor_id THEN RETURN; END IF;
  -- Deduplicate follow notifications only
  IF p_type = 'follow' THEN
    INSERT INTO notifications (recipient_id, actor_id, type)
    SELECT p_recipient_id, p_actor_id, p_type
    WHERE NOT EXISTS (
      SELECT 1 FROM notifications
      WHERE recipient_id = p_recipient_id AND actor_id = p_actor_id AND type = 'follow'
    );
  ELSE
    INSERT INTO notifications (recipient_id, actor_id, type, aura_id)
    VALUES (p_recipient_id, p_actor_id, p_type, p_aura_id);
  END IF;
END;
$$;
