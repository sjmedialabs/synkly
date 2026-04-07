import { NextResponse } from 'next/server'
import { getAuthContext, canAccessAll, canCreateProjects, applyClientFilter } from '@/lib/rbac-server'
import { NextRequest } from 'next/server'

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const { adminClient, role, clientId, isMasterAdmin } = ctx

    let projects: any[] = []

    // Build base query
    let query = adminClient
      .from('projects')
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
        client_id,
        clients (id, name),
        project_lead:users!projects_project_lead_id_fkey (id, full_name, email),
        created_by_user:users!projects_created_by_fkey (id, full_name)
      `)
      .order('created_at', { ascending: false })

    // Apply client filtering based on role
    if (isMasterAdmin) {
      // Master admin sees all projects
      const { data, error } = await query
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      projects = data || []
    } else if (canAccessAll(role)) {
      // Client admin, manager sees all projects in their client
      if (clientId) {
        const { data, error } = await query.eq('client_id', clientId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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

      if (leadProjectsRes.error) return NextResponse.json({ error: leadProjectsRes.error.message }, { status: 500 })
      
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
      
      if (projectUsersRes.error) return NextResponse.json({ error: projectUsersRes.error.message }, { status: 500 })
      
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
    
    if (ids.length > 0) {
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
    
    if (!projectClientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
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
