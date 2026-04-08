'use client'

import { useEffect, useState } from 'react'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  ArrowLeft, 
  Calendar, 
  Users,
  CheckSquare, 
  Target,
  Plus,
  X,
  MoreVertical,
  Eye,
} from 'lucide-react'

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

interface Task {
  id: string
  status: string
  module_id: string | null
  estimation?: number | null
  estimated_hours?: number | null
}

const statusColors: Record<string, string> = {
  planning: 'bg-muted text-muted-foreground',
  active: 'bg-primary/10 text-primary',
  on_hold: 'bg-accent/10 text-accent',
  completed: 'bg-green-500/10 text-green-600',
  cancelled: 'bg-destructive/10 text-destructive',
}

export default function ProjectDetailPage() {
  const params = useParams()
  const projectRef = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [projectSummaries, setProjectSummaries] = useState<{ id: string; name: string | null }[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModuleModal, setShowAddModuleModal] = useState(false)
  const [newModuleName, setNewModuleName] = useState('')
  const [creatingModule, setCreatingModule] = useState(false)
  const [canAddModule, setCanAddModule] = useState(false)

  const router = useRouter()
  const supabase = createClient()

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

      let finalTasks: Task[] = []
      const tasksByProject = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', resolvedProjectId)
        .order('created_at', { ascending: false })

      if (!tasksByProject.error) {
        finalTasks = (tasksByProject.data || []) as Task[]
      } else if (finalModules.length > 0) {
        const moduleIds = finalModules.map((m) => m.id).filter(Boolean)
        if (moduleIds.length > 0) {
          const tasksByModules = await supabase
            .from('tasks')
            .select('*')
            .in('module_id', moduleIds)
            .order('created_at', { ascending: false })
          finalTasks = (tasksByModules.data || []) as Task[]
        }
      }

      setModules(finalModules)
      setTasks(finalTasks)
      setLoading(false)
    }

    fetchData()
  }, [projectRef, router, supabase])

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

  const taskStats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  }

  const totalEstimation = modules.reduce((sum, mod) => sum + (mod.estimated_hours || 0), 0)

  const moduleAggregates = modules.map((module) => {
    const moduleTasks = tasks.filter((task) => task.module_id === module.id)
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
        <div className="flex items-center gap-2">
          <Link href="/projects">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Projects
            </Button>
          </Link>
          <Button variant="outline" size="sm">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </div>
      }
    >
      {/* Project Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${statusColors[project.status]}`}>
            {project.status.replace('_', ' ')}
          </span>
          <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${
            project.priority === 'high' ? 'bg-destructive/10 text-destructive' :
            project.priority === 'medium' ? 'bg-accent/10 text-accent' :
            'bg-muted text-muted-foreground'
          }`}>
            {project.priority} priority
          </span>
          {project.phase && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary">
              {project.phase}
            </span>
          )}
        </div>
        {project.description && (
          <p className="text-muted-foreground max-w-3xl">{project.description}</p>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckSquare className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{taskStats.total}</p>
                <p className="text-sm text-muted-foreground">Total Tasks</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Target className="w-8 h-8 text-cyan-500" />
              <div>
                <p className="text-2xl font-bold text-foreground">{modules.length}</p>
                <p className="text-sm text-muted-foreground">Modules</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-accent" />
              <div>
                <p className="text-2xl font-bold text-foreground">{totalEstimation}h</p>
                <p className="text-sm text-muted-foreground">Total Estimation</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {project.end_date ? new Date(project.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                </p>
                <p className="text-sm text-muted-foreground">Due Date</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 grid-cols-1">
        {/* Modules */}
        <Card className="col-span-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Modules</CardTitle>
            <div className="flex gap-2">
              {canAddModule && (
              <Button 
                size="sm" 
                onClick={() => setShowAddModuleModal(true)}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Module
              </Button>
              )}
              <Link href={`/modules?project=${project.id}`}>
                <Button size="sm" variant="outline">View All</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {modules.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No modules found. Add a module to get started.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-secondary z-10">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Module Name</th>
                      <th className="text-left px-3 py-2 font-semibold">Status</th>
                      <th className="text-left px-3 py-2 font-semibold">Number of Tasks</th>
                      <th className="text-left px-3 py-2 font-semibold">Estimated Time</th>
                      <th className="text-right px-3 py-2 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moduleAggregates.map(({ module, taskCount, estimatedTime }) => {
                      const enabled = module.is_active ?? true
                      return (
                        <tr key={module.id} className="border-t border-border hover:bg-secondary/40 transition">
                          <td className="px-3 py-2">
                            <div>
                              <p className="font-medium text-foreground">{module.name}</p>
                              {module.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1">{module.description}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </td>
                          <td className="px-3 py-2">{taskCount || 0}</td>
                          <td className="px-3 py-2">{estimatedTime || 0}h</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end">
                              <Link
                                href={projectModuleHref(
                                  project,
                                  module,
                                  projectSummaries,
                                  modules,
                                )}
                              >
                                <Button size="sm" variant="outline">
                                  <Eye className="w-4 h-4 mr-1" />
                                  View
                                </Button>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Module Modal */}
      {showAddModuleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Add Module</h3>
              <button 
                onClick={() => setShowAddModuleModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddModule} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Module Name *
                </label>
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
                <Button
                  type="submit"
                  disabled={creatingModule || !newModuleName.trim()}
                  className="flex-1 bg-primary"
                >
                  {creatingModule ? 'Creating...' : 'Create Module'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddModuleModal(false)}
                >
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
