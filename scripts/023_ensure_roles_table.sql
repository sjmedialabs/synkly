-- Ensure public.roles exists and contains built-in roles.
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roles_name ON public.roles(name);

INSERT INTO public.roles (name, description, permissions)
VALUES
  ('master_admin', 'Platform administrator', '{}'::jsonb),
  ('client_admin', 'Client administrator', '{}'::jsonb),
  ('manager', 'Project manager', '{}'::jsonb),
  ('team_lead', 'Team lead', '{}'::jsonb),
  ('member', 'Team member', '{}'::jsonb)
ON CONFLICT (name) DO NOTHING;
