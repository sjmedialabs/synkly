import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessAll, getAuthContext } from '@/lib/rbac-server'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const typeParam = searchParams.get('type')
    const parentId = searchParams.get('parent_id')
    const tenantId = searchParams.get('tenant_id')
    
    if (!typeParam) {
      return NextResponse.json({ error: 'Type parameter is required' }, { status: 400 })
    }
    
    const adminClient = getAdminClient()
    
    // Get type ID from name
    const { data: typeData, error: typeError } = await adminClient
      .from('master_data_types')
      .select('id')
      .eq('name', typeParam)
      .single()
    
    if (typeError || !typeData) {
      return NextResponse.json({ error: 'Type not found' }, { status: 404 })
    }
    
    // Try modern schema first (parent_id + tenant_id)
    let modernQuery = adminClient
      .from('master_data_values')
      .select('id, name, is_active, parent_id, tenant_id')
      .eq('type_id', typeData.id)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (tenantId) {
      modernQuery = modernQuery.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    } else {
      modernQuery = modernQuery.is('tenant_id', null)
    }

    if (parentId) {
      modernQuery = modernQuery.eq('parent_id', parentId)
    }

    const modernRes = await modernQuery
    if (!modernRes.error) {
      return NextResponse.json({ values: modernRes.data || [] })
    }

    // Fallback for legacy schema without parent_id/tenant_id
    const legacyRes = await adminClient
      .from('master_data_values')
      .select('id, name, is_active')
      .eq('type_id', typeData.id)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (legacyRes.error) {
      console.error('[master-data values API] Failed to fetch values:', legacyRes.error)
      return NextResponse.json({ error: legacyRes.error.message }, { status: 500 })
    }

    const legacyValues = (legacyRes.data || []).map((value: any) => ({
      ...value,
      parent_id: null,
      tenant_id: null,
    }))

    return NextResponse.json({ values: legacyValues })
  } catch (err: unknown) {
    console.error('[master-data values API] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canAccessAll(ctx.role)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await request.json()
    const { type, name, parent_id, tenant_id } = body
    
    if (!type || !name || !name.trim()) {
      return NextResponse.json({ error: 'Type and name are required' }, { status: 400 })
    }
    
    const adminClient = getAdminClient()
    
    // Get type ID
    const { data: typeData, error: typeError } = await adminClient
      .from('master_data_types')
      .select('id')
      .eq('name', type)
      .single()
    
    if (typeError || !typeData) {
      return NextResponse.json({ error: 'Type not found' }, { status: 404 })
    }
    
    // 1) If global already exists (case-insensitive), return it
    const normalizedName = name.trim()
    let globalCandidates: any[] = []
    let modernSchema = true

    let globalExistsQuery = adminClient
      .from('master_data_values')
      .select('id, name, type_id, parent_id, tenant_id, is_active')
      .eq('type_id', typeData.id)
      .is('tenant_id', null)
      .eq('is_active', true)

    if (parent_id) {
      globalExistsQuery = globalExistsQuery.eq('parent_id', parent_id)
    } else {
      globalExistsQuery = globalExistsQuery.is('parent_id', null)
    }

    const modernExists = await globalExistsQuery
    if (modernExists.error) {
      modernSchema = false
      const legacyExists = await adminClient
        .from('master_data_values')
        .select('id, name, type_id, is_active')
        .eq('type_id', typeData.id)
        .eq('is_active', true)

      if (legacyExists.error) {
        return NextResponse.json({ error: legacyExists.error.message }, { status: 500 })
      }
      globalCandidates = legacyExists.data || []
    } else {
      globalCandidates = modernExists.data || []
    }

    const globalMatch = (globalCandidates || []).find(
      (v) => v.name.toLowerCase() === normalizedName.toLowerCase(),
    )

    if (globalMatch) {
      return NextResponse.json({ value: globalMatch, reused: true }, { status: 200 })
    }

    // 2) Create global value
    const insertPayload = modernSchema
      ? {
          type_id: typeData.id,
          name: normalizedName,
          parent_id: parent_id || null,
          tenant_id: null,
          is_active: true,
        }
      : {
          type_id: typeData.id,
          name: normalizedName,
          is_active: true,
        }

    const { data: globalValue, error: globalInsertError } = await adminClient
      .from('master_data_values')
      .insert(insertPayload as any)
      .single()

    if (globalInsertError) {
      console.error('[master-data values API] Failed to create global value:', globalInsertError)
      return NextResponse.json({ error: globalInsertError.message }, { status: 500 })
    }

    // 3) If tenant provided, also create tenant-specific copy unless duplicate exists
    if (tenant_id && modernSchema) {
      let tenantExistsQuery = adminClient
        .from('master_data_values')
        .select('id, name')
        .eq('type_id', typeData.id)
        .eq('tenant_id', tenant_id)
        .eq('is_active', true)

      if (parent_id) {
        tenantExistsQuery = tenantExistsQuery.eq('parent_id', parent_id)
      } else {
        tenantExistsQuery = tenantExistsQuery.is('parent_id', null)
      }

      const { data: tenantExisting } = await tenantExistsQuery
      const tenantMatch = (tenantExisting || []).find(
        (v) => v.name.toLowerCase() === normalizedName.toLowerCase(),
      )

      if (!tenantMatch) {
        await adminClient.from('master_data_values').insert({
          type_id: typeData.id,
          name: normalizedName,
          parent_id: parent_id || null,
          tenant_id,
          is_active: true,
        })
      }
    }

    return NextResponse.json({ value: globalValue, created: true }, { status: 201 })
  } catch (err: unknown) {
    console.error('[master-data values API] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canAccessAll(ctx.role)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Value ID is required' }, { status: 400 })
    }

    const adminClient = getAdminClient()
    const { error } = await adminClient
      .from('master_data_values')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[master-data values API] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
