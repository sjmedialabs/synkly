import { NextRequest, NextResponse } from 'next/server'
import { can, canAccessAll, getAuthContext } from '@/lib/rbac-server'
import { canManageProjects } from '@/lib/rbac'
import {
  fetchActivePeopleForAssignment,
  filterPeopleToAssignableTaskRoles,
  isLoosePeopleHierarchy,
  type AssignmentPersonRow,
} from '@/lib/people-for-assignment'

const RESTRICTED_DESIGNATIONS = ['Super Admin', 'Delivery Manager']

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

    const peopleResult = await fetchActivePeopleForAssignment(ctx.adminClient)
    if (peopleResult.rows.length === 0) {
      return NextResponse.json({
        recommendations: [],
        warning:
          'No people found in public.team, public.users, or Supabase Auth. Invite users in Authentication, or sync profiles into public.users / public.team.',
      })
    }

    const users = peopleResult.rows

    const eligible = users.filter((u: AssignmentPersonRow) => {
      const designation =
        typeof u.designation === 'string'
          ? u.designation
          : (u.designation as { name?: string } | null)?.name || ''
      if (designation && RESTRICTED_DESIGNATIONS.includes(designation)) return false
      if (ctx.isMasterAdmin || canManageProjects(ctx.role)) {
        if (ctx.clientId && u.client_id && u.client_id !== ctx.clientId) return false
        return true
      }
      if (ctx.role === 'team_lead') {
        if (!u.reporting_manager_id && isLoosePeopleHierarchy(peopleResult.source)) return true
        return u.reporting_manager_id === ctx.userId
      }
      return false
    })

    const narrowed = await filterPeopleToAssignableTaskRoles(ctx.adminClient, eligible)

    const { data: capacity } = await ctx.adminClient
      .from('employee_capacity')
      .select('employee_id, available_hours, allocated_hours')
      .eq('month', month)

    const capacityMap = new Map((capacity || []).map((c: { employee_id: string }) => [c.employee_id, c]))

    const recommendations = narrowed
      .map((user) => {
        const cap = capacityMap.get(user.id) as
          | { available_hours?: number; allocated_hours?: number }
          | undefined
        const availableHours = cap?.available_hours || 160
        const allocatedHours = cap?.allocated_hours || 0
        const remainingHours = Math.max(0, availableHours - allocatedHours)
        const skillScore = (user.experience_years || 0) * 10
        const capacityScore = remainingHours > 0 ? Math.min(100, remainingHours * 2) : 0

        return {
          employee_id: user.id,
          full_name: user.full_name || user.email,
          email: user.email,
          skill_match_score: skillScore,
          available_hours: availableHours,
          allocated_hours: allocatedHours,
          remaining_hours: remainingHours,
          total_score: skillScore + capacityScore,
        }
      })
      .sort((a, b) => b.total_score - a.total_score)

    return NextResponse.json({ recommendations, source: peopleResult.source })
  } catch (err) {
    console.error('[recommend-assignee] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
