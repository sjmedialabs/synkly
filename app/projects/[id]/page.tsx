'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
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
  MoreVertical
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
}

interface Task {
  id: string
  title: string
  status: string
  priority: string
  assignee: { full_name: string; email: string } | null
}

interface Milestone {
  id: string
  name: string
  status: string
  end_date: string | null
}

interface TeamMember {
  id: string
  user: { id: string; full_name: string; email: string; role: { name: string } | null } | null
}

const statusColors: Record<string, string> = {
  planning: 'bg-muted text-muted-foreground',
  active: 'bg-primary/10 text-primary',
  on_hold: 'bg-accent/10 text-accent',
  completed: 'bg-green-500/10 text-green-600',
  cancelled: 'bg-destructive/10 text-destructive',
}

const taskStatusColors: Record<string, string> = {
  todo: 'bg-muted',
  in_progress: 'bg-primary',
  review: 'bg-accent',
  done: 'bg-green-500',
}

export default function ProjectDetailPage() {
  const params = useParams()
  const projectId = params.id as string
  
  const [project, setProject] = useState<Project | null>(null)
  const [modules, setModules] = useState<Module[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModuleModal, setShowAddModuleModal] = useState(false)
  const [newModuleName, setNewModuleName] = useState('')
  const [creatingModule, setCreatingModule] = useState(false)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Fetch project details
      const { data: projectData, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (error || !projectData) {
        router.push('/projects')
        return
      }

      setProject(projectData)

      // Fetch related data
      const [modulesRes, tasksRes, milestonesRes, teamRes] = await Promise.all([
        supabase
          .from('modules')
          .select('id, name, description, estimated_hours, status')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('tasks')
          .select(`
            id,
            title,
            status,
            priority,
            assignee:users!tasks_assignee_id_fkey(full_name, email)
          `)
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('milestones')
          .select('id, name, status, end_date')
          .eq('project_id', projectId)
          .order('end_date'),
        supabase
          .from('project_users')
          .select(`
            id,
            user:users(id, full_name, email, role:roles(name))
          `)
          .eq('project_id', projectId),
      ])

      setModules(modulesRes.data || [])
      setTasks(tasksRes.data || [])
      setMilestones(milestonesRes.data || [])
      setTeamMembers(teamRes.data || [])
      setLoading(false)
    }

    fetchData()
  }, [projectId, router, supabase])

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

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newModuleName.trim() || !projectId) return

    setCreatingModule(true)
    try {
      const { data, error } = await supabase
        .from('modules')
        .insert([{
          project_id: projectId,
          name: newModuleName.trim(),
          created_at: new Date().toISOString(),
        }])
        .select()

      if (error) throw error

      if (data) {
        setModules([...modules, data[0] as Module])
        setNewModuleName('')
        setShowAddModuleModal(false)
      }
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Modules */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Modules</CardTitle>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                onClick={() => setShowAddModuleModal(true)}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Module
              </Button>
              <Link href={`/modules?project=${projectId}`}>
                <Button size="sm" variant="outline">View All</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {modules.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No modules yet. Create one to organize your project.
              </p>
            ) : (
              <div className="space-y-3">
                {modules.map((module) => (
                  <Link key={module.id} href={`/modules/${module.id}`}>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          module.status === 'completed' ? 'bg-green-500' :
                          module.status === 'in_progress' ? 'bg-primary' :
                          'bg-muted-foreground'
                        }`} />
                        <div>
                          <p className="font-medium text-foreground">{module.name}</p>
                          {module.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{module.description}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                        {module.estimated_hours}h
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team & Milestones */}
        <div className="space-y-6">
          {/* Team */}
          <Card>
            <CardHeader>
              <CardTitle>Team</CardTitle>
            </CardHeader>
            <CardContent>
              {teamMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No team members assigned.</p>
              ) : (
                <div className="space-y-3">
                  {teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {(member.user?.full_name || member.user?.email || 'U')[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {member.user?.full_name || member.user?.email?.split('@')[0]}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {member.user?.role?.name?.replace('_', ' ') || 'Member'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Milestones */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Milestones</CardTitle>
              <Link href="/milestones">
                <Button size="sm" variant="ghost">
                  <Plus className="w-4 h-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {milestones.length === 0 ? (
                <p className="text-sm text-muted-foreground">No milestones yet.</p>
              ) : (
                <div className="space-y-3">
                  {milestones.map((milestone) => (
                    <div key={milestone.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          milestone.status === 'completed' ? 'bg-green-500' :
                          milestone.status === 'in_progress' ? 'bg-primary' :
                          'bg-muted-foreground'
                        }`} />
                        <span className="text-sm text-foreground">{milestone.name}</span>
                      </div>
                      {milestone.end_date && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(milestone.end_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
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
