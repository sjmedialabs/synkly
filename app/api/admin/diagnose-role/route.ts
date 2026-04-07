import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/rbac-server'
import { resolveRole } from '@/lib/rbac'

export async function GET() {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Disabled in production' }, { status: 403 })
    }

    const serverClient = await createServerClient()
    const {
      data: { user: authUser },
      error: authError,
    } = await serverClient.auth.getUser()

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 401 })
    }
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = getAdminClient()

    const byId = await adminClient
      .from('users')
      .select('id, email, full_name, role, tenant_id')
      .eq('id', authUser.id)
      .maybeSingle()

    const byEmail = await adminClient
      .from('users')
      .select('id, email, full_name, role, tenant_id')
      .eq('email', (authUser.email || '').toLowerCase())
      .maybeSingle()

    const picked = byId.data || byEmail.data || null
    const pickedBy = byId.data ? 'id' : byEmail.data ? 'email' : null
    const resolvedRole = resolveRole(picked)

    return NextResponse.json({
      auth_user: {
        id: authUser.id,
        email: authUser.email || null,
      },
      lookup: {
        by_id: {
          row: byId.data || null,
          error: byId.error?.message || null,
        },
        by_email: {
          row: byEmail.data || null,
          error: byEmail.error?.message || null,
        },
      },
      picked: {
        source: pickedBy,
        row: picked,
      },
      resolved_role: resolvedRole,
      notes: [
        'If by_id is null but by_email exists, your auth user id does not match users.id.',
        'Role is resolved strictly from users.role.',
      ],
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

