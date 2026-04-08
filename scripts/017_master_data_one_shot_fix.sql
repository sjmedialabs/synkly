-- =============================================================================
-- ONE-SHOT MASTER DATA + USER ALIGNMENT FIX (idempotent)
-- Run in Supabase SQL Editor once.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Core master-data tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_data_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.master_data_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id uuid REFERENCES public.master_data_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_id uuid NULL,
  tenant_id uuid NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mdv_type_id ON public.master_data_values(type_id);
CREATE INDEX IF NOT EXISTS idx_mdv_parent_id ON public.master_data_values(parent_id);
CREATE INDEX IF NOT EXISTS idx_mdv_tenant_id ON public.master_data_values(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mdv_is_active ON public.master_data_values(is_active);

-- Ensure duplicate values are prevented per type (case-insensitive).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'master_data_values_type_name_key'
      AND conrelid = 'public.master_data_values'::regclass
  ) THEN
    ALTER TABLE public.master_data_values
      ADD CONSTRAINT master_data_values_type_name_key UNIQUE (type_id, name);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Required master-data types
-- ---------------------------------------------------------------------------
INSERT INTO public.master_data_types (name) VALUES
  ('department'),
  ('designation'),
  ('division'),
  ('task_status'),
  ('priority'),
  ('phase')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) Mandatory seed values
-- ---------------------------------------------------------------------------
INSERT INTO public.master_data_values (name, type_id, is_active)
SELECT 'Design', id, true FROM public.master_data_types WHERE name = 'department'
ON CONFLICT (type_id, name) DO NOTHING;

INSERT INTO public.master_data_values (name, type_id, is_active)
SELECT 'Development', id, true FROM public.master_data_types WHERE name = 'department'
ON CONFLICT (type_id, name) DO NOTHING;

INSERT INTO public.master_data_values (name, type_id, is_active)
SELECT 'Super Admin', id, true FROM public.master_data_types WHERE name = 'designation'
ON CONFLICT (type_id, name) DO NOTHING;

INSERT INTO public.master_data_values (name, type_id, is_active)
SELECT 'Project Manager', id, true FROM public.master_data_types WHERE name = 'designation'
ON CONFLICT (type_id, name) DO NOTHING;

INSERT INTO public.master_data_values (name, type_id, is_active)
SELECT 'Delivery Manager', id, true FROM public.master_data_types WHERE name = 'designation'
ON CONFLICT (type_id, name) DO NOTHING;

INSERT INTO public.master_data_values (name, type_id, is_active)
SELECT 'Team Lead', id, true FROM public.master_data_types WHERE name = 'designation'
ON CONFLICT (type_id, name) DO NOTHING;

INSERT INTO public.master_data_values (name, type_id, is_active)
SELECT 'Employee', id, true FROM public.master_data_types WHERE name = 'designation'
ON CONFLICT (type_id, name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4) Align app person table (supports BOTH schemas: users or team)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS department_id uuid,
      ADD COLUMN IF NOT EXISTS division_id uuid,
      ADD COLUMN IF NOT EXISTS designation_id uuid;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'users_department_id_fkey'
        AND conrelid = 'public.users'::regclass
    ) THEN
      ALTER TABLE public.users
        ADD CONSTRAINT users_department_id_fkey
        FOREIGN KEY (department_id) REFERENCES public.master_data_values(id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'users_division_id_fkey'
        AND conrelid = 'public.users'::regclass
    ) THEN
      ALTER TABLE public.users
        ADD CONSTRAINT users_division_id_fkey
        FOREIGN KEY (division_id) REFERENCES public.master_data_values(id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'users_designation_id_fkey'
        AND conrelid = 'public.users'::regclass
    ) THEN
      ALTER TABLE public.users
        ADD CONSTRAINT users_designation_id_fkey
        FOREIGN KEY (designation_id) REFERENCES public.master_data_values(id);
    END IF;
  END IF;

  IF to_regclass('public.team') IS NOT NULL THEN
    ALTER TABLE public.team
      ADD COLUMN IF NOT EXISTS department_id uuid,
      ADD COLUMN IF NOT EXISTS division_id uuid,
      ADD COLUMN IF NOT EXISTS designation_id uuid;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'team_department_id_fkey'
        AND conrelid = 'public.team'::regclass
    ) THEN
      ALTER TABLE public.team
        ADD CONSTRAINT team_department_id_fkey
        FOREIGN KEY (department_id) REFERENCES public.master_data_values(id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'team_division_id_fkey'
        AND conrelid = 'public.team'::regclass
    ) THEN
      ALTER TABLE public.team
        ADD CONSTRAINT team_division_id_fkey
        FOREIGN KEY (division_id) REFERENCES public.master_data_values(id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'team_designation_id_fkey'
        AND conrelid = 'public.team'::regclass
    ) THEN
      ALTER TABLE public.team
        ADD CONSTRAINT team_designation_id_fkey
        FOREIGN KEY (designation_id) REFERENCES public.master_data_values(id);
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Backfill missing designation to Employee (users/team if present)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    UPDATE public.users
    SET designation_id = (
      SELECT mdv.id
      FROM public.master_data_values mdv
      JOIN public.master_data_types mdt ON mdt.id = mdv.type_id
      WHERE mdt.name = 'designation' AND mdv.name = 'Employee'
      LIMIT 1
    )
    WHERE designation_id IS NULL;
  END IF;

  IF to_regclass('public.team') IS NOT NULL THEN
    UPDATE public.team
    SET designation_id = (
      SELECT mdv.id
      FROM public.master_data_values mdv
      JOIN public.master_data_types mdt ON mdt.id = mdv.type_id
      WHERE mdt.name = 'designation' AND mdv.name = 'Employee'
      LIMIT 1
    )
    WHERE designation_id IS NULL;
  END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- 6) Verify
-- ---------------------------------------------------------------------------
SELECT id, name FROM public.master_data_types ORDER BY name;
SELECT id, type_id, name, parent_id, tenant_id, is_active
FROM public.master_data_values
ORDER BY name;
