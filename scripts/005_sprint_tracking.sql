-- Simple Sprint Tracking Migration
-- Add sprint tracking columns to tasks table

-- Step 1: Add sprint tracking columns to tasks table
-- These columns will track which sprint a task belongs to and if it was carried forward
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS carried_from_sprint_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Step 2: Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_tasks_sprint_id ON tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at);

-- Step 3: Update tasks that are marked as done to have completed_at set
UPDATE tasks 
SET completed_at = updated_at 
WHERE status = 'done' AND completed_at IS NULL;
