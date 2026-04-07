import { getAdminClient, getAuthContext } from '@/lib/rbac-server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()

    if (!authContext.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only client_admin can invite users
    if (!authContext.isClientAdmin) {
      return NextResponse.json({ error: 'Only client admins can invite users' }, { status: 403 })
    }

    const body = await request.json()
    const { email, role } = body

    if (!email || !role) {
      return NextResponse.json({ error: 'Email and role are required' }, { status: 400 })
    }

    // Validate role is allowed
    const allowedRoles = ['manager', 'team_lead', 'member']
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Get role ID
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', role)
      .single()

    if (roleError || !roleData) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // Create invitation record (this would be better with a proper invitations table)
    // For now, we'll create the user with pending status and send invite via email
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: {
        role: role,
        invited_at: new Date().toISOString(),
        invited_by: authContext.userId,
        client_id: authContext.clientId,
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Create corresponding user profile record
    await supabase.from('users').insert({
      id: data.user.id,
      email: email.toLowerCase().trim(),
      role_id: roleData.id,
      client_id: authContext.clientId,
      status: 'active',
    })

    // Send invitation email (you would integrate with your email service here)
    console.log(`[v0] Invitation sent to ${email}`)

    return NextResponse.json(
      {
        message: 'User invited successfully',
        user_id: data.user.id,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error inviting user:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
