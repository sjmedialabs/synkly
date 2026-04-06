-- Optional: Add database-level constraint to prevent invalid assignments
-- This ensures no Super Admin or Delivery Manager can ever receive tasks

-- Create a trigger function to validate task assignments
CREATE OR REPLACE FUNCTION validate_task_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the new assignee has a restricted designation
  IF NEW.assignee_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM users
      WHERE id = NEW.assignee_id
      AND designation IN ('Super Admin', 'Delivery Manager')
    ) THEN
      RAISE EXCEPTION 'Tasks cannot be assigned to users with designation % or %', 'Super Admin', 'Delivery Manager';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS check_task_assignment ON tasks;
CREATE TRIGGER check_task_assignment
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION validate_task_assignment();

-- Verify the trigger works by testing
-- Uncomment below to test (will raise an error if assignment is attempted)
/*
-- This will raise an error:
UPDATE tasks
SET assignee_id = (SELECT id FROM users WHERE designation = 'Super Admin' LIMIT 1)
WHERE id = 'some-task-id';
*/
