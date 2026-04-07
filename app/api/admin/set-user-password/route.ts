import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { normalizeRole } from '@/lib/rbac'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRole) throw new Error('Supabase admin credentials are missing')
  return createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function POST(request: NextRequest) {
  try {
    const serverClient = await createServerClient()
    const adminClient = getAdminClient()
    const {
      data: { user: sessionUser },
    } = await serverClient.auth.getUser()
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const roleRes = await adminClient
      .from('users')
      .select('role')
      .eq('id', sessionUser.id)
      .single()
    let currentRole = normalizeRole(roleRes.data?.role)
    if (roleRes.error) {
      const legacyRole = await adminClient
        .from('users')
        .select('role')
        .eq('id', sessionUser.id)
        .single()
      currentRole = normalizeRole((legacyRole.data as any)?.role)
    }
    if (currentRole !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const user_id = String(body.user_id || '').trim()
    const password = String(body.password || '')
    const force_reset = Boolean(body.force_reset)
    if (!user_id || !password || password.length < 8) {
      return NextResponse.json({ error: 'user_id and valid password are required' }, { status: 400 })
    }

    const authRes = await adminClient.auth.admin.updateUserById(user_id, {
      password,
      email_confirm: true,
    })
    if (authRes.error) {
      return NextResponse.json({ error: authRes.error.message }, { status: 500 })
    }

    // Best effort DB flags for compatibility; schema-safe fallbacks
    const modernUpdate = await adminClient
      .from('users')
      .update({
        status: 'active',
        password_reset_required: force_reset,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', user_id)
    if (modernUpdate.error) {
      await adminClient.from('users').update({ updated_at: new Date().toISOString() }).eq('id', user_id)
    }

    return NextResponse.json({ success: true, force_reset })
  } catch (err: any) {
    console.error('[admin set-user-password] POST error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

