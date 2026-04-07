import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/rbac-server'

async function upsertAuthUser(
  adminClient: ReturnType<typeof getAdminClient>,
  email: string,
  password: string,
  metadata: Record<string, unknown>,
) {
  const list = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existing = list.data?.users?.find((u) => (u.email || '').toLowerCase() === email.toLowerCase())
  if (existing?.id) {
    const update = await adminClient.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    })
    if (update.error) throw new Error(update.error.message)
    return existing.id
  }
  const create = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (create.error || !create.data.user?.id) {
    throw new Error(create.error?.message || `Failed to create auth user for ${email}`)
  }
  return create.data.user.id
}

export async function POST() {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Disabled in production' }, { status: 403 })
    }

    const adminClient = getAdminClient()

    const masterEmail = 'info@sjmedialabs.com'
    const masterPassword = 'MasterAdmin@123'
    const clientSuperEmail = 'client.admin@sjmedialabs.com'
    const clientSuperPassword = 'ClientSuper@123'

    // Ensure tenant/client exists for client super admin
    let tenantId: string | null = null
    const tenantRes = await adminClient
      .from('tenants')
      .insert({ name: 'Mock Client Org' } as any)
      .select('id')
      .single()
    if (!tenantRes.error) {
      tenantId = tenantRes.data?.id || null
    } else {
      const existingTenant = await adminClient
        .from('tenants')
        .select('id')
        .eq('name', 'Mock Client Org')
        .single()
      if (!existingTenant.error) tenantId = existingTenant.data?.id || null
    }
    const clientRes = await adminClient
      .from('clients')
      .insert({ name: 'Mock Client Org', email: 'client@sjmedialabs.com', is_active: true } as any)
      .select('id')
      .single()
    if (!tenantId) {
      tenantId = clientRes.data?.id || null
    }
    if (!tenantId) throw new Error('Failed to create tenant/client')

    const masterId = await upsertAuthUser(adminClient, masterEmail, masterPassword, {
      role: 'master_admin',
      tenant_id: null,
    })
    const clientSuperId = await upsertAuthUser(adminClient, clientSuperEmail, clientSuperPassword, {
      role: 'super_admin',
      tenant_id: tenantId,
    })

    const masterUpsert = await adminClient
      .from('users')
      .upsert(
        {
          id: masterId,
          email: masterEmail,
          full_name: 'Platform Master Admin',
          role: 'master_admin',
          tenant_id: null,
          is_active: true,
        } as any,
        { onConflict: 'id' },
      )
    if (masterUpsert.error) throw new Error(masterUpsert.error.message)
    await adminClient
      .from('users')
      .update({ role: 'master_admin', tenant_id: null } as any)
      .eq('email', masterEmail)

    const clientUpsert = await adminClient
      .from('users')
      .upsert(
        {
          id: clientSuperId,
          email: clientSuperEmail,
          full_name: 'Client Super Admin',
          role: 'super_admin',
          tenant_id: tenantId,
          is_active: true,
        } as any,
        { onConflict: 'id' },
      )
    if (clientUpsert.error) throw new Error(clientUpsert.error.message)
    await adminClient
      .from('users')
      .update({ role: 'super_admin', tenant_id: tenantId } as any)
      .eq('email', clientSuperEmail)

    return NextResponse.json({
      ok: true,
      credentials: {
        master_admin: { email: masterEmail, password: masterPassword },
        client_super_admin: { email: clientSuperEmail, password: clientSuperPassword },
      },
      tenant_id: tenantId,
    })
  } catch (err: any) {
    if (String(err?.message || '').includes("Could not find the 'role' column of 'users'")) {
      return NextResponse.json(
        {
          error:
            "Missing users.role column. Run migration scripts/014_add_users_role_column.sql, then call this endpoint again.",
        },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

