'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  projectHref,
  projectModuleHref,
  projectUrlSegment,
  resolveProjectFromRef,
} from '@/lib/slug'
import { canCreateModules } from '@/lib/rbac'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  CheckSquare,
  Plus,
  X,
  Upload,
  Layers,
  ListTodo,
  Clock,
  ArrowRight,
} from 'lucide-react'
import { QuickCreateTaskModal } from '@/components/projects/quick-create-task-modal'
import { cn } from '@/lib/utils'

interface Project {
  id: string
  name: string
  description: string | null
  status: string
  priority: string
  phase: string | null
  start_date: string | null
  end_date: string | null
  budget: number | null
  created_at: string
}

interface Module {
  id: string
  name: string
  description: string | null
  estimated_hours: number
  status: string
  is_active?: boolean
}

type TaskRollupRow = {
  module_id: string | null
  estimation: number | null
  estimated_hours: number | null
}

const MODULE_ACCENTS = [
  'from-primary/80 via-primary/40 to-transparent',
  'from-cyan-500/70 via-cyan-400/25 to-transparent',
  'from-violet-500/70 via-violet-400/25 to-transparent',
  'from-emerald-500/70 via-emerald-400/25 to-transparent',
  'from-amber-500/70 via-amber-400/25 to-transparent',
  'from-rose-500/65 via-rose-400/22 to-transparent',
]

function formatModuleStatus(m: Module) {
  if (m.is_active === false) return 'Disabled'
  const s = (m.status || 'active').replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function ProjectDetailPage() {
  const params = useParams()
  const projectRef = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [projectSummaries, setProjectSummaries] = useState<{ id: string; name: string | null }[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [taskRollupRows, setTaskRollupRows] = useState<TaskRollupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModuleModal, setShowAddModuleModal] = useState(false)
  const [newModuleName, setNewModuleName] = useState('')
  const [creatingModule, setCreatingModule] = useState(false)
  const [canAddModule, setCanAddModule] = useState(false)
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [createTaskModalKey, setCreateTaskModalKey] = useState(0)
  const prevShowCreateTask = useRef(false)

  const router = useRouter()
  const supabase = createClient()

  const refreshTaskRollup = useCallback(
    async (projectId: string, moduleList: Module[]) => {
      const sel = 'module_id, estimation, estimated_hours'
      let rows: TaskRollupRow[] = []
      const byProject = await supabase
        .from('tasks')
        .select(sel)
        .eq('project_id', projectId)
      if (!byProject.error && byProject.data) {
        rows = byProject.data as TaskRollupRow[]
      } else if (moduleList.length > 0) {
        const moduleIds = moduleList.map((m) => m.id).filter(Boolean)
        if (moduleIds.length > 0) {
          const byMod = await supabase.from('tasks').select(sel).in('module_id', moduleIds)
          if (!byMod.error && byMod.data) rows = byMod.data as TaskRollupRow[]
        }
      }
      setTaskRollupRows(rows)
    },
    [supabase],
  )

  useEffect(() => {
    async function fetchData() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      const meRes = await fetch('/api/me')
      if (meRes.ok) {
        const me = await meRes.json()
        setCanAddModule(canCreateModules(me.role))
      }

      const { data: summaryRows } = await supabase.from('projects').select('id, name')
      const summaries = summaryRows || []
      const resolved = resolveProjectFromRef(projectRef, summaries)
      if (!resolved) {
        router.push('/projects')
        return
      }
      const resolvedProjectId = resolved.id

      const { data: projectData, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', resolvedProjectId)
        .single()

      if (error || !projectData) {
        router.push('/projects')
        return
      }

      setProject(projectData)
      setProjectSummaries(summaries)

      const segment = projectUrlSegment(projectData, summaries)
      if (decodeURIComponent(projectRef).trim() !== segment) {
        router.replace(projectHref(projectData, summaries))
      }

      const modulesRes = await supabase
        .from('modules')
        .select('*')
        .eq('project_id', resolvedProjectId)
        .order('created_at', { ascending: false })

      const finalModules = ((modulesRes.data || []) as any[]).map((m) => ({
        id: m.id,
        name: m.name || 'Untitled Module',
        description: m.description ?? null,
        estimated_hours: Number(m.estimated_hours ?? 0),
        status: String(m.status || 'active'),
        is_active: m.is_active ?? true,
      })) as Module[]

      setModules(finalModules)

      let rollup: TaskRollupRow[] = []
      const rollupRes = await supabase
        .from('tasks')
        .select('module_id, estimation, estimated_hours')
        .eq('project_id', resolvedProjectId)

      if (!rollupRes.error && rollupRes.data) {
        rollup = rollupRes.data as TaskRollupRow[]
      } else if (finalModules.length > 0) {
        const moduleIds = finalModules.map((m) => m.id).filter(Boolean)
        if (moduleIds.length > 0) {
          const byMod = await supabase
            .from('tasks')
            .select('module_id, estimation, estimated_hours')
            .in('module_id', moduleIds)
          if (!byMod.error && byMod.data) {
            rollup = byMod.data as TaskRollupRow[]
          }
        }
      }

      setTaskRollupRows(rollup)
      setLoading(false)
    }

    fetchData()
  }, [projectRef, router, supabase])

  useEffect(() => {
    if (prevShowCreateTask.current && !showCreateTask && project) {
      void refreshTaskRollup(project.id, modules)
    }
    prevShowCreateTask.current = showCreateTask
  }, [showCreateTask, project, modules, refreshTaskRollup])

  if (loading) {
    return (
      <DashboardLayout title="Project Details">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48"></div>
          <div className="h-32 bg-muted rounded"></div>
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!project) {
    return null
  }

  const moduleAggregates = modules.map((module) => {
    const moduleTasks = taskRollupRows.filter((task) => task.module_id === module.id)
    const taskCount = moduleTasks.length
    const estimatedTime = moduleTasks.reduce((sum, task) => {
      const estimation = Number(task.estimation ?? task.estimated_hours ?? 0)
      return sum + (Number.isFinite(estimation) ? estimation : 0)
    }, 0)
    return {
      module,
      taskCount,
      estimatedTime,
    }
  })

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newModuleName.trim() || !project) return

    setCreatingModule(true)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectRef)}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newModuleName.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.module) {
        const msg = [json.error, json.hint].filter(Boolean).join(' — ') || 'Failed to create module'
        throw new Error(msg)
      }
      const row = json.module as Record<string, unknown>
      setModules([
        ...modules,
        {
          id: String(row.id),
          name: String(row.name || 'Untitled Module'),
          description: (row.description as string | null) ?? null,
          estimated_hours: Number(row.estimated_hours ?? 0),
          status: String(row.status || 'not_started'),
          is_active: (row.is_active as boolean | undefined) ?? true,
        },
      ])
      setNewModuleName('')
      setShowAddModuleModal(false)
    } catch (error: any) {
      console.error('Error creating module:', error)
      alert('Error creating module: ' + error.message)
    } finally {
      setCreatingModule(false)
    }
  }

  return (
    <DashboardLayout
      title={project.name}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              setCreateTaskModalKey((k) => k + 1)
              setShowCreateTask(true)
            }}
          >
            <CheckSquare className="w-4 h-4 mr-2" />
            Create task
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/tasks/bulk-upload">
              <Upload className="w-4 h-4 mr-2" />
              Bulk upload
            </Link>
          </Button>
          <Link href="/projects">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Projects
            </Button>
          </Link>
        </div>
      }
    >
      {showCreateTask && (
        <QuickCreateTaskModal
          key={createTaskModalKey}
          onClose={() => setShowCreateTask(false)}
          projects={projectSummaries.map((s) => ({ id: s.id, name: s.name || 'Untitled project' }))}
          defaultProjectId={project.id}
        />
      )}

      <div className="mb-8 space-y-3">
        {project.description ? (
          <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">{project.description}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground/80">Status:</span> {project.status.replace(/_/g, ' ')}
          <span className="mx-2 text-border">·</span>
          <span className="text-foreground/80">Priority:</span> {project.priority}
          {project.phase ? (
            <>
              <span className="mx-2 text-border">·</span>
              <span className="text-foreground/80">Phase:</span> {project.phase}
            </>
          ) : null}
          {project.end_date ? (
            <>
              <span className="mx-2 text-border">·</span>
              <span className="text-foreground/80">Target end:</span>{' '}
              {new Date(project.end_date).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </>
          ) : null}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Modules</h2>
        <div className="flex flex-wrap gap-2">
          {canAddModule && (
            <Button size="sm" onClick={() => setShowAddModuleModal(true)} className="bg-primary text-primary-foreground">
              <Plus className="w-4 h-4 mr-1" />
              Add module
            </Button>
          )}
          <Link href={`/modules?project=${project.id}`}>
            <Button size="sm" variant="outline">
              View all modules
            </Button>
          </Link>
          <Link href="/tasks">
            <Button size="sm" variant="outline">
              Global task board
            </Button>
          </Link>
        </div>
      </div>

      {modules.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground border border-dashed border-border rounded-2xl">
          No modules yet. Add one to organize work.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {moduleAggregates.map(({ module, taskCount, estimatedTime }, i) => {
            const href = projectModuleHref(project, module, projectSummaries, modules)
            return (
              <Link key={module.id} href={href} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                <article
                  className={cn(
                    'relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card',
                    'shadow-sm transition-all duration-300 ease-out',
                    'hover:border-primary/30 hover:shadow-lg hover:-translate-y-1',
                  )}
                >
                  <div
                    className={cn(
                      'absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-90',
                      MODULE_ACCENTS[i % MODULE_ACCENTS.length],
                    )}
                    aria-hidden
                  />
                  <div className="flex flex-1 flex-col p-5 pt-6">
                    <div className="mb-4 min-h-[2.75rem]">
                      <h3 className="text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary line-clamp-2">
                        {module.name}
                      </h3>
                      {module.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{module.description}</p>
                      ) : null}
                    </div>
                    <dl className="mb-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-muted/40 px-2 py-2.5 ring-1 ring-border/50">
                        <dt className="mb-0.5 flex items-center justify-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <Layers className="h-3 w-3" aria-hidden />
                          Status
                        </dt>
                        <dd className="text-[11px] font-medium text-foreground leading-tight">{formatModuleStatus(module)}</dd>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-2 py-2.5 ring-1 ring-border/50">
                        <dt className="mb-0.5 flex items-center justify-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <ListTodo className="h-3 w-3" aria-hidden />
                          Tasks
                        </dt>
                        <dd className="text-lg font-bold tabular-nums text-foreground">{taskCount}</dd>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-2 py-2.5 ring-1 ring-border/50">
                        <dt className="mb-0.5 flex items-center justify-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <Clock className="h-3 w-3" aria-hidden />
                          Est.
                        </dt>
                        <dd className="text-lg font-bold tabular-nums text-foreground">
                          {estimatedTime}
                          <span className="text-xs font-semibold text-muted-foreground">h</span>
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-4 text-xs">
                      <span className="text-muted-foreground">Module tasks</span>
                      <span className="inline-flex items-center gap-1 font-medium text-primary">
                        Open
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            )
          })}
        </div>
      )}

      {showAddModuleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Add Module</h3>
              <button onClick={() => setShowAddModuleModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddModule} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Module Name *</label>
                <input
                  type="text"
                  required
                  value={newModuleName}
                  onChange={(e) => setNewModuleName(e.target.value)}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="e.g., Authentication Module"
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-4 pt-4 border-t border-border">
                <Button type="submit" disabled={creatingModule || !newModuleName.trim()} className="flex-1 bg-primary">
                  {creatingModule ? 'Creating...' : 'Create Module'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowAddModuleModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
