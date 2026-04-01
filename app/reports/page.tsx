'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, Users, FolderKanban, CheckSquare, Target, TrendingUp } from 'lucide-react'

interface Stats {
  totalProjects: number
  activeProjects: number
  completedProjects: number
  totalTasks: number
  completedTasks: number
  pendingTasks: number
  inProgressTasks: number
  totalUsers: number
  totalMilestones: number
  completedMilestones: number
  activeSprints: number
  completedSprints: number
}

interface ProjectStats {
  name: string
  tasks: number
  completed: number
}

export default function ReportsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [projectStats, setProjectStats] = useState<ProjectStats[]>([])
  const [loading, setLoading] = useState(true)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Fetch all counts
      const [
        projectsRes,
        tasksRes,
        usersRes,
        milestonesRes,
        sprintsRes,
      ] = await Promise.all([
        supabase.from('projects').select('status'),
        supabase.from('tasks').select('status'),
        supabase.from('users').select('id'),
        supabase.from('milestones').select('status'),
        supabase.from('sprint_tracking').select('status'),
      ])

      const projects = projectsRes.data || []
      const tasks = tasksRes.data || []
      const users = usersRes.data || []
      const milestones = milestonesRes.data || []
      const sprints = sprintsRes.data || []

      setStats({
        totalProjects: projects.length,
        activeProjects: projects.filter(p => p.status === 'active').length,
        completedProjects: projects.filter(p => p.status === 'completed').length,
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.status === 'done').length,
        pendingTasks: tasks.filter(t => t.status === 'todo').length,
        inProgressTasks: tasks.filter(t => t.status === 'in_progress').length,
        totalUsers: users.length,
        totalMilestones: milestones.length,
        completedMilestones: milestones.filter(m => m.status === 'completed').length,
        activeSprints: sprints.filter(s => s.status === 'active').length,
        completedSprints: sprints.filter(s => s.status === 'completed').length,
      })

      // Fetch project-level stats
      const { data: projectsWithTasks } = await supabase
        .from('projects')
        .select(`
          name,
          tasks(status)
        `)
        .limit(10)

      if (projectsWithTasks) {
        setProjectStats(projectsWithTasks.map(p => ({
          name: p.name,
          tasks: p.tasks?.length || 0,
          completed: p.tasks?.filter((t: any) => t.status === 'done').length || 0,
        })))
      }

      setLoading(false)
    }

    fetchData()
  }, [router, supabase])

  if (loading || !stats) {
    return (
      <DashboardLayout title="Reports">
        <div className="animate-pulse space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const taskCompletionRate = stats.totalTasks > 0 
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100) 
    : 0

  const milestoneCompletionRate = stats.totalMilestones > 0
    ? Math.round((stats.completedMilestones / stats.totalMilestones) * 100)
    : 0

  return (
    <DashboardLayout title="Reports & Analytics">
      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Projects</p>
                <p className="text-3xl font-bold text-foreground">{stats.totalProjects}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.activeProjects} active, {stats.completedProjects} completed
                </p>
              </div>
              <FolderKanban className="w-10 h-10 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Tasks</p>
                <p className="text-3xl font-bold text-foreground">{stats.totalTasks}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.completedTasks} completed
                </p>
              </div>
              <CheckSquare className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Team Members</p>
                <p className="text-3xl font-bold text-foreground">{stats.totalUsers}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Active users
                </p>
              </div>
              <Users className="w-10 h-10 text-accent" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Milestones</p>
                <p className="text-3xl font-bold text-foreground">{stats.totalMilestones}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.completedMilestones} completed
                </p>
              </div>
              <Target className="w-10 h-10 text-cyan-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Cards */}
      <div className="grid gap-6 md:grid-cols-2 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Task Completion Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Progress</span>
                  <span className="text-sm font-medium">{taskCompletionRate}%</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all"
                    style={{ width: `${taskCompletionRate}%` }}
                  />
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-foreground">{stats.completedTasks}</p>
                <p className="text-xs text-muted-foreground">of {stats.totalTasks} tasks</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-lg font-semibold text-foreground">{stats.pendingTasks}</p>
                <p className="text-xs text-muted-foreground">To Do</p>
              </div>
              <div className="text-center p-3 bg-primary/10 rounded-lg">
                <p className="text-lg font-semibold text-primary">{stats.inProgressTasks}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
              <div className="text-center p-3 bg-green-500/10 rounded-lg">
                <p className="text-lg font-semibold text-green-600">{stats.completedTasks}</p>
                <p className="text-xs text-muted-foreground">Done</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-cyan-500" />
              Milestone Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Completion</span>
                  <span className="text-sm font-medium">{milestoneCompletionRate}%</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-cyan-500 transition-all"
                    style={{ width: `${milestoneCompletionRate}%` }}
                  />
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-foreground">{stats.completedMilestones}</p>
                <p className="text-xs text-muted-foreground">of {stats.totalMilestones} milestones</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="text-center p-3 bg-primary/10 rounded-lg">
                <p className="text-lg font-semibold text-primary">{stats.activeSprints}</p>
                <p className="text-xs text-muted-foreground">Active Sprints</p>
              </div>
              <div className="text-center p-3 bg-green-500/10 rounded-lg">
                <p className="text-lg font-semibold text-green-600">{stats.completedSprints}</p>
                <p className="text-xs text-muted-foreground">Completed Sprints</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Project Task Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {projectStats.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No projects with tasks yet.
            </p>
          ) : (
            <div className="space-y-4">
              {projectStats.map((project, index) => {
                const completionRate = project.tasks > 0 
                  ? Math.round((project.completed / project.tasks) * 100)
                  : 0
                return (
                  <div key={index}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{project.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {project.completed}/{project.tasks} tasks ({completionRate}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all"
                        style={{ width: `${completionRate}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  )
}
