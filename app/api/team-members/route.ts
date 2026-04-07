import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { ROLE_LABELS, ROLE_PERMISSIONS, resolveRole, type RoleKey } from '@/lib/rbac'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRole) {
    throw new Error('Supabase admin credentials are missing')
  }
  return createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET() {
  try {
    const adminClient = getAdminClient()
    const modernRes = await adminClient
      .from('users')
      .select('id, email, full_name, role, designation, is_active, created_at')
      .order('created_at', { ascending: false })

    let users = modernRes.data as any[] | null
    let error = modernRes.error

    if (error) {
      const legacyRes = await adminClient
        .from('users')
        .select('id, email, full_name, designation, is_active, created_at')
        .order('created_at', { ascending: false })
      users = legacyRes.data as any[] | null
      error = legacyRes.error
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const adapted = (users || []).map((user) => {
      const canonicalRole = resolveRole(user)
      return {
        ...user,
        name: user.full_name || null,
        role: canonicalRole,
        role_label: canonicalRole ? ROLE_LABELS[canonicalRole] : null,
        permissions: canonicalRole ? ROLE_PERMISSIONS[canonicalRole] : [],
      }
    })

    return NextResponse.json({ users: adapted })
  } catch (err: any) {
    console.error('[team-members API] GET error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const serverClient = await createServerClient()
    const adminClient = getAdminClient()
    const {
      data: { user: sessionUser },
    } = await serverClient.auth.getUser()

    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUserModern = await adminClient
      .from('users')
      .select('role')
      .eq('id', sessionUser.id)
      .single()
    let currentUserData: any = currentUserModern.data
    if (currentUserModern.error) {
      const currentUserLegacy = await adminClient
        .from('users')
        .select('role')
        .eq('id', sessionUser.id)
        .single()
      currentUserData = currentUserLegacy.data
    }

    const isSuperAdmin = resolveRole({ role: currentUserData?.role }) === 'super_admin'

    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Only Super Admin (Client Side) can create team members' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const email = String(body.email || '').trim().toLowerCase()
    const full_name = String(body.full_name || '').trim()
    const department = String(body.department || '').trim()
    const division = String(body.division || '').trim()
    const designation = String(body.designation || '').trim()
    const reporting_manager_id = body.reporting_manager_id ? String(body.reporting_manager_id) : null
    const role = String(body.role || '').trim().toLowerCase() as RoleKey
    const password = body.password ? String(body.password) : ''
    const experience_years = Number(body.experience_years ?? 0)
    const skills = Array.isArray(body.skills)
      ? body.skills.map((s: unknown) => String(s).trim()).filter(Boolean)
      : String(body.skills || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)

    if (!email || !emailRegex.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }
    if (!full_name || !department || !designation || !role) {
      return NextResponse.json(
        { error: 'full_name, department, designation and role are required' },
        { status: 400 },
      )
    }
    if (!(role in ROLE_LABELS)) {
      return NextResponse.json({ error: 'Invalid role selected' }, { status: 400 })
    }
    if (!Number.isFinite(experience_years) || experience_years < 0 || experience_years > 50) {
      return NextResponse.json({ error: 'experience_years must be between 0 and 50' }, { status: 400 })
    }
    if (reporting_manager_id && reporting_manager_id === sessionUser.id) {
      return NextResponse.json(
        { error: 'Reporting manager must not be same as user' },
        { status: 400 },
      )
    }

    const {
      data: { users: authUsers },
    } = await adminClient.auth.admin.listUsers()
    const existingAuth = authUsers?.find((u) => (u.email || '').toLowerCase() === email)
    if (existingAuth) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 })
    }

    const { data: existingDb } = await adminClient.from('users').select('id').eq('email', email).maybeSingle()
    if (existingDb) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 })
    }

    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/set-password`
    const inviteMetadata = {
      full_name,
      role,
      permissions: ROLE_PERMISSIONS[role],
      invited: true,
      invited_at: new Date().toISOString(),
    }

    /**
     * Login requirement: user must either have a password (hashed in Auth) or receive an invite
     * so they can set one. We never leave an auth user without a successful invite send.
     */
    let newUserId: string | null = null

    const isDirectPasswordFlow = password.trim().length > 0
    if (isDirectPasswordFlow && password.trim().length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const inviteRes = isDirectPasswordFlow
      ? { error: new Error('skip invite for direct password flow'), data: null as any }
      : await adminClient.auth.admin.inviteUserByEmail(email, {
          redirectTo,
          data: inviteMetadata,
        })

    if (!inviteRes.error) {
      newUserId = inviteRes.data?.user?.id ?? null
      if (!newUserId) {
        const { data: listData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const found = listData?.users?.find((u) => (u.email || '').toLowerCase() === email)
        newUserId = found?.id ?? null
      }
    }

    if (!newUserId) {
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: isDirectPasswordFlow,
        password: isDirectPasswordFlow ? password : undefined,
        user_metadata: inviteMetadata,
      })
      if (authError || !authData.user?.id) {
        return NextResponse.json(
          { error: authError?.message || 'Failed to create auth user' },
          { status: 500 },
        )
      }
      newUserId = authData.user.id

      if (!isDirectPasswordFlow) {
        const secondInvite = await adminClient.auth.admin.inviteUserByEmail(email, {
          redirectTo,
          data: inviteMetadata,
        })
        if (secondInvite.error) {
          await adminClient.auth.admin.deleteUser(newUserId)
          return NextResponse.json(
            {
              error:
                secondInvite.error.message ||
                'Invite email could not be sent. User was not created — configure SMTP or check Supabase Auth settings.',
            },
            { status: 502 },
          )
        }
      }
    }

    if (reporting_manager_id && reporting_manager_id === newUserId) {
      await adminClient.auth.admin.deleteUser(newUserId)
      return NextResponse.json(
        { error: 'Reporting manager must not be same as user' },
        { status: 400 },
      )
    }

    const basePayload: Record<string, unknown> = {
      id: newUserId,
      email,
      full_name,
      department,
      designation,
      reporting_manager_id,
      experience_years,
      skillset: skills,
      is_active: true,
      updated_at: new Date().toISOString(),
    }

    // Modern schema attempt: explicit role + division + permissions.
    let insertResult = await adminClient
      .from('users')
      .upsert(
        {
          ...basePayload,
          division: division || null,
          role,
          permissions: ROLE_PERMISSIONS[role],
          status: 'active',
          password_reset_required: false,
        } as any,
        { onConflict: 'id' },
      )
      .select('*')
      .single()

    // Legacy fallback if modern columns do not exist.
    if (insertResult.error) {
      insertResult = await adminClient
        .from('users')
        .upsert(
          {
            ...basePayload,
            role,
            designation: designation || ROLE_LABELS[role],
          },
          { onConflict: 'id' },
        )
        .select('*')
        .single()
    }

    // Second fallback for older schemas that don't yet have users.role.
    if (insertResult.error?.code === '42703' || insertResult.error?.code === 'PGRST204') {
      insertResult = await adminClient
        .from('users')
        .upsert(
          {
            ...basePayload,
            designation: designation || ROLE_LABELS[role],
          },
          { onConflict: 'id' },
        )
        .select('*')
        .single()
    }

    if (insertResult.error) {
      await adminClient.auth.admin.deleteUser(newUserId)
      return NextResponse.json({ error: insertResult.error.message }, { status: 500 })
    }

    // Best effort audit log, non-blocking and schema-safe
    await adminClient.from('audit_logs').insert({
      actor_id: sessionUser.id,
      action: 'team_member_created',
      target_id: newUserId,
      metadata: { email, role, invitation_sent: true },
    } as any)

    return NextResponse.json(
      {
        user: insertResult.data,
        invitation_sent: !isDirectPasswordFlow,
        message:
          isDirectPasswordFlow
            ? 'Team member created with password. User can sign in immediately.'
            : 'Team member created. An invite email was sent so they can set a password and sign in.',
      },
      { status: 201 },
    )
  } catch (err: any) {
    console.error('[team-members API] POST error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

