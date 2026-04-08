import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRole) throw new Error('Supabase admin credentials are missing')
  return createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function POST() {
  try {
    const serverClient = await createServerClient()
    const adminClient = getAdminClient()
    const {
      data: { user },
    } = await serverClient.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const modernUpdate = await adminClient
      .from('team')
      .update({
        status: 'active',
        password_reset_required: false,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', user.id)

    if (modernUpdate.error) {
      await adminClient.from('team').update({ updated_at: new Date().toISOString() }).eq('id', user.id)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[onboarding-complete] POST error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

