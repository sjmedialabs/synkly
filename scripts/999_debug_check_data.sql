-- Check and add sample sprint data if needed
-- First, let's see what projects exist
SELECT id, name FROM projects LIMIT 5;

-- Check if there are any sprints
SELECT id, sprint_name, project_id, status FROM sprint_tracking LIMIT 10;

-- Check if there are team members
SELECT id, full_name, email, is_active, designation FROM users WHERE is_active = true LIMIT 10;

-- Check project_users assignments
SELECT project_id, user_id FROM project_users LIMIT 10;

-- Check employee_capacity
SELECT employee_id, month, available_hours, allocated_hours FROM employee_capacity LIMIT 10;
