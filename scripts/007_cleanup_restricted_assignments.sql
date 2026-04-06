-- Script to find and clean up invalid task assignments
-- Run this to find tasks assigned to Super Admin or Delivery Manager

-- Step 1: Find all invalid assignments
SELECT 
  t.id,
  t.title,
  u.full_name,
  u.email,
  u.designation,
  t.sprint_id,
  t.status
FROM tasks t
JOIN users u ON t.assignee_id = u.id
WHERE u.designation IN ('Super Admin', 'Delivery Manager');

-- Step 2: Optional - Unassign these tasks
-- Uncomment the following query to unassign these tasks:
/*
UPDATE tasks
SET assignee_id = NULL, assigned_month = NULL
WHERE assignee_id IN (
  SELECT id FROM users 
  WHERE designation IN ('Super Admin', 'Delivery Manager')
);
*/

-- Step 3: Optional - If you want to reassign to a specific project manager
-- First create a mapping of invalid assignments
-- Then run UPDATE with new assignee_id
