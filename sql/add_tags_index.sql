CREATE INDEX IF NOT EXISTS idx_auras_tags ON auras USING GIN(tags);
