import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, getAdminClient } from '@/lib/rbac-server'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// GET /api/users - List users (filtered by client for non-master admins)
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const adminClient = getAdminClient()
    
    // Build query with client filtering
    let query = adminClient
      .from('team')
      .select(`
        id,
        email,
        full_name,
        avatar_url,
        designation,
        department,
        phone,
        status,
        client_id,
        created_at,
        roles (id, name, description)
      `)
      .eq('status', 'active')
      .order('full_name', { ascending: true })
    
    // Apply client filter for non-master admins
    if (!ctx.isMasterAdmin && ctx.clientId) {
      query = query.eq('client_id', ctx.clientId)
    } else if (!ctx.isMasterAdmin && !ctx.clientId) {
      // User without client_id can only see themselves
      query = query.eq('id', ctx.userId)
    }
    
    const { data, error } = await query
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ users: data || [] })
  } catch (error: any) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: error?.message || 'Failed to fetch users' }, { status: 500 })
  }
}

// POST /api/users - Create a new user (admin only)
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    // Only admins can create users
    if (!ctx.isMasterAdmin && !ctx.isClientAdmin) {
      return NextResponse.json({ error: 'Only admins can create users' }, { status: 403 })
    }
    
    const body = await request.json()
    const email = String(body.email || '').trim().toLowerCase()
    const full_name = String(body.full_name || '').trim()
    const role_id = body.role_id
    const designation = body.designation || null
    const department = body.department || null
    const password = body.password || null
    
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }
    
    if (!full_name) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
    }
    
    const adminClient = getAdminClient()
    
    // Determine client_id for new user
    let clientId = body.client_id
    if (!ctx.isMasterAdmin) {
      // Client admins can only create users for their own client
      clientId = ctx.clientId
    }
    
    // Check if email already exists
    const { data: { users: existingUsers } } = await adminClient.auth.admin.listUsers({ 
      page: 1, 
      perPage: 1000 
    })
    if (existingUsers?.some((u) => (u.email || '').toLowerCase() === email)) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 })
    }
    
    // Create user in auth
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: Boolean(password),
      password: password || undefined,
      user_metadata: {
        full_name,
      },
    })
    
    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || 'Failed to create user' }, { status: 400 })
    }
    
    // Update the user profile (trigger should have created it)
    const { data: userData, error: updateError } = await adminClient
      .from('team')
      .upsert({
        id: authData.user.id,
        email,
        full_name,
        role_id,
        designation,
        department,
        client_id: clientId,
        status: 'active',
      }, { onConflict: 'id' })
      .select(`
        id,
        email,
        full_name,
        designation,
        department,
        client_id,
        status,
        roles (id, name)
      `)
      .single()
    
    if (updateError) {
      console.error('Error updating user profile:', updateError)
      // Clean up: delete auth user
      await adminClient.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    
    // Send invite email if no password was provided
    if (!password) {
      await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback?next=/auth/set-password&type=invite`,
      })
    }
    
    return NextResponse.json({ 
      user: userData, 
      message: password ? 'User created successfully' : 'User created and invitation sent' 
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating user:', error)
    return NextResponse.json({ error: error?.message || 'Failed to create user' }, { status: 500 })
  }
}
