'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Plus, X } from 'lucide-react'

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
  const projectId = params.id as string
  const moduleId = params.moduleId as string

  const [loading, setLoading] = useState(true)
  const [module, setModule] = useState<ModuleRecord | null>(null)
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [sprints, setSprints] = useState<{ id: string; name: string }[]>([])
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    sprint_id: '',
    assignee_id: '',
    estimation: '',
    start_date: '',
    end_date: '',
  })

  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        router.push('/auth/login')
        return
      }

      console.log('Module ID:', moduleId)

      const moduleRes = await supabase
        .from('modules')
        .select('id, project_id, name, description, status, estimated_hours, is_active')
        .eq('id', moduleId)
        .single()

      // Fallback for environments without is_active
      let moduleData = moduleRes.data as ModuleRecord | null
      if (moduleRes.error) {
        const legacy = await supabase
          .from('modules')
          .select('id, project_id, name, description, status, estimated_hours')
          .eq('id', moduleId)
          .single()
        moduleData = legacy.data ? ({ ...legacy.data, is_active: true } as ModuleRecord) : null
      }

      if (!moduleData) {
        router.push(`/projects/${projectId}`)
        return
      }

      const tasksRes = await supabase
        .from('tasks')
        .select(`
          id,
          title,
          status,
          assignee_id,
          estimation,
          estimated_hours,
          start_date,
          end_date,
          assignee:users!tasks_assignee_id_fkey(full_name, email)
        `)
        .eq('module_id', moduleId)
        .order('created_at', { ascending: false })

      console.log('Modules API response:', moduleData)
      console.log('Tasks API response:', tasksRes.data)

      const [sprintsRes, usersRes] = await Promise.all([
        fetch(`/api/sprints?project_id=${moduleData.project_id}`),
        supabase
          .from('users')
          .select('id, full_name, email')
          .eq('is_active', true)
          .order('full_name', { ascending: true }),
      ])

      setModule(moduleData)
      setTasks((tasksRes.data as TaskRecord[]) || [])
      const sprintJson = sprintsRes.ok ? await sprintsRes.json() : { sprints: [] }
      console.log('Project ID:', moduleData.project_id)
      console.log('Sprints:', sprintJson.sprints || [])
      setSprints((sprintJson.sprints || []).map((s: any) => ({ id: s.id, name: s.name })))
      setTeamMembers(usersRes.data || [])
      setLoading(false)
    }

    load()
  }, [moduleId, projectId, router, supabase])

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
    const tasksRes = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        status,
        assignee_id,
        estimation,
        estimated_hours,
        start_date,
        end_date,
        assignee:users!tasks_assignee_id_fkey(full_name, email)
      `)
      .eq('module_id', moduleId)
      .order('created_at', { ascending: false })
    setTasks((tasksRes.data as TaskRecord[]) || [])
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTask.title.trim() || !newTask.sprint_id || !module) return
    setCreatingTask(true)
    try {
      const payload: Record<string, unknown> = {
        title: newTask.title.trim(),
        description: newTask.description.trim() || null,
        module_id: moduleId,
        project_id: module.project_id,
        sprint_id: newTask.sprint_id,
        assignee_id: newTask.assignee_id || null,
        estimation: newTask.estimation ? Number(newTask.estimation) : 0,
        start_date: newTask.start_date || null,
        end_date: newTask.end_date || null,
        status: 'todo',
      }

      const { error } = await supabase.from('tasks').insert(payload)
      if (error) throw error

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

  return (
    <DashboardLayout
      title={module.name}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowCreateTaskModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Task
          </Button>
          <Link href={`/projects/${projectId}`}>
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
    </DashboardLayout>
  )
}
