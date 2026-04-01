'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Plus, Grid3X3, List, FolderKanban } from 'lucide-react'

export default function ProjectsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [userRole, setUserRole] = useState<string | null>(null)

  // Only Super Admin, Project Manager, and Delivery Manager can create projects
  const canCreateProject = userRole && ['super_admin', 'project_manager', 'delivery_manager'].includes(userRole)

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Fetch user's role
      const { data: userData } = await supabase
        .from('users')
        .select('role:roles(name)')
        .eq('id', user.id)
        .single()

      if (userData?.role?.name) {
        setUserRole(userData.role.name)
      }

      // Fetch all projects with estimations
      const { data: projectsData } = await supabase
        .from('projects')
        .select(`
          id,
          name,
          description,
          status,
          priority,
          created_at,
          modules(estimated_hours)
        `)
        .order('created_at', { ascending: false })

      // Calculate total estimations for each project
      const projectsWithEstimations = (projectsData || []).map(project => ({
        ...project,
        totalEstimation: (project.modules || []).reduce((sum: number, mod: any) => sum + (mod.estimated_hours || 0), 0)
      }))

      setProjects(projectsWithEstimations)
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
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
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
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project: any) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition cursor-pointer h-full flex flex-col">
                <h3 className="font-semibold text-lg text-foreground mb-2">{project.name}</h3>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2 flex-1">{project.description || 'No description'}</p>
                <div className="space-y-3">
                  <div className="bg-primary/10 rounded p-2">
                    <p className="text-xs text-muted-foreground">Total Estimation</p>
                    <p className="text-lg font-bold text-primary">{project.totalEstimation}h</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
                      project.status === 'active' ? 'bg-primary/10 text-primary' :
                      project.status === 'completed' ? 'bg-green-500/10 text-green-600' :
                      project.status === 'on_hold' ? 'bg-accent/10 text-accent' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {project.status?.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Project Name</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Estimation</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Priority</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {projects.map((project: any) => (
                <tr key={project.id} className="hover:bg-muted/50 transition">
                  <td className="px-6 py-4">
                    <Link href={`/projects/${project.id}`} className="text-primary hover:underline font-medium">
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-semibold text-primary bg-primary/10 px-3 py-1 rounded">
                      {project.totalEstimation}h
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
                      project.status === 'active' ? 'bg-primary/10 text-primary' :
                      project.status === 'completed' ? 'bg-green-500/10 text-green-600' :
                      project.status === 'on_hold' ? 'bg-accent/10 text-accent' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {project.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
                      project.priority === 'high' ? 'bg-destructive/10 text-destructive' :
                      project.priority === 'medium' ? 'bg-accent/10 text-accent' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {project.priority || 'medium'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {new Date(project.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  )
}
