import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { type RoleKey, hasPermission, isFullAccessRole, isAdminRole, canManageProjects, canAssignTasks } from '@/lib/rbac'

export function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRole) throw new Error('Supabase admin credentials are missing')
  return createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export interface AuthContextResult {
  userId: string | null
  email: string | null
  role: RoleKey | null
  clientId: string | null
  /** @deprecated Use clientId instead */
  tenantId: string | null
  adminClient: ReturnType<typeof getAdminClient>
  isMasterAdmin: boolean
  isClientAdmin: boolean
}

export async function getAuthContext(): Promise<AuthContextResult> {
  const serverClient = await createServerClient()
  const adminClient = getAdminClient()
  
  const {
    data: { user },
  } = await serverClient.auth.getUser()
  
  if (!user) {
    return { 
      userId: null, 
      email: null,
      role: null, 
      clientId: null,
      tenantId: null, 
      adminClient,
      isMasterAdmin: false,
      isClientAdmin: false,
    }
  }
  
  // Fetch user with role from joined roles table
  const { data: userData } = await adminClient
    .from('users')
    .select(`
      id, 
      email,
      client_id,
      status,
      roles (name)
    `)
    .eq('id', user.id)
    .single()
  
  const roleName = (userData?.roles as any)?.name as RoleKey | null
  const clientId = userData?.client_id || null
  
  return {
    userId: user.id,
    email: userData?.email || user.email || null,
    role: roleName,
    clientId,
    tenantId: clientId, // Keep for backward compatibility
    adminClient,
    isMasterAdmin: roleName === 'master_admin',
    isClientAdmin: roleName === 'client_admin',
  }
}

export function canAccessAll(role: RoleKey | null): boolean {
  return isFullAccessRole(role) || isAdminRole(role)
}

export function can(role: RoleKey | null, permission: string): boolean {
  return hasPermission(role, permission)
}

export function canCreateProjects(role: RoleKey | null): boolean {
  return canManageProjects(role)
}

export function canAssign(role: RoleKey | null): boolean {
  return canAssignTasks(role)
}

/**
 * Check if user can access data for a specific client
 */
export function canAccessClient(authContext: AuthContextResult, targetClientId: string | null): boolean {
  // Master admin can access all clients
  if (authContext.isMasterAdmin) return true
  
  // Other users can only access their own client's data
  if (!authContext.clientId) return false
  return authContext.clientId === targetClientId
}

/**
 * Apply client filter to a Supabase query
 */
export function applyClientFilter<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  authContext: AuthContextResult,
  column = 'client_id'
): T {
  // Master admin sees all data
  if (authContext.isMasterAdmin) {
    return query
  }
  
  // Other users filtered by their client_id
  if (authContext.clientId) {
    return query.eq(column, authContext.clientId)
  }
  
  // No client_id means user can't see any client data
  // Return query that will find nothing
  return query.eq(column, '00000000-0000-0000-0000-000000000000')
}
