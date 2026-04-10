'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Plus, FolderKanban, Pencil, Eye, CheckSquare, Layers, ListTodo, Clock } from 'lucide-react'
import { projectEditHref, projectHref } from '@/lib/slug'
import { QuickCreateTaskModal } from '@/components/projects/quick-create-task-modal'
import { cn } from '@/lib/utils'

export default function ProjectsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [createTaskModalKey, setCreateTaskModalKey] = useState(0)

  const projectPicks = useMemo(
    () => projects.map((p: any) => ({ id: p.id, name: p.name || 'Untitled project' })),
    [projects],
  )

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
        <div className="flex flex-wrap items-center gap-2">
          {projects.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCreateTaskModalKey((k) => k + 1)
                  setShowCreateTask(true)
                }}
              >
                <CheckSquare className="w-4 h-4 mr-2" />
                Create task
              </Button>
            </>
          )}
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
      {showCreateTask && (
        <QuickCreateTaskModal
          key={createTaskModalKey}
          onClose={() => setShowCreateTask(false)}
          projects={projectPicks}
        />
      )}

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
        (() => {
          const projectSummaries = projects.map((p: any) => ({ id: p.id, name: p.name as string | null }))
          const accents = [
            'from-primary/80 via-primary/40 to-transparent',
            'from-cyan-500/70 via-cyan-400/25 to-transparent',
            'from-violet-500/70 via-violet-400/25 to-transparent',
            'from-emerald-500/70 via-emerald-400/25 to-transparent',
            'from-amber-500/70 via-amber-400/25 to-transparent',
            'from-rose-500/65 via-rose-400/22 to-transparent',
          ]
          return (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((project: any, i: number) => {
                const modules = project.moduleCount || 0
                const tasks = project.taskStats?.total || 0
                const est = project.taskStats?.estimation || 0
                return (
                  <article
                    key={project.id}
                    className={cn(
                      'group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card',
                      'shadow-sm transition-all duration-300 ease-out',
                      'hover:border-primary/25 hover:shadow-lg hover:-translate-y-1',
                    )}
                  >
                    <div
                      className={cn(
                        'absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-90',
                        accents[i % accents.length],
                      )}
                      aria-hidden
                    />
                    <div className="relative flex flex-1 flex-col p-6 pt-7">
                      <div className="mb-5 min-h-[3.5rem]">
                        <Link
                          href={projectHref(project, projectSummaries)}
                          className="text-lg font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary line-clamp-2"
                        >
                          {project.name}
                        </Link>
                        <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
                          Project
                        </p>
                      </div>

                      <dl className="mb-6 grid grid-cols-3 gap-3">
                        <div className="rounded-xl bg-muted/50 px-3 py-3 text-center ring-1 ring-border/60 transition-colors group-hover:bg-muted/70">
                          <dt className="mb-1 flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <Layers className="h-3.5 w-3.5" aria-hidden />
                            Modules
                          </dt>
                          <dd className="text-xl font-bold tabular-nums text-foreground">{modules}</dd>
                        </div>
                        <div className="rounded-xl bg-muted/50 px-3 py-3 text-center ring-1 ring-border/60 transition-colors group-hover:bg-muted/70">
                          <dt className="mb-1 flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <ListTodo className="h-3.5 w-3.5" aria-hidden />
                            Tasks
                          </dt>
                          <dd className="text-xl font-bold tabular-nums text-foreground">{tasks}</dd>
                        </div>
                        <div className="rounded-xl bg-muted/50 px-3 py-3 text-center ring-1 ring-border/60 transition-colors group-hover:bg-muted/70">
                          <dt className="mb-1 flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" aria-hidden />
                            Est.
                          </dt>
                          <dd className="text-xl font-bold tabular-nums text-foreground">
                            {est}
                            <span className="text-sm font-semibold text-muted-foreground">h</span>
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-auto flex flex-wrap gap-2 border-t border-border/60 pt-5">
                        <Link href={projectHref(project, projectSummaries)} className="flex-1 min-w-[7rem]">
                          <Button
                            variant="default"
                            size="sm"
                            className="w-full gap-2"
                            title="View project"
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </Button>
                        </Link>
                        <Link href={projectEditHref(project, projectSummaries)} className="flex-1 min-w-[7rem]">
                          <Button variant="outline" size="sm" className="w-full gap-2" title="Edit project">
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )
        })()
      )}
    </DashboardLayout>
  )
}
