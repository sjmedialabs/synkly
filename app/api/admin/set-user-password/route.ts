import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/rbac-server'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRole) throw new Error('Supabase admin credentials are missing')
  return createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
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

export async function POST(request: NextRequest) {
  try {
    const serverClient = await createServerClient()
    const adminClient = getAdminClient()
    const {
      data: { user: sessionUser },
    } = await serverClient.auth.getUser()
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.isMasterAdmin && !ctx.isClientAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const user_id = String(body.user_id || '').trim()
    const password = String(body.password || '')
    const force_reset = Boolean(body.force_reset)
    if (!user_id || !password || password.length < 8) {
      return NextResponse.json({ error: 'user_id and valid password are required' }, { status: 400 })
    }

    const peopleTable = await resolvePeopleTable(adminClient)

    // Client admins can reset only users from their own client.
    if (ctx.isClientAdmin && !ctx.isMasterAdmin) {
      if (peopleTable) {
        const targetUser = await adminClient
          .from(peopleTable)
          .select('id, client_id')
          .eq('id', user_id)
          .maybeSingle()
        if (targetUser.error) {
          return NextResponse.json({ error: targetUser.error.message }, { status: 500 })
        }
        if (!targetUser.data) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }
        if (!ctx.clientId || targetUser.data.client_id !== ctx.clientId) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }
      } else {
        const targetAuthUser = await adminClient.auth.admin.getUserById(user_id)
        if (targetAuthUser.error || !targetAuthUser.data?.user) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }
        const targetClientId = (targetAuthUser.data.user.user_metadata as any)?.client_id || null
        if (!ctx.clientId || targetClientId !== ctx.clientId) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }
      }
    }

    const authRes = await adminClient.auth.admin.updateUserById(user_id, {
      password,
      email_confirm: true,
    })
    if (authRes.error) {
      return NextResponse.json({ error: authRes.error.message }, { status: 500 })
    }

    // Best effort DB flags for compatibility; schema-safe fallbacks.
    if (peopleTable) {
      const modernUpdate = await adminClient
        .from(peopleTable)
        .update({
          status: 'active',
          password_reset_required: force_reset,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', user_id)
      if (modernUpdate.error) {
        await adminClient.from(peopleTable).update({ updated_at: new Date().toISOString() }).eq('id', user_id)
      }
    } else {
      // No people table present; preserve compatibility via auth metadata only.
      const target = await adminClient.auth.admin.getUserById(user_id)
      if (!target.error && target.data?.user) {
        const currentMeta = (target.data.user.user_metadata || {}) as Record<string, unknown>
        await adminClient.auth.admin.updateUserById(user_id, {
          user_metadata: {
            ...currentMeta,
            password_reset_required: force_reset,
          },
        })
      }
    }

    return NextResponse.json({ success: true, force_reset })
  } catch (err: any) {
    console.error('[admin set-user-password] POST error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

