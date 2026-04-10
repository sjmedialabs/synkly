import type { SupabaseClient } from '@supabase/supabase-js'

export type TaskAssigneeDisplay = { full_name: string | null; email: string }

/**
 * Resolve assignee display for tasks using assignee_id (team → users), seeded by an optional member list.
 */
export async function hydrateTaskAssigneesClient<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  taskRows: T[],
  memberSeed: { id: string; full_name: string | null; email: string }[],
): Promise<(T & { assignee: TaskAssigneeDisplay | null })[]> {
  const byId = new Map<string, TaskAssigneeDisplay>()
  for (const m of memberSeed) {
    byId.set(m.id, { full_name: m.full_name, email: m.email })
  }

  const ids = [...new Set(taskRows.map((t) => t.assignee_id).filter(Boolean) as string[])]
  const missing = ids.filter((id) => !byId.has(id))

  if (missing.length > 0) {
    const teamRes = await supabase.from('team').select('id, full_name, email').in('id', missing)
    for (const p of (teamRes.data || []) as { id: string; full_name: string | null; email: string | null }[]) {
      byId.set(p.id, { full_name: p.full_name ?? null, email: String(p.email || '') })
    }

    const stillMissing = missing.filter((id) => !byId.has(id))
    if (stillMissing.length > 0) {
      const usersRes = await supabase.from('users').select('id, full_name, email').in('id', stillMissing)
      for (const p of (usersRes.data || []) as { id: string; full_name: string | null; email: string | null }[]) {
        byId.set(p.id, { full_name: p.full_name ?? null, email: String(p.email || '') })
      }
    }
  }

  return taskRows.map((task) => ({
    ...task,
    assignee: task.assignee_id ? byId.get(String(task.assignee_id)) ?? null : null,
  }))
}
