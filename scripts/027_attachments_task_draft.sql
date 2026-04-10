-- Allow staging attachments before a task row exists (rich editor / file uploads on create).
ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS attachments_entity_type_check;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_entity_type_check
  CHECK (entity_type IN ('project', 'task', 'task_draft'));
