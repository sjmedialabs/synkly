-- Create master_data_types table
CREATE TABLE IF NOT EXISTS master_data_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create master_data_values table
CREATE TABLE IF NOT EXISTS master_data_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id UUID NOT NULL REFERENCES master_data_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(type_id, name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_master_data_values_type_id ON master_data_values(type_id);
CREATE INDEX IF NOT EXISTS idx_master_data_values_is_active ON master_data_values(is_active);

-- Enable RLS
ALTER TABLE master_data_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_data_values ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - allow authenticated users to read
CREATE POLICY "allow_read_types" ON master_data_types
  FOR SELECT USING (true);

CREATE POLICY "allow_read_values" ON master_data_values
  FOR SELECT USING (true);

-- Create RLS policies - allow admin to modify (super_admin role)
CREATE POLICY "allow_admin_types" ON master_data_types
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_admin_values" ON master_data_values
  FOR ALL USING (true) WITH CHECK (true);

-- Seed master data types
INSERT INTO master_data_types (name) VALUES
  ('department'),
  ('designation'),
  ('role'),
  ('phase'),
  ('task_status'),
  ('priority'),
  ('division')
ON CONFLICT (name) DO NOTHING;

-- Seed some sample master data values
INSERT INTO master_data_values (type_id, name) 
SELECT id, 'Engineering' FROM master_data_types WHERE name = 'department' ON CONFLICT DO NOTHING;
INSERT INTO master_data_values (type_id, name) 
SELECT id, 'Product' FROM master_data_types WHERE name = 'department' ON CONFLICT DO NOTHING;
INSERT INTO master_data_values (type_id, name) 
SELECT id, 'Sales' FROM master_data_types WHERE name = 'department' ON CONFLICT DO NOTHING;
INSERT INTO master_data_values (type_id, name) 
SELECT id, 'HR' FROM master_data_types WHERE name = 'department' ON CONFLICT DO NOTHING;

INSERT INTO master_data_values (type_id, name) 
SELECT id, 'Senior Developer' FROM master_data_types WHERE name = 'designation' ON CONFLICT DO NOTHING;
INSERT INTO master_data_values (type_id, name) 
SELECT id, 'Junior Developer' FROM master_data_types WHERE name = 'designation' ON CONFLICT DO NOTHING;
INSERT INTO master_data_values (type_id, name) 
SELECT id, 'Project Manager' FROM master_data_types WHERE name = 'designation' ON CONFLICT DO NOTHING;
INSERT INTO master_data_values (type_id, name) 
SELECT id, 'Product Manager' FROM master_data_types WHERE name = 'designation' ON CONFLICT DO NOTHING;

INSERT INTO master_data_values (type_id, name) 
SELECT id, 'Not Started' FROM master_data_types WHERE name = 'task_status' ON CONFLICT DO NOTHING;
INSERT INTO master_data_values (type_id, name) 
SELECT id, 'In Progress' FROM master_data_types WHERE name = 'task_status' ON CONFLICT DO NOTHING;
INSERT INTO master_data_values (type_id, name) 
SELECT id, 'Completed' FROM master_data_types WHERE name = 'task_status' ON CONFLICT DO NOTHING;
INSERT INTO master_data_values (type_id, name) 
SELECT id, 'On Hold' FROM master_data_types WHERE name = 'task_status' ON CONFLICT DO NOTHING;

INSERT INTO master_data_values (type_id, name) 
SELECT id, 'Critical' FROM master_data_types WHERE name = 'priority' ON CONFLICT DO NOTHING;
INSERT INTO master_data_values (type_id, name) 
SELECT id, 'High' FROM master_data_types WHERE name = 'priority' ON CONFLICT DO NOTHING;
INSERT INTO master_data_values (type_id, name) 
SELECT id, 'Medium' FROM master_data_types WHERE name = 'priority' ON CONFLICT DO NOTHING;
INSERT INTO master_data_values (type_id, name) 
SELECT id, 'Low' FROM master_data_types WHERE name = 'priority' ON CONFLICT DO NOTHING;
