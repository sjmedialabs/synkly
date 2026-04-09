import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/rbac-server'

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const designationId = searchParams.get('designation_id')
    const clientId = searchParams.get('client_id') || ctx.clientId

    let query = ctx.adminClient
      .from('designation_roles')
      .select('id, designation_id, role_id, client_id, roles (id, name, description)')
      .order('created_at', { ascending: false })

    if (designationId) {
      query = query.eq('designation_id', designationId)
    }

    // For non-master-admin, show client-specific + global mappings
    if (!ctx.isMasterAdmin && clientId) {
      query = query.or(`client_id.eq.${clientId},client_id.is.null`)
    }

    const { data, error } = await query
    if (error) {
      // Table may not exist yet
      if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
        return NextResponse.json({
          mappings: [],
          warning:
            'designation_roles table is missing. Run scripts/024_ensure_designation_roles_table.sql (or scripts/022_rbac_org_hierarchy.sql).',
        })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ mappings: data || [] })
  } catch (e) {
    console.error('[designation-roles API] GET:', e)
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
    const designationId = String(body.designation_id || '')
    const roleId = String(body.role_id || '')
    if (!designationId || !roleId) {
      return NextResponse.json({ error: 'designation_id and role_id are required' }, { status: 400 })
    }

    const clientId = ctx.isMasterAdmin ? (body.client_id || null) : ctx.clientId

    // Upsert: update if mapping exists for this designation+client, else insert
    let existingQuery = ctx.adminClient
      .from('designation_roles')
      .select('id')
      .eq('designation_id', designationId)
    existingQuery = clientId ? existingQuery.eq('client_id', clientId) : existingQuery.is('client_id', null)
    const { data: existing, error: existingErr } = await existingQuery.maybeSingle()
    if (existingErr) {
      if (existingErr.code === 'PGRST205' || existingErr.message?.includes('does not exist')) {
        return NextResponse.json(
          {
            error:
              'designation_roles table is missing. Run scripts/024_ensure_designation_roles_table.sql in Supabase SQL Editor.',
          },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: existingErr.message }, { status: 500 })
    }

    let result
    if (existing?.id) {
      result = await ctx.adminClient
        .from('designation_roles')
        .update({ role_id: roleId, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('*, roles (id, name)')
        .single()
    } else {
      result = await ctx.adminClient
        .from('designation_roles')
        .insert({
          designation_id: designationId,
          role_id: roleId,
          client_id: clientId,
        })
        .select('*, roles (id, name)')
        .single()
    }

    if (result.error) {
      if (result.error.code === 'PGRST205' || result.error.message?.includes('does not exist')) {
        return NextResponse.json(
          {
            error:
              'designation_roles table is missing. Run scripts/024_ensure_designation_roles_table.sql in Supabase SQL Editor.',
          },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }
    return NextResponse.json({ mapping: result.data }, { status: existing?.id ? 200 : 201 })
  } catch (e) {
    console.error('[designation-roles API] POST:', e)
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
    if (!id) return NextResponse.json({ error: 'Mapping ID is required' }, { status: 400 })

    const { error } = await ctx.adminClient.from('designation_roles').delete().eq('id', id)
    if (error && (error.code === 'PGRST205' || error.message?.includes('does not exist'))) {
      return NextResponse.json(
        {
          error:
            'designation_roles table is missing. Run scripts/024_ensure_designation_roles_table.sql in Supabase SQL Editor.',
        },
        { status: 503 },
      )
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[designation-roles API] DELETE:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
