-- Multi-tenant + hierarchy migration (safe additive changes)

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE master_data_values
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES master_data_values(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Ensure required types exist (role retained for backward compatibility)
INSERT INTO master_data_types (name) VALUES
  ('department'),
  ('division'),
  ('designation')
ON CONFLICT (name) DO NOTHING;

-- Team/user tenant + hierarchy references (additive only)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES master_data_values(id) ON DELETE SET NULL;

-- department_id / designation_id may already exist from previous migration
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES master_data_values(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS designation_id UUID REFERENCES master_data_values(id) ON DELETE SET NULL;

-- Case-insensitive duplicate prevention per type + tenant + parent
CREATE UNIQUE INDEX IF NOT EXISTS uq_master_values_tenant_parent_lower_name
ON master_data_values (
  type_id,
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(name)
);

CREATE INDEX IF NOT EXISTS idx_master_data_values_parent_id ON master_data_values(parent_id);
CREATE INDEX IF NOT EXISTS idx_master_data_values_tenant_id ON master_data_values(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_department_id_mdv ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_division_id_mdv ON users(division_id);
CREATE INDEX IF NOT EXISTS idx_users_designation_id_mdv ON users(designation_id);
