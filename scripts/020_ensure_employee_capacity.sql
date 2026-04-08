-- Create employee_capacity if missing (fixes "Capacity table is not available" / PostgREST PGRST205).
-- Safe to re-run.
--
-- 1) Creates the table without a foreign key first so it works even if public.users is not ready yet.
-- 2) Adds FK to public.users only when that table exists (optional integrity).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.employee_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  month TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  available_hours NUMERIC(8, 2) NOT NULL DEFAULT 160,
  allocated_hours NUMERIC(8, 2) NOT NULL DEFAULT 0,
  remaining_hours NUMERIC(8, 2) GENERATED ALWAYS AS (available_hours - allocated_hours) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, month)
);

CREATE INDEX IF NOT EXISTS idx_employee_capacity_employee_id ON public.employee_capacity(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_capacity_month ON public.employee_capacity(month);

-- Add FK when users table exists and constraint is not already there
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'users'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employee_capacity_employee_id_fkey'
  ) THEN
    ALTER TABLE public.employee_capacity
      ADD CONSTRAINT employee_capacity_employee_id_fkey
      FOREIGN KEY (employee_id)
      REFERENCES public.users(id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
