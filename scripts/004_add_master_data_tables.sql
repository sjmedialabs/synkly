-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create designations table
CREATE TABLE IF NOT EXISTS designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Alter users table to add department_id and designation_id
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation_id uuid REFERENCES designations(id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
CREATE INDEX IF NOT EXISTS idx_designations_name ON designations(name);
CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_designation_id ON users(designation_id);

-- Insert sample data
INSERT INTO departments (name) VALUES
  ('Engineering'),
  ('Product'),
  ('Design'),
  ('Sales'),
  ('Marketing'),
  ('Human Resources'),
  ('Finance')
ON CONFLICT (name) DO NOTHING;

INSERT INTO designations (name) VALUES
  ('Senior Engineer'),
  ('Junior Engineer'),
  ('Team Lead'),
  ('Product Manager'),
  ('UX Designer'),
  ('Sales Executive'),
  ('Marketing Manager'),
  ('HR Manager'),
  ('Finance Manager'),
  ('Intern')
ON CONFLICT (name) DO NOTHING;
