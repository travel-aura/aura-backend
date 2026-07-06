ALTER TABLE auras ADD COLUMN IF NOT EXISTS place_id uuid REFERENCES places(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_auras_place_id ON auras(place_id);
