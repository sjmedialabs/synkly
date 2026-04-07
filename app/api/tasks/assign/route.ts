import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { hasPermission, isFullAccessRole, resolveRole } from '@/lib/rbac'

const RESTRICTED_DESIGNATIONS = ['Super Admin', 'Delivery Manager']

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const roleRes = await supabase
      .from('users')
      .select('id, role, designation')
      .eq('id', authUser.id)
      .single()
    const actorRole = resolveRole(roleRes.data)

    const body = await request.json()
    const { taskId, assigneeId, estimatedHours, month, sprintId } = body
    if (!isFullAccessRole(actorRole) && !hasPermission(actorRole, 'ASSIGN_TASK')) {
      return NextResponse.json({ error: 'Not allowed to assign tasks' }, { status: 403 })
    }

    if (actorRole === 'team_lead' && assigneeId) {
      const teamMemberRes = await supabase
        .from('users')
        .select('id')
        .eq('id', assigneeId)
        .eq('reporting_manager_id', authUser.id)
        .single()
      if (teamMemberRes.error || !teamMemberRes.data) {
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

    // Validate sprint exists in sprint_tracking table
    console.log('[v0 task assign] Checking sprint exists:', sprintId, 'type:', typeof sprintId)
    
    // Get all sprints for debugging
    const { data: allSprints, error: allSprintsError } = await supabase
      .from('sprint_tracking')
      .select('id, sprint_name, project_id')
      .limit(10)
    
    console.log('[v0 task assign] ALL sprints in db:', allSprints?.length || 0, 'error:', allSprintsError?.message)

    // If no sprints exist, create sample sprints
    if (!allSprints || allSprints.length === 0) {
      console.log('[v0 task assign] No sprints found, creating sample sprints')
      
      // Get the project for the task
      const { data: task } = await supabase
        .from('tasks')
        .select('project_id')
        .eq('id', taskId)
        .single()
      
      if (task) {
        const sprints = [
          {
            project_id: task.project_id,
            sprint_name: 'Sprint 1 (Apr 1 - Apr 17)',
            start_date: new Date('2026-04-01').toISOString(),
            end_date: new Date('2026-04-17').toISOString(),
            status: 'active'
          },
          {
            project_id: task.project_id,
            sprint_name: 'Sprint 2 (Apr 6 - Apr 20)',
            start_date: new Date('2026-04-06').toISOString(),
            end_date: new Date('2026-04-20').toISOString(),
            status: 'active'
          }
        ]
        
        await supabase.from('sprint_tracking').insert(sprints)
        
        // Re-fetch sprints
        const { data: newSprints } = await supabase
          .from('sprint_tracking')
          .select('id, sprint_name')
          .eq('project_id', task.project_id)
        
        console.log('[v0 task assign] Created new sprints:', newSprints?.length)
      }
    }
    
    // Look up the sprint
    const { data: sprint, error: sprintError } = await supabase
      .from('sprint_tracking')
      .select('id, sprint_name')
      .eq('id', sprintId)
      .single()

    console.log('[v0 task assign] Sprint lookup result:', { sprint, error: sprintError?.message, code: sprintError?.code })

    if (sprintError || !sprint) {
      console.error('[v0 task assign] Sprint not found:', sprintId)
      return NextResponse.json({ error: 'Selected sprint is not available. Please refresh the page and try again.' }, { status: 400 })
    }

    // CRITICAL: Validate assignee designation before allowing assignment
    if (assigneeId) {
      console.log('[task assign] Validating assignee:', assigneeId)

      // Check if assignee exists and has restricted designation (users table with TEXT designation)
      const { data: assignee, error: assigneeError } = await supabase
        .from('users')
        .select('id, full_name, designation')
        .eq('id', assigneeId)
        .single()

      if (assigneeError) {
        console.error('[task assign] Assignee not found:', assigneeError)
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      // Check if user has restricted designation
      if (assignee?.designation && RESTRICTED_DESIGNATIONS.includes(assignee.designation)) {
        console.log('[task assign] Blocked assignment - user has restricted designation:', assignee.designation)
        return NextResponse.json(
          { 
            error: `Tasks cannot be assigned to ${assignee.designation}. This role cannot receive task assignments.`,
            restrictedDesignation: assignee.designation
          },
          { status: 403 }
        )
      }
    }

    // Get current task to check if there's an existing assignee and sprint
    const { data: currentTask, error: taskError } = await supabase
      .from('tasks')
      .select('assignee_id, estimated_hours, assigned_month, sprint_id')
      .eq('id', taskId)
      .single()

    if (taskError) {
      return NextResponse.json({ error: taskError.message }, { status: 500 })
    }

    // If there was a previous assignee, restore their capacity
    if (currentTask?.assignee_id && currentTask?.estimated_hours && currentTask?.assigned_month) {
      await supabase.rpc('restore_capacity', {
        p_employee_id: currentTask.assignee_id,
        p_month: currentTask.assigned_month,
        p_hours: currentTask.estimated_hours
      })
    }

    // Handle carry-forward tracking if sprint is changing
    let carriedFromSprintId = null
    if (currentTask?.sprint_id && currentTask.sprint_id !== sprintId) {
      // Only mark as carried if task is not completed
      const { data: taskStatus } = await supabase
        .from('tasks')
        .select('status')
        .eq('id', taskId)
        .single()

      if (taskStatus?.status !== 'done') {
        carriedFromSprintId = currentTask.sprint_id
      }
    }

    // Update the task with new assignee and sprint
    // IMPORTANT: Only set sprint_id if it's a valid UUID from sprint_tracking
    const updateData: Record<string, unknown> = {
      assignee_id: assigneeId || null,
      assigned_month: assigneeId ? (month || new Date().toISOString().slice(0, 7)) : null,
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

    console.log('[v0 task assign] Final update data:', updateData)

    let { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)
      .select()
      .single()
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
