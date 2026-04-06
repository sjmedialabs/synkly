-- Seed test users for each role
-- Note: These users need to be created through Supabase Auth first
-- This script assigns roles to existing auth users

-- First, let's create the test users in the public.users table
-- The passwords for all test accounts should be: TestPass123!

-- After signing up these users via the app or Supabase dashboard,
-- run this script to assign their roles:

-- Test User Credentials:
-- =====================================================
-- | Role            | Email                    | Password      |
-- |-----------------|--------------------------|---------------|
-- | Super Admin     | admin@taskflow.test      | TestPass123!  |
-- | Project Manager | pm@taskflow.test         | TestPass123!  |
-- | Team Lead       | lead@taskflow.test       | TestPass123!  |
-- | Developer       | dev@taskflow.test        | TestPass123!  |
-- | Client          | client@taskflow.test     | TestPass123!  |
-- =====================================================

-- This function will be called after users sign up to assign roles
CREATE OR REPLACE FUNCTION assign_test_user_roles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_super_admin_role_id uuid;
  v_pm_role_id uuid;
  v_lead_role_id uuid;
  v_dev_role_id uuid;
  v_client_role_id uuid;
BEGIN
  -- Get role IDs
  SELECT id INTO v_super_admin_role_id FROM public.roles WHERE name = 'super_admin';
  SELECT id INTO v_pm_role_id FROM public.roles WHERE name = 'project_manager';
  SELECT id INTO v_lead_role_id FROM public.roles WHERE name = 'team_lead';
  SELECT id INTO v_dev_role_id FROM public.roles WHERE name = 'developer';
  SELECT id INTO v_client_role_id FROM public.roles WHERE name = 'client';

  -- Update users with their respective roles based on email
  UPDATE public.users SET role_id = v_super_admin_role_id, first_name = 'Super', last_name = 'Admin'
  WHERE email = 'admin@taskflow.test';
  
  UPDATE public.users SET role_id = v_pm_role_id, first_name = 'Project', last_name = 'Manager'
  WHERE email = 'pm@taskflow.test';
  
  UPDATE public.users SET role_id = v_lead_role_id, first_name = 'Team', last_name = 'Lead'
  WHERE email = 'lead@taskflow.test';
  
  UPDATE public.users SET role_id = v_dev_role_id, first_name = 'Dev', last_name = 'Developer'
  WHERE email = 'dev@taskflow.test';
  
  UPDATE public.users SET role_id = v_client_role_id, first_name = 'Test', last_name = 'Client'
  WHERE email = 'client@taskflow.test';
END;
$$;

-- Run the function to assign roles (call this after users have signed up)
-- SELECT assign_test_user_roles();
