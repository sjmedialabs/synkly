import {
  fetchActivePeopleForAssignment,
  filterPeopleToAssignableTaskRoles,
  type AssignmentPersonRow,
} from '@/lib/people-for-assignment'
import {
  canManageProjects,
  isFullAccessRole,
  type RoleKey,
} from '@/lib/rbac'

export function isMissingCapacityTable(
  err: { code?: string; message?: string } | null | undefined,
  tableHint: string,
) {
  if (!err) return false
  if (err.code === 'PGRST205') return true
  const m = String(err.message || '').toLowerCase()
  return m.includes(`public.${tableHint}`) || m.includes('could not find the table')
}

export type CapacityEmployee = {
  id: string
  full_name: string | null
  email: string
  division: { name: string } | null
}

export type CapacityRecordDTO = {
  id: string
  employee_id: string
  month: string
  available_hours: number
  allocated_hours: number
  remaining_hours: number
  employee: CapacityEmployee
}

function mapDivision(d: unknown): { name: string } | null {
  if (!d) return null
  if (typeof d === 'object' && d !== null && 'name' in d && typeof (d as { name: unknown }).name === 'string') {
    return { name: (d as { name: string }).name }
  }
  if (Array.isArray(d) && d[0] && typeof d[0] === 'object' && d[0] !== null && 'name' in d[0]) {
    return { name: String((d[0] as { name: string }).name) }
  }
  return null
}

/**
 * Same discovery order as task assignment: team → users (with is_active fallbacks) → Auth list.
 * Avoids empty dropdowns when `team` exists but is empty or when bare `users` queries need softer filters.
 */
export async function listEmployeesForCapacity(admin: any): Promise<CapacityEmployee[]> {
  const { rows } = await fetchActivePeopleForAssignment(admin)
  if (rows.length === 0) return []

  const userMap = await fetchUsersByIds(
    admin,
    rows.map((r) => r.id),
  )

  const list = rows.map((r) => {
    const u = userMap.get(r.id)
    return {
      id: r.id,
      full_name: r.full_name ?? u?.full_name ?? null,
      email: r.email || u?.email || '',
      division: u?.division ?? null,
    }
  })
  list.sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)))
  return list
}

/** Capacity picker: same as task assignees — team_lead and member only (not managers/admins). */
export async function filterCapacityEmployeesToLeadAndBelow(
  admin: any,
  employees: CapacityEmployee[],
): Promise<CapacityEmployee[]> {
  if (employees.length === 0) return []
  const rows: AssignmentPersonRow[] = employees.map((e) => ({
    id: e.id,
    email: e.email,
    full_name: e.full_name,
    designation: null,
    department: null,
    experience_years: null,
    reporting_manager_id: null,
    client_id: null,
  }))
  const allowed = await filterPeopleToAssignableTaskRoles(admin, rows)
  const ids = new Set(allowed.map((r) => r.id))
  return employees.filter((e) => ids.has(e.id))
}

async function mergeAuthUserProfileForCapacity(
  admin: any,
  id: string,
  cur: CapacityEmployee | undefined,
): Promise<CapacityEmployee> {
  try {
    const { data } = await admin.auth.admin.getUserById(id)
    const u = data?.user
    if (!u) {
      return (
        cur || {
          id,
          full_name: null,
          email: '',
          division: null,
        }
      )
    }
    const meta = u.user_metadata || {}
    const authName = (meta.full_name || meta.name || null) as string | null
    const authEmail = String(u.email || '')
    return {
      id,
      full_name: cur?.full_name?.trim() ? cur.full_name : authName || cur?.full_name || null,
      email: cur?.email?.trim() ? cur.email : authEmail || cur?.email || '',
      division: cur?.division ?? null,
    }
  } catch {
    return cur || { id, full_name: null, email: '', division: null }
  }
}

/** Resolve employee display fields from `users`, then Supabase Auth for ids missing or blank in DB. */
export async function fetchUsersByIds(admin: any, ids: string[]): Promise<Map<string, CapacityEmployee>> {
  const map = new Map<string, CapacityEmployee>()
  const uniq = [...new Set(ids)].filter(Boolean)
  if (uniq.length === 0) return map

  const selects = ['id, full_name, email, division:divisions(name)', 'id, full_name, email', 'id, email, full_name']
  for (const sel of selects) {
    const { data, error } = await admin.from('users').select(sel).in('id', uniq)
    if (error && isMissingCapacityTable(error, 'users')) break
    if (error?.code === 'PGRST204') continue
    if (error) continue
    for (const r of data || []) {
      const row = r as Record<string, unknown>
      map.set(String(row.id), {
        id: String(row.id),
        full_name: (row.full_name as string | null) ?? null,
        email: String(row.email || ''),
        division: mapDivision(row.division),
      })
    }
    if (map.size > 0) break
  }

  const needsAuth = uniq.filter((id) => {
    const c = map.get(id)
    return !c || !String(c.full_name || '').trim() || !String(c.email || '').trim()
  })

  await Promise.all(
    needsAuth.map(async (id) => {
      const merged = await mergeAuthUserProfileForCapacity(admin, id, map.get(id))
      map.set(id, merged)
    }),
  )

  return map
}

function dtoFromRow(r: Record<string, unknown>, employee?: CapacityEmployee | null): CapacityRecordDTO {
  const avail = Number(r.available_hours ?? 0)
  const alloc = Number(r.allocated_hours ?? 0)
  const rem = r.remaining_hours != null ? Number(r.remaining_hours) : avail - alloc
  const eid = String(r.employee_id)
  return {
    id: String(r.id),
    employee_id: eid,
    month: String(r.month),
    available_hours: avail,
    allocated_hours: alloc,
    remaining_hours: rem,
    employee:
      employee ||
      ({
        id: eid,
        full_name: null,
        email: '',
        division: null,
      } satisfies CapacityEmployee),
  }
}

export async function fetchCapacityForMonth(admin: any, month: string): Promise<CapacityRecordDTO[]> {
  const plain = await admin.from('employee_capacity').select('*').eq('month', month)
  if (plain.error && isMissingCapacityTable(plain.error, 'employee_capacity')) {
    return []
  }
  if (plain.error || !plain.data || (plain.data as unknown[]).length === 0) {
    return []
  }
  const raw = plain.data as Record<string, unknown>[]
  const userMap = await fetchUsersByIds(
    admin,
    raw.map((row) => String(row.employee_id)).filter(Boolean),
  )
  const rows = raw.map((r) => dtoFromRow(r, userMap.get(String(r.employee_id))))
  rows.sort((a, b) =>
    String(a.employee.full_name || a.employee.email).localeCompare(String(b.employee.full_name || b.employee.email)),
  )
  return rows
}

export function canManageCapacityRole(role: RoleKey | null): boolean {
  if (!role) return false
  return isFullAccessRole(role) || role === 'client_admin' || canManageProjects(role)
}
