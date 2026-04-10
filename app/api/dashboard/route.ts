import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/rbac-server'
import { apiCache, tableCache, shortCacheHeaders } from '@/lib/cache'
import type { RoleKey } from '@/lib/rbac'

function missingTable(err: { code?: string; message?: string } | null) {
  if (!err) return false
  if (err.code === 'PGRST205') return true
  const m = String(err.message || '')
  return m.includes('schema cache') || m.includes('Could not find the table')
}

async function resolvePeopleTable(adminClient: any): Promise<'team' | 'users' | null> {
  const cached = tableCache.get<'team' | 'users' | null>('peopleTable')
  if (cached !== undefined) return cached
  const teamCheck = await adminClient.from('team').select('id').limit(1)
  if (!teamCheck.error) { tableCache.set('peopleTable', 'team'); return 'team' }
  const usersCheck = await adminClient.from('users').select('id').limit(1)
  if (!usersCheck.error) { tableCache.set('peopleTable', 'users'); return 'users' }
  tableCache.set('peopleTable', null)
  return null
}

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Return cached dashboard if available (60s TTL)
    const cacheKey = `dashboard:${ctx.userId}`
    const cached = apiCache.get<any>(cacheKey)
    if (cached) return NextResponse.json(cached, { headers: shortCacheHeaders() })

    const admin = ctx.adminClient
    const peopleTable = await resolvePeopleTable(admin)

    let full_name: string | null = null
    let status = 'active'
    if (peopleTable) {
      const pr = await admin
        .from(peopleTable)
        .select('full_name, name, email, status, is_active')
        .eq('id', ctx.userId)
        .maybeSingle()
      if (!pr.error && pr.data) {
        full_name = (pr.data as any).full_name || (pr.data as any).name || null
        if ((pr.data as any).status) status = String((pr.data as any).status)
        else if ((pr.data as any).is_active === false) status = 'inactive'
      }
    }
    if (!full_name) {
      const au = await admin.auth.admin.getUserById(ctx.userId)
      const meta = (au.data?.user?.user_metadata || {}) as Record<string, unknown>
      full_name =
        (typeof meta.full_name === 'string' && meta.full_name) ||
        ctx.email?.split('@')[0] ||
        'User'
    }

    const role: RoleKey | null = ctx.role
    const clientScope = ctx.isMasterAdmin ? null : ctx.clientId

    let projects: any[] = []
    {
      let q = admin.from('projects').select('id, name, status, description, created_at, client_id')
      if (clientScope) q = q.eq('client_id', clientScope)
      const res = await q.order('created_at', { ascending: false })
      if (!missingTable(res.error) && res.data) projects = res.data
    }

    const projectIds = projects.map((p) => p.id)

    let tasks: any[] = []
    {
      let q = admin.from('tasks').select('id, status, assignee_id, project_id')
      if (clientScope) {
        if (projectIds.length) q = q.in('project_id', projectIds)
        else q = q.eq('id', '00000000-0000-0000-0000-000000000000')
      }
      const res = await q
      if (!missingTable(res.error) && res.data) tasks = res.data
    }

    let teamCount = 0
    if (peopleTable) {
      let q = admin.from(peopleTable).select('id', { count: 'exact', head: true })
      if (clientScope) q = q.eq('client_id', clientScope)
      const res = await q
      if (!missingTable(res.error)) teamCount = res.count || 0
    }

    let milestoneCount = 0
    {
      let q = admin.from('milestones').select('id', { count: 'exact', head: true })
      if (clientScope && projectIds.length) q = q.in('project_id', projectIds)
      else if (clientScope && !projectIds.length) {
        q = q.eq('id', '00000000-0000-0000-0000-000000000000')
      }
      const res = await q
      if (!missingTable(res.error)) milestoneCount = res.count || 0
    }

    let myTasks: any[] = []
    if (!clientScope || projectIds.length > 0) {
      let q = admin
        .from('tasks')
        .select('id, title, status, priority, due_date, projects(name)')
        .eq('assignee_id', ctx.userId)
        .in('status', ['todo', 'in_progress'])
        .order('due_date', { ascending: true })
        .limit(5)

      if (clientScope && projectIds.length) q = q.in('project_id', projectIds)

      const res = await q
      if (!missingTable(res.error) && res.data) {
        myTasks = (res.data as any[]).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          due_date: t.due_date,
          project: t.projects && typeof t.projects === 'object' ? { name: (t.projects as any).name } : null,
        }))
      }
    }

    const stats = {
      projects: projects.length,
      activeProjects: projects.filter((p) => p.status === 'active').length,
      tasks: tasks.length,
      pendingTasks: tasks.filter((t) => t.status === 'todo' || t.status === 'in_progress').length,
      teamMembers: teamCount,
      milestones: milestoneCount,
    }

    const payload = {
      full_name,
      role,
      status,
      stats,
      myTasks,
    }
    apiCache.set(cacheKey, payload)
    return NextResponse.json(payload, { headers: shortCacheHeaders() })
  } catch (e: any) {
    console.error('[dashboard API] GET error:', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
