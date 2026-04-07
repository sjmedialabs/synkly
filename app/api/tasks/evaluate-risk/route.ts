import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessAll, getAuthContext } from '@/lib/rbac-server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canAccessAll(ctx.role)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await request.json()
    const { taskIds } = body

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      // If no specific tasks, evaluate all non-done tasks
      const { data: tasks, error: fetchError } = await supabase
        .from('tasks')
        .select('id')
        .neq('status', 'done')

      if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 })
      }

      const results = []
      for (const task of tasks || []) {
        const { data: riskScore } = await supabase.rpc('calculate_task_risk', {
          p_task_id: task.id
        })
        results.push({ taskId: task.id, riskScore })
      }

      return NextResponse.json({ evaluated: results.length, results })
    }

    // Evaluate specific tasks
    const results = []
    for (const taskId of taskIds) {
      const { data: riskScore, error } = await supabase.rpc('calculate_task_risk', {
        p_task_id: taskId
      })
      
      if (!error) {
        results.push({ taskId, riskScore })
      }
    }

    return NextResponse.json({ evaluated: results.length, results })
  } catch (err) {
    console.error('Risk evaluation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  const supabase = await createClient()

  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canAccessAll(ctx.role)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    // Get tasks with risk data
    const { data: riskyTasks, error } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        status,
        risk_score,
        risk_level,
        predicted_delay_days,
        end_date,
        estimated_hours,
        assignee:users!tasks_assignee_id_fkey(id, full_name, email),
        modules(name, projects(name))
      `)
      .neq('status', 'done')
      .gt('risk_score', 0)
      .order('risk_score', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Group by risk level
    const riskSummary = {
      critical: riskyTasks?.filter(t => t.risk_level === 'critical').length || 0,
      high: riskyTasks?.filter(t => t.risk_level === 'high').length || 0,
      medium: riskyTasks?.filter(t => t.risk_level === 'medium').length || 0,
      low: riskyTasks?.filter(t => t.risk_level === 'low').length || 0,
    }

    return NextResponse.json({ 
      tasks: riskyTasks || [],
      summary: riskSummary
    })
  } catch (err) {
    console.error('Get risk data error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
