-- Advanced RBAC + Organizational Hierarchy migration (additive only, backward-compatible)

-- 1. Designation-to-Role mapping table
CREATE TABLE IF NOT EXISTS designation_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designation_id UUID NOT NULL REFERENCES master_data_values(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one mapping per designation per client (NULL client = global default)
CREATE UNIQUE INDEX IF NOT EXISTS uq_designation_roles_designation_client
ON designation_roles (
  designation_id,
  COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE INDEX IF NOT EXISTS idx_designation_roles_role_id ON designation_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_designation_roles_client_id ON designation_roles(client_id);

-- 2. Ensure team table has org hierarchy columns (may already exist from earlier migrations)
DO $$
BEGIN
  -- department_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team' AND column_name = 'department_id'
  ) THEN
    ALTER TABLE team ADD COLUMN department_id UUID REFERENCES master_data_values(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_team_department_id ON team(department_id);
  END IF;

  -- division_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team' AND column_name = 'division_id'
  ) THEN
    ALTER TABLE team ADD COLUMN division_id UUID REFERENCES master_data_values(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_team_division_id ON team(division_id);
  END IF;

  -- designation_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team' AND column_name = 'designation_id'
  ) THEN
    ALTER TABLE team ADD COLUMN designation_id UUID REFERENCES master_data_values(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_team_designation_id ON team(designation_id);
  END IF;
END
$$;

-- 3. Update existing roles with granular permissions JSON structure
-- Existing roles are preserved; only the permissions column is enriched.

UPDATE roles SET permissions = '{
  "projects":  { "view": true, "create": true, "edit": true, "delete": true, "view_all": true },
  "tasks":     { "view": true, "create": true, "edit": true, "delete": true, "assign": true },
  "modules":   { "view": true, "create": true, "edit": true, "delete": true },
  "team":      { "view": true, "create": true, "edit": true, "delete": true },
  "reports":   { "view": true, "export": true },
  "settings":  { "view": true, "edit": true },
  "master_data": { "view": true, "edit": true },
  "sprints":   { "view": true, "create": true, "edit": true, "delete": true },
  "milestones": { "view": true, "create": true, "edit": true, "delete": true }
}'::jsonb
WHERE name IN ('master_admin', 'super_admin');

UPDATE roles SET permissions = '{
  "projects":  { "view": true, "create": true, "edit": true, "delete": true, "view_all": true },
  "tasks":     { "view": true, "create": true, "edit": true, "delete": true, "assign": true },
  "modules":   { "view": true, "create": true, "edit": true, "delete": true },
  "team":      { "view": true, "create": true, "edit": true, "delete": true },
  "reports":   { "view": true, "export": true },
  "settings":  { "view": true, "edit": true },
  "master_data": { "view": true, "edit": true },
  "sprints":   { "view": true, "create": true, "edit": true, "delete": true },
  "milestones": { "view": true, "create": true, "edit": true, "delete": true }
}'::jsonb
WHERE name = 'client_admin';

UPDATE roles SET permissions = '{
  "projects":  { "view": true, "create": true, "edit": true, "delete": true, "view_all": true },
  "tasks":     { "view": true, "create": true, "edit": true, "delete": true, "assign": true },
  "modules":   { "view": true, "create": true, "edit": true, "delete": true },
  "team":      { "view": true, "create": false, "edit": false, "delete": false },
  "reports":   { "view": true, "export": false },
  "settings":  { "view": false, "edit": false },
  "master_data": { "view": false, "edit": false },
  "sprints":   { "view": true, "create": true, "edit": true, "delete": false },
  "milestones": { "view": true, "create": true, "edit": true, "delete": false }
}'::jsonb
WHERE name IN ('delivery_manager', 'project_manager');

UPDATE roles SET permissions = '{
  "projects":  { "view": true, "create": true, "edit": true, "delete": true, "view_all": false },
  "tasks":     { "view": true, "create": true, "edit": true, "delete": true, "assign": true },
  "modules":   { "view": true, "create": true, "edit": true, "delete": false },
  "team":      { "view": true, "create": false, "edit": false, "delete": false },
  "reports":   { "view": true, "export": false },
  "settings":  { "view": false, "edit": false },
  "master_data": { "view": false, "edit": false },
  "sprints":   { "view": true, "create": true, "edit": true, "delete": false },
  "milestones": { "view": true, "create": true, "edit": true, "delete": false }
}'::jsonb
WHERE name = 'manager';

UPDATE roles SET permissions = '{
  "projects":  { "view": true, "create": false, "edit": false, "delete": false, "view_all": false },
  "tasks":     { "view": true, "create": true, "edit": true, "delete": false, "assign": true },
  "modules":   { "view": true, "create": true, "edit": true, "delete": false },
  "team":      { "view": true, "create": false, "edit": false, "delete": false },
  "reports":   { "view": false, "export": false },
  "settings":  { "view": false, "edit": false },
  "master_data": { "view": false, "edit": false },
  "sprints":   { "view": true, "create": false, "edit": false, "delete": false },
  "milestones": { "view": true, "create": false, "edit": false, "delete": false }
}'::jsonb
WHERE name = 'team_lead';

UPDATE roles SET permissions = '{
  "projects":  { "view": true, "create": false, "edit": false, "delete": false, "view_all": false },
  "tasks":     { "view": true, "create": false, "edit": false, "delete": false, "assign": false },
  "modules":   { "view": true, "create": false, "edit": false, "delete": false },
  "team":      { "view": true, "create": false, "edit": false, "delete": false },
  "reports":   { "view": false, "export": false },
  "settings":  { "view": false, "edit": false },
  "master_data": { "view": false, "edit": false },
  "sprints":   { "view": true, "create": false, "edit": false, "delete": false },
  "milestones": { "view": false, "create": false, "edit": false, "delete": false }
}'::jsonb
WHERE name IN ('employee', 'member');

-- 4. RLS policy for designation_roles (follow existing multi-tenant pattern)
ALTER TABLE designation_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "designation_roles_select" ON designation_roles
  FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "designation_roles_insert" ON designation_roles
  FOR INSERT WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "designation_roles_update" ON designation_roles
  FOR UPDATE USING (true);

CREATE POLICY IF NOT EXISTS "designation_roles_delete" ON designation_roles
  FOR DELETE USING (true);
