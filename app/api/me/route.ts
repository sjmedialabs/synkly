import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/rbac-server'
import { apiCache, tableCache, shortCacheHeaders } from '@/lib/cache'

async function resolvePeopleTable(adminClient: any): Promise<'team' | 'users' | null> {
  const cached = tableCache.get<'team' | 'users' | null>('peopleTable')
  if (cached !== undefined) return cached
  const teamCheck = await adminClient.from('team').select('id').limit(1)
  if (!teamCheck.error) { tableCache.set('peopleTable', 'team'); return 'team' }
  const usersCheck = await adminClient.from('users').select('id').limit(1)
  if (!usersCheck.error) { tableCache.set('peopleTable', 'users'); return 'users' }
  tableCache.set('peopleTable', null)
  return null
}

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const meCacheKey = `me:${ctx.userId}`
    const cached = apiCache.get<any>(meCacheKey)
    if (cached) return NextResponse.json(cached, { headers: shortCacheHeaders() })

    const peopleTable = await resolvePeopleTable(ctx.adminClient as any)

    // Fetch a minimal profile for display (no role joins needed).
    const profileRes = peopleTable
      ? await ctx.adminClient.from(peopleTable).select('*').eq('id', ctx.userId).maybeSingle()
      : ({ data: null } as any)

    const profileStatus =
      (profileRes.data?.status as string | undefined) ||
      ((profileRes.data?.is_active === false ? 'inactive' : null) as string | null) ||
      'active'

    let effectiveClientId = profileRes.data?.client_id || ctx.clientId || null

    // Auto-provision missing client for client_admin self-registration flow.
    if (ctx.role === 'client_admin' && !effectiveClientId) {
      const orgNameBase =
        (profileRes.data?.full_name || profileRes.data?.name || ctx.email?.split('@')[0] || 'Client').trim()
      const orgName = `${orgNameBase} Organization`
      const createdClient = await ctx.adminClient
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
        effectiveClientId = createdClient.data.id

        if (peopleTable) {
          await ctx.adminClient
            .from(peopleTable)
            .upsert(
              {
                id: ctx.userId,
                email: profileRes.data?.email || ctx.email || null,
                full_name: profileRes.data?.full_name || profileRes.data?.name || null,
                client_id: effectiveClientId,
                updated_at: new Date().toISOString(),
              } as any,
              { onConflict: 'id' },
            )
        }

        const authUserRes = await ctx.adminClient.auth.admin.getUserById(ctx.userId)
        if (!authUserRes.error && authUserRes.data?.user) {
          const userMetadata = authUserRes.data.user.user_metadata || {}
          await ctx.adminClient.auth.admin.updateUserById(ctx.userId, {
            user_metadata: {
              ...userMetadata,
              client_id: effectiveClientId,
            },
          })
        }
      }
    }

    const mePayload = {
      userId: ctx.userId,
      email: profileRes.data?.email || ctx.email,
      full_name: profileRes.data?.full_name || profileRes.data?.name || null,
      clientId: effectiveClientId,
      role: ctx.role,
      /** Granular module permissions from `roles.permissions` (for sidebar + UI). */
      permissions: ctx.permissions ?? null,
      status: profileStatus,
      isMasterAdmin: ctx.isMasterAdmin,
      isClientAdmin: ctx.isClientAdmin,
    }
    apiCache.set(meCacheKey, mePayload)
    return NextResponse.json(mePayload, { headers: shortCacheHeaders() })
  } catch (e: any) {
    console.error('[me API] GET error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

