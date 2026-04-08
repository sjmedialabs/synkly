import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { type RoleKey, ROLE_LEVELS } from '@/lib/rbac'

export interface ApiAuthContext {
  userId: string
  email: string
  role: RoleKey | null
  clientId: string | null
  isMasterAdmin: boolean
  isClientAdmin: boolean
}

/**
 * Authenticate API request and return user context
 */
export async function authenticateRequest(): Promise<ApiAuthContext | NextResponse> {
  const supabase = await createClient()
  
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !authUser) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }
  
  // Fetch user profile with role
  const { data: userData, error: userError } = await supabase
    .from('team')
    .select(`
      id,
      email,
      client_id,
      status,
      roles (name)
    `)
    .eq('id', authUser.id)
    .single()
  
  if (userError || !userData) {
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 401 }
    )
  }
  
  if (userData.status !== 'active') {
    return NextResponse.json(
      { error: 'Account is not active' },
      { status: 403 }
    )
  }
  
  const roleName = (userData.roles as any)?.name as RoleKey | null
  
  return {
    userId: userData.id,
    email: userData.email,
    role: roleName,
    clientId: userData.client_id,
    isMasterAdmin: roleName === 'master_admin',
    isClientAdmin: roleName === 'client_admin',
  }
}

/**
 * Check if user has required role level
 */
export function hasRoleLevel(userRole: RoleKey | null, requiredRole: RoleKey): boolean {
  if (!userRole) return false
  return ROLE_LEVELS[userRole] >= ROLE_LEVELS[requiredRole]
}

/**
 * Create unauthorized response
 */
export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 })
}

/**
 * Create forbidden response
 */
export function forbidden(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 })
}

/**
 * Create bad request response
 */
export function badRequest(message = 'Bad Request') {
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * Create not found response
 */
export function notFound(message = 'Not Found') {
  return NextResponse.json({ error: message }, { status: 404 })
}

/**
 * Create success response
 */
export function success<T>(data: T) {
  return NextResponse.json(data)
}

/**
 * Create server error response
 */
export function serverError(message = 'Internal Server Error') {
  return NextResponse.json({ error: message }, { status: 500 })
}

/**
 * Helper to filter data by client_id for multi-tenant queries
 */
export function applyClientFilter<T extends { client_id?: string | null }>(
  data: T[],
  authContext: ApiAuthContext
): T[] {
  // Master admin sees all data
  if (authContext.isMasterAdmin) {
    return data
  }
  
  // Other users only see data from their client
  if (!authContext.clientId) {
    return []
  }
  
  return data.filter(item => item.client_id === authContext.clientId)
}

/**
 * Build a WHERE clause for client filtering in raw SQL
 */
export function getClientWhereClause(authContext: ApiAuthContext, columnAlias = 'client_id'): string {
  if (authContext.isMasterAdmin) {
    return ''
  }
  
  if (!authContext.clientId) {
    return `AND ${columnAlias} IS NULL`
  }
  
  return `AND ${columnAlias} = '${authContext.clientId}'`
}
