import { NextRequest, NextResponse } from 'next/server'
import { can, canAccessAll, getAuthContext } from '@/lib/rbac-server'
import { canManageProjects } from '@/lib/rbac'
import {
  fetchActivePeopleForAssignment,
  filterPeopleToAssignableTaskRoles,
  isLoosePeopleHierarchy,
} from '@/lib/people-for-assignment'

export async function GET(request: NextRequest) {
  try {
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

    const { data: task, error: taskErr } = await ctx.adminClient
      .from('tasks')
      .select('project_id')
      .eq('id', taskId)
      .maybeSingle()

    if (taskErr || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const peopleResult = await fetchActivePeopleForAssignment(ctx.adminClient)
    if (peopleResult.rows.length === 0) {
      return NextResponse.json({
        recommendations: [],
        warning:
          'No people in team, users, or Auth. Invite users in Supabase Authentication or add profile rows.',
      })
    }

    const restricted = ['Super Admin', 'Delivery Manager']
    let eligible = peopleResult.rows.filter((u) => {
      const d =
        typeof u.designation === 'string'
          ? u.designation
          : (u.designation as { name?: string } | null)?.name || ''
      return !d || !restricted.includes(d)
    })

    if (!canAccessAll(ctx.role) && !canManageProjects(ctx.role)) {
      eligible = eligible.filter((u: any) => {
        if (!u.reporting_manager_id && isLoosePeopleHierarchy(peopleResult.source)) return true
        return u.reporting_manager_id === ctx.userId
      })
    } else if (ctx.clientId) {
      eligible = eligible.filter(
        (u: any) => !u.client_id || u.client_id === ctx.clientId,
      )
    }

    eligible = await filterPeopleToAssignableTaskRoles(ctx.adminClient, eligible)

    const { data: capacity } = await ctx.adminClient
      .from('employee_capacity')
      .select('employee_id, available_hours, allocated_hours')
      .eq('month', month)

    const capacityMap = new Map((capacity || []).map((c: any) => [c.employee_id, c]))

    const recommendations = eligible
      .map((user) => {
        const cap = capacityMap.get(user.id) as { available_hours?: number; allocated_hours?: number } | undefined
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
          total_score: totalScore,
        }
      })
      .sort((a, b) => b.total_score - a.total_score)

    return NextResponse.json({ recommendations, source: peopleResult.source })
  } catch (err) {
    console.error('[smart-assignee] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
