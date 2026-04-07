import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, getAuthContext } from '@/lib/rbac-server'
import { ROLE_PERMISSIONS } from '@/lib/rbac'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isPlatformMasterAdmin = ctx.role === 'master_admin' && !ctx.tenantId
    if (!isPlatformMasterAdmin) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const body = await request.json()
    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim().toLowerCase() || null
    const phone = String(body.phone || '').trim() || null
    const company = String(body.company || '').trim() || null
    const address = String(body.address || '').trim() || null
    const superAdminEmail = String(body.super_admin_email || '').trim().toLowerCase()
    const superAdminName = String(body.super_admin_name || '').trim()
    const superAdminPassword = String(body.super_admin_password || '')

    if (!name) return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
    if (!superAdminEmail || !emailRegex.test(superAdminEmail)) {
      return NextResponse.json({ error: 'Valid super_admin_email is required' }, { status: 400 })
    }

    const adminClient = getAdminClient()

    // Create tenant/client in a schema-safe way.
    let tenantId: string | null = null
    const tenantRes = await adminClient
      .from('tenants')
      .insert({ name } as any)
      .select('id, name')
      .single()
    if (!tenantRes.error) {
      tenantId = tenantRes.data?.id || null
    }

    let clientRes = await adminClient
      .from('clients')
      .insert({ name, email, phone, company, address, is_active: true } as any)
      .select('id, name, email, company')
      .single()
    if (clientRes.error) {
      clientRes = await adminClient
        .from('clients')
        .insert({ name, email, phone, company, is_active: true } as any)
        .select('id, name, email, company')
        .single()
    }
    if (clientRes.error) {
      return NextResponse.json({ error: clientRes.error.message }, { status: 500 })
    }
    if (!tenantId) tenantId = clientRes.data?.id || null

    // Ensure super admin auth account does not already exist.
    const {
      data: { users: authUsers },
    } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (authUsers?.some((u) => (u.email || '').toLowerCase() === superAdminEmail)) {
      return NextResponse.json({ error: 'Super admin email already exists' }, { status: 409 })
    }

    const createAuth = await adminClient.auth.admin.createUser({
      email: superAdminEmail,
      email_confirm: Boolean(superAdminPassword),
      password: superAdminPassword || undefined,
      user_metadata: {
        full_name: superAdminName || null,
        role: 'super_admin',
        tenant_id: tenantId,
      },
    })
    if (createAuth.error || !createAuth.data.user?.id) {
      return NextResponse.json(
        { error: createAuth.error?.message || 'Failed to create super admin auth user' },
        { status: 500 },
      )
    }

    const superAdminId = createAuth.data.user.id
    const userUpsert = await adminClient
      .from('users')
      .upsert(
        {
          id: superAdminId,
          email: superAdminEmail,
          full_name: superAdminName || superAdminEmail.split('@')[0],
          role: 'super_admin',
          tenant_id: tenantId,
          is_active: true,
          permissions: ROLE_PERMISSIONS.super_admin,
        } as any,
        { onConflict: 'id' },
      )
      .select('id, email, full_name, role, tenant_id')
      .single()
    if (userUpsert.error) {
      await adminClient.auth.admin.deleteUser(superAdminId)
      return NextResponse.json({ error: userUpsert.error.message }, { status: 500 })
    }

    if (!superAdminPassword) {
      await adminClient.auth.admin.inviteUserByEmail(superAdminEmail, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/set-password`,
        data: { role: 'super_admin', tenant_id: tenantId },
      })
    }

    return NextResponse.json(
      {
        client: clientRes.data,
        tenant_id: tenantId,
        super_admin: userUpsert.data,
      },
      { status: 201 },
    )
  } catch (err: any) {
    console.error('[clients API] POST error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

