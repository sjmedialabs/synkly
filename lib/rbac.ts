// Simplified RBAC Role System for Synkly
// Roles: master_admin, client_admin, manager, team_lead, member

export const ROLE_KEYS = [
  'master_admin',
  'client_admin', 
  'manager',
  'team_lead',
  'member',
] as const

export type RoleKey = (typeof ROLE_KEYS)[number]

export const ROLE_LABELS: Record<RoleKey, string> = {
  master_admin: 'Master Admin',
  client_admin: 'Client Admin',
  manager: 'Manager',
  team_lead: 'Team Lead',
  member: 'Team Member',
}

export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  master_admin: 'Full system access across all clients (Platform Admin)',
  client_admin: 'Full access within organization - create users, manage projects, teams, and settings (Client Admin)',
  manager: 'Create and manage projects, assign tasks within the organization',
  team_lead: 'Lead teams and assign tasks to team members',
  member: 'Work on assigned tasks and update progress',
}

export const ROLE_PERMISSIONS: Record<RoleKey, string[]> = {
  master_admin: ['ALL'],
  client_admin: [
    'ALL_CLIENT', // Full access within client scope - Client Admin for their organization
    'VIEW_ALL_CLIENTS',
    'MANAGE_OWN_CLIENT',
    'CREATE_USER',
    'UPDATE_USER',
    'DELETE_USER',
    'VIEW_USER',
    'ASSIGN_ROLE',
    'CREATE_PROJECT',
    'UPDATE_PROJECT',
    'DELETE_PROJECT',
    'VIEW_PROJECT',
    'CREATE_TEAM',
    'UPDATE_TEAM',
    'DELETE_TEAM',
    'VIEW_TEAM',
    'CREATE_TASK',
    'UPDATE_TASK',
    'DELETE_TASK',
    'VIEW_TASK',
    'ASSIGN_TASK',
    'CREATE_SPRINT',
    'UPDATE_SPRINT',
    'DELETE_SPRINT',
    'VIEW_SPRINT',
    'CREATE_MILESTONE',
    'UPDATE_MILESTONE',
    'DELETE_MILESTONE',
    'VIEW_MILESTONE',
    'MANAGE_MASTER_DATA',
    'VIEW_REPORTS',
    'EXPORT_DATA',
    'MANAGE_SETTINGS',
  ],
  manager: [
    'CREATE_PROJECT',
    'UPDATE_PROJECT',
    'DELETE_PROJECT',
    'VIEW_PROJECT',
    'CREATE_TASK',
    'UPDATE_TASK',
    'DELETE_TASK',
    'VIEW_TASK',
    'ASSIGN_TASK',
    'VIEW_USER',
    'VIEW_TEAM',
    'VIEW_REPORTS',
  ],
  team_lead: [
    'VIEW_PROJECT',
    'CREATE_TASK',
    'UPDATE_TASK',
    'VIEW_TASK',
    'ASSIGN_TASK',
    'VIEW_TEAM',
    'UPDATE_TEAM_MEMBERS',
  ],
  member: [
    'VIEW_PROJECT',
    'VIEW_TASK',
    'UPDATE_OWN_TASK',
    'CREATE_COMMENT',
    'VIEW_TEAM',
  ],
}

// Role hierarchy level (higher = more permissions)
export const ROLE_LEVELS: Record<RoleKey, number> = {
  master_admin: 100,
  client_admin: 80,
  manager: 60,
  team_lead: 40,
  member: 20,
}

export function normalizeRole(value: string | null | undefined): RoleKey | null {
  const raw = (value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!raw) return null
  
  // Direct matches
  if (raw === 'master_admin') return 'master_admin'
  if (raw === 'client_admin') return 'client_admin'
  if (raw === 'manager') return 'manager'
  if (raw === 'team_lead') return 'team_lead'
  if (raw === 'member') return 'member'
  
  // Legacy role mappings
  if (raw.includes('super_admin')) return 'master_admin'
  if (raw.includes('project_manager')) return 'manager'
  if (raw.includes('delivery_manager')) return 'manager'
  if (raw === 'employee') return 'member'
  if (raw === 'senior' || raw === 'junior' || raw === 'trainee') return 'member'
  
  return null
}

export function resolveRole(user: any): RoleKey | null {
  // Check for role name in different places
  if (user?.role_name) {
    return normalizeRole(user.role_name)
  }
  const joined = user?.roles
  const joinedName =
    joined && typeof joined === 'object' && !Array.isArray(joined)
      ? (joined as { name?: string }).name
      : Array.isArray(joined)
        ? (joined[0] as { name?: string } | undefined)?.name
        : undefined
  if (joinedName) {
    return normalizeRole(joinedName)
  }
  if (user?.role?.name) {
    return normalizeRole(user.role.name)
  }
  if (user?.role) {
    return normalizeRole(user.role)
  }
  // Last-resort inference for legacy rows where role_id/role might be missing
  // but designation contains values like "Super Admin", "Project Manager", etc.
  if (user?.designation) {
    return normalizeRole(user.designation)
  }
  return null
}

export function hasPermission(role: RoleKey | null, permission: string): boolean {
  if (!role) return false
  const perms = ROLE_PERMISSIONS[role] || []
  return perms.includes('ALL') || perms.includes(permission)
}

export function canAccessResource(userRole: RoleKey | null, requiredRole: RoleKey): boolean {
  if (!userRole) return false
  return ROLE_LEVELS[userRole] >= ROLE_LEVELS[requiredRole]
}

/** Task assignee picker: team lead and member only (exclude manager, client_admin, master_admin). */
export function isAssignableTaskRole(role: RoleKey | null): boolean {
  if (!role) return false
  return ROLE_LEVELS[role] <= ROLE_LEVELS.team_lead
}

export function isFullAccessRole(role: RoleKey | null): boolean {
  return role === 'master_admin'
}

// Client Admin is top-level admin within their client scope
export function isClientSuperAdmin(role: RoleKey | null): boolean {
  return role === 'client_admin'
}

export function isAdminRole(role: RoleKey | null): boolean {
  return role === 'master_admin' || role === 'client_admin'
}

// Check if user has full access within a client scope
export function hasFullClientAccess(role: RoleKey | null): boolean {
  return role === 'master_admin' || role === 'client_admin'
}

export function canManageUsers(role: RoleKey | null): boolean {
  return role === 'master_admin' || role === 'client_admin'
}

export function canDeleteUsers(role: RoleKey | null): boolean {
  return role === 'master_admin' || role === 'client_admin'
}

export function canAssignRoles(role: RoleKey | null): boolean {
  return role === 'master_admin' || role === 'client_admin'
}

export function canManageProjects(role: RoleKey | null): boolean {
  return role === 'master_admin' || role === 'client_admin' || role === 'manager'
}

/** Create modules under a project (not available to plain members). */
export function canCreateModules(role: RoleKey | null): boolean {
  return (
    role === 'master_admin' ||
    role === 'client_admin' ||
    role === 'manager' ||
    role === 'team_lead'
  )
}

export function canDeleteProjects(role: RoleKey | null): boolean {
  return role === 'master_admin' || role === 'client_admin' || role === 'manager'
}

export function canAssignTasks(role: RoleKey | null): boolean {
  return role === 'master_admin' || role === 'client_admin' || role === 'manager' || role === 'team_lead'
}

export function canManageMasterData(role: RoleKey | null): boolean {
  return role === 'master_admin' || role === 'client_admin'
}

export function canManageSettings(role: RoleKey | null): boolean {
  return role === 'master_admin' || role === 'client_admin'
}

export function canExportData(role: RoleKey | null): boolean {
  return role === 'master_admin' || role === 'client_admin'
}

// User type with role info
export interface UserWithRole {
  id: string
  email: string
  full_name: string | null
  role_name: RoleKey | null
  role_permissions: Record<string, any> | null
  client_id: string | null
  status: 'active' | 'inactive' | 'suspended'
}
