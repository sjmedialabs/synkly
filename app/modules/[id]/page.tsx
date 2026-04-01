'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Calendar, CheckSquare, Plus, MoreVertical, X } from 'lucide-react'

interface Module {
  id: string
  name: string
  description: string | null
  project_id: string
  estimated_hours: number
  status: string
  created_at: string
}

interface Project {
  id: string
  name: string
}

interface Task {
  id: string
  title: string
  status: string
  priority: string
  estimated_hours: number
  module_id: string
  start_date: string | null
  end_date: string | null
  assignee: { full_name: string; email: string } | null
}

const statusColors: Record<string, string> = {
  not_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary/10 text-primary',
  blocked: 'bg-destructive/10 text-destructive',
  completed: 'bg-green-500/10 text-green-600',
}

const taskStatusColors: Record<string, string> = {
  todo: 'bg-muted',
  in_progress: 'bg-primary',
  in_review: 'bg-accent',
  done: 'bg-green-500',
}

export default function ModuleDetailPage() {
  const params = useParams()
  const moduleId = params.id as string
  
  const [module, setModule] = useState<Module | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddTaskModal, setShowAddTaskModal] = useState(false)
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [creatingTask, setCreatingTask] = useState(false)
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    status: 'todo',
    assignee_id: '',
    start_date: '',
    end_date: '',
    estimated_hours: '',
  })
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Fetch module details
      const { data: moduleData, error } = await supabase
        .from('modules')
        .select('*')
        .eq('id', moduleId)
        .single()

      if (error || !moduleData) {
        router.push('/projects')
        return
      }

      setModule(moduleData)

      // Fetch project
      const { data: projectData } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', moduleData.project_id)
        .single()

      setProject(projectData)

      // Fetch tasks for this module
      const { data: tasksData } = await supabase
        .from('tasks')
        .select(`
          id,
          title,
          status,
          priority,
          estimated_hours,
          module_id,
          start_date,
          end_date,
          assignee:users!tasks_assignee_id_fkey(full_name, email)
        `)
        .eq('module_id', moduleId)
        .order('created_at', { ascending: false })

      setTasks(tasksData || [])
      setLoading(false)

      // Fetch team members for task assignment
      const { data: teamData } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('is_active', true)

      setTeamMembers(teamData || [])
    }

    fetchData()
  }, [moduleId, router, supabase])

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTask.title.trim() || !moduleId) return

    setCreatingTask(true)
    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert([{
          module_id: moduleId,
          project_id: module?.project_id,
          title: newTask.title.trim(),
          description: newTask.description.trim() || null,
          status: newTask.status,
          assignee_id: newTask.assignee_id || null,
          start_date: newTask.start_date || null,
          end_date: newTask.end_date || null,
          estimated_hours: newTask.estimated_hours ? parseFloat(newTask.estimated_hours) : null,
          created_at: new Date().toISOString(),
        }])
        .select(`
          id,
          title,
          status,
          priority,
          estimated_hours,
          module_id,
          start_date,
          end_date,
          assignee:users!tasks_assignee_id_fkey(full_name, email)
        `)

      if (error) throw error

      if (data) {
        setTasks([...tasks, data[0] as Task])
        setNewTask({
          title: '',
          description: '',
          status: 'todo',
          assignee_id: '',
          start_date: '',
          end_date: '',
          estimated_hours: '',
        })
        setShowAddTaskModal(false)
      }
    } catch (error: any) {
      console.error('Error creating task:', error)
      alert('Error creating task: ' + error.message)
    } finally {
      setCreatingTask(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Module Details">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48"></div>
          <div className="h-32 bg-muted rounded"></div>
          <div className="h-64 bg-muted rounded-lg"></div>
        </div>
      </DashboardLayout>
    )
  }

  if (!module) {
    return null
  }

  const taskStats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  }

  const totalTaskEstimation = tasks.reduce((sum, task) => sum + (task.estimated_hours || 0), 0)
  const completionPercentage = taskStats.total > 0 ? Math.round((taskStats.done / taskStats.total) * 100) : 0

  return (
    <DashboardLayout 
      title={module.name}
      actions={
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => setShowAddTaskModal(true)}
            className="bg-primary hover:bg-primary/90 text-white"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Task
          </Button>
          {project && (
            <Link href={`/projects/${project.id}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Project
              </Button>
            </Link>
          )}
          <Button variant="outline" size="sm">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </div>
      }
    >
      {/* Module Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${statusColors[module.status]}`}>
            {module.status.replace('_', ' ')}
          </span>
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary">
            {module.estimated_hours}h Estimated
          </span>
        </div>
        {module.description && (
          <p className="text-muted-foreground max-w-3xl">{module.description}</p>
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
              <Calendar className="w-8 h-8 text-accent" />
              <div>
                <p className="text-2xl font-bold text-foreground">{completionPercentage}%</p>
                <p className="text-sm text-muted-foreground">Completion</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckSquare className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-foreground">{totalTaskEstimation}h</p>
                <p className="text-sm text-muted-foreground">Task Estimation</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full border-4 border-primary/20 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">{completionPercentage}%</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{taskStats.done}/{taskStats.total}</p>
                <p className="text-sm text-muted-foreground">Tasks Done</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tasks List */}
      <Card>
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No tasks yet. Create one to start working on this module.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Task Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Assignee</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Start Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">End Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Estimation</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tasks.map((task) => (
                    <tr key={task.id} className="hover:bg-secondary/50 transition">
                      <td className="px-4 py-3 font-medium text-foreground">{task.title}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded capitalize ${
                          task.status === 'todo' ? 'bg-muted text-muted-foreground' :
                          task.status === 'in_progress' ? 'bg-primary/10 text-primary' :
                          task.status === 'in_revision' ? 'bg-accent/10 text-accent' :
                          'bg-green-500/10 text-green-600'
                        }`}>
                          {task.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {task.assignee?.full_name || task.assignee?.email || 'Unassigned'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {task.start_date ? new Date(task.start_date).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {task.end_date ? new Date(task.end_date).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-primary">
                        {task.estimated_hours || '—'}h
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-2">
                          <button className="text-primary hover:underline text-xs">
                            Edit
                          </button>
                          <button className="text-destructive hover:underline text-xs">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

{/* Create Task Modal */}
      {showAddTaskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-lg w-full max-w-2xl my-8">
            <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card">
              <h3 className="text-lg font-semibold text-foreground">Create Task</h3>
              <button 
                onClick={() => setShowAddTaskModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddTask} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Task Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTask.title}
                    onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="e.g., Implement user authentication"
                    autoFocus
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Description
                  </label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Task details..."
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Status
                  </label>
                  <select
                    value={newTask.status}
                    onChange={(e) => setNewTask({...newTask, status: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="todo">To Do</option>
                    <option value="inprogress">In Progress</option>
                    <option value="in_revision">In Revision</option>
                    <option value="done">Done</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Assignee
                  </label>
                  <select
                    value={newTask.assignee_id}
                    onChange={(e) => setNewTask({...newTask, assignee_id: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name || member.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={newTask.start_date}
                    onChange={(e) => setNewTask({...newTask, start_date: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={newTask.end_date}
                    onChange={(e) => setNewTask({...newTask, end_date: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Estimation (hours)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={newTask.estimated_hours}
                    onChange={(e) => setNewTask({...newTask, estimated_hours: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                    placeholder="e.g., 8"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4 border-t border-border">
                <Button
                  type="submit"
                  disabled={creatingTask || !newTask.title.trim()}
                  className="flex-1 bg-primary"
                >
                  {creatingTask ? 'Creating...' : 'Create Task'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddTaskModal(false)}
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
