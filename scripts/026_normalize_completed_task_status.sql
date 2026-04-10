-- Map legacy/alternate "completed" statuses to canonical `done` (matches tasks CHECK + completed_at logic).
UPDATE public.tasks
SET status = 'done'
WHERE LOWER(REGEXP_REPLACE(TRIM(status), '\s+', '_', 'g')) IN ('completed', 'complete');

-- Ensure done tasks have a completion timestamp when the column exists (best-effort).
UPDATE public.tasks
SET completed_at = COALESCE(completed_at, updated_at, now())
WHERE status = 'done' AND completed_at IS NULL;
