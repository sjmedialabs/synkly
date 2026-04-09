-- Ensure designation -> role mapping table exists (safe, additive).
-- Run this in Supabase SQL Editor if /api/designation-roles returns 503.

CREATE TABLE IF NOT EXISTS public.designation_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designation_id UUID NOT NULL REFERENCES public.master_data_values(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  client_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK to clients only when clients table exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clients'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'designation_roles'
      AND tc.constraint_name = 'designation_roles_client_id_fkey'
  ) THEN
    ALTER TABLE public.designation_roles
      ADD CONSTRAINT designation_roles_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- One mapping per designation per client (NULL client = global default).
CREATE UNIQUE INDEX IF NOT EXISTS uq_designation_roles_designation_client
ON public.designation_roles (
  designation_id,
  COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE INDEX IF NOT EXISTS idx_designation_roles_designation_id
  ON public.designation_roles(designation_id);
CREATE INDEX IF NOT EXISTS idx_designation_roles_role_id
  ON public.designation_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_designation_roles_client_id
  ON public.designation_roles(client_id);
