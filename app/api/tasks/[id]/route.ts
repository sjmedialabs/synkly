import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, hasModulePermission, type AuthContextResult } from '@/lib/rbac-server'
import { resolveAssignmentPersonRole } from '@/lib/people-for-assignment'
import { hasPermission, isAssignableTaskRole, isFullAccessRole } from '@/lib/rbac'
import { normalizeTaskWorkflowStatus } from '@/lib/task-workflow-status'

function assertCanEditTask(
  auth: AuthContextResult,
  userId: string,
  taskRow: { assignee_id?: string | null },
) {
  const role = auth.role
  const rawAid = taskRow.assignee_id
  const assigneeId = rawAid != null ? String(rawAid).toLowerCase() : null
  const uid = String(userId).toLowerCase()
  const isAssignee = assigneeId != null && assigneeId === uid

  const canEditTasksModule = hasModulePermission(auth, 'tasks', 'update')

  const elevated =
    isFullAccessRole(role) ||
    hasPermission(role, 'UPDATE_TASK') ||
    canEditTasksModule ||
    (hasPermission(role, 'UPDATE_OWN_TASK') && isAssignee)

  if (!elevated) {
    return NextResponse.json({ error: 'You do not have permission to edit tasks' }, { status: 403 })
  }

  const mayEditOthersTasks =
    isFullAccessRole(role) ||
    role === 'team_lead' ||
    hasPermission(role, 'UPDATE_TASK') ||
    canEditTasksModule

  if (!mayEditOthersTasks && !isAssignee) {
    return NextResponse.json({ error: 'Cannot edit others tasks' }, { status: 403 })
  }

  return null
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext()
  if (!auth.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { adminClient, userId } = auth
  const { id } = await params

  try {
    const taskRes = await adminClient.from('tasks').select('*').eq('id', id).maybeSingle()
    if (taskRes.error || !taskRes.data) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const denied = assertCanEditTask(auth, userId, taskRes.data as { assignee_id?: string | null })
    if (denied) return denied

    const body = await request.json()
    const title = String(body.title || '').trim()
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

    const documentUrl =
      body.document_url !== undefined
        ? body.document_url === null || body.document_url === ''
          ? null
          : String(body.document_url).trim()
        : undefined

    const statusForTask = normalizeTaskWorkflowStatus(String(body.status || 'todo'))
    const completedAtPatch: Record<string, unknown> = {}
    if (statusForTask === 'done') {
      completedAtPatch.completed_at = new Date().toISOString()
    } else if (body.status != null && statusForTask !== 'done') {
      completedAtPatch.completed_at = null
    }

    const assigneeRaw = body.assignee_id
    const assigneeId =
      assigneeRaw === null || assigneeRaw === undefined || assigneeRaw === ''
        ? ''
        : String(assigneeRaw).trim()
    if (assigneeId) {
      const resolved = await resolveAssignmentPersonRole(adminClient, assigneeId)
      if (!isAssignableTaskRole(resolved)) {
        return NextResponse.json(
          {
            error:
              'Tasks can only be assigned to team leads and team members (not managers or administrators).',
          },
          { status: 403 },
        )
      }
    }

    const base = {
      title,
      description: body.description || null,
      assignee_id: assigneeId || null,
      sprint_id: body.sprint_id || null,
      status: statusForTask,
      ...completedAtPatch,
      ...(documentUrl !== undefined ? { document_url: documentUrl } : {}),
    }
    const baseWithoutDocCompletion = {
      title,
      description: body.description || null,
      assignee_id: assigneeId || null,
      sprint_id: body.sprint_id || null,
      status: statusForTask,
    }
    const estimate = body.estimation != null && body.estimation !== '' ? Number(body.estimation) : 0
    const startDate = body.start_date || null
    const endDate = body.end_date || null

    const withEst = (b: Record<string, unknown>) => [
      { ...b, estimation: estimate, start_date: startDate, end_date: endDate },
      { ...b, estimated_hours: estimate, start_date: startDate, end_date: endDate },
      { ...b, start_date: startDate, end_date: endDate },
      { ...b, estimation: estimate, start_date: startDate },
      { ...b, estimated_hours: estimate, start_date: startDate },
      { ...b, estimation: estimate, end_date: endDate },
      { ...b, estimated_hours: estimate, end_date: endDate },
      { ...b, start_date: startDate },
      { ...b, end_date: endDate },
      { ...b, estimation: estimate },
      { ...b, estimated_hours: estimate },
      { ...b },
    ]

    const attempts: Record<string, unknown>[] = [...withEst(base), ...withEst(baseWithoutDocCompletion)]

    let updated: any = null
    let lastError: any = null
    for (const payload of attempts) {
      const res = await adminClient.from('tasks').update(payload).eq('id', id).select('*')
      if (!res.error && res.data && res.data.length > 0) {
        updated = res.data[0]
        break
      }
      lastError = res.error
    }

    if (!updated) {
      return NextResponse.json({ error: lastError?.message || 'Failed to update task' }, { status: 500 })
    }
    return NextResponse.json({ task: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext()
  if (!auth.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { adminClient, userId } = auth
  const { id } = await params

  try {
    const taskRes = await adminClient.from('tasks').select('*').eq('id', id).maybeSingle()
    if (taskRes.error || !taskRes.data) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const denied = assertCanEditTask(auth, userId, taskRes.data as { assignee_id?: string | null })
    if (denied) return denied

    const body = await request.json()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ('document_url' in body) {
      patch.document_url =
        body.document_url == null || body.document_url === ''
          ? null
          : String(body.document_url).trim()
    }
    if ('description' in body) {
      patch.description = body.description == null ? null : String(body.description)
    }

    if (!('document_url' in body) && !('description' in body)) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const tryUpdate = async (payload: Record<string, unknown>) => {
      return adminClient.from('tasks').update(payload).eq('id', id).select('*').maybeSingle()
    }

    let res = await tryUpdate(patch)
    if (res.error?.code === 'PGRST204' && String(res.error.message || '').includes('document_url')) {
      const { document_url: _d, ...rest } = patch
      res = await tryUpdate(rest)
    }
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
    if (!res.data) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    return NextResponse.json({ task: res.data })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
