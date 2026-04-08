import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/rbac-server'
import type { CapacityEmployee } from '@/lib/capacity-server'
import { fetchCapacityForMonth, fetchUsersByIds, isMissingCapacityTable } from '@/lib/capacity-server'

async function fetchTasksForUtilization(admin: any) {
  const selects = [
    'id, estimated_hours, estimation, is_billable, status, assignee_id, project_id, assigned_month, module_id, assignee:users!tasks_assignee_id_fkey (id, full_name, email), projects (id, name)',
    'id, estimated_hours, estimation, is_billable, status, assignee_id, project_id, assigned_month, module_id',
    'id, estimated_hours, estimation, is_billable, status, assignee_id, project_id, assigned_month',
    'id, assignee_id, project_id, module_id, estimated_hours, estimation, assigned_month, status',
    '*',
  ]
  for (const sel of selects) {
    const q = admin.from('tasks').select(sel)
    const { data, error } = await q
    if (error?.code === 'PGRST205') {
      const msg = String(error.message || '').toLowerCase()
      if (msg.includes('tasks')) return []
    }
    if (error?.code === 'PGRST204') continue
    if (error) continue
    if (!data || !Array.isArray(data)) continue
    return await shapeTasksForUtilization(admin, data as Record<string, unknown>[])
  }
  return []
}

async function shapeTasksForUtilization(admin: any, rows: Record<string, unknown>[]) {
  const assigneeIds = [...new Set(rows.map((r) => r.assignee_id).filter(Boolean).map(String))]
  const projectIds = new Set(rows.map((r) => r.project_id).filter(Boolean).map(String))
  const moduleIds = [...new Set(rows.map((r) => r.module_id).filter(Boolean).map(String))]
  const userMap = await fetchUsersByIds(admin, assigneeIds)
  const projMap = new Map<string, { name: string }>()
  if (projectIds.size) {
    const { data: prows } = await admin.from('projects').select('id, name').in('id', [...projectIds])
    for (const p of prows || []) {
      const pr = p as { id: string; name?: string | null }
      projMap.set(String(pr.id), { name: String(pr.name || 'Project') })
    }
  }
  if (moduleIds.length) {
    const { data: mods } = await admin.from('modules').select('id, project_id').in('id', moduleIds)
    const modToProject = new Map<string, string>()
    const extraProjectIds: string[] = []
    for (const m of mods || []) {
      const row = m as { id: string; project_id?: string | null }
      if (row.project_id) {
        modToProject.set(String(row.id), String(row.project_id))
        if (!projMap.has(String(row.project_id))) extraProjectIds.push(String(row.project_id))
      }
    }
    if (extraProjectIds.length) {
      const { data: prows2 } = await admin.from('projects').select('id, name').in('id', extraProjectIds)
      for (const p of prows2 || []) {
        const pr = p as { id: string; name?: string | null }
        projMap.set(String(pr.id), { name: String(pr.name || 'Project') })
      }
    }
    return rows.map((t) => shapeOneTask(t, userMap, projMap, modToProject))
  }

  return rows.map((t) => shapeOneTask(t, userMap, projMap, new Map()))
}

function shapeOneTask(
  t: Record<string, unknown>,
  userMap: Map<string, CapacityEmployee>,
  projMap: Map<string, { name: string }>,
  modToProject: Map<string, string>,
) {
  const aidRaw = t.assignee_id
  const aid = aidRaw ? String(aidRaw) : ''
  const embA = t.assignee
  let assignee: { id: string; full_name: string | null; email: string } | null = null
  if (aid) {
    if (embA && typeof embA === 'object') {
      const a = embA as { id?: string; full_name?: string | null; email?: string | null }
      assignee = {
        id: String(a.id || aid),
        full_name: a.full_name ?? null,
        email: String(a.email || ''),
      }
    } else {
      const u = userMap.get(aid)
      assignee = u
        ? { id: u.id, full_name: u.full_name, email: u.email }
        : { id: aid, full_name: null, email: '' }
    }
  }

  let pid = t.project_id ? String(t.project_id) : null
  const mid = t.module_id ? String(t.module_id) : null
  if (!pid && mid && modToProject.has(mid)) {
    pid = modToProject.get(mid) || null
  }

  let projects: { name: string }
  const emb = t.projects
  if (emb && typeof emb === 'object' && emb !== null && 'name' in emb) {
    projects = { name: String((emb as { name: unknown }).name || 'Unassigned') }
  } else if (pid && projMap.has(pid)) {
    projects = projMap.get(pid)!
  } else {
    projects = { name: 'Unassigned' }
  }

  return {
    id: t.id,
    estimated_hours: Number(t.estimated_hours ?? t.estimation ?? 0),
    is_billable: t.is_billable ?? true,
    status: t.status,
    assignee_id: t.assignee_id ?? null,
    project_id: pid || t.project_id,
    assigned_month: t.assigned_month,
    assignee,
    projects,
  }
}

async function fetchCapacityAlerts(admin: any) {
  const { data, error } = await admin
    .from('alerts')
    .select('*')
    .eq('is_read', false)
    .eq('type', 'capacity_warning')
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) {
    if (isMissingCapacityTable(error, 'alerts')) return []
    return []
  }
  return data || []
}

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month =
    req.nextUrl.searchParams.get('month') ||
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  const admin = ctx.adminClient
  const [tasks, capacityRecords, alerts] = await Promise.all([
    fetchTasksForUtilization(admin),
    fetchCapacityForMonth(admin, month),
    fetchCapacityAlerts(admin),
  ])

  const capacityData = capacityRecords.map((r) => ({
    employee_id: r.employee_id,
    month: r.month,
    available_hours: r.available_hours,
    allocated_hours: r.allocated_hours,
    users: {
      id: r.employee.id,
      full_name: r.employee.full_name,
      email: r.employee.email,
    },
  }))

  return NextResponse.json({
    month,
    tasks,
    capacityData,
    alerts,
  })
}
