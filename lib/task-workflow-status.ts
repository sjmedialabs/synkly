/**
 * Normalize task workflow status to canonical DB values (e.g. completed → done).
 */
export function normalizeTaskWorkflowStatus(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim()
  if (!s) return 'todo'
  const lower = s.toLowerCase().replace(/[\s-]+/g, '_')
  if (lower === 'completed' || lower === 'complete') return 'done'
  return s
}
