import { NextRequest, NextResponse } from 'next/server'
import { can, canAccessAll, getAuthContext, hasModulePermission } from '@/lib/rbac-server'
import { canAccessClientScope, hasPermission } from '@/lib/rbac'
import {
  fetchActivePeopleForAssignment,
  filterPeopleToAssignableTaskRoles,
  type AssignmentPersonRow,
} from '@/lib/people-for-assignment'

const RESTRICTED_DESIGNATIONS = ['Super Admin', 'Delivery Manager']

type ListedUser = {
  id: string
  email: string
  full_name: string | null
  designation: string | null
  department: string | null
  reporting_manager_id: string | null
  client_id: string | null
}

function canListAssignablePeople(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  if (!ctx.userId || !ctx.role) return false
  return (
    canAccessAll(ctx.role) ||
    canAccessClientScope(ctx.role) ||
    can(ctx.role, 'ASSIGN_TASK') ||
    hasPermission(ctx.role, 'CREATE_TASK') ||
    hasPermission(ctx.role, 'UPDATE_TASK') ||
    hasModulePermission(ctx, 'tasks', 'create') ||
    hasModulePermission(ctx, 'tasks', 'update') ||
    hasModulePermission(ctx, 'tasks', 'assign')
  )
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canListAssignablePeople(ctx)) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get('project_id')
    const showAll = searchParams.get('all') === 'true'

    const admin = ctx.adminClient
    const bundle = await fetchActivePeopleForAssignment(admin)

    let allUsers: ListedUser[] = bundle.rows.map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      designation: typeof u.designation === 'string' ? u.designation : u.designation != null ? String(u.designation) : null,
      department: typeof u.department === 'string' ? u.department : u.department != null ? String(u.department) : null,
      reporting_manager_id: u.reporting_manager_id,
      client_id: u.client_id,
    }))

    allUsers.sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)))

    const assignableUsers = allUsers.filter((user) => {
      if (!user.designation) return true
      return !RESTRICTED_DESIGNATIONS.includes(user.designation)
    })

    let finalUsers = assignableUsers
    if (canAccessAll(ctx.role) || canAccessClientScope(ctx.role)) {
      if (ctx.clientId) {
        finalUsers = finalUsers.filter((u) => !u.client_id || u.client_id === ctx.clientId)
      }
    } else if (ctx.role === 'team_lead') {
      finalUsers = finalUsers.filter((u) => u.reporting_manager_id === ctx.userId)
    } else {
      finalUsers = finalUsers.filter((u) => u.id === ctx.userId)
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

    if (!showAll) {
      const asRows: AssignmentPersonRow[] = finalUsers.map((u) => ({
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
    }

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
