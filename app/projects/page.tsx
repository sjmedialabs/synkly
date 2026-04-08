'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Plus, FolderKanban, Pencil, Eye } from 'lucide-react'
import { projectEditHref, projectHref } from '@/lib/slug'

export default function ProjectsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)

  // Master Admin, Client Admin, and Manager can create projects
  const canCreateProject = userRole && ['master_admin', 'client_admin', 'manager'].includes(userRole)

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Fetch user's role via role_id join
      const { data: userData } = await supabase
        .from('team')
        .select('role_id, roles:role_id (name)')
        .eq('id', user.id)
        .single()

      if ((userData as any)?.roles?.name) {
        setUserRole((userData as any).roles.name)
      }

      // RBAC-enforced project list from backend API
      const projectsRes = await fetch('/api/projects')
      const projectsJson = await projectsRes.json()
      if (!projectsRes.ok) {
        if (projectsRes.status === 403) {
          router.push('/dashboard')
          return
        }
        console.error('Failed to fetch projects:', projectsJson?.error)
        try {
          const meRes = await fetch('/api/me')
          if (meRes.ok) {
            const me = await meRes.json()
            if (me?.role) setUserRole(me.role)
          }
        } catch {
          /* ignore */
        }
        setProjects([])
        setLoading(false)
        return
      }
      if (projectsJson?.role) {
        setUserRole(projectsJson.role)
      }
      setProjects((projectsJson.projects || []) as any[])
      setLoading(false)
    }

    getUser()
  }, [router, supabase])

  if (loading) {
    return (
      <DashboardLayout title="Projects">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-muted rounded w-40"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout 
      title="Projects"
      actions={
        <div className="flex items-center gap-4">
          {canCreateProject && (
            <Link href="/projects/new">
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            </Link>
          )}
        </div>
      }
    >
      {projects.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <FolderKanban className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No Projects Yet</h3>
          <p className="text-muted-foreground mb-6">
            {canCreateProject ? 'Create your first project to get started' : 'No projects have been assigned to you yet'}
          </p>
          {canCreateProject && (
            <Link href="/projects/new">
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Plus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {(() => {
            const projectSummaries = projects.map((p: any) => ({ id: p.id, name: p.name as string | null }))
            return (
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-semibold text-foreground">Project Name</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-foreground">Total Modules</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-foreground">Total Tasks</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-foreground">Total Estimation</th>
                <th className="px-4 py-2 text-right text-sm font-semibold text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {projects.map((project: any) => (
                <tr key={project.id} className="hover:bg-muted/40 transition">
                  <td className="px-4 py-2">
                    <Link href={projectHref(project, projectSummaries)} className="text-primary hover:underline font-medium">
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{project.moduleCount || 0}</td>
                  <td className="px-4 py-2">{project.taskStats?.total || 0}</td>
                  <td className="px-4 py-2">{project.taskStats?.estimation || 0}h</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <Link href={projectHref(project, projectSummaries)}>
                        <Button size="sm" variant="outline" title="View Project" aria-label="View Project">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Link href={projectEditHref(project, projectSummaries)}>
                        <Button size="sm" variant="outline" title="Edit Project" aria-label="Edit Project">
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            )
          })()}
        </div>
      )}
    </DashboardLayout>
  )
}
