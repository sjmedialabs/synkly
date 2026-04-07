import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { resolveRole } from '@/lib/rbac'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Create admin client with service role key for user management
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

// GET - Sync auth users to users table and return all team members
export async function GET() {
  try {
    const serverClient = await createServerClient()
    const {
      data: { user: sessionUser },
    } = await serverClient.auth.getUser()
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminClient = getAdminClient()
    const actorRes = await adminClient
      .from('users')
      .select('id, role_id, client_id, roles:role_id (name)')
      .eq('id', sessionUser.id)
      .single()
    const actorRole = (actorRes.data as any)?.roles?.name || resolveRole(actorRes.data)
    const actorClientId = (actorRes.data as any)?.client_id || null
    const isPlatformMasterAdmin = actorRole === 'master_admin'
    const isClientAdmin = actorRole === 'client_admin'
    const isFullAccess = isPlatformMasterAdmin || isClientAdmin || actorRole === 'manager' || actorRole === 'team_lead'
    
    // Get all auth users
    const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers()
    
    if (authError) {
      console.error('[team API] Failed to list auth users:', authError)
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }
    
    // Get existing users from public.users
    const { data: existingUsers } = await adminClient
      .from('users')
      .select('id')
    
    const existingIds = new Set(existingUsers?.map(u => u.id) || [])
    
    // Find auth users not in public.users
    const missingUsers = authUsers?.users?.filter(u => !existingIds.has(u.id)) || []
    
    // Insert missing users
    if (missingUsers.length > 0) {
      const toInsert = missingUsers.map(u => ({
        id: u.id,
        email: u.email,
        full_name: u.user_metadata?.full_name || u.email?.split('@')[0] || 'Unknown',
        is_active: true,
      }))
      
      const { error: insertError } = await adminClient
        .from('users')
        .insert(toInsert)
        .select()
      
      if (insertError) {
        console.error('[team API] Failed to sync users:', insertError)
      }
    }
    
    // Return all users with role join
    let allUsers: any[] | null = null
    let fetchError: any = null
    const modernQuery = await adminClient
      .from('users')
      .select(`
        id,
        email,
        full_name,
        role_id,
        roles:role_id (id, name, description),
        department_id,
        department:department_id (id, name),
        division_id,
        division:division_id (id, name),
        designation_id,
        designation:designation_id (id, name),
        client_id,
        tenant_id,
        status,
        is_active,
        created_at,
        experience_years,
        skillset,
        reporting_manager_id,
        reporting_manager:reporting_manager_id (id, full_name, email)
      `)
      .order('created_at', { ascending: false })
    allUsers = modernQuery.data as any[] | null
    fetchError = modernQuery.error

    if (fetchError) {
      console.error('[team API] Modern query failed, trying simplified:', fetchError)
      const simpleQuery = await adminClient
        .from('users')
        .select(`
          id,
          email,
          full_name,
          role_id,
          client_id,
          status,
          is_active,
          created_at
        `)
        .order('created_at', { ascending: false })
      allUsers = simpleQuery.data as any[] | null
      fetchError = simpleQuery.error
    }
    
    if (fetchError) {
      console.error('[team API] Failed to fetch users:', fetchError)
      return NextResponse.json({ error: fetchError.message, code: fetchError.code }, { status: 500 })
    }
    
    let visibleUsers = allUsers || []
    // Master admin sees all users
    // Client admin/manager sees users in their client
    // Team lead sees their direct reports + self
    // Member sees only self
    if (!isPlatformMasterAdmin && actorClientId) {
      visibleUsers = visibleUsers.filter((u: any) => u.client_id === actorClientId)
    }
    if (!isPlatformMasterAdmin && !isClientAdmin) {
      if (actorRole === 'manager') {
        // Managers can see all users in their client (already filtered above)
      } else if (actorRole === 'team_lead') {
        visibleUsers = visibleUsers.filter((u: any) => u.reporting_manager_id === sessionUser.id || u.id === sessionUser.id)
      } else {
        // Members only see themselves
        visibleUsers = visibleUsers.filter((u: any) => u.id === sessionUser.id)
      }
    }

    const adaptedUsers = visibleUsers.map((user: any) => ({
      ...user,
      role: user.roles?.name || resolveRole(user),
      name: user.full_name || null,
      department_name: user.department?.name || null,
      division_name: user.division?.name || null,
      designation_name: user.designation?.name || null,
      reporting_manager_name: user.reporting_manager?.full_name || null,
    }))
    console.log('[team API] Successfully fetched users:', adaptedUsers.length || 0)
    return NextResponse.json({ users: adaptedUsers, synced: missingUsers.length })
  } catch (err) {
    console.error('[team API] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const serverClient = await createServerClient()
    const {
      data: { user: sessionUser },
    } = await serverClient.auth.getUser()
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const {
      email,
      full_name,
      department,
      department_id,
      division_id,
      designation,
      designation_id,
      tenant_id,
      experience_years,
      skillset,
      reporting_manager_id,
      role,
      is_active = true
    } = body

    if (!email || !full_name) {
      return NextResponse.json({ error: 'Email and name are required' }, { status: 400 })
    }

    const adminClient = getAdminClient()
    const actorRes = await adminClient
      .from('users')
      .select('id, role_id, client_id, roles:role_id (name)')
      .eq('id', sessionUser.id)
      .single()
    const actorRole = (actorRes.data as any)?.roles?.name || resolveRole(actorRes.data)
    const actorClientId = (actorRes.data as any)?.client_id || null
    const isPlatformMasterAdmin = actorRole === 'master_admin'
    const isClientAdmin = actorRole === 'client_admin'
    if (!isPlatformMasterAdmin && !isClientAdmin) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }
    const effectiveClientId = isPlatformMasterAdmin ? (tenant_id || null) : actorClientId
    const skillsetArr = skillset && Array.isArray(skillset) ? skillset : []

    // Check if user already exists in auth
    let userId: string

    try {
      // Try to get existing user by email
      const { data: { users: existingAuthUsers } } = await adminClient.auth.admin.listUsers()
      const existingUser = existingAuthUsers?.find(u => u.email === email)

      if (existingUser) {
        // User already exists in auth
        userId = existingUser.id
        console.log('[team API] User already exists in auth:', email)
      } else {
        // Create new auth user without password
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name }
        })

        if (authError) {
          console.error('[team API] Failed to create auth user:', authError)
          return NextResponse.json({ error: authError.message }, { status: 500 })
        }

        if (!authData.user?.id) {
          return NextResponse.json({ error: 'Failed to create auth user' }, { status: 500 })
        }

        userId = authData.user.id
        console.log('[team API] Created new auth user:', email)

        // Send password setup invite
        const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/set-password`
        })

        if (inviteError) {
          console.error('[team API] Failed to send invite:', inviteError)
          // Don't fail here - user was created, just inform about invite failure
        }
      }
    } catch (err) {
      console.error('[team API] Unexpected error during user creation:', err)
      return NextResponse.json({ error: 'Failed to create team member' }, { status: 500 })
    }

    const modernPayload = {
      id: userId,
      email,
      full_name,
      department: department || null,
      department_id: department_id || null,
      division_id: division_id || null,
      designation: designation || null,
      designation_id: designation_id || null,
      client_id: effectiveClientId,
      experience_years: experience_years || null,
      skillset: skillsetArr,
      reporting_manager_id: reporting_manager_id || null,
      is_active,
    }

    // Simplified payload for fallback
    const simplePayload = {
      id: userId,
      email,
      full_name,
      client_id: effectiveClientId,
      is_active,
    }

    // Upsert into users table (modern first, fallback for older schema)
    let upsertRes = await adminClient
      .from('users')
      .upsert(modernPayload as any, { onConflict: 'id' })
      .select('*')
      .single()

    if (upsertRes.error?.code === '42703' || upsertRes.error?.code === 'PGRST204') {
      console.log('[team API] Modern upsert failed, trying simple payload')
      upsertRes = await adminClient
        .from('users')
        .upsert(simplePayload as any, { onConflict: 'id' })
        .select('*')
        .single()
    }

    const userData = upsertRes.data
    const upsertError = upsertRes.error

    if (upsertError) {
      console.error('[team API] Users upsert error:', upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({
      user: userData,
      message: 'User created successfully. Password setup email sent.' 
    }, { status: 201 })
  } catch (err: unknown) {
    console.error('[team API] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const serverClient = await createServerClient()
    const {
      data: { user: sessionUser },
    } = await serverClient.auth.getUser()
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const {
      id,
      full_name,
      department,
      department_id,
      division_id,
      designation,
      designation_id,
      tenant_id,
      experience_years,
      skillset,
      reporting_manager_id,
      role,
      is_active
    } = body

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const adminClient = getAdminClient()
    const actorRes = await adminClient
      .from('users')
      .select('id, role_id, client_id, roles:role_id (name)')
      .eq('id', sessionUser.id)
      .single()
    const actorRole = (actorRes.data as any)?.roles?.name || resolveRole(actorRes.data)
    const actorClientId = (actorRes.data as any)?.client_id || null
    const isPlatformMasterAdmin = actorRole === 'master_admin'
    const isClientAdmin = actorRole === 'client_admin'
    const isManager = actorRole === 'manager'
    const isTeamLead = actorRole === 'team_lead'
    const canEdit = isPlatformMasterAdmin || isClientAdmin || isManager || isTeamLead
    if (!canEdit) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    const targetRes = await adminClient
      .from('users')
      .select('id, client_id, reporting_manager_id')
      .eq('id', id)
      .single()
    if (targetRes.error) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (!isPlatformMasterAdmin && targetRes.data?.client_id !== actorClientId) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }
    if (isTeamLead) {
      if (targetRes.data?.reporting_manager_id !== sessionUser.id && targetRes.data?.id !== sessionUser.id) {
        return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
      }
    }

    const skillsetArr = skillset
      ? (Array.isArray(skillset) ? skillset : skillset.split(',').map((s: string) => s.trim()).filter(Boolean))
      : null

    const modernUpdate = {
      full_name,
      department_id: department_id || null,
      division_id: division_id || null,
      designation_id: designation_id || null,
      experience_years: experience_years || null,
      skillset: skillsetArr,
      reporting_manager_id: reporting_manager_id || null,
      is_active,
      updated_at: new Date().toISOString(),
    }

    const simpleUpdate = {
      full_name,
      is_active,
      updated_at: new Date().toISOString(),
    }

    let updateRes = await adminClient
      .from('users')
      .update(modernUpdate as any)
      .eq('id', id)
      .select('*')
      .single()

    if (updateRes.error?.code === '42703' || updateRes.error?.code === 'PGRST204') {
      console.log('[team API] Modern update failed, trying simple update')
      updateRes = await adminClient
        .from('users')
        .update(simpleUpdate as any)
        .eq('id', id)
        .select('*')
        .single()
    }

    const updatedUser = updateRes.data
    const error = updateRes.error

    if (error) {
      console.error('[team API] PUT error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ user: updatedUser, updated: true })
  } catch (err) {
    console.error('[team API] PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const serverClient = await createServerClient()
    const {
      data: { user: sessionUser },
    } = await serverClient.auth.getUser()
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const adminClient = getAdminClient()
    const actorRes = await adminClient
      .from('users')
      .select('id, role_id, client_id, roles:role_id (name)')
      .eq('id', sessionUser.id)
      .single()
    const actorRole = (actorRes.data as any)?.roles?.name || resolveRole(actorRes.data)
    const actorClientId = (actorRes.data as any)?.client_id || null
    const isPlatformMasterAdmin = actorRole === 'master_admin'
    const isClientAdmin = actorRole === 'client_admin'
    if (!isPlatformMasterAdmin && !isClientAdmin) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    const targetRes = await adminClient.from('users').select('id, client_id').eq('id', id).single()
    if (targetRes.error) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (!isPlatformMasterAdmin && targetRes.data?.client_id !== actorClientId) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    // Delete from auth.users first (will cascade to users table if FK set up)
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(id)

    if (authDeleteError) {
      console.error('[team API] Auth delete error:', authDeleteError)
      // If auth delete fails, still try to delete from users table
    }

    // Also delete from users table directly to ensure cleanup
    await adminClient.from('users').delete().eq('id', id)

    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('[team API] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
