import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { resolveRole, type RoleKey, hasPermission, isFullAccessRole } from '@/lib/rbac'

export function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRole) throw new Error('Supabase admin credentials are missing')
  return createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function getAuthContext() {
  const serverClient = await createServerClient()
  const adminClient = getAdminClient()
  const {
    data: { user },
  } = await serverClient.auth.getUser()
  if (!user) return { userId: null, role: null as RoleKey | null, tenantId: null as string | null, adminClient }
  const roleRes = await adminClient
    .from('users')
    .select('id, role, tenant_id')
    .eq('id', user.id)
    .single()
  return {
    userId: user.id,
    role: resolveRole(roleRes.data),
    tenantId: (roleRes.data as any)?.tenant_id || null,
    adminClient,
  }
}

export function canAccessAll(role: RoleKey | null): boolean {
  return isFullAccessRole(role)
}

export function can(role: RoleKey | null, permission: string): boolean {
  return hasPermission(role, permission)
}

