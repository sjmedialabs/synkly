-- =============================================================================
-- Delete ALL Supabase Auth users + matching public.users rows
-- =============================================================================
-- WARNING: This removes every login account. You will need to sign up / invite
-- again. Projects, tasks, clients, etc. are mostly kept; user FKs are nulled
-- where required so the delete succeeds.
--
-- Run in: Supabase Dashboard → SQL Editor (as a role with access to auth schema).
-- Do not run from the anon key in the app.
--
-- If something still blocks the delete, read the Postgres error — it names the
-- table/constraint; add another UPDATE ... NULL or DELETE for that reference.
-- =============================================================================

BEGIN;

-- Break references from public tables to public.users (NO ACTION FKs in base schema)
UPDATE public.projects
SET
  created_by = NULL,
  project_lead_id = NULL
WHERE created_by IS NOT NULL OR project_lead_id IS NOT NULL;

UPDATE public.modules
SET created_by = NULL
WHERE created_by IS NOT NULL;

UPDATE public.tasks
SET assignee_id = NULL, reporter_id = NULL
WHERE assignee_id IS NOT NULL OR reporter_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name = 'previous_assignee_id'
  ) THEN
    UPDATE public.tasks SET previous_assignee_id = NULL WHERE previous_assignee_id IS NOT NULL;
  END IF;
END $$;

UPDATE public.documents
SET uploaded_by = NULL
WHERE uploaded_by IS NOT NULL;

-- Rows that CASCADE when users are deleted will be removed automatically:
-- project_users, comments (user_id), notifications, capacity rows with employee_id, etc.

-- Auth: delete every user (identities, sessions, refresh tokens, etc. cascade in Supabase)
DELETE FROM auth.users;

COMMIT;

-- Verify (should return 0)
-- SELECT COUNT(*) FROM auth.users;
-- SELECT COUNT(*) FROM public.users;
