import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { resolveRole } from '@/lib/rbac'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/rbac-server'

// Create admin client with service role key for user management
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

async function resolvePeopleTable(
  adminClient: ReturnType<typeof getAdminClient>,
): Promise<'team' | 'users' | null> {
  const teamCheck = await adminClient.from('team').select('id').limit(1)
  if (!teamCheck.error) return 'team'
  const usersCheck = await adminClient.from('users').select('id').limit(1)
  if (!usersCheck.error) return 'users'
  return null
}

function isPeopleTableMissingError(err: { code?: string; message?: string } | null) {
  if (!err) return false
  if (err.code === 'PGRST205') return true
  const m = String(err.message || '')
  return m.includes('schema cache') || m.includes('Could not find the table')
}

/** When `public.team` / `public.users` is absent or PostgREST cannot use it, persist profile on auth metadata. */
async function putTeamMemberViaAuthMetadata(
  adminClient: ReturnType<typeof getAdminClient>,
  sessionUser: { id: string },
  targetId: string,
  body: {
    full_name?: string
    department?: string | null
    department_id?: string | null
    division_id?: string | null
    designation?: string | null
    designation_id?: string | null
    tenant_id?: string | null
    experience_years?: number | null
    skillset?: unknown
    reporting_manager_id?: string | null
    role?: string
    is_active?: boolean
  },
  skillsetArr: string[] | null,
) {
  const ctx = await getAuthContext()
  if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isPlatformMasterAdmin = ctx.isMasterAdmin
  const isClientAdmin = ctx.isClientAdmin
  const isManager = ctx.role === 'manager'
  const isTeamLead = ctx.role === 'team_lead'
  const canEdit = isPlatformMasterAdmin || isClientAdmin || isManager || isTeamLead
  if (!canEdit) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

  const targetAuth = await adminClient.auth.admin.getUserById(targetId)
  if (targetAuth.error || !targetAuth.data?.user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const targetUser = targetAuth.data.user
  const targetMeta = (targetUser.user_metadata || {}) as Record<string, unknown>
  const actorClientId = ctx.clientId
  const targetClientId = typeof targetMeta.client_id === 'string' ? targetMeta.client_id : null

  if (!isPlatformMasterAdmin) {
    const effectiveTargetClient = targetClientId || (isClientAdmin ? actorClientId : null)
    if (actorClientId && effectiveTargetClient && actorClientId !== effectiveTargetClient) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }
  }

  if (isTeamLead && !isPlatformMasterAdmin && !isClientAdmin && !isManager) {
    const reportsTo = targetMeta.reporting_manager_id
    if (reportsTo !== sessionUser.id && targetId !== sessionUser.id) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }
  }

  const {
    full_name,
    department,
    department_id,
    division_id,
    designation,
    designation_id,
    tenant_id,
    experience_years,
    reporting_manager_id,
    role,
    is_active,
  } = body

  const currentMeta = targetMeta as Record<string, any>
  const bodyKeys = Object.keys(body as object)
  const pick = <T,>(key: string, fallback: T, sent: unknown): T =>
    bodyKeys.includes(key) ? (sent as T) : fallback

  const nextMeta: Record<string, any> = {
    ...currentMeta,
    full_name: pick('full_name', currentMeta.full_name, full_name),
    department: pick('department', currentMeta.department, department),
    department_id: pick('department_id', currentMeta.department_id, department_id),
    division_id: pick('division_id', currentMeta.division_id, division_id),
    designation: pick('designation', currentMeta.designation, designation),
    designation_id: pick('designation_id', currentMeta.designation_id, designation_id),
    reporting_manager_id: pick(
      'reporting_manager_id',
      currentMeta.reporting_manager_id,
      reporting_manager_id,
    ),
    experience_years: pick('experience_years', currentMeta.experience_years, experience_years),
    skills: pick('skillset', currentMeta.skills, skillsetArr),
    is_active: pick('is_active', currentMeta.is_active, is_active),
  }
  if (tenant_id !== undefined && tenant_id !== null) nextMeta.tenant_id = tenant_id
  if (role && (isPlatformMasterAdmin || isClientAdmin)) {
    nextMeta.role = role
  }
  if (!targetClientId && actorClientId && isClientAdmin) {
    nextMeta.client_id = actorClientId
  }

  const authUpdate = await adminClient.auth.admin.updateUserById(targetId, { user_metadata: nextMeta })
  if (authUpdate.error) {
    return NextResponse.json({ error: authUpdate.error.message }, { status: 500 })
  }

  const resolvedClientId =
    typeof nextMeta.client_id === 'string' ? nextMeta.client_id : targetClientId

  return NextResponse.json({
    user: {
      id: targetId,
      email: targetUser.email || '',
      full_name: nextMeta.full_name ?? null,
      department_name: typeof nextMeta.department === 'string' ? nextMeta.department : null,
      designation_name: typeof nextMeta.designation === 'string' ? nextMeta.designation : null,
      department_id: nextMeta.department_id ?? null,
      division_id: nextMeta.division_id ?? null,
      designation_id: nextMeta.designation_id ?? null,
      reporting_manager_id: nextMeta.reporting_manager_id ?? null,
      experience_years: nextMeta.experience_years ?? null,
      skillset: Array.isArray(nextMeta.skills) ? nextMeta.skills : [],
      is_active: nextMeta.is_active !== false,
      client_id: resolvedClientId,
    },
    updated: true,
    warning: 'Updated auth user metadata only (no public.team / public.users table).',
  })
}

// GET - Sync auth users to team table and return all team members
export async function GET() {
  try {
    const serverClient = await createServerClient()
    const {
      data: { user: sessionUser },
    } = await serverClient.auth.getUser()
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminClient = getAdminClient()
    const peopleTable = await resolvePeopleTable(adminClient)
    if (!peopleTable) {
      // Get all auth users
      const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers()
      if (authError) {
        console.error('[team API] Failed to list auth users:', authError)
        return NextResponse.json({ error: authError.message }, { status: 500 })
      }
      console.error('[team API] No people table available (expected public.team or public.users)')
      const authBackedUsers = (authUsers?.users || []).map((u: any) => ({
        id: u.id,
        email: u.email || '',
        full_name: u.user_metadata?.full_name || u.email?.split('@')[0] || 'Unknown',
        name: u.user_metadata?.full_name || u.email?.split('@')[0] || 'Unknown',
        role: resolveRole({ role: u.user_metadata?.role, designation: u.user_metadata?.designation }) || null,
        department_name: u.user_metadata?.department || null,
        division_name: u.user_metadata?.division || null,
        designation_name: u.user_metadata?.designation || null,
        reporting_manager_id: u.user_metadata?.reporting_manager_id || null,
        experience_years: Number(u.user_metadata?.experience_years || 0) || null,
        skillset: Array.isArray(u.user_metadata?.skills) ? u.user_metadata.skills : [],
        reporting_manager_name: null,
        client_id: null,
        tenant_id: null,
        is_active: u.user_metadata?.is_active !== false,
        created_at: u.created_at || new Date().toISOString(),
      }))
      console.log('TEAM DATA:', authBackedUsers)
      return NextResponse.json({
        data: authBackedUsers,
        users: authBackedUsers,
        synced: 0,
        warning: 'Using auth.users fallback because no people table was found',
      })
    }

    const actorRes = await adminClient
      .from(peopleTable)
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
    
    // Get existing users from public.team
    const { data: existingUsers } = await adminClient
      .from(peopleTable)
      .select('id')
    
    const existingIds = new Set(existingUsers?.map(u => u.id) || [])
    
    // Find auth users not in public.team
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
        .from(peopleTable)
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
      .from(peopleTable)
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
        .from(peopleTable)
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
      console.error('[team API] Simplified query failed, trying wildcard:', fetchError)
      const wildcardQuery = await adminClient.from(peopleTable).select('*').order('created_at', { ascending: false })
      allUsers = wildcardQuery.data as any[] | null
      fetchError = wildcardQuery.error
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
      name: user.full_name || user.name || null,
      department_name: user.department?.name || null,
      division_name: user.division?.name || null,
      designation_name: user.designation?.name || null,
      reporting_manager_name: user.reporting_manager?.full_name || user.reporting_manager?.name || null,
    }))
    console.log('TEAM DATA:', adaptedUsers)
    console.log('[team API] Successfully fetched users:', adaptedUsers.length || 0)
    return NextResponse.json({ data: adaptedUsers, users: adaptedUsers, synced: missingUsers.length })
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
    const peopleTable = await resolvePeopleTable(adminClient)
    if (!peopleTable) {
      return NextResponse.json(
        {
          error:
            'People table is not available. Create members with POST /api/team-members, or add public.team (or public.users).',
        },
        { status: 503 },
      )
    }
    const actorRes = await adminClient
      .from(peopleTable)
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
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback?next=/auth/set-password&type=invite`
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

    // Get role_id if role is provided
    let roleId = null
    if (role) {
      const { data: roleData } = await adminClient
        .from('roles')
        .select('id')
        .eq('name', role)
        .single()
      roleId = roleData?.id || null
    }

    const modernPayload = {
      id: userId,
      email,
      full_name,
      role_id: roleId,
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
    const namePayload = {
      id: userId,
      email,
      name: full_name,
      client_id: effectiveClientId,
      is_active,
    }

    // Upsert into team table (modern first, fallback for older schema)
    let upsertRes = await adminClient
      .from(peopleTable)
      .upsert(modernPayload as any, { onConflict: 'id' })
      .select('*')
      .single()

    if (upsertRes.error?.code === '42703' || upsertRes.error?.code === 'PGRST204') {
      console.log('[team API] Modern upsert failed, trying simple payload')
      upsertRes = await adminClient
        .from(peopleTable)
        .upsert(simplePayload as any, { onConflict: 'id' })
        .select('*')
        .single()
    }
    if (upsertRes.error?.code === '42703' || upsertRes.error?.code === 'PGRST204') {
      console.log('[team API] Simple upsert failed, trying name payload')
      upsertRes = await adminClient
        .from(peopleTable)
        .upsert(namePayload as any, { onConflict: 'id' })
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
    const skillsetArr = skillset
      ? (Array.isArray(skillset) ? skillset : skillset.split(',').map((s: string) => s.trim()).filter(Boolean))
      : null

    const peopleTable = await resolvePeopleTable(adminClient)
    if (!peopleTable) {
      return putTeamMemberViaAuthMetadata(
        adminClient,
        sessionUser,
        id,
        {
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
          is_active,
        },
        skillsetArr,
      )
    }
    const actorRes = await adminClient
      .from(peopleTable)
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
      .from(peopleTable)
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

    // Get role_id if role is provided (only admins can change roles)
    let roleId = undefined
    if (role && (isPlatformMasterAdmin || isClientAdmin)) {
      const { data: roleData } = await adminClient
        .from('roles')
        .select('id')
        .eq('name', role)
        .single()
      roleId = roleData?.id || undefined
    }

    const modernUpdate: Record<string, any> = {
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
    
    // Only add role_id if it was resolved (admin changing role)
    if (roleId !== undefined) {
      modernUpdate.role_id = roleId
    }

    const simpleUpdate = {
      full_name,
      is_active,
      updated_at: new Date().toISOString(),
    }
    const nameUpdate = {
      name: full_name,
      is_active,
      updated_at: new Date().toISOString(),
    }

    let updateRes = await adminClient
      .from(peopleTable)
      .update(modernUpdate as any)
      .eq('id', id)
      .select('*')
      .single()

    if (updateRes.error?.code === '42703' || updateRes.error?.code === 'PGRST204') {
      console.log('[team API] Modern update failed, trying simple update')
      updateRes = await adminClient
        .from(peopleTable)
        .update(simpleUpdate as any)
        .eq('id', id)
        .select('*')
        .single()
    }
    if (updateRes.error?.code === '42703' || updateRes.error?.code === 'PGRST204') {
      console.log('[team API] Simple update failed, trying name update')
      updateRes = await adminClient
        .from(peopleTable)
        .update(nameUpdate as any)
        .eq('id', id)
        .select('*')
        .single()
    }

    const updatedUser = updateRes.data
    const error = updateRes.error

    if (error) {
      if (isPeopleTableMissingError(error)) {
        console.warn('[team API] PUT: DB update failed (missing table), using auth metadata fallback')
        return putTeamMemberViaAuthMetadata(
          adminClient,
          sessionUser,
          id,
          {
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
            is_active,
          },
          skillsetArr,
        )
      }
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
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.isMasterAdmin && !ctx.isClientAdmin) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const peopleTable = await resolvePeopleTable(ctx.adminClient as ReturnType<typeof getAdminClient>)

    const { data: targetAuth, error: targetAuthErr } = await ctx.adminClient.auth.admin.getUserById(id)
    if (targetAuthErr || !targetAuth?.user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    const tMeta = (targetAuth.user.user_metadata || {}) as Record<string, unknown>
    const tClient = typeof tMeta.client_id === 'string' ? tMeta.client_id : null
    if (!ctx.isMasterAdmin && tClient && ctx.clientId && tClient !== ctx.clientId) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const { error: authDeleteError } = await ctx.adminClient.auth.admin.deleteUser(id)
    if (authDeleteError) {
      console.error('[team API] Auth delete error:', authDeleteError)
      return NextResponse.json({ error: authDeleteError.message }, { status: 500 })
    }

    if (peopleTable) {
      await ctx.adminClient.from(peopleTable).delete().eq('id', id)
    }

    return NextResponse.json({
      deleted: true,
      ...(peopleTable ? {} : { warning: 'Auth user removed; no public.team / public.users row to delete.' }),
    })
  } catch (err) {
    console.error('[team API] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
