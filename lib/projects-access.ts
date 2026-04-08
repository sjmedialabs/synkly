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
    const { data, error } = await adminClient
      .from('projects')
      .select('id, name')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) return []
    return data || []
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
