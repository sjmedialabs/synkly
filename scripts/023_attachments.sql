-- Run this script in Supabase → SQL Editor. Paste ONLY these SQL statements (not HTTP logs or terminal output).
--
-- Attachments table for projects and tasks
CREATE TABLE IF NOT EXISTS public.attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'task')),
  entity_id UUID NOT NULL,
  file_name TEXT,
  file_type TEXT,
  file_size BIGINT,
  storage_path TEXT,
  url TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON public.attachments(entity_type, entity_id);

-- Storage bucket (run via Supabase dashboard if RPC not available)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', true) ON CONFLICT DO NOTHING;
