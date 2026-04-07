import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessAll, getAuthContext } from '@/lib/rbac-server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canAccessAll(ctx.role)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await request.json()
    const { module_id, is_active } = body

    if (!module_id || typeof is_active !== 'boolean') {
      return NextResponse.json(
        { error: 'module_id and is_active are required' },
        { status: 400 },
      )
    }

    const { data, error } = await supabase
      .from('modules')
      .update({ is_active })
      .eq('id', module_id)
      .select('id, name, is_active, project_id')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ module: data })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
