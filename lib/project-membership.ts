import type { SupabaseClient } from '@supabase/supabase-js'

/** PostgREST / Supabase: table missing from schema cache. */
export function isMissingProjectUsersTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === 'PGRST205') return true
  const m = String(err.message || '').toLowerCase()
  return m.includes('project_users')
}

/**
 * Projects where the user has at least one assigned task (assignee_id).
 * Works without `project_users` table.
 */
export async function fetchProjectIdsFromAssignedTasks(
  adminClient: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await adminClient
    .from('tasks')
    .select('project_id')
    .eq('assignee_id', userId)
    .not('project_id', 'is', null)
  if (error || !data?.length) return []
  return [...new Set(data.map((r: { project_id: string | null }) => r.project_id).filter(Boolean) as string[])]
}
