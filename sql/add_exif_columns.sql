-- EXIF metadata columns on auras
ALTER TABLE auras ADD COLUMN IF NOT EXISTS taken_at       text;
ALTER TABLE auras ADD COLUMN IF NOT EXISTS tz_offset      text;
ALTER TABLE auras ADD COLUMN IF NOT EXISTS gps_accuracy   float;
ALTER TABLE auras ADD COLUMN IF NOT EXISTS gps_timestamp  text;

-- aura reference on notifications (for save/perspective types)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS aura_id uuid REFERENCES auras(id) ON DELETE SET NULL;
