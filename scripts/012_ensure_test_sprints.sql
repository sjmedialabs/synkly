-- Ensure sprints exist for testing task assignment
-- This script creates test sprints if they don't exist

-- Insert test sprint for Dashboard project if it doesn't exist
INSERT INTO sprint_tracking (project_id, sprint_name, start_date, end_date, status)
SELECT 
  p.id,
  'Sprint 1 (Apr 1 - Apr 17)',
  '2026-04-01'::date,
  '2026-04-17'::date,
  'active'
FROM projects p
WHERE p.name = 'Dashboard'
  AND NOT EXISTS (
    SELECT 1 FROM sprint_tracking st 
    WHERE st.project_id = p.id 
    AND st.sprint_name = 'Sprint 1 (Apr 1 - Apr 17)'
  )
ON CONFLICT DO NOTHING;

-- Verify sprints were created
SELECT id, project_id, sprint_name, status FROM sprint_tracking LIMIT 5;
