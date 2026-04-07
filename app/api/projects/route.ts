import { NextResponse } from 'next/server'
import { canAccessAll, getAuthContext } from '@/lib/rbac-server'
import { NextRequest } from 'next/server'

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { adminClient, userId, role, tenantId } = ctx
    const isPlatformMasterAdmin = role === 'master_admin' && !tenantId
    const isTenantUser = role !== 'master_admin' && !!tenantId

    let projects: any[] = []

    if (isPlatformMasterAdmin) {
      const fullRes = await adminClient
        .from('projects')
        .select('id, name, projected_end_date, end_date, created_at, tenant_id, client_id')
        .order('created_at', { ascending: false })
      if (!fullRes.error) {
        projects = fullRes.data || []
      } else {
        const fallbackRes = await adminClient
          .from('projects')
          .select('id, name, projected_end_date, end_date, created_at, client_id')
          .order('created_at', { ascending: false })
        if (fallbackRes.error) return NextResponse.json({ error: fallbackRes.error.message }, { status: 500 })
        projects = fallbackRes.data || []
      }
    } else if (!isTenantUser) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    } else if (canAccessAll(role)) {
      let tenantScoped = await adminClient
        .from('projects')
        .select('id, name, projected_end_date, end_date, created_at, tenant_id, client_id')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
      if (tenantScoped.error) {
        tenantScoped = await adminClient
          .from('projects')
          .select('id, name, projected_end_date, end_date, created_at, client_id')
          .eq('client_id', tenantId)
          .order('created_at', { ascending: false })
      }
      if (tenantScoped.error) return NextResponse.json({ error: tenantScoped.error.message }, { status: 500 })
      projects = tenantScoped.data || []
    } else if (role === 'team_lead') {
      const [leadProjectsRes, projectUsersRes] = await Promise.all([
        adminClient
          .from('projects')
          .select('id, name, projected_end_date, end_date, created_at, tenant_id, client_id')
          .eq('team_lead_id', userId),
        adminClient
          .from('project_users')
          .select('project_id')
          .eq('user_id', userId),
      ])

      if (leadProjectsRes.error) return NextResponse.json({ error: leadProjectsRes.error.message }, { status: 500 })
      const direct = (leadProjectsRes.data || []).filter(
        (p: any) => p?.tenant_id === tenantId || p?.client_id === tenantId,
      )
      const projectIds = Array.from(new Set((projectUsersRes.data || []).map((r: any) => r.project_id).filter(Boolean)))

      let extra: any[] = []
      if (projectIds.length > 0) {
        const extraRes = await adminClient
          .from('projects')
          .select('id, name, projected_end_date, end_date, created_at, tenant_id, client_id')
          .in('id', projectIds)
        if (!extraRes.error) {
          extra = (extraRes.data || []).filter((p: any) => p?.tenant_id === tenantId || p?.client_id === tenantId)
        }
      }
      const byId = new Map<string, any>()
      ;[...direct, ...extra].forEach((p) => byId.set(p.id, p))
      projects = Array.from(byId.values()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    } else {
      // Strict requirement: non-management roles cannot access projects.
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const ids = projects.map((p) => p.id)
    let totalsByProject: Record<string, number> = {}
    if (ids.length > 0) {
      const tasksRes = await adminClient
        .from('tasks')
        .select('project_id, estimation')
        .in('project_id', ids)
      if (!tasksRes.error && tasksRes.data) {
        totalsByProject = tasksRes.data.reduce((acc: Record<string, number>, row: any) => {
          if (!row.project_id) return acc
          acc[row.project_id] = (acc[row.project_id] || 0) + Number(row.estimation || 0)
          return acc
        }, {})
      }
    }

    return NextResponse.json({
      role,
      projects: projects.map((p) => ({
        ...p,
        totalEstimation: totalsByProject[p.id] || 0,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { adminClient, userId, role, tenantId } = ctx
    const isPlatformMasterAdmin = role === 'master_admin' && !tenantId
    const isTenantProjectCreator =
      !!tenantId && (role === 'super_admin' || role === 'project_manager' || role === 'delivery_manager')
    if (!isPlatformMasterAdmin && !isTenantProjectCreator) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const body = await request.json()
    const name = String(body.name || '').trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const scopedTenantId = isPlatformMasterAdmin
      ? String(body.tenant_id || body.client_id || '').trim() || null
      : tenantId
    if (!scopedTenantId) {
      return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
    }

    const basePayload: Record<string, unknown> = {
      name,
      description: body.description || null,
      priority: body.priority || 'medium',
      status: body.status || 'active',
      team_lead_id: body.team_lead_id || null,
      projected_end_date: body.projected_end_date || null,
      onboarded_date: body.onboarded_date || null,
      assigned_date: body.assigned_date || null,
      inputs: body.inputs || {},
      created_by: userId,
      tenant_id: scopedTenantId,
      client_id: scopedTenantId,
    }

    let insertRes = await adminClient
      .from('projects')
      .insert([basePayload] as any)
      .select('id, name, projected_end_date, created_at, tenant_id, client_id')
      .single()

    if (insertRes.error?.code === '42703' || insertRes.error?.code === 'PGRST204') {
      const fallbackPayload = {
        name,
        description: body.description || null,
        priority: body.priority || 'medium',
        status: body.status || 'active',
        project_lead_id: body.team_lead_id || null,
        start_date: body.assigned_date || body.onboarded_date || null,
        end_date: body.projected_end_date || null,
        created_by: userId,
        client_id: scopedTenantId,
      }
      insertRes = await adminClient
        .from('projects')
        .insert([fallbackPayload] as any)
        .select('id, name, end_date, created_at, client_id')
        .single()
    }

    if (insertRes.error || !insertRes.data) {
      return NextResponse.json({ error: insertRes.error?.message || 'Failed to create project' }, { status: 500 })
    }

    if (body.team_lead_id) {
      await adminClient.from('project_users').upsert(
        { project_id: insertRes.data.id, user_id: body.team_lead_id, role: 'lead' } as any,
        { onConflict: 'project_id,user_id' },
      )
    }

    return NextResponse.json({ project: insertRes.data }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

