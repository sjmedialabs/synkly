import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  try {
    const body = await request.json()
    const { taskId, assigneeId, estimatedHours, month } = body

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
    }

    // Get current task to check if there's an existing assignee
    const { data: currentTask, error: taskError } = await supabase
      .from('tasks')
      .select('assignee_id, estimated_hours, assigned_month')
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

    // Update the task with new assignee
    const updateData: Record<string, unknown> = {
      assignee_id: assigneeId || null,
      assigned_month: assigneeId ? (month || new Date().toISOString().slice(0, 7)) : null
    }

    if (estimatedHours !== undefined) {
      updateData.estimated_hours = estimatedHours
    }

    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)
      .select()
      .single()

    if (updateError) {
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

    return NextResponse.json({ success: true, task: updatedTask })
  } catch (err) {
    console.error('Assign task error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
