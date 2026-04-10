import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/rbac-server'

function canManageDivisions(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return ctx.isMasterAdmin || ctx.isClientAdmin
}

function isMissingTable(err: { code?: string; message?: string } | null, tableHint: string) {
  if (!err) return false
  if (err.code === 'PGRST205') return true
  const m = String(err.message || '').toLowerCase()
  return m.includes(`public.${tableHint}`) || m.includes('could not find the table')
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const url = new URL(request.url)
    const parentId = url.searchParams.get('parent_id')

    let divisionsQuery = ctx.adminClient.from('divisions').select('*').order('name')
    if (parentId) divisionsQuery = divisionsQuery.eq('parent_id', parentId)
    const { data, error } = await divisionsQuery
    if (error) {
      if (!isMissingTable(error, 'divisions')) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      // Fallback for environments where dedicated `divisions` table is missing:
      // reuse master_data_values(type_id -> master_data_types.name='division'), which is used by settings.
      const typeRes = await ctx.adminClient
        .from('master_data_types')
        .select('id')
        .eq('name', 'division')
        .maybeSingle()
      if (typeRes.error || !typeRes.data?.id) {
        return NextResponse.json({ error: "Missing master_data_types row for 'division'" }, { status: 500 })
      }
      const { data: md, error: mdErr } = await ctx.adminClient
        .from('master_data_values')
        .select('id, name, parent_id, is_active, created_at, updated_at')
        .eq('type_id', typeRes.data.id)
        .eq('is_active', true)
        .order('name', { ascending: true })
      const filteredRows =
        parentId && !mdErr
          ? (md || []).filter((r: any) => (r.parent_id || null) === parentId)
          : md
      if (mdErr) return NextResponse.json({ error: mdErr.message }, { status: 500 })
      const divisions = (filteredRows || []).map((r: any) => ({
        id: String(r.id),
        name: String(r.name || ''),
        parent_id: (r.parent_id as string | null) ?? null,
        description: null,
        sort_order: null,
        is_active: r.is_active ?? true,
        created_at: r.created_at ?? null,
        updated_at: r.updated_at ?? null,
      }))
      return NextResponse.json({ divisions, source: 'master_data_values' })
    }
    return NextResponse.json({ divisions: data || [] })
  } catch (e) {
    console.error('[divisions API] GET:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canManageDivisions(ctx)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await request.json()
    const name = String(body.name || '').trim()
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const { data, error } = await ctx.adminClient
      .from('divisions')
      .insert({
        name,
        description: body.description ? String(body.description).trim() || null : null,
        parent_id: body.parent_id ? String(body.parent_id) : null,
      })
      .select('*')
      .single()

    if (error) {
      if (!isMissingTable(error, 'divisions')) return NextResponse.json({ error: error.message }, { status: 500 })
      // Fallback to master_data_values(type=division)
      const typeRes = await ctx.adminClient
        .from('master_data_types')
        .select('id')
        .eq('name', 'division')
        .maybeSingle()
      if (typeRes.error || !typeRes.data?.id) {
        return NextResponse.json({ error: "Missing master_data_types row for 'division'" }, { status: 500 })
      }
      const mdIns = await ctx.adminClient
        .from('master_data_values')
        .insert({
          type_id: typeRes.data.id,
          name,
          parent_id: body.parent_id ? String(body.parent_id) : null,
          is_active: true,
        } as any)
        .select('id, name, parent_id, is_active, created_at, updated_at')
        .single()
      if (mdIns.error) return NextResponse.json({ error: mdIns.error.message }, { status: 500 })
      return NextResponse.json({ division: mdIns.data, source: 'master_data_values' }, { status: 201 })
    }
    return NextResponse.json({ division: data }, { status: 201 })
  } catch (e) {
    console.error('[divisions API] POST:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canManageDivisions(ctx)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await request.json()
    const id = String(body.id || '')
    const name = String(body.name || '').trim()
    if (!id || !name) return NextResponse.json({ error: 'id and name are required' }, { status: 400 })

    const payload: Record<string, unknown> = {
      name,
      updated_at: new Date().toISOString(),
    }
    if (body.description !== undefined) {
      payload.description = String(body.description || '').trim() || null
    }

    const { data, error } = await ctx.adminClient
      .from('divisions')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      if (!isMissingTable(error, 'divisions')) return NextResponse.json({ error: error.message }, { status: 500 })
      const mdUp = await ctx.adminClient
        .from('master_data_values')
        .update({ name, updated_at: new Date().toISOString() } as any)
        .eq('id', id)
        .select('id, name, parent_id, is_active, created_at, updated_at')
        .single()
      if (mdUp.error) return NextResponse.json({ error: mdUp.error.message }, { status: 500 })
      return NextResponse.json({ division: mdUp.data, source: 'master_data_values' })
    }
    return NextResponse.json({ division: data })
  } catch (e) {
    console.error('[divisions API] PUT:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canManageDivisions(ctx)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { error } = await ctx.adminClient.from('divisions').delete().eq('id', id)
    if (error) {
      if (!isMissingTable(error, 'divisions')) return NextResponse.json({ error: error.message }, { status: 500 })
      const mdDel = await ctx.adminClient.from('master_data_values').delete().eq('id', id).select('id')
      if (mdDel.error) return NextResponse.json({ error: mdDel.error.message }, { status: 500 })
      if (!mdDel.data || mdDel.data.length === 0) return NextResponse.json({ error: 'Division not found' }, { status: 404 })
      return NextResponse.json({ success: true, source: 'master_data_values' })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[divisions API] DELETE:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
