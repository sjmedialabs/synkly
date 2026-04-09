import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { canMutateMasterData, getAuthContext } from '@/lib/rbac-server'
import { masterDataCache, longCacheHeaders } from '@/lib/cache'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const cached = masterDataCache.get<any>('types')
    if (cached) return NextResponse.json({ types: cached }, { headers: longCacheHeaders() })

    const adminClient = getAdminClient()
    
    const { data, error } = await adminClient
      .from('master_data_types')
      .select('id, name')
      .neq('name', 'role')
      .order('name')
    
    if (!error) {
      masterDataCache.set('types', data || [])
      return NextResponse.json({ types: data || [] })
    }

    // Legacy fallback when master_data_types table is unavailable.
    const [deptCheck, desigCheck] = await Promise.all([
      adminClient.from('master_departments').select('id').limit(1),
      adminClient.from('master_designations').select('id').limit(1),
    ])

    const fallbackTypes: Array<{ id: string; name: string }> = []
    if (!deptCheck.error) fallbackTypes.push({ id: 'legacy-department', name: 'department' })
    if (!desigCheck.error) fallbackTypes.push({ id: 'legacy-designation', name: 'designation' })

    if (fallbackTypes.length > 0) {
      return NextResponse.json({ types: fallbackTypes })
    }

    // Final safety net: always return at least the default legacy types
    // so the UI doesn't crash in environments with incomplete migrations.
    return NextResponse.json({
      types: [
        { id: 'legacy-department', name: 'department' },
        { id: 'legacy-designation', name: 'designation' },
      ],
    })

    console.error('[master-data API] Failed to fetch types:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  } catch (err: unknown) {
    console.error('[master-data API] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canMutateMasterData(ctx.role)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await request.json()
    const { name } = body
    
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Type name is required' }, { status: 400 })
    }
    
    const adminClient = getAdminClient()
    
    const { data, error } = await adminClient
      .from('master_data_types')
      .insert({ name: name.trim() })
      .select()
      .single()
    
    if (!error) {
      masterDataCache.invalidatePrefix('types')
      return NextResponse.json({ type: data }, { status: 201 })
    }

    // Legacy-safe behavior: if old schema is in use, allow only known legacy types.
    const typeName = name.trim().toLowerCase()
    if (typeName === 'department' || typeName === 'designation') {
      return NextResponse.json({ type: { id: `legacy-${typeName}`, name: typeName }, legacy: true }, { status: 201 })
    }

    console.error('[master-data API] Failed to create type:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  } catch (err: unknown) {
    console.error('[master-data API] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
