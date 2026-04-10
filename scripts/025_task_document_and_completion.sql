-- Task reference document + completion timestamp (additive, idempotent).

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS document_url TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.tasks.document_url IS 'Public URL for spec / image / PDF linked to the task.';
COMMENT ON COLUMN public.tasks.completed_at IS 'When the assignee marked the task done (actual completion).';
COMMENT ON COLUMN public.tasks.end_date IS 'Target end date set by the assigner (unchanged; distinct from completed_at).';
