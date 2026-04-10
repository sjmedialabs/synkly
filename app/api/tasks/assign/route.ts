import { NextRequest, NextResponse } from 'next/server'
import { resolveAssignmentPersonRole } from '@/lib/people-for-assignment'
import { isAssignableTaskRole } from '@/lib/rbac'
import { can, canAccessAll, getAuthContext } from '@/lib/rbac-server'

const RESTRICTED_DESIGNATIONS = ['Super Admin', 'Delivery Manager']

function isMissingTable(err: { code?: string; message?: string } | null | undefined, tableHint: string) {
  if (!err) return false
  if (err.code === 'PGRST205') return true
  const m = String(err.message || '').toLowerCase()
  return m.includes(`public.${tableHint}`) || m.includes('could not find the table')
}

/** Confirm assignee exists (team → users → Auth). Optional designation for restricted-title checks. */
async function fetchAssigneeForValidation(
  supabase: any,
  assigneeId: string,
): Promise<{ found: true; designation: string | null } | { found: false }> {
  const fromTeam = await supabase.from('team').select('id, designation').eq('id', assigneeId).maybeSingle()
  if (fromTeam.data?.id) {
    return { found: true, designation: (fromTeam.data.designation as string | null) ?? null }
  }
  if (fromTeam.error && !isMissingTable(fromTeam.error, 'team')) {
    console.error('[task assign] team assignee lookup error:', fromTeam.error)
    return { found: false }
  }

  const userSelects = ['id, designation', 'id, full_name, designation', 'id']
  for (const cols of userSelects) {
    const fromUsers = await supabase.from('users').select(cols).eq('id', assigneeId).maybeSingle()
    if (fromUsers.error) {
      if (isMissingTable(fromUsers.error, 'users')) break
      if (fromUsers.error.code === 'PGRST204') continue
      continue
    }
    if (fromUsers.data && (fromUsers.data as { id: string }).id) {
      const designation = (fromUsers.data as { designation?: string | null }).designation ?? null
      return { found: true, designation }
    }
  }

  try {
    const { data } = await supabase.auth.admin.getUserById(assigneeId)
    if (data?.user?.id) return { found: true, designation: null }
  } catch {
    /* ignore */
  }

  return { found: false }
}

/** When `team` / `users` are missing, allow Team Lead to assign if assignee exists in Auth (degraded). */
async function verifyTeamLeadCanAssignTo(
  supabase: any,
  authUserId: string,
  assigneeId: string,
): Promise<boolean> {
  const fromTeam = await supabase
    .from('team')
    .select('id')
    .eq('id', assigneeId)
    .eq('reporting_manager_id', authUserId)
    .maybeSingle()

  if (fromTeam.data?.id) return true
  if (fromTeam.error && !isMissingTable(fromTeam.error, 'team')) {
    console.warn('[task assign] team_lead team check:', fromTeam.error)
  }

  const teamUnavailable = !!(fromTeam.error && isMissingTable(fromTeam.error, 'team'))
  const shouldTryUsers = teamUnavailable || (!fromTeam.error && !fromTeam.data)

  if (!shouldTryUsers) return false

  const fromUsers = await supabase
    .from('users')
    .select('id')
    .eq('id', assigneeId)
    .eq('reporting_manager_id', authUserId)
    .maybeSingle()

  if (fromUsers.data?.id) return true
  if (fromUsers.error && !isMissingTable(fromUsers.error, 'users')) {
    console.warn('[task assign] team_lead users check:', fromUsers.error)
  }

  const usersUnavailable = !!(fromUsers.error && isMissingTable(fromUsers.error, 'users'))
  if (teamUnavailable && usersUnavailable) {
    try {
      const { data } = await supabase.auth.admin.getUserById(assigneeId)
      return !!data?.user?.id
    } catch {
      return false
    }
  }

  return false
}

function stripTasksUpdateColumnFromError(
  err: { code?: string; message?: string },
  payload: Record<string, unknown>,
  estimatedHours: number | undefined,
): boolean {
  if (err.code !== 'PGRST204') return false
  const msg = String(err.message || '')
  if (msg.includes('assigned_month') && 'assigned_month' in payload) {
    delete payload.assigned_month
    return true
  }
  if (msg.includes('carried_from_sprint_id') && 'carried_from_sprint_id' in payload) {
    delete payload.carried_from_sprint_id
    return true
  }
  if (msg.includes('estimated_hours') && 'estimated_hours' in payload) {
    delete payload.estimated_hours
    if (estimatedHours !== undefined) payload.estimation = estimatedHours
    return true
  }
  if (msg.includes('estimation') && 'estimation' in payload) {
    delete payload.estimation
    return true
  }
  if (msg.includes('end_date') && 'end_date' in payload) {
    delete payload.end_date
    return true
  }
  if (msg.includes('completed_at') && 'completed_at' in payload) {
    delete payload.completed_at
    return true
  }
  return false
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext()
  
  try {
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = ctx.adminClient
    const actorRole = ctx.role
    const authUserId = ctx.userId

    const body = await request.json()
    const taskId = String(body.taskId ?? body.task_id ?? '').trim()
    const assigneeIdRaw = body.assigneeId ?? body.assignee_id
    const assigneeId =
      assigneeIdRaw === null || assigneeIdRaw === undefined || assigneeIdRaw === ''
        ? ''
        : String(assigneeIdRaw).trim()
    const sprintId = String(body.sprintId ?? body.sprint_id ?? '').trim()
    const estimatedHoursRaw = body.estimatedHours ?? body.estimated_hours
    const estimatedHours =
      estimatedHoursRaw === undefined || estimatedHoursRaw === '' ? undefined : Number(estimatedHoursRaw)
    const month = body.month != null && body.month !== '' ? String(body.month) : undefined
    const assignerEndDate =
      body.end_date != null && String(body.end_date).trim() !== ''
        ? String(body.end_date).trim().slice(0, 10)
        : body.assigner_end_date != null && String(body.assigner_end_date).trim() !== ''
          ? String(body.assigner_end_date).trim().slice(0, 10)
          : undefined
    if (!canAccessAll(actorRole) && !can(actorRole, 'ASSIGN_TASK')) {
      return NextResponse.json({ error: 'Not allowed to assign tasks' }, { status: 403 })
    }

    if (actorRole === 'team_lead' && assigneeId) {
      const ok = await verifyTeamLeadCanAssignTo(supabase, authUserId, assigneeId)
      if (!ok) {
        return NextResponse.json({ error: 'Team Lead can assign only to their team members' }, { status: 403 })
      }
    }


    console.log('[v0 task assign] Request body:', { taskId, assigneeId, estimatedHours, month, sprintId })

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
    }

    if (!sprintId) {
      return NextResponse.json({ error: 'Sprint selection is required' }, { status: 400 })
    }

    // Load task with * so missing optional columns (e.g. assigned_month) do not break the query.
    const taskLookup = await supabase.from('tasks').select('*').eq('id', taskId).maybeSingle()

    if (taskLookup.error) {
      console.error('[v0 task assign] Task lookup error:', taskLookup.error.message, taskLookup.error.code)
      return NextResponse.json(
        { error: 'Task lookup failed', details: taskLookup.error.message },
        { status: 400 },
      )
    }

    const row = taskLookup.data as Record<string, unknown> | null
    if (!row) {
      return NextResponse.json({ error: 'Task not found' }, { status: 400 })
    }

    let taskProjectId = (row.project_id as string | null | undefined) ?? null
    const moduleId = row.module_id as string | null | undefined
    if (!taskProjectId && moduleId) {
      const { data: moduleRow } = await supabase
        .from('modules')
        .select('project_id')
        .eq('id', moduleId)
        .maybeSingle()
      taskProjectId = (moduleRow?.project_id as string | undefined) || null
    }

    console.log('[v0 task assign] Resolving sprint:', sprintId, 'for project:', taskProjectId ?? '(unknown)')

    let sprint: { id: string; project_id?: string } | null = null

    const resolveSprintScoped = async (pid: string) => {
      const fromSprints = await supabase
        .from('sprints')
        .select('id, project_id')
        .eq('id', sprintId)
        .eq('project_id', pid)
        .maybeSingle()
      if (!fromSprints.error && fromSprints.data?.id) {
        return { id: fromSprints.data.id as string, project_id: fromSprints.data.project_id as string }
      }
      const fromTracking = await supabase
        .from('sprint_tracking')
        .select('id, project_id')
        .eq('id', sprintId)
        .eq('project_id', pid)
        .maybeSingle()
      if (!fromTracking.error && fromTracking.data?.id) {
        return { id: fromTracking.data.id as string, project_id: fromTracking.data.project_id as string }
      }
      return null
    }

    const resolveSprintByIdOnly = async () => {
      const wideSprints = await supabase.from('sprints').select('id, project_id').eq('id', sprintId).maybeSingle()
      if (!wideSprints.error && wideSprints.data?.id) {
        return { id: wideSprints.data.id as string, project_id: wideSprints.data.project_id as string }
      }
      const wideTracking = await supabase
        .from('sprint_tracking')
        .select('id, project_id')
        .eq('id', sprintId)
        .maybeSingle()
      if (!wideTracking.error && wideTracking.data?.id) {
        return { id: wideTracking.data.id as string, project_id: wideTracking.data.project_id as string }
      }
      return null
    }

    if (taskProjectId) {
      sprint = await resolveSprintScoped(taskProjectId)
    } else {
      sprint = await resolveSprintByIdOnly()
    }

    if (!sprint) {
      console.error('[v0 task assign] Sprint not found in sprints or sprint_tracking:', sprintId)
      return NextResponse.json({ error: 'Selected sprint is not available. Please refresh the page and try again.' }, { status: 400 })
    }

    if (taskProjectId && sprint.project_id && sprint.project_id !== taskProjectId) {
      console.error('[v0 task assign] Sprint project mismatch', { taskProjectId, sprintProject: sprint.project_id })
      return NextResponse.json({ error: 'Selected sprint does not belong to this task’s project.' }, { status: 400 })
    }

    if (!taskProjectId && !sprint.project_id) {
      console.error('[v0 task assign] Missing project context for task:', taskId)
      return NextResponse.json({ error: 'Task project is missing' }, { status: 400 })
    }

    // Validate assignee exists (team → users → Auth), role, and restricted titles
    if (assigneeId) {
      console.log('[task assign] Validating assignee:', assigneeId)

      const assignee = await fetchAssigneeForValidation(supabase, assigneeId)
      if (!assignee.found) {
        console.error('[task assign] Assignee not found in team, users, or Auth')
        return NextResponse.json({ error: 'User not found' }, { status: 400 })
      }

      // Allow assigning to any active team member

      if (assignee.designation && RESTRICTED_DESIGNATIONS.includes(assignee.designation)) {
        console.log('[task assign] Blocked assignment - user has restricted designation:', assignee.designation)
        return NextResponse.json(
          {
            error: `Tasks cannot be assigned to ${assignee.designation}. This role cannot receive task assignments.`,
            restrictedDesignation: assignee.designation,
          },
          { status: 403 },
        )
      }
    }

    const prevAssigneeId = row.assignee_id as string | null | undefined
    const prevEstimated =
      row.estimated_hours != null
        ? Number(row.estimated_hours)
        : row.estimation != null
          ? Number(row.estimation)
          : null
    const prevAssignedMonth = row.assigned_month as string | null | undefined
    const prevSprintId = row.sprint_id as string | null | undefined

    // If there was a previous assignee, restore their capacity (only when schema has these fields)
    if (prevAssigneeId && prevEstimated != null && Number.isFinite(prevEstimated) && prevAssignedMonth) {
      await supabase.rpc('restore_capacity', {
        p_employee_id: prevAssigneeId,
        p_month: prevAssignedMonth,
        p_hours: prevEstimated,
      })
    }

    // Handle carry-forward tracking if sprint is changing
    let carriedFromSprintId = null
    if (prevSprintId && prevSprintId !== sprintId) {
      const { data: taskStatus } = await supabase.from('tasks').select('status').eq('id', taskId).maybeSingle()
      if (taskStatus?.status !== 'done') {
        carriedFromSprintId = prevSprintId
      }
    }

    // Update the task with new assignee and sprint
    // IMPORTANT: Only set sprint_id after validation against `sprints` or `sprint_tracking`
    const updateData: Record<string, unknown> = {
      assignee_id: assigneeId || null,
      assigned_month: assigneeId ? month || new Date().toISOString().slice(0, 7) : null,
    }

    // Only add sprint_id if it was validated to exist
    if (sprint && sprint.id) {
      updateData.sprint_id = sprint.id
    } else {
      console.warn('[v0 task assign] Sprint validation passed but sprint.id is missing, NOT updating sprint_id')
    }

    if (estimatedHours !== undefined) {
      updateData.estimated_hours = estimatedHours
    }

    if (carriedFromSprintId) {
      updateData.carried_from_sprint_id = carriedFromSprintId
    }

    if (assignerEndDate) {
      updateData.end_date = assignerEndDate
    }

    console.log('[v0 task assign] Final update data:', updateData)

    let updatedTask: any = null
    let updateError: any = null
    for (let attempt = 0; attempt < 8; attempt++) {
      const res = await supabase.from('tasks').update(updateData).eq('id', taskId).select().single()
      updatedTask = res.data
      updateError = res.error
      if (!updateError) break
      if (stripTasksUpdateColumnFromError(updateError, updateData, estimatedHours)) {
        console.warn('[v0 task assign] Retrying update without unknown column:', updateError.message)
        continue
      }
      break
    }

    let sprintAssignmentSkipped = false

    // Some environments still have a legacy sprint FK target; keep assignment working even if sprint cannot be written.
    if (updateError?.code === '23503' && updateData.sprint_id) {
      console.warn('[v0 task assign] Sprint FK mismatch detected; retrying assignment without sprint_id')
      const retryUpdateData = { ...updateData }
      delete retryUpdateData.sprint_id
      delete retryUpdateData.carried_from_sprint_id

      const retryResult = await supabase
        .from('tasks')
        .update(retryUpdateData)
        .eq('id', taskId)
        .select()
        .single()

      updatedTask = retryResult.data
      updateError = retryResult.error
      sprintAssignmentSkipped = !retryResult.error
    }

    console.log('[v0 task assign] Update result:', { success: !!updatedTask, error: updateError?.message, code: updateError?.code })

    if (updateError) {
      console.error('[v0 task assign] Update error details:', { 
        code: updateError.code, 
        message: updateError.message,
        details: updateError.details
      })
      // Provide user-friendly error message for FK constraint violations
      if (updateError.code === '23503') {
        return NextResponse.json({ 
          error: 'The selected sprint is no longer available. Please refresh and try again.' 
        }, { status: 400 })
      }
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // If new assignee, deduct their capacity
    if (assigneeId && updatedTask?.estimated_hours) {
      await supabase.rpc('deduct_capacity', {
        p_employee_id: assigneeId,
        p_month: month || new Date().toISOString().slice(0, 7),
        p_hours: updatedTask.estimated_hours
      })

      // Check if assignee is now over-allocated and create alert
      const { data: capacity } = await supabase
        .from('employee_capacity')
        .select('available_hours, allocated_hours')
        .eq('employee_id', assigneeId)
        .eq('month', month || new Date().toISOString().slice(0, 7))
        .single()

      if (capacity && capacity.allocated_hours > capacity.available_hours) {
        // Create over-allocation alert
        await supabase.from('alerts').insert({
          user_id: assigneeId,
          message: `You are over-allocated for ${month || new Date().toISOString().slice(0, 7)}. Allocated: ${capacity.allocated_hours}h, Available: ${capacity.available_hours}h`,
          type: 'warning',
          metadata: {
            task_id: taskId,
            month: month || new Date().toISOString().slice(0, 7),
            over_hours: capacity.allocated_hours - capacity.available_hours
          }
        })
      }
    }

    // Calculate risk score for the task
    await supabase.rpc('calculate_task_risk', { p_task_id: taskId })

    return NextResponse.json({ 
      success: true, 
      task: updatedTask,
      carriedFromSprint: carriedFromSprintId ? !sprintAssignmentSkipped : false,
      sprintAssignmentSkipped
    })
  } catch (err) {
    console.error('Assign task error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
