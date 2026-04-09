import { randomUUID } from 'crypto'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import {
  type RoleKey,
  hasPermission,
  isFullAccessRole,
  isAdminRole,
  canManageProjects,
  canAssignTasks,
  canAccessClientScope,
  resolveRole,
  normalizeRole,
} from '@/lib/rbac'
import { authCache, tableCache } from '@/lib/cache'

export function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRole) throw new Error('Supabase admin credentials are missing')
  return createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Insert or update `public.clients` so `projects.client_id` FK can reference this id. */
export async function upsertClientRowForFk(
  admin: ReturnType<typeof getAdminClient>,
  id: string,
  fields: { name: string; email: string | null },
) {
  return admin
    .from('clients')
    .upsert(
      {
        id,
        name: fields.name,
        email: fields.email,
        company: fields.name,
        is_active: true,
      } as Record<string, unknown>,
      { onConflict: 'id' },
    )
    .select('id')
    .single()
}

export interface AuthContextResult {
  permissions: Record<string, Record<string, boolean>> | null
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
      permissions: null, 
      adminClient,
      isMasterAdmin: false,
      isClientAdmin: false,
    }
  }

  // Return cached auth context if available (avoids 2-6 extra DB queries)
  const cachedAuth = authCache.get<Omit<AuthContextResult, 'adminClient'>>(`auth:${user.id}`)
  if (cachedAuth) {
    return { ...cachedAuth, adminClient }
  }
  
  // Cache table resolution — this never changes at runtime
  let peopleTable = tableCache.get<'team' | 'users' | null>('peopleTable')
  if (peopleTable === undefined) {
    const teamCheck = await adminClient.from('team').select('id').limit(1)
    const usersCheck = await adminClient.from('users').select('id').limit(1)
    peopleTable = !teamCheck.error ? 'team' : !usersCheck.error ? 'users' : null
    tableCache.set('peopleTable', peopleTable)
  }

  // Prefer peopleTable.role + roles join; fall back if role column is absent in older DBs
  let userData: any = null
  if (peopleTable) {
    const withRoleCol = await adminClient
      .from(peopleTable)
      .select(
        `
        id,
        email,
        client_id,
        status,
        role,
        designation,
        roles (name)
      `,
      )
      .eq('id', user.id)
      .single()

    if (!withRoleCol.error) {
      userData = withRoleCol.data
    } else {
      const joinOnly = await adminClient
        .from(peopleTable)
        .select(
          `
          id,
          email,
          client_id,
          status,
          designation,
          roles (name)
        `,
        )
        .eq('id', user.id)
        .single()
      if (!joinOnly.error) {
        userData = joinOnly.data
      } else {
        const explicitFk = await adminClient
          .from(peopleTable)
          .select(
            `
            id,
            email,
            client_id,
            status,
            designation,
            role_id,
            roles:role_id (name)
          `,
          )
          .eq('id', user.id)
          .single()
        if (!explicitFk.error) {
          userData = explicitFk.data as any
        } else {
          const legacyRole = await adminClient
            .from(peopleTable)
            .select('id, email, client_id, status, role, designation')
            .eq('id', user.id)
            .single()
          userData = legacyRole.data
        }
      }
    }
  }

  let role = resolveRole(userData)
  if (!role) {
    const metaRole = normalizeRole((user as any)?.user_metadata?.role)
    role = metaRole || null
  }
  if (!role && userData?.role_id) {
    // Avoid relationship/join issues by resolving role_id directly.
    const { data: roleRow } = await adminClient
      .from('roles')
      .select('name')
      .eq('id', userData.role_id)
      .maybeSingle()
    role = roleRow?.name ? normalizeRole(roleRow.name) : role
  }
  const meta = (user as { user_metadata?: { client_id?: unknown } })?.user_metadata
  const metaClientId = typeof meta?.client_id === 'string' ? meta.client_id : null
  const clientId = userData?.client_id || metaClientId || null

  // Fetch granular permissions from role
  let rolePermissions: Record<string, Record<string, boolean>> | null = null
  if (role && userData?.role_id) {
    const { data: permRole } = await adminClient
      .from('roles')
      .select('permissions')
      .eq('id', userData.role_id)
      .maybeSingle()
    if (permRole?.permissions && typeof permRole.permissions === 'object') {
      rolePermissions = permRole.permissions as Record<string, Record<string, boolean>>
    }
  }

  const result = {
    userId: user.id,
    email: userData?.email || user.email || null,
    role,
    clientId,
    tenantId: clientId, // Keep for backward compatibility
    adminClient,
    permissions: rolePermissions,
    isMasterAdmin: role === 'master_admin',
    isClientAdmin: role === 'client_admin',
  }

  // Cache the resolved auth context (excluding adminClient) for 30s
  authCache.set(`auth:${user.id}`, {
    userId: result.userId,
    email: result.email,
    role: result.role,
    clientId: result.clientId,
    tenantId: result.tenantId,
    permissions: result.permissions,
    isMasterAdmin: result.isMasterAdmin,
    isClientAdmin: result.isClientAdmin,
  })

  return result
}

/**
 * Ensures tenant id for users who can own projects but have no `client_id` yet.
 * - Tries `public.clients` insert when available.
 * - If that fails, reuses or generates a stable UUID and **upserts `public.clients`** so
 *   `projects.client_id` FK (when present) still resolves.
 */
export async function provisionClientForClientAdminIfMissing(ctx: AuthContextResult): Promise<string | null> {
  if (!ctx.userId) return null
  if (ctx.role !== 'client_admin' && ctx.role !== 'manager') return null
  if (ctx.clientId) return ctx.clientId

  const admin = ctx.adminClient
  const teamOk = !(await admin.from('team').select('id').limit(1)).error
  const usersOk = !(await admin.from('users').select('id').limit(1)).error
  const peopleTable: 'team' | 'users' | null = teamOk ? 'team' : usersOk ? 'users' : null

  const profileRes = peopleTable
    ? await admin.from(peopleTable).select('*').eq('id', ctx.userId).maybeSingle()
    : { data: null as any, error: null }

  const stampPeopleAndAuth = async (tenantId: string) => {
    if (peopleTable) {
      await admin.from(peopleTable).upsert(
        {
          id: ctx.userId,
          email: profileRes.data?.email || ctx.email || null,
          full_name: profileRes.data?.full_name || profileRes.data?.name || null,
          client_id: tenantId,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: 'id' },
      )
    }
    const authUserRes = await admin.auth.admin.getUserById(ctx.userId!)
    if (!authUserRes.error && authUserRes.data?.user) {
      const userMetadata = authUserRes.data.user.user_metadata || {}
      await admin.auth.admin.updateUserById(ctx.userId!, {
        user_metadata: { ...userMetadata, client_id: tenantId },
      })
    }
  }

  const orgNameBase = String(
    profileRes.data?.full_name || profileRes.data?.name || ctx.email?.split('@')[0] || 'Client',
  ).trim()
  const orgName = `${orgNameBase} Organization`

  const createdClient = await admin
    .from('clients')
    .insert({
      name: orgName,
      email: ctx.email || null,
      company: orgName,
      is_active: true,
    } as any)
    .select('id')
    .single()

  if (!createdClient.error && createdClient.data?.id) {
    const newId = createdClient.data.id as string
    await stampPeopleAndAuth(newId)
    return newId
  }

  console.warn(
    '[provisionClient] clients insert failed; will upsert by stable id:',
    createdClient.error?.message,
  )

  const authPeek = await admin.auth.admin.getUserById(ctx.userId)
  if (authPeek.error || !authPeek.data?.user) return null
  const meta = (authPeek.data.user.user_metadata || {}) as Record<string, unknown>
  let virtualId = typeof meta.client_id === 'string' ? meta.client_id : null
  if (!virtualId) {
    virtualId = randomUUID()
  }

  const upsertRes = await upsertClientRowForFk(admin, virtualId, {
    name: orgName,
    email: ctx.email || null,
  })
  if (upsertRes.error || !upsertRes.data?.id) {
    console.warn('[provisionClient] clients upsert failed:', upsertRes.error?.message)
    return null
  }

  await stampPeopleAndAuth(virtualId)
  return virtualId
}

export function canAccessAll(role: RoleKey | null): boolean {
  return isFullAccessRole(role) || isAdminRole(role)
}

/** Master data mutations: platform admin, client admin, or explicit permission */
export function canMutateMasterData(role: RoleKey | null): boolean {
  return isFullAccessRole(role) || isAdminRole(role) || hasPermission(role, 'MANAGE_MASTER_DATA')
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

// ─── Granular Permission Helpers (extends existing server RBAC) ───

import { type PermissionMap, checkPermission } from '@/lib/rbac'

/**
 * Check a module.action permission using the auth context.
 * Uses granular JSON first, falls back to role hierarchy.
 */
export function hasModulePermission(
  ctx: AuthContextResult,
  module: string,
  action: string,
): boolean {
  // Master admin bypasses all checks
  if (ctx.isMasterAdmin) return true
  return checkPermission(ctx.role, ctx.permissions ?? null, module, action)
}

// Extend AuthContextResult to include permissions field.
// The getAuthContext function above already fetches roles (name).
// We patch it here to also carry the permissions JSONB when available.
// Callers can access ctx.permissions for the granular map.
