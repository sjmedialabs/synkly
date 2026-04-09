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

/** Returns true for roles that can access all data within their client scope (admin + manager). */
export function canAccessClientScope(role: RoleKey | null): boolean {
  return role === 'master_admin' || role === 'client_admin' || role === 'manager'
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

// ─── Granular Permission System (extends existing RBAC) ───

/** Module × action permission map stored in roles.permissions JSONB */
export type PermissionMap = Record<string, Record<string, boolean>>

/** All modules that can appear in the granular permissions JSON */
export const PERMISSION_MODULES = [
  'projects',
  'tasks',
  'modules',
  'team',
  'reports',
  'settings',
  'master_data',
  'sprints',
  'milestones',
] as const

export type PermissionModule = (typeof PERMISSION_MODULES)[number]

/** Actions per module (superset — not every module uses every action) */
export const PERMISSION_ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'assign',
  'export',
  'view_all',
] as const

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

/** Default granular permissions per role (mirrors the DB seed) */
export const DEFAULT_GRANULAR_PERMISSIONS: Record<RoleKey, PermissionMap> = {
  master_admin: Object.fromEntries(
    PERMISSION_MODULES.map((m) => [m, Object.fromEntries(PERMISSION_ACTIONS.map((a) => [a, true]))]),
  ),
  client_admin: Object.fromEntries(
    PERMISSION_MODULES.map((m) => [m, Object.fromEntries(PERMISSION_ACTIONS.map((a) => [a, true]))]),
  ),
  manager: {
    projects:   { view: true, create: true, edit: true, delete: true, assign: false, export: false, view_all: false },
    tasks:      { view: true, create: true, edit: true, delete: true, assign: true, export: false, view_all: false },
    modules:    { view: true, create: true, edit: true, delete: false, assign: false, export: false, view_all: false },
    team:       { view: true, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    reports:    { view: true, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    settings:   { view: false, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    master_data:{ view: false, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    sprints:    { view: true, create: true, edit: true, delete: false, assign: false, export: false, view_all: false },
    milestones: { view: true, create: true, edit: true, delete: false, assign: false, export: false, view_all: false },
  },
  team_lead: {
    projects:   { view: true, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    tasks:      { view: true, create: true, edit: true, delete: false, assign: true, export: false, view_all: false },
    modules:    { view: true, create: true, edit: true, delete: false, assign: false, export: false, view_all: false },
    team:       { view: true, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    reports:    { view: false, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    settings:   { view: false, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    master_data:{ view: false, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    sprints:    { view: true, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    milestones: { view: true, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
  },
  member: {
    projects:   { view: true, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    tasks:      { view: true, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    modules:    { view: true, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    team:       { view: true, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    reports:    { view: false, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    settings:   { view: false, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    master_data:{ view: false, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    sprints:    { view: true, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
    milestones: { view: false, create: false, edit: false, delete: false, assign: false, export: false, view_all: false },
  },
}

/**
 * Check a granular permission from the roles.permissions JSONB.
 * Returns undefined if the permission map doesn't contain the module/action
 * (caller should fall back to legacy check).
 */
export function hasGranularPermission(
  permissions: PermissionMap | null | undefined,
  module: string,
  action: string,
): boolean | undefined {
  if (!permissions || typeof permissions !== 'object') return undefined
  const mod = permissions[module]
  if (!mod || typeof mod !== 'object') return undefined
  const val = mod[action]
  if (typeof val !== 'boolean') return undefined
  return val
}

/**
 * Unified permission check: granular JSON first, then legacy ROLE_PERMISSIONS fallback.
 */
export function checkPermission(
  role: RoleKey | null,
  rolePermissionsJson: PermissionMap | null | undefined,
  module: string,
  action: string,
): boolean {
  // 1. Try granular JSON from the DB
  const granular = hasGranularPermission(rolePermissionsJson, module, action)
  if (granular !== undefined) return granular

  // 2. Try default granular for this role
  if (role) {
    const defaults = DEFAULT_GRANULAR_PERMISSIONS[role]
    const defaultGranular = hasGranularPermission(defaults, module, action)
    if (defaultGranular !== undefined) return defaultGranular
  }

  // 3. Fall back to legacy permission strings
  if (!role) return false
  const legacyMap: Record<string, string> = {
    'projects.view': 'VIEW_PROJECT',
    'projects.create': 'CREATE_PROJECT',
    'projects.edit': 'UPDATE_PROJECT',
    'projects.delete': 'DELETE_PROJECT',
    'tasks.view': 'VIEW_TASK',
    'tasks.create': 'CREATE_TASK',
    'tasks.edit': 'UPDATE_TASK',
    'tasks.delete': 'DELETE_TASK',
    'tasks.assign': 'ASSIGN_TASK',
    'team.view': 'VIEW_TEAM',
    'team.create': 'CREATE_USER',
    'team.edit': 'UPDATE_USER',
    'team.delete': 'DELETE_USER',
    'reports.view': 'VIEW_REPORTS',
    'reports.export': 'EXPORT_DATA',
    'settings.view': 'MANAGE_SETTINGS',
    'settings.edit': 'MANAGE_SETTINGS',
    'master_data.view': 'MANAGE_MASTER_DATA',
    'master_data.edit': 'MANAGE_MASTER_DATA',
  }
  const legacyPerm = legacyMap[`${module}.${action}`]
  if (legacyPerm) return hasPermission(role, legacyPerm)
  return false
}
