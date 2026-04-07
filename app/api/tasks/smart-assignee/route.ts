import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { can, canAccessAll, getAuthContext } from '@/lib/rbac-server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canAccessAll(ctx.role) && !can(ctx.role, 'ASSIGN_TASK')) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId')
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7)

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 })
    }

    const { data: task } = await supabase
      .from('tasks')
      .select('project_id')
      .eq('id', taskId)
      .single()

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const { data: users } = await supabase
      .from('users')
      .select('id, email, full_name, designation, department, reporting_manager_id')
      .eq('is_active', true)

    const restricted = ['Super Admin', 'Delivery Manager']
    let eligible = (users || []).filter(u => !u.designation || !restricted.includes(u.designation))
    if (!canAccessAll(ctx.role)) {
      eligible = eligible.filter((u: any) => u.reporting_manager_id === ctx.userId)
    }

    const { data: capacity } = await supabase
      .from('employee_capacity')
      .select('employee_id, available_hours, allocated_hours')
      .eq('month', month)

    const capacityMap = new Map((capacity || []).map(c => [c.employee_id, c]))

    const recommendations = eligible.map(user => {
      const cap = capacityMap.get(user.id)
      const avail = cap?.available_hours || 160
      const used = cap?.allocated_hours || 0
      const remaining = Math.max(0, avail - used)
      const totalScore = remaining > 0 ? 100 : 50

      return {
        employee_id: user.id,
        full_name: user.full_name || user.email,
        email: user.email,
        skill_match_score: 0,
        available_hours: avail,
        allocated_hours: used,
        remaining_hours: remaining,
        total_score: totalScore
      }
    }).sort((a, b) => b.total_score - a.total_score)

    return NextResponse.json({ recommendations })
  } catch (err) {
    console.error('[smart-assignee] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
