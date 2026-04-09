import { NextRequest, NextResponse } from 'next/server'
import { canAccessAll, getAuthContext, hasModulePermission } from '@/lib/rbac-server'
import { getAccessibleProjectSummaries } from '@/lib/projects-access'
import {
  fetchActivePeopleForAssignment,
  filterPeopleToAssignableTaskRoles,
  isLoosePeopleHierarchy,
  resolveAssignmentPersonRole,
} from '@/lib/people-for-assignment'
import { hasPermission, isAssignableTaskRole, isFullAccessRole } from '@/lib/rbac'

function isMissingTasksTable(err: { code?: string; message?: string } | null) {
  if (!err) return false
  if (err.code === 'PGRST205') return true
  const m = String(err.message || '')
  return m.includes('public.tasks') || m.includes('Could not find the table')
}

async function hydrateTaskAssignees(adminClient: any, rows: Record<string, unknown>[]) {
  const ids = [...new Set(rows.map((t) => t.assignee_id as string | null).filter(Boolean))] as string[]
  if (ids.length === 0) return

  // Build a lookup map from team + users tables
  const byId = new Map<string, { full_name: string | null; email: string }>()

  const teamRes = await adminClient.from('team').select('id, full_name, email').in('id', ids)
  for (const p of (teamRes.data || []) as any[]) {
    byId.set(p.id, { full_name: p.full_name ?? null, email: String(p.email || '') })
  }

  const missingFromTeam = ids.filter((id) => !byId.has(id))
  if (missingFromTeam.length > 0) {
    const usersRes = await adminClient.from('users').select('id, full_name, email').in('id', missingFromTeam)
    for (const p of (usersRes.data || []) as any[]) {
      byId.set(p.id, { full_name: p.full_name ?? null, email: String(p.email || '') })
    }
  }

  // Always overwrite assignee field from our lookup (FK join may have returned null)
  for (const t of rows) {
    const aid = t.assignee_id as string | undefined
    if (aid && byId.has(aid)) {
      ;(t as any).assignee = byId.get(aid)
    }
  }
}

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { adminClient, userId, role } = ctx

  try {
    /** Scope tasks by accessible projects so unassigned (null assignee) work appears for leads/managers. */
    let projectIdFilter: string[] | null = null
    let teamLeadReportIds: string[] | null = null
    let assigneeOnlyFilter: string[] | null = null

    if (isFullAccessRole(role)) {
      // no extra filter
    } else if (canAccessAll(role) || role === 'manager') {
      const summaries = await getAccessibleProjectSummaries(ctx)
      projectIdFilter = summaries.map((s) => s.id)
    } else if (role === 'team_lead') {
      const summaries = await getAccessibleProjectSummaries(ctx)
      projectIdFilter = summaries.map((s) => s.id)
      const membersRes = await adminClient
        .from('team')
        .select('id')
        .eq('reporting_manager_id', userId)
        .eq('is_active', true)
      teamLeadReportIds = (membersRes.data || []).map((u: any) => u.id)
    } else {
      assigneeOnlyFilter = [userId]
    }

    const selectAttempts = [
      `*, assignee:users!tasks_assignee_id_fkey (full_name, email), modules (name), projects (name)`,
      `*, modules (name), projects (name)`,
      `*`,
    ]

    let taskRows: any[] | null = null
    let lastError: { code?: string; message?: string } | null = null

    for (const sel of selectAttempts) {
      let taskQuery = adminClient.from('tasks').select(sel).order('created_at', { ascending: false })

      if (assigneeOnlyFilter) {
        taskQuery = taskQuery.in('assignee_id', assigneeOnlyFilter)
      } else if (projectIdFilter) {
        if (projectIdFilter.length === 0) {
          taskRows = []
          lastError = null
          break
        }
        taskQuery = taskQuery.in('project_id', projectIdFilter)
      }

      const tasksRes = await taskQuery
      if (!tasksRes.error) {
        taskRows = tasksRes.data || []
        break
      }
      lastError = tasksRes.error
      if (isMissingTasksTable(tasksRes.error)) {
        return NextResponse.json({
          tasks: [],
          assignees: [],
          role,
          warning: 'Tasks table is not available in this environment',
        })
      }
    }

    if (taskRows === null) {
      return NextResponse.json({ error: lastError?.message || 'Failed to load tasks' }, { status: 500 })
    }

    if (teamLeadReportIds) {
      const reportSet = new Set(teamLeadReportIds)
      taskRows = taskRows.filter(
        (t) =>
          !t.assignee_id ||
          reportSet.has(t.assignee_id) ||
          t.assignee_id === userId,
      )
    }

    await hydrateTaskAssignees(adminClient, taskRows)

    let assignees: { id: string; full_name: string | null; email: string }[] = []
    const peopleBundle = await fetchActivePeopleForAssignment(adminClient)
    if (peopleBundle.rows.length > 0) {
      let list = peopleBundle.rows
      if (isFullAccessRole(role)) {
        // keep all
      } else if (canAccessAll(role) || role === 'manager') {
        if (ctx.clientId && peopleBundle.source === 'team') {
          list = list.filter((u) => !u.client_id || u.client_id === ctx.clientId)
        }
        if (ctx.clientId && peopleBundle.source === 'auth') {
          list = list.filter((u) => !u.client_id || u.client_id === ctx.clientId)
        }
      } else if (role === 'team_lead') {
        list = list.filter(
          (u) =>
            u.reporting_manager_id === userId ||
            (!u.reporting_manager_id && isLoosePeopleHierarchy(peopleBundle.source)),
        )
      } else {
        list = list.filter((u) => u.id === userId)
      }
      // Show all active team members (role validation happens at assignment time)
      assignees = list
        .map((u) => ({ id: u.id, full_name: u.full_name, email: u.email || '' }))
        .sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)))
    }

    return NextResponse.json({ tasks: taskRows, assignees, role })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { adminClient, userId, role } = ctx

  try {
    const body = await request.json()
    const taskId = String(body.taskId || '')
    const status = String(body.status || '')
    if (!taskId || !status) return NextResponse.json({ error: 'taskId and status are required' }, { status: 400 })

    const taskRes = await adminClient
      .from('tasks')
      .select('id, assignee_id')
      .eq('id', taskId)
      .single()
    if (taskRes.error || !taskRes.data) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    if (!isFullAccessRole(role)) {
      if (role === 'team_lead') {
        if (!hasPermission(role, 'UPDATE_TASK')) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
        const teamRes = await adminClient
          .from('team')
          .select('id')
          .eq('reporting_manager_id', userId)
          .eq('is_active', true)
        const teamIds = new Set((teamRes.data || []).map((u: any) => u.id))
        const aid = taskRes.data.assignee_id as string | null
        if (aid && !teamIds.has(aid)) {
          return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
        }
        if (!aid) {
          const projRes = await adminClient.from('tasks').select('project_id').eq('id', taskId).single()
          const summaries = await getAccessibleProjectSummaries(ctx)
          const pid = projRes.data?.project_id as string | undefined
          if (!pid || !summaries.some((p) => p.id === pid)) {
            return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
          }
        }
      } else if (canAccessAll(role) || role === 'manager') {
        const projRes = await adminClient.from('tasks').select('project_id').eq('id', taskId).single()
        const summaries = await getAccessibleProjectSummaries(ctx)
        const pid = projRes.data?.project_id as string | undefined
        if (!pid || !summaries.some((p) => p.id === pid)) {
          if (taskRes.data.assignee_id !== userId) {
            return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
          }
        }
      } else {
        if (taskRes.data.assignee_id !== userId) {
          return NextResponse.json({ error: 'Cannot update others tasks' }, { status: 403 })
        }
      }
    }

    const updateRes = await adminClient
      .from('tasks')
      .update({ status })
      .eq('id', taskId)
      .select('*')
      .single()
    if (updateRes.error) return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
    return NextResponse.json({ task: updateRes.data })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { adminClient, userId, role } = ctx

  try {
    if (!isFullAccessRole(role) && !hasPermission(role, 'CREATE_TASK') && !hasModulePermission(ctx, 'tasks', 'create')) {
      return NextResponse.json({ error: 'You do not have permission to create tasks' }, { status: 403 })
    }

    const body = await request.json()
    const title = String(body.title || '').trim()
    const projectId = String(body.project_id || '').trim()
    const moduleId = String(body.module_id || '').trim()

    if (!title || !projectId || !moduleId) {
      return NextResponse.json(
        { error: 'title, project_id, and module_id are required' },
        { status: 400 },
      )
    }

    // Ensure module belongs to project before creating task
    const moduleRes = await adminClient
      .from('modules')
      .select('id, project_id')
      .eq('id', moduleId)
      .maybeSingle()
    if (moduleRes.error || !moduleRes.data) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 })
    }
    if ((moduleRes.data as any).project_id !== projectId) {
      return NextResponse.json({ error: 'Module does not belong to selected project' }, { status: 400 })
    }

    const assigneeIdRaw = body.assignee_id
    const assigneeId =
      assigneeIdRaw === null || assigneeIdRaw === undefined || assigneeIdRaw === ''
        ? ''
        : String(assigneeIdRaw).trim()
    // Assignee validation (allow any active team member)

    const base = {
      title,
      description: body.description || null,
      module_id: moduleId,
      project_id: projectId,
      sprint_id: body.sprint_id || null,
      assignee_id: assigneeId || null,
      status: body.status || 'todo',
    }
    const withCreator = { ...base, created_by: userId }
    const estimate = body.estimation != null && body.estimation !== '' ? Number(body.estimation) : 0
    const startDate = body.start_date || null
    const endDate = body.end_date || null

    const payloadAttempts: Record<string, unknown>[] = [
      { ...withCreator, estimation: estimate, start_date: startDate, end_date: endDate },
      { ...withCreator, estimated_hours: estimate, start_date: startDate, end_date: endDate },
      { ...withCreator, start_date: startDate, end_date: endDate },
      { ...withCreator, estimation: estimate, start_date: startDate },
      { ...withCreator, estimated_hours: estimate, start_date: startDate },
      { ...withCreator, estimation: estimate, end_date: endDate },
      { ...withCreator, estimated_hours: estimate, end_date: endDate },
      { ...withCreator, start_date: startDate },
      { ...withCreator, end_date: endDate },
      { ...withCreator, estimation: estimate },
      { ...withCreator, estimated_hours: estimate },
      { ...base, estimation: estimate, start_date: startDate, end_date: endDate },
      { ...base, estimated_hours: estimate, start_date: startDate, end_date: endDate },
      { ...base, start_date: startDate, end_date: endDate },
      { ...base, estimation: estimate, start_date: startDate },
      { ...base, estimated_hours: estimate, start_date: startDate },
      { ...base, estimation: estimate, end_date: endDate },
      { ...base, estimated_hours: estimate, end_date: endDate },
      { ...base, start_date: startDate },
      { ...base, end_date: endDate },
      { ...base, estimation: estimate },
      { ...base, estimated_hours: estimate },
      { ...base },
    ]

    let created: any = null
    let lastError: any = null
    for (const payload of payloadAttempts) {
      const res = await adminClient.from('tasks').insert(payload).select('*')
      if (!res.error && res.data && res.data.length > 0) {
        created = res.data[0]
        break
      }
      lastError = res.error
    }

    if (!created) {
      return NextResponse.json({ error: lastError?.message || 'Failed to create task' }, { status: 500 })
    }

    return NextResponse.json({ task: created }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

