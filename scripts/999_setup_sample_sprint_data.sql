-- This script creates sample sprints and capacity data for testing task assignment

-- 1. Get the first project (assuming there's at least one)
WITH project_info AS (
  SELECT id FROM projects LIMIT 1
),
-- 2. Create sample sprints for current month and next month
active_sprints AS (
  INSERT INTO sprint_tracking (sprint_name, project_id, start_date, end_date, status, created_at, updated_at)
  SELECT 
    'Sprint ' || to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    (SELECT id FROM project_info),
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '14 days',
    'active',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  WHERE NOT EXISTS (SELECT 1 FROM sprint_tracking WHERE project_id = (SELECT id FROM project_info) AND status = 'active')
  ON CONFLICT DO NOTHING
  RETURNING id, project_id
),
-- 3. Get all active team members
team_members AS (
  SELECT DISTINCT u.id, u.full_name
  FROM users u
  WHERE u.is_active = true
  AND u.designation != 'Super Admin'
  AND u.designation != 'Delivery Manager'
  LIMIT 5
),
-- 4. Ensure team members are assigned to the project
project_assignments AS (
  INSERT INTO project_users (project_id, user_id, role, created_at, updated_at)
  SELECT 
    (SELECT id FROM project_info),
    t.id,
    'team_member',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM team_members t
  ON CONFLICT (project_id, user_id) DO NOTHING
  RETURNING user_id, project_id
),
-- 5. Ensure capacity records exist for team members
capacity_setup AS (
  INSERT INTO employee_capacity (employee_id, month, available_hours, allocated_hours, created_at, updated_at)
  SELECT 
    t.id,
    to_char(CURRENT_DATE, 'YYYY-MM'),
    160,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM team_members t
  ON CONFLICT (employee_id, month) DO NOTHING
  RETURNING employee_id, month
)
SELECT 'Setup complete' as status;
