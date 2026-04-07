export const ROLE_KEYS = [
  'master_admin',
  'super_admin',
  'project_manager',
  'delivery_manager',
  'team_lead',
  'senior',
  'junior',
  'trainee',
] as const

export type RoleKey = (typeof ROLE_KEYS)[number]

export const ROLE_LABELS: Record<RoleKey, string> = {
  master_admin: 'Master Admin',
  super_admin: 'Super Admin',
  project_manager: 'Project Manager',
  delivery_manager: 'Delivery Manager',
  team_lead: 'Team Lead',
  senior: 'Senior',
  junior: 'Junior',
  trainee: 'Trainee',
}

export const ROLE_PERMISSIONS: Record<RoleKey, string[]> = {
  master_admin: ['ALL'],
  super_admin: ['ALL'],
  project_manager: ['ALL'],
  delivery_manager: ['ALL'],
  team_lead: ['VIEW_TEAM_TASKS', 'ASSIGN_TASK', 'UPDATE_TASK'],
  senior: ['UPDATE_TASK'],
  junior: ['UPDATE_OWN_TASK'],
  trainee: ['VIEW_TASK'],
}

export function normalizeRole(value: string | null | undefined): RoleKey | null {
  const raw = (value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!raw) return null
  if (raw.includes('super_admin') || raw.includes('super_admin_(client_side)') || raw.includes('client_side')) {
    return 'super_admin'
  }
  if (raw.includes('master_admin')) return 'master_admin'
  if (raw.includes('project_manager')) return 'project_manager'
  if (raw.includes('delivery_manager')) return 'delivery_manager'
  if (raw.includes('team_lead')) return 'team_lead'
  if (raw === 'senior') return 'senior'
  if (raw === 'junior') return 'junior'
  if (raw === 'trainee') return 'trainee'
  return null
}

export function resolveRole(user: any): RoleKey | null {
  return normalizeRole(user?.role) || null
}

export function hasPermission(role: RoleKey | null, permission: string): boolean {
  if (!role) return false
  const perms = ROLE_PERMISSIONS[role] || []
  return perms.includes('ALL') || perms.includes(permission)
}

export function isFullAccessRole(role: RoleKey | null): boolean {
  return role === 'master_admin' || role === 'super_admin' || role === 'project_manager' || role === 'delivery_manager'
}

