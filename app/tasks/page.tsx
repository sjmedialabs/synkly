'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Plus, X } from 'lucide-react'

type Task = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  task_type: string
  assignee_id: string | null
  project_id: string | null
  module_id: string | null
  due_date: string | null
  created_at: string
  assignee?: {
    full_name: string | null
    email: string
  } | null
  projects?: {
    name: string
  } | null
  modules?: {
    name: string
  } | null
}

type Project = {
  id: string
  name: string
}

type TeamMember = {
  id: string
  full_name: string | null
  email: string
}

export default function TasksPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [filterPriority, setFilterPriority] = useState<string | null>(null)
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedTaskForAssign, setSelectedTaskForAssign] = useState<Task | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  // Team Lead can assign tasks to developers
  const canAssignTask = userRole && ['super_admin', 'project_manager', 'team_lead'].includes(userRole)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }
      setUser(user)

      // Fetch user's role
      const { data: userData } = await supabase
        .from('users')
        .select('role:roles(name)')
        .eq('id', user.id)
        .single()

      if (userData?.role?.name) {
        setUserRole(userData.role.name)
      }

      // Fetch all tasks with relations
      const { data: tasksData } = await supabase
        .from('tasks')
        .select(`
          *,
          assignee:users!tasks_assignee_id_fkey (full_name, email),
          modules (name),
          projects (name)
        `)
        .order('created_at', { ascending: false })

      setTasks((tasksData as Task[]) || [])

      // Fetch team members for assignee dropdown
      const { data: usersData } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('is_active', true)
        .order('full_name')

      setTeamMembers(usersData || [])
      setLoading(false)
    }

    init()
  }, [router, supabase])

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId)

      if (error) throw error

      setTasks(tasks.map(task => 
        task.id === taskId ? { ...task, status: newStatus } : task
      ))
    } catch (error: any) {
      console.error('Error updating task:', error)
      alert('Error updating task: ' + error.message)
    }
  }

  const filteredTasks = tasks.filter(task => {
    if (filterStatus && task.status !== filterStatus) return false
    if (filterPriority && task.priority !== filterPriority) return false
    if (filterAssignee && task.assignee_id !== filterAssignee) return false
    return true
  })

  const groupedByStatus = {
    todo: filteredTasks.filter(t => t.status === 'todo'),
    in_progress: filteredTasks.filter(t => t.status === 'in_progress'),
    in_review: filteredTasks.filter(t => t.status === 'in_review'),
    done: filteredTasks.filter(t => t.status === 'done'),
  }

  const statusConfig = {
    todo: { label: 'To Do', color: 'bg-muted text-muted-foreground', headerColor: 'border-muted-foreground' },
    in_progress: { label: 'In Progress', color: 'bg-primary/10 text-primary', headerColor: 'border-primary' },
    in_review: { label: 'In Review', color: 'bg-accent/10 text-accent', headerColor: 'border-accent' },
    done: { label: 'Done', color: 'bg-green-500/10 text-green-600', headerColor: 'border-green-500' },
  }

  const priorityColors: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-destructive',
    medium: 'bg-accent',
    low: 'bg-green-500',
  }

  const taskTypeIcons: Record<string, string> = {
    task: 'T',
    bug: 'B',
    feature: 'F',
    improvement: 'I',
    epic: 'E',
    story: 'S',
  }

  if (loading) {
    return (
      <DashboardLayout title="Tasks">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-muted rounded w-40"></div>
          <div className="flex gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-80 h-96 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout 
      title="Tasks"
      actions={
        <div className="flex items-center gap-3">
          <select
            value={filterStatus || ''}
            onChange={(e) => setFilterStatus(e.target.value || null)}
            className="px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm"
          >
            <option value="">All Statuses</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="done">Done</option>
          </select>
          <select
            value={filterPriority || ''}
            onChange={(e) => setFilterPriority(e.target.value || null)}
            className="px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm"
          >
            <option value="">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <select
            value={filterAssignee || ''}
            onChange={(e) => setFilterAssignee(e.target.value || null)}
            className="px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm"
          >
            <option value="">All Assignees</option>
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name || member.email}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Object.entries(groupedByStatus).map(([status, statusTasks]) => (
          <div 
            key={status} 
            className={`flex flex-col w-80 min-w-80 bg-muted/30 rounded-lg border-t-4 ${statusConfig[status as keyof typeof statusConfig]?.headerColor}`}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                {statusConfig[status as keyof typeof statusConfig]?.label}
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                  {statusTasks.length}
                </span>
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-[calc(100vh-300px)]">
              {statusTasks.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-xs text-muted-foreground">No tasks</p>
                </div>
              ) : (
                statusTasks.map((task) => (
                  <div
                    key={task.id}
                    className="bg-card border border-border rounded-lg p-3 hover:shadow-md transition cursor-pointer group"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <span className={`w-5 h-5 rounded text-xs font-bold flex items-center justify-center text-white ${
                        task.task_type === 'bug' ? 'bg-destructive' :
                        task.task_type === 'feature' ? 'bg-green-500' :
                        task.task_type === 'epic' ? 'bg-purple-500' :
                        'bg-primary'
                      }`}>
                        {taskTypeIcons[task.task_type] || 'T'}
                      </span>
                      <h4 className="font-medium text-sm text-foreground flex-1 line-clamp-2">{task.title}</h4>
                    </div>
                    
                    {task.projects?.name && (
                      <p className="text-xs text-primary mb-1">{task.projects.name}</p>
                    )}

                    {task.modules?.name && (
                      <p className="text-xs text-accent mb-2">{task.modules.name}</p>
                    )}

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${priorityColors[task.priority]}`}></span>
                        <span className="text-muted-foreground capitalize">{task.priority}</span>
                      </div>
                      {task.assignee && (
                        <div className="flex items-center gap-1">
                          <div className="w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center">
                            <span className="text-primary text-xs font-medium">
                              {(task.assignee.full_name || task.assignee.email)?.[0]?.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {task.due_date && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Due: {new Date(task.due_date).toLocaleDateString()}
                      </div>
                    )}

                    {/* Quick actions - appears on hover */}
                    <div className="mt-2 pt-2 border-t border-border opacity-0 group-hover:opacity-100 transition flex gap-2">
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.id, e.target.value)}
                        className="flex-1 text-xs px-2 py-1 border border-input rounded bg-background text-foreground"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="todo">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="in_review">In Review</option>
                        <option value="done">Done</option>
                      </select>
                      {canAssignTask && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedTaskForAssign(task)
                            setShowAssignModal(true)
                          }}
                          className="px-2 py-1 text-xs bg-primary text-white rounded hover:bg-primary/90"
                        >
                          Assign
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

{/* Assign Task Modal */}
      {showAssignModal && selectedTaskForAssign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Assign Task</h3>
              <button onClick={() => setShowAssignModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Task</p>
                <p className="font-medium text-foreground">{selectedTaskForAssign.title}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Assign To
                </label>
                <select
                  value={selectedTaskForAssign.assignee_id || ''}
                  onChange={async (e) => {
                    const newAssigneeId = e.target.value || null
                    try {
                      const { error } = await supabase
                        .from('tasks')
                        .update({ assignee_id: newAssigneeId })
                        .eq('id', selectedTaskForAssign.id)

                      if (error) throw error

                      // Update local state
                      const assignee = teamMembers.find(m => m.id === newAssigneeId)
                      setTasks(tasks.map(task => 
                        task.id === selectedTaskForAssign.id 
                          ? { ...task, assignee_id: newAssigneeId, assignee: assignee ? { full_name: assignee.full_name, email: assignee.email } : null } 
                          : task
                      ))
                      setShowAssignModal(false)
                      setSelectedTaskForAssign(null)
                    } catch (error: any) {
                      console.error('Error assigning task:', error)
                      alert('Error assigning task: ' + error.message)
                    }
                  }}
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
              <div className="flex items-center gap-4 pt-4 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAssignModal(false)
                    setSelectedTaskForAssign(null)
                  }}
                  className="flex-1"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
