-- Run this in Supabase SQL Editor

-- 1. Add parent_id to auras for anchor/perspective relationship
ALTER TABLE auras ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES auras(id) NULL;

-- 2. Saves join table
CREATE TABLE IF NOT EXISTS saves (
  user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  aura_id   uuid REFERENCES auras(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, aura_id)
);

-- RLS stays enabled on saves (see security_lock_down_public_api.sql); the backend uses the service role.
