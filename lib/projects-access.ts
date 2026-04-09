import type { AuthContextResult } from '@/lib/rbac-server'
import { canAccessAll } from '@/lib/rbac-server'

/** id + name for URL slug resolution; same visibility as GET /api/projects (service role + manual filter). */
export async function getAccessibleProjectSummaries(
  ctx: AuthContextResult,
): Promise<{ id: string; name: string | null }[]> {
  const { adminClient, role, clientId, isMasterAdmin, userId } = ctx
  if (!userId) return []

  if (isMasterAdmin) {
    const { data, error } = await adminClient
      .from('projects')
      .select('id, name')
      .order('created_at', { ascending: false })
    if (error) return []
    return data || []
  }

  if (canAccessAll(role) && clientId) {
    const { data, error } = await adminClient
      .from('projects')
      .select('id, name')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) return []
    return data || []
  }

  if (role === 'manager' && clientId) {
    // Check if manager has view_all permission (e.g. Delivery Manager)
    const hasViewAll = ctx.permissions?.projects?.view_all === true
    
    if (hasViewAll) {
      // Delivery Manager equivalent: see all projects in client
      const { data, error } = await adminClient
        .from('projects')
        .select('id, name')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      if (error) return []
      return data || []
    }
    
    // Project Manager: see projects they lead, are assigned to, or within their department
    const [leadRes, assignedRes, userProfileRes] = await Promise.all([
      adminClient.from('projects').select('id, name, client_id').eq('project_lead_id', userId),
      adminClient.from('project_users').select('project_id').eq('user_id', userId),
      adminClient.from('team').select('department_id').eq('id', userId).maybeSingle(),
    ])
    
    const byId = new Map<string, { id: string; name: string | null }>()
    
    // Projects they lead
    if (!leadRes.error) {
      for (const p of (leadRes.data || []).filter((p: any) => p?.client_id === clientId)) {
        byId.set(p.id, { id: p.id, name: p.name })
      }
    }
    
    // Projects they're assigned to
    const assignedIds = (assignedRes.data || []).map((r: any) => r.project_id).filter(Boolean)
    if (assignedIds.length > 0) {
      const { data: assignedProjects } = await adminClient
        .from('projects')
        .select('id, name, client_id')
        .in('id', assignedIds)
      for (const p of (assignedProjects || []).filter((p: any) => p?.client_id === clientId)) {
        byId.set(p.id, { id: p.id, name: p.name })
      }
    }
    
    // Projects where the lead is in the same department
    const managerDeptId = userProfileRes.data?.department_id
    if (managerDeptId) {
      const { data: deptUsers } = await adminClient
        .from('team')
        .select('id')
        .eq('department_id', managerDeptId)
        .eq('client_id', clientId)
      const deptUserIds = (deptUsers || []).map((u: any) => u.id).filter(Boolean)
      if (deptUserIds.length > 0) {
        const { data: deptProjects } = await adminClient
          .from('projects')
          .select('id, name, client_id')
          .in('project_lead_id', deptUserIds)
          .eq('client_id', clientId)
        for (const p of deptProjects || []) {
          byId.set(p.id, { id: p.id, name: p.name })
        }
      }
    }
    
    return Array.from(byId.values())
  }

  if (role === 'team_lead') {
    const [leadProjectsRes, projectUsersRes] = await Promise.all([
      adminClient.from('projects').select('id, name, client_id').eq('project_lead_id', userId),
      adminClient.from('project_users').select('project_id').eq('user_id', userId),
    ])
    if (leadProjectsRes.error) return []
    const direct = (leadProjectsRes.data || []).filter((p: any) => !clientId || p?.client_id === clientId)
    const projectIds = Array.from(
      new Set((projectUsersRes.data || []).map((r: any) => r.project_id).filter(Boolean)),
    )
    let extra: any[] = []
    if (projectIds.length > 0) {
      const extraRes = await adminClient.from('projects').select('id, name, client_id').in('id', projectIds)
      if (!extraRes.error) {
        extra = (extraRes.data || []).filter((p: any) => !clientId || p?.client_id === clientId)
      }
    }
    const byId = new Map<string, any>()
    ;[...direct, ...extra].forEach((p) => byId.set(p.id, p))
    return Array.from(byId.values()).map((p) => ({ id: p.id, name: p.name }))
  }

  if (role === 'member') {
    const projectUsersRes = await adminClient.from('project_users').select('project_id').eq('user_id', userId)
    if (projectUsersRes.error) return []
    const projectIds = (projectUsersRes.data || []).map((r: any) => r.project_id).filter(Boolean)
    if (projectIds.length === 0) return []
    const projectsRes = await adminClient.from('projects').select('id, name, client_id').in('id', projectIds)
    if (projectsRes.error) return []
    return (projectsRes.data || [])
      .filter((p: any) => !clientId || p?.client_id === clientId)
      .map((p: any) => ({ id: p.id, name: p.name }))
  }

  return []
}
