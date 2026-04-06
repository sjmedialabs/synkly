-- Create sample sprints for task assignment testing
-- This script ensures sprints exist in the database

DO $$
DECLARE
  project_id UUID;
BEGIN
  -- Find the Dashboard project
  SELECT id INTO project_id FROM projects WHERE name = 'Dashboard' LIMIT 1;
  
  IF project_id IS NOT NULL THEN
    -- Insert Sprint 1
    INSERT INTO sprint_tracking (project_id, sprint_name, start_date, end_date, status, created_at)
    VALUES (
      project_id,
      'Sprint 1 (Apr 1 - Apr 17)',
      '2026-04-01'::date,
      '2026-04-17'::date,
      'active',
      NOW()
    )
    ON CONFLICT (project_id, sprint_name) DO NOTHING;

    -- Insert Sprint 2
    INSERT INTO sprint_tracking (project_id, sprint_name, start_date, end_date, status, created_at)
    VALUES (
      project_id,
      'Sprint 2 (Apr 6 - Apr 20)',
      '2026-04-06'::date,
      '2026-04-20'::date,
      'active',
      NOW()
    )
    ON CONFLICT (project_id, sprint_name) DO NOTHING;

    -- Insert Sprint 3
    INSERT INTO sprint_tracking (project_id, sprint_name, start_date, end_date, status, created_at)
    VALUES (
      project_id,
      'Sprint 3 (Apr 21 - May 5)',
      '2026-04-21'::date,
      '2026-05-05'::date,
      'planned',
      NOW()
    )
    ON CONFLICT (project_id, sprint_name) DO NOTHING;

    RAISE NOTICE 'Sprints created for project: %', project_id;
  ELSE
    RAISE NOTICE 'Dashboard project not found';
  END IF;
END $$;
