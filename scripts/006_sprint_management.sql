-- Add Sprint Management to Tasks

-- 1. Create sprint_tracking table if it doesn't exist
CREATE TABLE IF NOT EXISTS sprint_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sprint_name TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add sprint tracking columns to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_id UUID REFERENCES sprint_tracking(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS carried_from_sprint_id UUID REFERENCES sprint_tracking(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_month TEXT;

-- 3. Create index on sprint_id for better query performance
CREATE INDEX IF NOT EXISTS idx_tasks_sprint_id ON tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_tasks_carried_from_sprint_id ON tasks(carried_from_sprint_id);
CREATE INDEX IF NOT EXISTS idx_sprint_tracking_project_id ON sprint_tracking(project_id);

-- 4. Create view for tasks by sprint
CREATE OR REPLACE VIEW tasks_by_sprint AS
SELECT 
  t.id,
  t.title,
  t.status,
  t.priority,
  t.assignee_id,
  t.sprint_id,
  t.carried_from_sprint_id,
  st.sprint_name,
  st.start_date,
  st.end_date,
  st.status as sprint_status,
  u.full_name as assignee_name,
  u.email as assignee_email
FROM tasks t
LEFT JOIN sprint_tracking st ON t.sprint_id = st.id
LEFT JOIN users u ON t.assignee_id = u.id
ORDER BY st.start_date DESC, t.order_index;

-- 5. Create function for handling carry-forward
CREATE OR REPLACE FUNCTION handle_sprint_carry_forward(
  p_task_id UUID,
  p_old_sprint_id UUID,
  p_new_sprint_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  IF p_old_sprint_id IS NOT NULL AND p_old_sprint_id != p_new_sprint_id THEN
    -- Mark task as carried forward
    UPDATE tasks 
    SET carried_from_sprint_id = p_old_sprint_id,
        updated_at = NOW()
    WHERE id = p_task_id AND status != 'done';
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;
