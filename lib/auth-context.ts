import { createClient } from '@/lib/supabase/server'
import { type RoleKey, ROLE_PERMISSIONS, ROLE_LEVELS, type UserWithRole } from '@/lib/rbac'

export interface AuthContext {
  user: UserWithRole | null
  isAuthenticated: boolean
  role: RoleKey | null
  clientId: string | null
  hasPermission: (permission: string) => boolean
  canAccessResource: (requiredRole: RoleKey) => boolean
  isMasterAdmin: () => boolean
  isClientAdmin: () => boolean
  isManager: () => boolean
  isTeamLead: () => boolean
}

/**
 * Get the current authenticated user with role information
 * Use this in Server Components and Server Actions
 */
export async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createClient()
  
  const { data: { user: authUser } } = await supabase.auth.getUser()
  
  if (!authUser) {
    return createEmptyAuthContext()
  }
  
  // Fetch user profile with role
  const { data: userData } = await supabase
    .from('team')
    .select(`
      id,
      email,
      full_name,
      client_id,
      status,
      roles (
        name,
        permissions
      )
    `)
    .eq('id', authUser.id)
    .single()
  
  if (!userData || userData.status !== 'active') {
    return createEmptyAuthContext()
  }
  
  const roleName = (userData.roles as any)?.name as RoleKey | undefined
  const rolePermissions = (userData.roles as any)?.permissions || null
  
  const user: UserWithRole = {
    id: userData.id,
    email: userData.email,
    full_name: userData.full_name,
    role_name: roleName || null,
    role_permissions: rolePermissions,
    client_id: userData.client_id,
    status: userData.status as 'active' | 'inactive' | 'suspended',
  }
  
  return createAuthContext(user)
}

function createEmptyAuthContext(): AuthContext {
  return {
    user: null,
    isAuthenticated: false,
    role: null,
    clientId: null,
    hasPermission: () => false,
    canAccessResource: () => false,
    isMasterAdmin: () => false,
    isClientAdmin: () => false,
    isManager: () => false,
    isTeamLead: () => false,
  }
}

function createAuthContext(user: UserWithRole): AuthContext {
  const role = user.role_name
  
  const hasPermission = (permission: string): boolean => {
    if (!role) return false
    const perms = ROLE_PERMISSIONS[role] || []
    return perms.includes('ALL') || perms.includes(permission)
  }
  
  const canAccessResource = (requiredRole: RoleKey): boolean => {
    if (!role) return false
    return ROLE_LEVELS[role] >= ROLE_LEVELS[requiredRole]
  }
  
  return {
    user,
    isAuthenticated: true,
    role,
    clientId: user.client_id,
    hasPermission,
    canAccessResource,
    isMasterAdmin: () => role === 'master_admin',
    isClientAdmin: () => role === 'client_admin',
    isManager: () => role === 'manager',
    isTeamLead: () => role === 'team_lead',
  }
}

/**
 * Require authentication - throws redirect if not authenticated
 */
export async function requireAuth(): Promise<AuthContext> {
  const context = await getAuthContext()
  
  if (!context.isAuthenticated) {
    throw new Error('UNAUTHORIZED')
  }
  
  return context
}

/**
 * Require specific role or higher
 */
export async function requireRole(requiredRole: RoleKey): Promise<AuthContext> {
  const context = await requireAuth()
  
  if (!context.canAccessResource(requiredRole)) {
    throw new Error('FORBIDDEN')
  }
  
  return context
}

/**
 * Require admin access (master_admin or client_admin)
 */
export async function requireAdmin(): Promise<AuthContext> {
  const context = await requireAuth()
  
  if (!context.isMasterAdmin() && !context.isClientAdmin()) {
    throw new Error('FORBIDDEN')
  }
  
  return context
}

/**
 * Require master admin access
 */
export async function requireMasterAdmin(): Promise<AuthContext> {
  const context = await requireAuth()
  
  if (!context.isMasterAdmin()) {
    throw new Error('FORBIDDEN')
  }
  
  return context
}
