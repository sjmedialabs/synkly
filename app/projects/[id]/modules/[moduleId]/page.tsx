'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Plus, X, Pencil } from 'lucide-react'
import {
  fetchModuleFromUrlRef,
  fetchProjectFromUrlRef,
  moduleUrlSegment,
  projectHref,
} from '@/lib/slug'

type ModuleRecord = {
  id: string
  project_id: string
  name: string
  description: string | null
  status: string
  estimated_hours: number | null
  is_active?: boolean
}

type TaskRecord = {
  id: string
  title: string
  status: string
  assignee_id?: string | null
  assignee?: { full_name: string | null; email: string } | null
  estimation?: number | null
  estimated_hours?: number | null
  start_date?: string | null
  end_date?: string | null
}

export default function ProjectModuleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const projectIdParam = params.id
  const moduleIdParam = params.moduleId
  const projectRef = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam
  const moduleRef = Array.isArray(moduleIdParam) ? moduleIdParam[0] : moduleIdParam

  const [projectNav, setProjectNav] = useState<{ id: string; name: string | null } | null>(null)
  const [projectSummaries, setProjectSummaries] = useState<{ id: string; name: string | null }[]>([])

  const [loading, setLoading] = useState(true)
  const [module, setModule] = useState<ModuleRecord | null>(null)
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [sprints, setSprints] = useState<{ id: string; name: string }[]>([])
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
  const [showEditTaskModal, setShowEditTaskModal] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)
  const [editingTask, setEditingTask] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    sprint_id: '',
    assignee_id: '',
    estimation: '',
    start_date: '',
    end_date: '',
  })
  const [editTask, setEditTask] = useState({
    title: '',
    description: '',
    sprint_id: '',
    assignee_id: '',
    estimation: '',
    start_date: '',
    end_date: '',
    status: 'todo',
  })

  useEffect(() => {
    async function load() {
      if (!projectRef || !moduleRef) {
        return
      }

      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        router.push('/auth/login')
        return
      }

      const { data: summaryRows } = await supabase.from('projects').select('id, name')
      const summaries = summaryRows || []
      setProjectSummaries(summaries)

      const projectRow = await fetchProjectFromUrlRef(supabase, projectRef)
      if (!projectRow) {
        router.push('/projects')
        return
      }
      setProjectNav(projectRow)

      const moduleStub = await fetchModuleFromUrlRef(supabase, projectRow.id, moduleRef)
      if (!moduleStub) {
        router.push(projectHref(projectRow, summaries))
        return
      }

      const { data: modulesInProject } = await supabase
        .from('modules')
        .select('id, name')
        .eq('project_id', projectRow.id)

      const moduleList = modulesInProject || []
      const canonicalModSeg = moduleUrlSegment(moduleStub, moduleList)
      if (decodeURIComponent(moduleRef).trim() !== canonicalModSeg) {
        router.replace(`${projectHref(projectRow, summaries)}/modules/${encodeURIComponent(canonicalModSeg)}`)
      }

      const moduleRes = await supabase
        .from('modules')
        .select('*')
        .eq('id', moduleStub.id)
        .eq('project_id', projectRow.id)
        .maybeSingle()

      let moduleData = moduleRes.data
        ? ({
            id: moduleRes.data.id,
            project_id: moduleRes.data.project_id,
            name: moduleRes.data.name || 'Untitled Module',
            description: moduleRes.data.description ?? null,
            status: moduleRes.data.status || 'active',
            estimated_hours: Number(moduleRes.data.estimated_hours ?? 0),
            is_active: moduleRes.data.is_active ?? true,
          } as ModuleRecord)
        : null
      if (moduleRes.error) {
        const legacy = await supabase
          .from('modules')
          .select('id, project_id, name, description, status, estimated_hours')
          .eq('id', moduleStub.id)
          .eq('project_id', projectRow.id)
          .maybeSingle()

        if (legacy.data) {
          moduleData = { ...legacy.data, is_active: true } as ModuleRecord
        } else {
          const minimal = await supabase
            .from('modules')
            .select('id, project_id, name, description')
            .eq('id', moduleStub.id)
            .eq('project_id', projectRow.id)
            .maybeSingle()

          moduleData = minimal.data
            ? ({
                ...minimal.data,
                status: 'active',
                estimated_hours: 0,
                is_active: true,
              } as ModuleRecord)
            : null
        }
      }

      if (!moduleData) {
        router.push(projectHref(projectRow, summaries))
        return
      }

      const tasksRes = await supabase
        .from('tasks')
        .select('*')
        .eq('module_id', moduleData.id)
        .order('created_at', { ascending: false })

      const [sprintsRes, assignableRes] = await Promise.all([
        fetch(`/api/sprints?project_id=${moduleData.project_id}`),
        fetch(`/api/team/assignable-users?project_id=${encodeURIComponent(moduleData.project_id)}`),
      ])

      setModule(moduleData)
      setTasks(((tasksRes.data || []) as any[]).map((task) => ({
        ...task,
        assignee: null,
      })))
      let sprintJson: { sprints?: any[]; error?: string } = { sprints: [] }
      try {
        sprintJson = await sprintsRes.json()
      } catch {
        sprintJson = {}
      }
      if (!sprintsRes.ok) {
        console.warn('[module] /api/sprints failed:', sprintsRes.status, sprintJson?.error || sprintJson)
      }
      setSprints(
        (sprintJson.sprints || []).map((s: any) => ({
          id: s.id,
          name: String(s.name ?? s.sprint_name ?? 'Sprint').trim() || 'Sprint',
        })),
      )
      let members: { id: string; full_name: string | null; email: string }[] = []
      if (assignableRes.ok) {
        try {
          const uj = await assignableRes.json()
          members = (uj.users || []).map((u: any) => ({
            id: u.id,
            full_name: u.full_name ?? null,
            email: u.email ?? '',
          }))
        } catch {
          members = []
        }
      }
      setTeamMembers(members)
      setLoading(false)
    }

    load()
  }, [moduleRef, projectRef, router, supabase])

  if (loading) {
    return (
      <DashboardLayout title="Module Details">
        <div className="p-6 text-muted-foreground">Loading module...</div>
      </DashboardLayout>
    )
  }

  if (!module) return null

  const totalEstimation = tasks.reduce(
    (sum, task) => sum + Number(task.estimation ?? task.estimated_hours ?? 0),
    0,
  )

  const fetchTasks = async () => {
    if (!module?.id) return
    const tasksRes = await supabase
      .from('tasks')
      .select('*')
      .eq('module_id', module.id)
      .order('created_at', { ascending: false })
    setTasks(((tasksRes.data || []) as any[]).map((task) => ({
      ...task,
      assignee: null,
    })))
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTask.title.trim() || !newTask.sprint_id || !module) return
    setCreatingTask(true)
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTask.title.trim(),
          description: newTask.description.trim() || null,
          module_id: module.id,
          project_id: module.project_id,
          sprint_id: newTask.sprint_id,
          assignee_id: newTask.assignee_id || null,
          estimation: newTask.estimation ? Number(newTask.estimation) : 0,
          start_date: newTask.start_date || null,
          end_date: newTask.end_date || null,
          status: 'todo',
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to create task')
      }

      await fetchTasks()
      setShowCreateTaskModal(false)
      setNewTask({
        title: '',
        description: '',
        sprint_id: '',
        assignee_id: '',
        estimation: '',
        start_date: '',
        end_date: '',
      })
    } catch (err: any) {
      alert(`Error creating task: ${err.message}`)
    } finally {
      setCreatingTask(false)
    }
  }

  const openEditTaskModal = (task: TaskRecord) => {
    setEditingTaskId(task.id)
    setEditTask({
      title: task.title || '',
      description: (task as any).description || '',
      sprint_id: (task as any).sprint_id || '',
      assignee_id: task.assignee_id || '',
      estimation: String(task.estimation ?? task.estimated_hours ?? ''),
      start_date: task.start_date || '',
      end_date: task.end_date || '',
      status: task.status || 'todo',
    })
    setShowEditTaskModal(true)
  }

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTaskId || !editTask.title.trim()) return
    setEditingTask(true)
    try {
      const response = await fetch(`/api/tasks/${editingTaskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTask.title.trim(),
          description: editTask.description.trim() || null,
          sprint_id: editTask.sprint_id || null,
          assignee_id: editTask.assignee_id || null,
          estimation: editTask.estimation ? Number(editTask.estimation) : 0,
          start_date: editTask.start_date || null,
          end_date: editTask.end_date || null,
          status: editTask.status || 'todo',
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || 'Failed to update task')

      await fetchTasks()
      setShowEditTaskModal(false)
      setEditingTaskId(null)
    } catch (err: any) {
      alert(`Error updating task: ${err.message}`)
    } finally {
      setEditingTask(false)
    }
  }

  return (
    <DashboardLayout
      title={module.name}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowCreateTaskModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Task
          </Button>
          <Link href={projectNav ? projectHref(projectNav, projectSummaries) : '/projects'}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Project
            </Button>
          </Link>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="font-semibold">{module.status}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Tasks</p>
            <p className="font-semibold">{tasks.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Estimation</p>
            <p className="font-semibold">{totalEstimation}h</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-muted-foreground">No tasks found for this module</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2">Task</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Assignee</th>
                    <th className="text-left px-3 py-2">Estimation</th>
                    <th className="text-left px-3 py-2">Start Date</th>
                    <th className="text-left px-3 py-2">End Date</th>
                    <th className="text-right px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id} className="border-t border-border">
                      <td className="px-3 py-2">{task.title}</td>
                      <td className="px-3 py-2">{task.status}</td>
                      <td className="px-3 py-2">{task.assignee?.full_name || task.assignee?.email || 'Unassigned'}</td>
                      <td className="px-3 py-2">{Number(task.estimation ?? task.estimated_hours ?? 0)}h</td>
                      <td className="px-3 py-2">{task.start_date ? new Date(task.start_date).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2">{task.end_date ? new Date(task.end_date).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => openEditTaskModal(task)}>
                          <Pencil className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showCreateTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-lg font-semibold">Create Task</h3>
              <button onClick={() => setShowCreateTaskModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm mb-2">Task Name *</label>
                  <input
                    required
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm mb-2">Description</label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2">Sprint *</label>
                  <select
                    required
                    disabled={sprints.length === 0}
                    value={newTask.sprint_id}
                    onChange={(e) => setNewTask({ ...newTask, sprint_id: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  >
                    <option value="">{sprints.length === 0 ? 'No sprints available' : 'Select sprint'}</option>
                    {sprints.map((sprint) => (
                      <option key={sprint.id} value={sprint.id}>{sprint.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-2">Assignee</label>
                  <select
                    value={newTask.assignee_id}
                    onChange={(e) => setNewTask({ ...newTask, assignee_id: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>{member.full_name || member.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-2">Estimation</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={newTask.estimation}
                    onChange={(e) => setNewTask({ ...newTask, estimation: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2">Start Date</label>
                  <input
                    type="date"
                    value={newTask.start_date}
                    onChange={(e) => setNewTask({ ...newTask, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2">End Date</label>
                  <input
                    type="date"
                    value={newTask.end_date}
                    onChange={(e) => setNewTask({ ...newTask, end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
              </div>
              <div className="pt-4 border-t border-border flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateTaskModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creatingTask || !newTask.title.trim() || !newTask.sprint_id}>
                  {creatingTask ? 'Creating...' : 'Create Task'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showEditTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-lg font-semibold">Edit Task</h3>
              <button onClick={() => setShowEditTaskModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateTask} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm mb-2">Task Name *</label>
                  <input
                    required
                    value={editTask.title}
                    onChange={(e) => setEditTask({ ...editTask, title: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm mb-2">Description</label>
                  <textarea
                    value={editTask.description}
                    onChange={(e) => setEditTask({ ...editTask, description: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2">Sprint</label>
                  <select
                    value={editTask.sprint_id}
                    onChange={(e) => setEditTask({ ...editTask, sprint_id: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  >
                    <option value="">No sprint</option>
                    {sprints.map((sprint) => (
                      <option key={sprint.id} value={sprint.id}>{sprint.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-2">Assignee</label>
                  <select
                    value={editTask.assignee_id}
                    onChange={(e) => setEditTask({ ...editTask, assignee_id: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>{member.full_name || member.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-2">Status</label>
                  <select
                    value={editTask.status}
                    onChange={(e) => setEditTask({ ...editTask, status: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="in_review">In Review</option>
                    <option value="done">Done</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-2">Estimation</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editTask.estimation}
                    onChange={(e) => setEditTask({ ...editTask, estimation: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2">Start Date</label>
                  <input
                    type="date"
                    value={editTask.start_date}
                    onChange={(e) => setEditTask({ ...editTask, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2">End Date</label>
                  <input
                    type="date"
                    value={editTask.end_date}
                    onChange={(e) => setEditTask({ ...editTask, end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
              </div>
              <div className="pt-4 border-t border-border flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowEditTaskModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editingTask || !editTask.title.trim()}>
                  {editingTask ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
