-- Get all notifications for a user, newest first, with actor info
CREATE OR REPLACE FUNCTION get_notifications(p_user_id uuid)
RETURNS TABLE (
  id           uuid,
  type         text,
  read         boolean,
  created_at   timestamptz,
  actor_id     uuid,
  actor_name   text,
  actor_avatar text,
  is_following boolean  -- does the recipient already follow the actor back?
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
    ) AS is_following
  FROM notifications n
  LEFT JOIN auth.users au ON n.actor_id = au.id
  LEFT JOIN profiles p ON n.actor_id = p.user_id
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

-- Create a notification (called by backend after follow)
CREATE OR REPLACE FUNCTION create_notification(
  p_recipient_id uuid,
  p_actor_id     uuid,
  p_type         text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Don't notify yourself
  IF p_recipient_id = p_actor_id THEN RETURN; END IF;
  -- Avoid duplicate follow notifications
  IF p_type = 'follow' THEN
    INSERT INTO notifications (recipient_id, actor_id, type)
    SELECT p_recipient_id, p_actor_id, p_type
    WHERE NOT EXISTS (
      SELECT 1 FROM notifications
      WHERE recipient_id = p_recipient_id AND actor_id = p_actor_id AND type = 'follow'
    );
  ELSE
    INSERT INTO notifications (recipient_id, actor_id, type)
    VALUES (p_recipient_id, p_actor_id, p_type);
  END IF;
END;
$$;
