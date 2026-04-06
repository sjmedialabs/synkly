-- Task Management System - Capacity Management
-- This script adds employee capacity tracking and auto-update logic

-- 1. Create employee_capacity table
CREATE TABLE IF NOT EXISTS employee_capacity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'), -- Format: YYYY-MM
  available_hours DECIMAL(8,2) NOT NULL DEFAULT 160,
  allocated_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
  remaining_hours DECIMAL(8,2) GENERATED ALWAYS AS (available_hours - allocated_hours) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, month)
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_employee_capacity_employee_id ON employee_capacity(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_capacity_month ON employee_capacity(month);
CREATE INDEX IF NOT EXISTS idx_tasks_estimated_hours ON tasks(estimated_hours);

-- 3. RPC Function: Deduct capacity when task is assigned
CREATE OR REPLACE FUNCTION deduct_capacity(
  p_employee_id UUID,
  p_month TEXT,
  p_hours DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity_id UUID;
  v_available DECIMAL;
  v_allocated DECIMAL;
  v_remaining DECIMAL;
BEGIN
  -- Ensure capacity record exists for the month
  INSERT INTO employee_capacity (employee_id, month, available_hours, allocated_hours)
  VALUES (p_employee_id, p_month, 160, 0)
  ON CONFLICT (employee_id, month) DO NOTHING;

  -- Get the capacity record
  SELECT id, available_hours, allocated_hours INTO v_capacity_id, v_available, v_allocated
  FROM employee_capacity
  WHERE employee_id = p_employee_id AND month = p_month;

  -- Check if adding hours would exceed available capacity
  IF (v_allocated + p_hours) > v_available THEN
    RAISE EXCEPTION 'Insufficient capacity: available %, trying to allocate %', v_available, (v_allocated + p_hours);
  END IF;

  -- Update allocated hours
  UPDATE employee_capacity
  SET allocated_hours = allocated_hours + p_hours, updated_at = NOW()
  WHERE id = v_capacity_id;

  -- Return updated capacity
  SELECT available_hours, allocated_hours, remaining_hours
  INTO v_available, v_allocated, v_remaining
  FROM employee_capacity
  WHERE id = v_capacity_id;

  RETURN jsonb_build_object(
    'capacity_id', v_capacity_id,
    'available_hours', v_available,
    'allocated_hours', v_allocated,
    'remaining_hours', v_remaining
  );
END;
$$;

-- 4. RPC Function: Restore capacity when task is unassigned or reassigned
CREATE OR REPLACE FUNCTION restore_capacity(
  p_employee_id UUID,
  p_month TEXT,
  p_hours DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity_id UUID;
  v_available DECIMAL;
  v_allocated DECIMAL;
  v_remaining DECIMAL;
BEGIN
  -- Get the capacity record
  SELECT id, available_hours, allocated_hours INTO v_capacity_id, v_available, v_allocated
  FROM employee_capacity
  WHERE employee_id = p_employee_id AND month = p_month;

  IF v_capacity_id IS NULL THEN
    RAISE EXCEPTION 'No capacity record found for employee % in month %', p_employee_id, p_month;
  END IF;

  -- Prevent negative allocated hours
  IF (v_allocated - p_hours) < 0 THEN
    UPDATE employee_capacity
    SET allocated_hours = 0, updated_at = NOW()
    WHERE id = v_capacity_id;
  ELSE
    UPDATE employee_capacity
    SET allocated_hours = allocated_hours - p_hours, updated_at = NOW()
    WHERE id = v_capacity_id;
  END IF;

  -- Return updated capacity
  SELECT available_hours, allocated_hours, remaining_hours
  INTO v_available, v_allocated, v_remaining
  FROM employee_capacity
  WHERE id = v_capacity_id;

  RETURN jsonb_build_object(
    'capacity_id', v_capacity_id,
    'available_hours', v_available,
    'allocated_hours', v_allocated,
    'remaining_hours', v_remaining
  );
END;
$$;

-- 5. RPC Function: Get capacity for an employee for a given month
CREATE OR REPLACE FUNCTION get_capacity(
  p_employee_id UUID,
  p_month TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity employee_capacity%ROWTYPE;
BEGIN
  SELECT * INTO v_capacity
  FROM employee_capacity
  WHERE employee_id = p_employee_id AND month = p_month;

  IF v_capacity.id IS NULL THEN
    -- Return empty capacity if none exists
    RETURN jsonb_build_object(
      'available_hours', 160,
      'allocated_hours', 0,
      'remaining_hours', 160,
      'message', 'No record found, returning defaults'
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_capacity.id,
    'available_hours', v_capacity.available_hours,
    'allocated_hours', v_capacity.allocated_hours,
    'remaining_hours', v_capacity.remaining_hours,
    'month', v_capacity.month
  );
END;
$$;

-- 6. RPC Function: Recalculate all capacity for an employee (for data fixing)
CREATE OR REPLACE FUNCTION recalculate_capacity(
  p_employee_id UUID
)
RETURNS TABLE(month TEXT, allocated_hours DECIMAL, available_hours DECIMAL, remaining_hours DECIMAL)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recalculate for each month that has capacity records
  UPDATE employee_capacity ec
  SET allocated_hours = (
    SELECT COALESCE(SUM(estimated_hours), 0)
    FROM tasks
    WHERE assignee_id = p_employee_id
      AND estimated_hours > 0
      AND status NOT IN ('done', 'cancelled')
      AND date_trunc('month', CAST(due_date AS TIMESTAMP)) = date_trunc('month', CAST(ec.month || '-01' AS TIMESTAMP))
  )
  WHERE ec.employee_id = p_employee_id;

  RETURN QUERY
  SELECT ec.month, ec.allocated_hours, ec.available_hours, ec.remaining_hours
  FROM employee_capacity ec
  WHERE ec.employee_id = p_employee_id
  ORDER BY ec.month DESC;
END;
$$;

-- 7. Create trigger to auto-create capacity when task is assigned
CREATE OR REPLACE FUNCTION auto_create_capacity_on_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month TEXT;
BEGIN
  -- Only process if assignee is being set and has estimated hours
  IF NEW.assignee_id IS NOT NULL AND NEW.estimated_hours > 0 THEN
    v_month := COALESCE(
      NEW.assigned_month,
      TO_CHAR(COALESCE(NEW.due_date, CURRENT_DATE), 'YYYY-MM')
    );

    -- Ensure capacity record exists
    INSERT INTO employee_capacity (employee_id, month, available_hours, allocated_hours)
    VALUES (NEW.assignee_id, v_month, 160, 0)
    ON CONFLICT (employee_id, month) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on tasks table
DROP TRIGGER IF EXISTS trigger_auto_create_capacity ON tasks;
CREATE TRIGGER trigger_auto_create_capacity
AFTER UPDATE ON tasks
FOR EACH ROW
WHEN (OLD.assignee_id IS DISTINCT FROM NEW.assignee_id)
EXECUTE FUNCTION auto_create_capacity_on_assignment();

-- 8. Add columns to tasks table if they don't exist
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_month TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS previous_assignee_id UUID;

-- 9. Grant permissions for RPC functions
GRANT EXECUTE ON FUNCTION deduct_capacity(UUID, TEXT, DECIMAL) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restore_capacity(UUID, TEXT, DECIMAL) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_capacity(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION recalculate_capacity(UUID) TO anon, authenticated;
