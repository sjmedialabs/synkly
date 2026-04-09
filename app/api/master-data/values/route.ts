import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { canMutateMasterData, getAuthContext } from '@/lib/rbac-server'
import { masterDataCache } from '@/lib/cache'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

async function resolveOrCreateTypeId(
  adminClient: ReturnType<typeof getAdminClient>,
  typeName: string,
  allowCreate: boolean,
): Promise<string | null> {
  const normalized = String(typeName || '').trim().toLowerCase()
  if (!normalized) return null

  const byExact = await adminClient
    .from('master_data_types')
    .select('id, name')
    .eq('name', normalized)
    .maybeSingle()
  if (!byExact.error && byExact.data?.id) return byExact.data.id

  const byIlike = await adminClient
    .from('master_data_types')
    .select('id, name')
    .ilike('name', normalized)
    .limit(1)
  if (!byIlike.error && byIlike.data && byIlike.data.length > 0) {
    return byIlike.data[0].id
  }

  if (!allowCreate) return null

  const created = await adminClient
    .from('master_data_types')
    .insert({ name: normalized } as any)
    .select('id')
    .single()
  if (!created.error && created.data?.id) return created.data.id

  // Concurrent request may have created the row after our initial read.
  if (created.error?.code === '23505') {
    const retry = await adminClient
      .from('master_data_types')
      .select('id, name')
      .ilike('name', normalized)
      .limit(1)
    if (!retry.error && retry.data && retry.data.length > 0) {
      return retry.data[0].id
    }
  }

  return null
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
    
    const cacheKey = `values:${typeParam}:${parentId || ''}:${tenantId || ''}`
    const cached = masterDataCache.get<any>(cacheKey)
    if (cached) return NextResponse.json({ values: cached })

    const adminClient = getAdminClient()
    
    const typeId = await resolveOrCreateTypeId(adminClient, typeParam, false)
    if (!typeId) {
      // Legacy fallback for installations using master_departments/master_designations only.
      if (typeParam === 'department') {
        const legacyDeptRes = await adminClient
          .from('master_departments')
          .select('id, name, is_active')
          .eq('is_active', true)
          .order('name', { ascending: true })
        if (legacyDeptRes.error) return NextResponse.json({ values: [] })
        const values = (legacyDeptRes.data || []).map((row: any) => ({
          ...row,
          parent_id: null,
          tenant_id: null,
        }))
        return NextResponse.json({ values })
      }
      if (typeParam === 'designation') {
        const legacyDesigRes = await adminClient
          .from('master_designations')
          .select('id, name, is_active')
          .eq('is_active', true)
          .order('name', { ascending: true })
        if (legacyDesigRes.error) return NextResponse.json({ values: [] })
        const values = (legacyDesigRes.data || []).map((row: any) => ({
          ...row,
          parent_id: null,
          tenant_id: null,
        }))
        return NextResponse.json({ values })
      }
      return NextResponse.json({ values: [] })
    }
    
    // Try modern schema first (parent_id + tenant_id)
    let modernQuery = adminClient
      .from('master_data_values')
      .select('id, name, is_active, parent_id, tenant_id')
      .eq('type_id', typeId)
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
      masterDataCache.set(cacheKey, modernRes.data || [])
      return NextResponse.json({ values: modernRes.data || [] })
    }

    // Fallback for legacy schema without parent_id/tenant_id
    const legacyRes = await adminClient
      .from('master_data_values')
      .select('id, name, is_active')
      .eq('type_id', typeId)
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
    if (!canMutateMasterData(ctx.role)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await request.json()
    const { type, name, parent_id, tenant_id } = body
    
    if (!type || !name || !name.trim()) {
      return NextResponse.json({ error: 'Type and name are required' }, { status: 400 })
    }
    
    const adminClient = getAdminClient()
    
    const typeId = await resolveOrCreateTypeId(adminClient, type, true)
    if (!typeId) {
      return NextResponse.json(
        {
          error:
            'Master data type could not be resolved in modern schema. Please ensure `master_data_types` exists and contains department/designation rows.',
        },
        { status: 500 },
      )
    }
    
    // 1) If global already exists (case-insensitive), return it
    const normalizedName = name.trim()
    let globalCandidates: any[] = []
    let modernSchema = true

    let globalExistsQuery = adminClient
      .from('master_data_values')
      .select('id, name, type_id, parent_id, tenant_id, is_active')
      .eq('type_id', typeId)
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
        .eq('type_id', typeId)
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
          type_id: typeId,
          name: normalizedName,
          parent_id: parent_id || null,
          tenant_id: null,
          is_active: true,
        }
      : {
          type_id: typeId,
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
        .eq('type_id', typeId)
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
          type_id: typeId,
          name: normalizedName,
          parent_id: parent_id || null,
          tenant_id,
          is_active: true,
        })
      }
    }

    masterDataCache.invalidatePrefix('values')
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
    if (!canMutateMasterData(ctx.role)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Value ID is required' }, { status: 400 })
    }

    const adminClient = getAdminClient()

    const del = async (table: string) =>
      adminClient.from(table).delete().eq('id', id).select('id')

    const md = await del('master_data_values')
    if (md.error) return NextResponse.json({ error: md.error.message }, { status: 500 })
    if (md.data && md.data.length > 0) { masterDataCache.invalidatePrefix('values'); return NextResponse.json({ success: true }) }

    const dept = await del('master_departments')
    if (dept.error) return NextResponse.json({ error: dept.error.message }, { status: 500 })
    if (dept.data && dept.data.length > 0) { masterDataCache.invalidatePrefix('values'); masterDataCache.invalidatePrefix('departments'); return NextResponse.json({ success: true }) }

    const desig = await del('master_designations')
    if (desig.error) return NextResponse.json({ error: desig.error.message }, { status: 500 })
    if (desig.data && desig.data.length > 0) { masterDataCache.invalidatePrefix('values'); masterDataCache.invalidatePrefix('designations'); return NextResponse.json({ success: true }) }

    return NextResponse.json(
      { error: 'Could not delete this value (not found or blocked by database rules).' },
      { status: 404 },
    )
  } catch (err: unknown) {
    console.error('[master-data values API] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canMutateMasterData(ctx.role)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await request.json()
    const { id, parent_id } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const adminClient = getAdminClient()

    // Try modern schema first
    const modernUpdate = await adminClient
      .from('master_data_values')
      .update({ parent_id: parent_id ?? null, updated_at: new Date().toISOString() } as any)
      .eq('id', id)
      .select('id, name, parent_id, is_active')
      .single()

    if (!modernUpdate.error) {
      masterDataCache.invalidatePrefix('values')
      return NextResponse.json({ value: modernUpdate.data })
    }

    // Fallback: try without updated_at
    const legacyUpdate = await adminClient
      .from('master_data_values')
      .update({ parent_id: parent_id ?? null } as any)
      .eq('id', id)
      .select('id, name, parent_id, is_active')
      .single()

    if (legacyUpdate.error) {
      console.error('[master-data values API] PATCH error:', legacyUpdate.error)
      return NextResponse.json({ error: legacyUpdate.error.message }, { status: 500 })
    }

    masterDataCache.invalidatePrefix('values')
    return NextResponse.json({ value: legacyUpdate.data })
  } catch (err: unknown) {
    console.error('[master-data values API] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
