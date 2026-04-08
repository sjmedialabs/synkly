import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/rbac-server'

function canManageDivisions(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return ctx.isMasterAdmin || ctx.isClientAdmin
}

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await ctx.adminClient.from('divisions').select('*').order('name')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[divisions API] DELETE:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
