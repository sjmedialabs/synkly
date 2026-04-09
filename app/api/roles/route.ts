import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/rbac-server'

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { adminClient, isMasterAdmin } = ctx

    const cached = masterDataCache.get<any>('roles')
    if (cached) return NextResponse.json({ roles: cached }, { headers: longCacheHeaders() })

    const { data, error } = await adminClient
      .from('roles')
      .select('id, name, description, permissions, created_at, updated_at')
      .order('name')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    masterDataCache.set('roles', data || [])
    return NextResponse.json({ roles: data || [] })
  } catch (e) {
    console.error('[roles API] GET:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.isMasterAdmin && !ctx.isClientAdmin) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const body = await request.json()
    const name = String(body.name || '').trim().toLowerCase().replace(/\s+/g, '_')
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const permissions = body.permissions || {}
    const description = body.description ? String(body.description).trim() : null

    // Clone support: if clone_from is provided, copy permissions from source role
    let finalPermissions = permissions
    if (body.clone_from) {
      const { data: source } = await ctx.adminClient
        .from('roles')
        .select('permissions')
        .eq('id', body.clone_from)
        .maybeSingle()
      if (source?.permissions) {
        finalPermissions = source.permissions
      }
    }

    const { data, error } = await ctx.adminClient
      .from('roles')
      .insert({
        name,
        description,
        permissions: finalPermissions,
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A role with this name already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    masterDataCache.delete('roles')
    return NextResponse.json({ role: data }, { status: 201 })
  } catch (e) {
    console.error('[roles API] POST:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.isMasterAdmin && !ctx.isClientAdmin) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const body = await request.json()
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'Role ID is required' }, { status: 400 })

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (body.description !== undefined) {
      payload.description = String(body.description || '').trim() || null
    }
    if (body.permissions !== undefined) {
      payload.permissions = body.permissions
    }
    if (body.name !== undefined) {
      payload.name = String(body.name).trim().toLowerCase().replace(/\s+/g, '_')
    }

    const { data, error } = await ctx.adminClient
      .from('roles')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    masterDataCache.delete('roles')
    return NextResponse.json({ role: data })
  } catch (e) {
    console.error('[roles API] PUT:', e)
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

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Role ID is required' }, { status: 400 })

    // Prevent deletion of core roles
    const { data: roleData } = await ctx.adminClient
      .from('roles')
      .select('name')
      .eq('id', id)
      .maybeSingle()

    const protectedRoles = ['master_admin', 'super_admin', 'client_admin', 'manager', 'team_lead', 'member', 'employee']
    if (roleData?.name && protectedRoles.includes(roleData.name)) {
      return NextResponse.json({ error: 'Cannot delete a built-in role' }, { status: 403 })
    }

    const { error } = await ctx.adminClient.from('roles').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    masterDataCache.delete('roles')
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[roles API] DELETE:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
