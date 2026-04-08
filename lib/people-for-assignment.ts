/**
 * Load people for task assignment. Order: `team` → `users` → Supabase Auth users.
 * Empty `team` still tries `users` and Auth. Relaxes `is_active` when needed.
 */

import { isAssignableTaskRole, normalizeRole, resolveRole, type RoleKey } from '@/lib/rbac'

export type PeopleSource = 'team' | 'users' | 'auth'

export type AssignmentPersonRow = {
  id: string
  email: string
  full_name: string | null
  designation: unknown
  department: unknown
  experience_years: number | null
  reporting_manager_id: string | null
  client_id: string | null
}

const TEAM_COLS =
  'id, email, full_name, designation, department, experience_years, reporting_manager_id, client_id'

const USER_SELECTS = [
  'id, email, full_name, designation, department, experience_years, reporting_manager_id, client_id',
  'id, email, full_name, designation, department, experience_years',
  'id, email, full_name',
]

function isMissingTable(err: { code?: string; message?: string } | null, tableHint: string) {
  if (!err) return false
  if (err.code === 'PGRST205') return true
  const m = String(err.message || '').toLowerCase()
  return m.includes(`public.${tableHint}`) || m.includes('could not find the table')
}

function normalizeUserRows(rows: Record<string, unknown>[]): AssignmentPersonRow[] {
  return rows.map((u) => ({
    id: String(u.id),
    email: String(u.email || ''),
    full_name: (u.full_name as string | null) ?? null,
    designation: u.designation ?? null,
    department: u.department ?? null,
    experience_years: (u.experience_years as number | null) ?? null,
    reporting_manager_id: (u.reporting_manager_id as string | null) ?? null,
    client_id: (u.client_id as string | null) ?? null,
  }))
}

async function listPeopleFromAuthAdmin(adminClient: any): Promise<AssignmentPersonRow[]> {
  try {
    const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error || !data?.users?.length) return []
    return data.users.map((u: any) => {
      const meta = u.user_metadata || {}
      return {
        id: u.id,
        email: String(u.email || ''),
        full_name: (meta.full_name || meta.name || null) as string | null,
        designation: null,
        department: null,
        experience_years: null,
        reporting_manager_id: null,
        client_id: typeof meta.client_id === 'string' ? meta.client_id : null,
      }
    })
  } catch {
    return []
  }
}

async function loadFromTeam(adminClient: any): Promise<AssignmentPersonRow[] | null> {
  const variants = [
    () => adminClient.from('team').select(TEAM_COLS).eq('is_active', true),
    () => adminClient.from('team').select(TEAM_COLS).or('is_active.is.null,is_active.eq.true'),
    () => adminClient.from('team').select(TEAM_COLS),
  ]
  let tableMissing = false
  for (const build of variants) {
    const { data, error } = await build()
    if (error) {
      if (isMissingTable(error, 'team')) {
        tableMissing = true
        break
      }
      continue
    }
    if (Array.isArray(data) && data.length > 0) {
      return normalizeUserRows(data as Record<string, unknown>[])
    }
  }
  if (tableMissing) return null
  return []
}

async function loadFromUsersTable(adminClient: any): Promise<AssignmentPersonRow[] | null> {
  let tableMissing = false
  outer: for (const cols of USER_SELECTS) {
    const variants = [
      () => adminClient.from('users').select(cols).eq('is_active', true),
      () => adminClient.from('users').select(cols).or('is_active.is.null,is_active.eq.true'),
      () => adminClient.from('users').select(cols),
    ]
    for (const build of variants) {
      const { data, error } = await build()
      if (error) {
        if (isMissingTable(error, 'users')) {
          tableMissing = true
          break outer
        }
        continue
      }
      if (Array.isArray(data) && data.length > 0) {
        return normalizeUserRows(data as Record<string, unknown>[])
      }
    }
  }
  if (tableMissing) return null
  return []
}

/** @returns Always an object. Uses Auth users when DB tables are empty or absent. */
export async function fetchActivePeopleForAssignment(adminClient: any): Promise<{
  rows: AssignmentPersonRow[]
  source: PeopleSource
}> {
  const fromTeam = await loadFromTeam(adminClient)
  if (fromTeam && fromTeam.length > 0) {
    return { rows: fromTeam, source: 'team' }
  }

  const fromUsers = await loadFromUsersTable(adminClient)
  if (fromUsers && fromUsers.length > 0) {
    return { rows: fromUsers, source: 'users' }
  }

  const fromAuth = await listPeopleFromAuthAdmin(adminClient)
  if (fromAuth.length > 0) {
    return { rows: fromAuth, source: 'auth' }
  }

  return { rows: [], source: 'auth' }
}

export function isLoosePeopleHierarchy(source: PeopleSource): boolean {
  return source === 'users' || source === 'auth'
}

const PEOPLE_ROLE_SELECTS = [
  'id, role, designation, roles (name), role_id, roles:role_id (name)',
  'id, role, designation, roles (name)',
  'id, designation',
]

async function batchResolveRoles(adminClient: any, ids: string[]): Promise<Map<string, RoleKey | null>> {
  const roleById = new Map<string, RoleKey | null>()
  for (const id of ids) roleById.set(id, null)
  if (ids.length === 0) return roleById

  const ingest = (rows: Record<string, unknown>[]) => {
    for (const u of rows) {
      const id = String(u.id)
      const r = resolveRole(u)
      if (r) roleById.set(id, r)
    }
  }

  const loadTable = async (table: string) => {
    let sawMissing = false
    for (const sel of PEOPLE_ROLE_SELECTS) {
      const { data, error } = await adminClient.from(table).select(sel).in('id', ids)
      if (error) {
        if (isMissingTable(error, table)) {
          sawMissing = true
          break
        }
        continue
      }
      ingest((data || []) as Record<string, unknown>[])
    }
    return !sawMissing
  }

  await loadTable('team')
  await loadTable('users')

  const missing = ids.filter((id) => roleById.get(id) == null)
  await Promise.all(
    missing.map(async (id) => {
      try {
        const { data } = await adminClient.auth.admin.getUserById(id)
        const meta = data?.user?.user_metadata || {}
        const r = normalizeRole(meta.role as string)
        if (r) roleById.set(id, r)
      } catch {
        /* ignore */
      }
    }),
  )

  return roleById
}

/** Keep only users at team_lead level or below (team_lead, member — not manager or admins). */
export async function filterPeopleToAssignableTaskRoles(
  adminClient: any,
  rows: AssignmentPersonRow[],
): Promise<AssignmentPersonRow[]> {
  if (rows.length === 0) return []
  const ids = [...new Set(rows.map((r) => r.id))]
  const roleById = await batchResolveRoles(adminClient, ids)
  return rows.filter((row) => isAssignableTaskRole(roleById.get(row.id) ?? null))
}

/** Resolved role for one user (team → users → Auth metadata), for assign API enforcement. */
export async function resolveAssignmentPersonRole(
  adminClient: any,
  userId: string,
): Promise<RoleKey | null> {
  const m = await batchResolveRoles(adminClient, [userId])
  return m.get(userId) ?? null
}
