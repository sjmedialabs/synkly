import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, getAuthContext } from '@/lib/rbac-server'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// GET /api/clients - List all clients (master admin only)
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Only master admin can list all clients
    if (!ctx.isMasterAdmin) {
      // Client admin can only see their own client
      if (ctx.isClientAdmin && ctx.clientId) {
        const adminClient = getAdminClient()
        const { data, error } = await adminClient
          .from('clients')
          .select('id, name, email, company, phone, address, is_active, created_at')
          .eq('id', ctx.clientId)
          .single()
        
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ clients: [data] })
      }
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const adminClient = getAdminClient()
    const { data, error } = await adminClient
      .from('clients')
      .select('id, name, email, company, phone, address, is_active, created_at')
      .order('name', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ clients: data || [] })
  } catch (err: any) {
    console.error('[clients API] GET error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

// POST /api/clients - Create a new client with client admin (master admin only)
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Only master admin can create clients
    if (!ctx.isMasterAdmin) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const body = await request.json()
    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim().toLowerCase() || null
    const phone = String(body.phone || '').trim() || null
    const company = String(body.company || '').trim() || null
    const address = String(body.address || '').trim() || null
    const clientAdminEmail = String(body.client_admin_email || '').trim().toLowerCase()
    const clientAdminName = String(body.client_admin_name || '').trim()
    const clientAdminPassword = String(body.client_admin_password || '')

    if (!name) return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
    if (!clientAdminEmail || !emailRegex.test(clientAdminEmail)) {
      return NextResponse.json({ error: 'Valid client_admin_email is required' }, { status: 400 })
    }

    const adminClient = getAdminClient()

    // Create client
    const { data: clientData, error: clientError } = await adminClient
      .from('clients')
      .insert({ 
        name, 
        email, 
        phone, 
        company, 
        address, 
        is_active: true 
      })
      .select('id, name, email, company')
      .single()

    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 })
    }

    const clientId = clientData.id

    // Check if client admin email already exists
    const {
      data: { users: authUsers },
    } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (authUsers?.some((u) => (u.email || '').toLowerCase() === clientAdminEmail)) {
      return NextResponse.json({ error: 'Client admin email already exists' }, { status: 409 })
    }

    // Get client_admin role id
    const { data: roleData } = await adminClient
      .from('roles')
      .select('id')
      .eq('name', 'client_admin')
      .single()

    // Create client admin auth account
    const createAuth = await adminClient.auth.admin.createUser({
      email: clientAdminEmail,
      email_confirm: Boolean(clientAdminPassword),
      password: clientAdminPassword || undefined,
      user_metadata: {
        full_name: clientAdminName || null,
        role: 'client_admin',
      },
    })

    if (createAuth.error || !createAuth.data.user?.id) {
      // Clean up: delete the client we just created
      await adminClient.from('clients').delete().eq('id', clientId)
      return NextResponse.json(
        { error: createAuth.error?.message || 'Failed to create client admin auth user' },
        { status: 500 },
      )
    }

    const clientAdminId = createAuth.data.user.id

    // Create/update user profile with client_id and role
    const { data: userData, error: userError } = await adminClient
      .from('users')
      .upsert(
        {
          id: clientAdminId,
          email: clientAdminEmail,
          full_name: clientAdminName || clientAdminEmail.split('@')[0],
          role_id: roleData?.id,
          client_id: clientId,
          status: 'active',
        },
        { onConflict: 'id' },
      )
      .select('id, email, full_name, client_id')
      .single()

    if (userError) {
      // Clean up: delete auth user and client
      await adminClient.auth.admin.deleteUser(clientAdminId)
      await adminClient.from('clients').delete().eq('id', clientId)
      return NextResponse.json({ error: userError.message }, { status: 500 })
    }

    // Send invite email if no password was provided
    if (!clientAdminPassword) {
      await adminClient.auth.admin.inviteUserByEmail(clientAdminEmail, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/set-password`,
        data: { role: 'client_admin', client_id: clientId },
      })
    }

    return NextResponse.json(
      {
        client: clientData,
        client_admin: userData,
      },
      { status: 201 },
    )
  } catch (err: any) {
    console.error('[clients API] POST error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
