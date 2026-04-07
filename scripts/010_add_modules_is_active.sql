-- Add module enable/disable support
ALTER TABLE modules
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

UPDATE modules
SET is_active = true
WHERE is_active IS NULL;
