-- Fix sprint_id column type mismatch
-- The sprint_id column might be TEXT (from script 005) instead of UUID (from script 006)
-- This script ensures it's UUID with proper FK constraint

-- First, drop the TEXT column if it exists without FK
DO $$
BEGIN
  -- Check if sprint_id exists as TEXT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tasks' 
    AND column_name = 'sprint_id' 
    AND data_type = 'text'
  ) THEN
    -- Drop the TEXT column
    ALTER TABLE tasks DROP COLUMN IF EXISTS sprint_id;
    ALTER TABLE tasks DROP COLUMN IF EXISTS carried_from_sprint_id;
    
    -- Re-add as UUID with FK constraint
    ALTER TABLE tasks ADD COLUMN sprint_id UUID REFERENCES sprint_tracking(id) ON DELETE SET NULL;
    ALTER TABLE tasks ADD COLUMN carried_from_sprint_id UUID REFERENCES sprint_tracking(id) ON DELETE SET NULL;
    
    RAISE NOTICE 'Fixed sprint_id column type from TEXT to UUID';
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_tasks_sprint_id ON tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_tasks_carried_from_sprint_id ON tasks(carried_from_sprint_id);
