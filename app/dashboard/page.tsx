'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  FolderKanban, 
  CheckSquare, 
  Users, 
  Target, 
  Plus,
  ArrowRight,
  Clock,
  AlertCircle
} from 'lucide-react'
import { ROLE_LABELS, resolveRole, type RoleKey } from '@/lib/rbac'

interface Stats {
  projects: number
  activeProjects: number
  tasks: number
  pendingTasks: number
  teamMembers: number
  milestones: number
}

interface Project {
  id: string
  name: string
  status: string
  description: string | null
}

interface Task {
  id: string
  title: string
  status: string
  priority: string
  project: { name: string } | null
  due_date: string | null
}

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState<RoleKey | null>(null)
  const [stats, setStats] = useState<Stats>({
    projects: 0,
    activeProjects: 0,
    tasks: 0,
    pendingTasks: 0,
    teamMembers: 0,
    milestones: 0,
  })
  const [recentProjects, setRecentProjects] = useState<Project[]>([])
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Fetch user details with role
      const byIdRes = await supabase
        .from('users')
        .select('full_name, email, role')
        .eq('id', user.id)
        .maybeSingle()
      let userData: any = byIdRes.data
      if (!userData) {
        const byEmailRes = await supabase
          .from('users')
          .select('full_name, email, role')
          .eq('email', (user.email || '').toLowerCase())
          .maybeSingle()
        userData = byEmailRes.data
      }

      setUserName(userData?.full_name || userData?.email?.split('@')[0] || 'User')
      setUserRole(resolveRole(userData))

      // Fetch stats
      const [projectsRes, tasksRes, usersRes, milestonesRes] = await Promise.all([
        supabase.from('projects').select('status'),
        supabase.from('tasks').select('status'),
        supabase.from('users').select('id'),
        supabase.from('milestones').select('id'),
      ])

      const projects = projectsRes.data || []
      const tasks = tasksRes.data || []

      setStats({
        projects: projects.length,
        activeProjects: projects.filter(p => p.status === 'active').length,
        tasks: tasks.length,
        pendingTasks: tasks.filter(t => t.status === 'todo' || t.status === 'in_progress').length,
        teamMembers: usersRes.data?.length || 0,
        milestones: milestonesRes.data?.length || 0,
      })

      // Fetch recent projects
      const { data: recentProjectsData } = await supabase
        .from('projects')
        .select('id, name, status, description')
        .order('created_at', { ascending: false })
        .limit(4)

      setRecentProjects(recentProjectsData || [])

      // Fetch my tasks
      const { data: myTasksData } = await supabase
        .from('tasks')
        .select(`
          id,
          title,
          status,
          priority,
          due_date,
          project:projects(name)
        `)
        .eq('assignee_id', user.id)
        .in('status', ['todo', 'in_progress'])
        .order('due_date')
        .limit(5)

      setMyTasks(myTasksData || [])
      setLoading(false)
    }

    fetchData()
  }, [router, supabase])

  if (loading) {
    return (
      <DashboardLayout title="Dashboard">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-muted rounded w-64"></div>
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="Dashboard">
      {/* Welcome Section */}
      <div className="mb-8">
        <h3 className="text-2xl font-bold text-foreground mb-1">
          Welcome back, {userName}!
        </h3>
        <p className="text-muted-foreground">
          {(userRole ? ROLE_LABELS[userRole] : 'User')} Dashboard - Here&apos;s what&apos;s happening today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Projects</p>
                <p className="text-3xl font-bold text-foreground">{stats.projects}</p>
                <p className="text-xs text-primary mt-1">{stats.activeProjects} active</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <FolderKanban className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Tasks</p>
                <p className="text-3xl font-bold text-foreground">{stats.tasks}</p>
                <p className="text-xs text-accent mt-1">{stats.pendingTasks} pending</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckSquare className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Team Members</p>
                <p className="text-3xl font-bold text-foreground">{stats.teamMembers}</p>
                <p className="text-xs text-muted-foreground mt-1">Active users</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-accent" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Milestones</p>
                <p className="text-3xl font-bold text-foreground">{stats.milestones}</p>
                <p className="text-xs text-muted-foreground mt-1">Tracked</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
                <Target className="w-6 h-6 text-cyan-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Projects */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Projects</CardTitle>
            <Link href="/projects">
              <Button variant="ghost" size="sm">
                View All
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentProjects.length === 0 ? (
              <div className="text-center py-8">
                <FolderKanban className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">No projects yet</p>
                <Link href="/projects/new">
                  <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Project
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {recentProjects.map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <div className="p-4 border border-border rounded-lg hover:shadow-md transition-shadow cursor-pointer">
                      <h5 className="font-semibold text-foreground mb-1">{project.name}</h5>
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-1">
                        {project.description || 'No description'}
                      </p>
                      <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${
                        project.status === 'active' ? 'bg-primary/10 text-primary' :
                        project.status === 'completed' ? 'bg-green-500/10 text-green-600' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {project.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My Tasks</CardTitle>
            <Link href="/tasks">
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {myTasks.length === 0 ? (
              <div className="text-center py-8">
                <CheckSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No pending tasks</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myTasks.map((task) => (
                  <div 
                    key={task.id}
                    className="p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-start justify-between mb-1">
                      <p className="font-medium text-foreground text-sm">{task.title}</p>
                      {task.priority === 'high' && (
                        <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {task.project?.name || 'No project'}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-2 py-0.5 rounded capitalize ${
                        task.status === 'in_progress' ? 'bg-primary/10 text-primary' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {task.status.replace('_', ' ')}
                      </span>
                      {task.due_date && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(task.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
