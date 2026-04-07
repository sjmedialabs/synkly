import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { hasPermission, isFullAccessRole, resolveRole } from '@/lib/rbac'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRole) throw new Error('Supabase admin credentials are missing')
  return createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function getAccessContext() {
  const serverClient = await createServerClient()
  const adminClient = getAdminClient()
  const {
    data: { user },
  } = await serverClient.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const userRes = await adminClient
    .from('users')
    .select('id, role, designation')
    .eq('id', user.id)
    .single()
  const role = resolveRole(userRes.data)
  return { adminClient, userId: user.id, role }
}

export async function GET() {
  const ctx = await getAccessContext()
  if ('error' in ctx) return ctx.error
  const { adminClient, userId, role } = ctx

  try {
    let allowedAssigneeIds: string[] | null = null
    if (!isFullAccessRole(role)) {
      if (role === 'team_lead') {
        const membersRes = await adminClient
          .from('users')
          .select('id')
          .eq('reporting_manager_id', userId)
          .eq('is_active', true)
        allowedAssigneeIds = (membersRes.data || []).map((u: any) => u.id)
      } else {
        allowedAssigneeIds = [userId]
      }
    }

    let taskQuery = adminClient
      .from('tasks')
      .select(`
        *,
        assignee:users!tasks_assignee_id_fkey (full_name, email),
        modules (name),
        projects (name)
      `)
      .order('created_at', { ascending: false })

    if (allowedAssigneeIds) {
      taskQuery = taskQuery.in('assignee_id', allowedAssigneeIds.length ? allowedAssigneeIds : ['00000000-0000-0000-0000-000000000000'])
    }

    const tasksRes = await taskQuery
    if (tasksRes.error) return NextResponse.json({ error: tasksRes.error.message }, { status: 500 })

    let assignees: any[] = []
    if (isFullAccessRole(role)) {
      const usersRes = await adminClient
        .from('users')
        .select('id, full_name, email')
        .eq('is_active', true)
        .order('full_name')
      assignees = usersRes.data || []
    } else if (role === 'team_lead') {
      const usersRes = await adminClient
        .from('users')
        .select('id, full_name, email')
        .eq('reporting_manager_id', userId)
        .eq('is_active', true)
        .order('full_name')
      assignees = usersRes.data || []
    } else {
      const usersRes = await adminClient
        .from('users')
        .select('id, full_name, email')
        .eq('id', userId)
      assignees = usersRes.data || []
    }

    return NextResponse.json({ tasks: tasksRes.data || [], assignees, role })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await getAccessContext()
  if ('error' in ctx) return ctx.error
  const { adminClient, userId, role } = ctx

  try {
    const body = await request.json()
    const taskId = String(body.taskId || '')
    const status = String(body.status || '')
    if (!taskId || !status) return NextResponse.json({ error: 'taskId and status are required' }, { status: 400 })

    const taskRes = await adminClient
      .from('tasks')
      .select('id, assignee_id')
      .eq('id', taskId)
      .single()
    if (taskRes.error || !taskRes.data) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    if (!isFullAccessRole(role)) {
      if (role === 'team_lead') {
        if (!hasPermission(role, 'UPDATE_TASK')) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
        const teamRes = await adminClient
          .from('users')
          .select('id')
          .eq('reporting_manager_id', userId)
          .eq('is_active', true)
        const teamIds = new Set((teamRes.data || []).map((u: any) => u.id))
        if (!taskRes.data.assignee_id || !teamIds.has(taskRes.data.assignee_id)) {
          return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
        }
      } else {
        if (taskRes.data.assignee_id !== userId) {
          return NextResponse.json({ error: 'Cannot update others tasks' }, { status: 403 })
        }
      }
    }

    const updateRes = await adminClient
      .from('tasks')
      .update({ status })
      .eq('id', taskId)
      .select('*')
      .single()
    if (updateRes.error) return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
    return NextResponse.json({ task: updateRes.data })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

