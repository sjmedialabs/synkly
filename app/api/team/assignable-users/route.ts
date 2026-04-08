import { NextRequest, NextResponse } from 'next/server'
import { can, canAccessAll, getAuthContext } from '@/lib/rbac-server'
import {
  filterPeopleToAssignableTaskRoles,
  type AssignmentPersonRow,
} from '@/lib/people-for-assignment'

// Restricted designation names
const RESTRICTED_DESIGNATIONS = ['Super Admin', 'Delivery Manager']

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canAccessAll(ctx.role) && !can(ctx.role, 'ASSIGN_TASK')) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get('project_id')

    const admin = ctx.adminClient
    const { data: allUsers, error: usersError } = await admin
      .from('team')
      .select('id, email, full_name, designation, department, reporting_manager_id, is_active')
      .eq('is_active', true)
      .order('full_name', { ascending: true })

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    const assignableUsers = (allUsers || []).filter((user) => {
      if (!user.designation) return true
      return !RESTRICTED_DESIGNATIONS.includes(user.designation as string)
    })

    let finalUsers = assignableUsers
    if (!canAccessAll(ctx.role)) {
      finalUsers = finalUsers.filter((u) => u.reporting_manager_id === ctx.userId)
    }

    if (projectId) {
      const { data: projectUsers, error: projectError } = await admin
        .from('project_users')
        .select('user_id')
        .eq('project_id', projectId)

      if (!projectError && projectUsers && projectUsers.length > 0) {
        const projectUserIds = new Set((projectUsers as { user_id: string }[]).map((pu) => pu.user_id))
        finalUsers = finalUsers.filter((u) => projectUserIds.has(u.id))
      }
    }

    const asRows: AssignmentPersonRow[] = finalUsers.map((u: any) => ({
      id: u.id,
      email: String(u.email || ''),
      full_name: u.full_name ?? null,
      designation: u.designation ?? null,
      department: u.department ?? null,
      experience_years: null,
      reporting_manager_id: u.reporting_manager_id ?? null,
      client_id: u.client_id ?? null,
    }))
    const roleFiltered = await filterPeopleToAssignableTaskRoles(admin, asRows)
    const allowedIds = new Set(roleFiltered.map((r) => r.id))
    finalUsers = finalUsers.filter((u) => allowedIds.has(u.id))

    return NextResponse.json({
      users: finalUsers,
      total: finalUsers.length,
      restrictedDesignations: RESTRICTED_DESIGNATIONS,
    })
  } catch (err) {
    console.error('[assignable-users] Catch error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
