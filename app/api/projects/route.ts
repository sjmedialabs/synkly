import { NextResponse } from 'next/server'
import {
  getAuthContext,
  canAccessAll,
  canCreateProjects,
  provisionClientForClientAdminIfMissing,
  upsertClientRowForFk,
} from '@/lib/rbac-server'
import { NextRequest } from 'next/server'

function isMissingProjectsTable(err: { code?: string; message?: string } | null) {
  if (!err) return false
  if (err.code === 'PGRST205') return true
  const m = String(err.message || '')
  return m.includes("public.projects") || m.includes('Could not find the table')
}

const PROJECT_LIST_SELECT_WITH_CLIENTS = `
  id,
  name,
  description,
  status,
  priority,
  phase,
  start_date,
  end_date,
  budget,
  created_at,
  client_id,
  project_lead_id,
  created_by,
  clients (id, name)
`.replace(/\s+/g, ' ')

const PROJECT_LIST_SELECT_MINIMAL = `
  id,
  name,
  description,
  status,
  priority,
  phase,
  start_date,
  end_date,
  budget,
  created_at,
  client_id,
  project_lead_id,
  created_by
`.replace(/\s+/g, ' ')

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const { adminClient, role, clientId, isMasterAdmin } = ctx

    const projectsProbe = await adminClient.from('projects').select('id').limit(1)
    if (projectsProbe.error && isMissingProjectsTable(projectsProbe.error)) {
      return NextResponse.json({
        role,
        projects: [],
        warning:
          'public.projects is missing. In Supabase SQL Editor, run scripts/018_ensure_projects_table.sql',
      })
    }

    let projects: any[] = []

    async function fetchProjectsList(applyFilter?: (q: any) => any) {
      const attempts = [PROJECT_LIST_SELECT_WITH_CLIENTS, PROJECT_LIST_SELECT_MINIMAL]
      let lastErr: { code?: string; message?: string } | null = null
      for (const sel of attempts) {
        let q = adminClient.from('projects').select(sel).order('created_at', { ascending: false })
        if (applyFilter) q = applyFilter(q)
        const { data, error } = await q
        if (!error) return { data: data || [], error: null as null }
        lastErr = error
        if (isMissingProjectsTable(error)) {
          return { data: [], error }
        }
      }
      return { data: [], error: lastErr }
    }

    // Apply client filtering based on role
    if (isMasterAdmin) {
      const { data, error } = await fetchProjectsList()
      if (error) {
        if (isMissingProjectsTable(error)) {
          return NextResponse.json({
            role,
            projects: [],
            warning:
              'public.projects is missing. In Supabase SQL Editor, run scripts/018_ensure_projects_table.sql',
          })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      projects = data || []
    } else if (canAccessAll(role) || role === 'manager') {
      if (clientId) {
        const { data, error } = await fetchProjectsList((q) => q.eq('client_id', clientId))
        if (error) {
          if (isMissingProjectsTable(error)) {
            return NextResponse.json({
              role,
              projects: [],
              warning:
                'public.projects is missing. In Supabase SQL Editor, run scripts/018_ensure_projects_table.sql',
            })
          }
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
        projects = data || []
      }
    } else if (role === 'team_lead') {
      // Team lead sees projects they lead or are assigned to
      const [leadProjectsRes, projectUsersRes] = await Promise.all([
        adminClient
          .from('projects')
          .select('id, name, description, status, priority, phase, start_date, end_date, budget, created_at, client_id')
          .eq('project_lead_id', ctx.userId),
        adminClient
          .from('project_users')
          .select('project_id')
          .eq('user_id', ctx.userId),
      ])

      if (leadProjectsRes.error) {
        if (isMissingProjectsTable(leadProjectsRes.error)) {
          return NextResponse.json({
            role,
            projects: [],
            warning:
              'public.projects is missing. In Supabase SQL Editor, run scripts/018_ensure_projects_table.sql',
          })
        }
        return NextResponse.json({ error: leadProjectsRes.error.message }, { status: 500 })
      }
      
      // Filter to own client
      const direct = (leadProjectsRes.data || []).filter(
        (p: any) => !clientId || p?.client_id === clientId,
      )
      
      const projectIds = Array.from(new Set((projectUsersRes.data || []).map((r: any) => r.project_id).filter(Boolean)))

      let extra: any[] = []
      if (projectIds.length > 0) {
        const extraRes = await adminClient
          .from('projects')
          .select('id, name, description, status, priority, phase, start_date, end_date, budget, created_at, client_id')
          .in('id', projectIds)
        if (!extraRes.error) {
          extra = (extraRes.data || []).filter((p: any) => !clientId || p?.client_id === clientId)
        }
      }
      
      const byId = new Map<string, any>()
      ;[...direct, ...extra].forEach((p) => byId.set(p.id, p))
      projects = Array.from(byId.values()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    } else if (role === 'member') {
      // Members see only projects they are assigned to
      const projectUsersRes = await adminClient
        .from('project_users')
        .select('project_id')
        .eq('user_id', ctx.userId)
      
      if (projectUsersRes.error) {
        return NextResponse.json({ error: projectUsersRes.error.message }, { status: 500 })
      }
      
      const projectIds = (projectUsersRes.data || []).map((r: any) => r.project_id).filter(Boolean)
      
      if (projectIds.length > 0) {
        const projectsRes = await adminClient
          .from('projects')
          .select('id, name, description, status, priority, phase, start_date, end_date, budget, created_at, client_id')
          .in('id', projectIds)
        
        if (!projectsRes.error) {
          projects = (projectsRes.data || []).filter((p: any) => !clientId || p?.client_id === clientId)
        }
      }
    } else {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    // Get task statistics for each project
    const ids = projects.map((p) => p.id)
    let taskStats: Record<string, { total: number; completed: number; estimation: number }> = {}
    let moduleCounts: Record<string, number> = {}
    
    if (ids.length > 0) {
      const modulesRes = await adminClient
        .from('modules')
        .select('id, project_id')
        .in('project_id', ids)
      if (!modulesRes.error && modulesRes.data) {
        moduleCounts = modulesRes.data.reduce((acc: Record<string, number>, row: any) => {
          if (!row?.project_id) return acc
          acc[row.project_id] = (acc[row.project_id] || 0) + 1
          return acc
        }, {})
      }

      const tasksRes = await adminClient
        .from('tasks')
        .select('project_id, status, estimated_hours')
        .in('project_id', ids)
      
      if (!tasksRes.error && tasksRes.data) {
        taskStats = tasksRes.data.reduce((acc: Record<string, any>, row: any) => {
          if (!row.project_id) return acc
          if (!acc[row.project_id]) {
            acc[row.project_id] = { total: 0, completed: 0, estimation: 0 }
          }
          acc[row.project_id].total++
          if (row.status === 'done') acc[row.project_id].completed++
          acc[row.project_id].estimation += Number(row.estimated_hours || 0)
          return acc
        }, {})
      }
    }

    return NextResponse.json({
      role,
      projects: projects.map((p) => ({
        ...p,
        moduleCount: moduleCounts[p.id] || 0,
        taskStats: taskStats[p.id] || { total: 0, completed: 0, estimation: 0 },
      })),
    })
  } catch (err: any) {
    console.error('Error in GET /api/projects:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const { adminClient, role, clientId, isMasterAdmin } = ctx
    
    // Check permissions
    if (!canCreateProjects(role)) {
      return NextResponse.json({ error: 'You do not have permission to create projects' }, { status: 403 })
    }

    const body = await request.json()
    const name = String(body.name || '').trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    // Determine client_id for the project
    let projectClientId = clientId
    if (isMasterAdmin && body.client_id) {
      projectClientId = body.client_id
    }

    if (!projectClientId && (ctx.isClientAdmin || ctx.role === 'manager')) {
      projectClientId = await provisionClientForClientAdminIfMissing(ctx)
    }

    // Master admin convenience: single org in DB
    if (!projectClientId && isMasterAdmin) {
      const { data: clientRows, error: clientsListErr } = await adminClient
        .from('clients')
        .select('id')
        .limit(2)
      if (!clientsListErr && clientRows?.length === 1) {
        projectClientId = clientRows[0].id
      }
    }

    if (!projectClientId) {
      return NextResponse.json(
        {
          error:
            'No organization for this project. Pass client_id in the request (master admin), or open /api/me once to link your account. If projects.client_id references public.clients, create that client row first.',
        },
        { status: 400 },
      )
    }

    const { data: existingClient } = await adminClient
      .from('clients')
      .select('id')
      .eq('id', projectClientId)
      .maybeSingle()

    if (!existingClient?.id) {
      const masterSentThisClientId =
        isMasterAdmin &&
        body.client_id != null &&
        String(body.client_id).trim() !== '' &&
        String(body.client_id) === String(projectClientId)
      if (masterSentThisClientId) {
        return NextResponse.json(
          {
            error: 'client_id does not exist in public.clients.',
            hint: 'Create that client first in Supabase or send a valid client id.',
          },
          { status: 400 },
        )
      }
      const stubLabel = String(ctx.email?.split('@')[0] || 'organization').trim() || 'organization'
      const stubName = `${stubLabel} Organization`
      const stub = await upsertClientRowForFk(adminClient, projectClientId, {
        name: stubName,
        email: ctx.email || null,
      })
      if (stub.error || !stub.data?.id) {
        return NextResponse.json(
          {
            error: 'Could not create a matching row in public.clients for this project.',
            detail: stub.error?.message,
          },
          { status: 500 },
        )
      }
    }

    const payload = {
      name,
      description: body.description || null,
      priority: body.priority || 'medium',
      status: body.status || 'planning',
      phase: body.phase || 'discovery',
      project_lead_id: body.project_lead_id || null,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      budget: body.budget || null,
      created_by: ctx.userId,
      client_id: projectClientId,
    }

    const { data, error } = await adminClient
      .from('projects')
      .insert([payload])
      .select(`
        id, 
        name, 
        description,
        status,
        priority,
        phase,
        start_date,
        end_date, 
        budget,
        created_at, 
        client_id
      `)
      .single()

    if (error) {
      console.error('Error creating project:', error)
      if (isMissingProjectsTable(error)) {
        return NextResponse.json(
          {
            error: 'public.projects is missing from this database.',
            hint: 'In Supabase → SQL Editor, run scripts/018_ensure_projects_table.sql, then retry.',
          },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Add project lead to project_users if specified
    if (body.project_lead_id && data) {
      await adminClient.from('project_users').upsert(
        { project_id: data.id, user_id: body.project_lead_id, role: 'lead' },
        { onConflict: 'project_id,user_id' },
      )
    }

    return NextResponse.json({ project: data }, { status: 201 })
  } catch (err: any) {
    console.error('Error in POST /api/projects:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
