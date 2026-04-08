'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, FolderKanban, CheckSquare, Clock, TrendingUp, AlertCircle } from 'lucide-react'
import { projectHref } from '@/lib/slug'

type TeamMember = {
  id: string
  full_name: string
  email: string
  designation: string | null
  is_active: boolean
}

type Project = {
  id: string
  name: string
  status: string
  priority: string
  modules: { id: string; name: string; estimated_hours: number }[]
}

type Task = {
  id: string
  title: string
  status: string
  priority: string
  assignee_id: string
  estimated_hours: number | null
  module: { name: string } | null
  project: { name: string } | null
}

type CapacityInfo = {
  employee_id: string
  available_hours: number
  allocated_hours: number
  remaining_hours: number
}

export default function MyTeamPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [capacityMap, setCapacityMap] = useState<Record<string, CapacityInfo>>({})

  const currentMonth = (() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })()

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        router.push('/login')
        return
      }
      setUser(authUser)

      // Get current user's role and info
      const { data: userData } = await supabase
        .from('team')
        .select('id, roles(name)')
        .eq('id', authUser.id)
        .single()

      const role = (userData?.roles as any)?.name
      setUserRole(role)

      // Only team leads and above can access this page
      if (!role || !['super_admin', 'project_manager', 'delivery_manager', 'team_lead'].includes(role)) {
        router.push('/dashboard')
        return
      }

      // Fetch team members reporting to this user
      const { data: membersData } = await supabase
        .from('team')
        .select('id, full_name, email, designation, is_active')
        .eq('reporting_manager_id', authUser.id)
        .eq('is_active', true)
        .order('full_name')

      setTeamMembers(membersData || [])

      // Fetch projects where user is team lead
      const { data: projectsData } = await supabase
        .from('projects')
        .select(`
          id,
          name,
          status,
          priority,
          modules(id, name, estimated_hours)
        `)
        .eq('team_lead_id', authUser.id)
        .order('created_at', { ascending: false })

      setProjects(projectsData || [])

      // Get all project IDs
      const projectIds = (projectsData || []).map(p => p.id)

      // Fetch tasks for these projects
      if (projectIds.length > 0) {
        const { data: tasksData } = await supabase
          .from('tasks')
          .select(`
            id,
            title,
            status,
            priority,
            assignee_id,
            estimated_hours,
            module:modules(name),
            project:projects(name)
          `)
          .in('project_id', projectIds)
          .order('created_at', { ascending: false })

        setTasks(tasksData || [])
      }

      // Fetch capacity for team members
      const memberIds = (membersData || []).map(m => m.id)
      if (memberIds.length > 0) {
        const { data: capacityData } = await supabase
          .from('employee_capacity')
          .select('employee_id, available_hours, allocated_hours, remaining_hours')
          .in('employee_id', memberIds)
          .eq('month', currentMonth)

        const capMap: Record<string, CapacityInfo> = {}
        ;(capacityData || []).forEach(c => {
          capMap[c.employee_id] = c
        })
        setCapacityMap(capMap)
      }

      setLoading(false)
    }

    fetchData()
  }, [router, supabase, currentMonth])

  // Calculate stats
  const taskStats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    inProgress: tasks.filter(t => t.status === 'in_progress' || t.status === 'inprogress').length,
    done: tasks.filter(t => t.status === 'done').length,
  }

  const totalProjectEstimation = projects.reduce((sum, p) => 
    sum + (p.modules || []).reduce((mSum, m) => mSum + (m.estimated_hours || 0), 0)
  , 0)

  const teamCapacity = Object.values(capacityMap)
  const totalAvailable = teamCapacity.reduce((sum, c) => sum + c.available_hours, 0)
  const totalAllocated = teamCapacity.reduce((sum, c) => sum + c.allocated_hours, 0)

  if (loading) {
    return (
      <DashboardLayout title="My Team">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout 
      title="My Team"
      subtitle="Manage your team members, projects, and capacity"
    >
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{teamMembers.length}</p>
                <p className="text-sm text-muted-foreground">Team Members</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FolderKanban className="w-8 h-8 text-accent" />
              <div>
                <p className="text-2xl font-bold text-foreground">{projects.length}</p>
                <p className="text-sm text-muted-foreground">Active Projects</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckSquare className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-foreground">{taskStats.done}/{taskStats.total}</p>
                <p className="text-sm text-muted-foreground">Tasks Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-cyan-500" />
              <div>
                <p className="text-2xl font-bold text-foreground">{totalProjectEstimation}h</p>
                <p className="text-sm text-muted-foreground">Total Estimation</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Team Members */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Team Members</CardTitle>
            <Link href="/team">
              <Button size="sm" variant="outline">View All</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {teamMembers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No team members assigned to you yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {teamMembers.map((member) => {
                  const capacity = capacityMap[member.id]
                  const utilization = capacity 
                    ? Math.round((capacity.allocated_hours / capacity.available_hours) * 100)
                    : 0

                  return (
                    <div 
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-foreground">{member.full_name || member.email}</p>
                        <p className="text-xs text-muted-foreground">{member.designation || 'No designation'}</p>
                      </div>
                      <div className="text-right">
                        {capacity ? (
                          <>
                            <p className={`text-sm font-medium ${utilization > 100 ? 'text-destructive' : 'text-foreground'}`}>
                              {utilization}% utilized
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {capacity.remaining_hours}h remaining
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">No capacity set</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Projects */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My Projects</CardTitle>
            <Link href="/projects">
              <Button size="sm" variant="outline">View All</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderKanban className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No projects assigned to you yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {projects.slice(0, 5).map((project) => {
                  const totalHours = (project.modules || []).reduce((sum, m) => sum + (m.estimated_hours || 0), 0)
                  const summaries = projects.map((p) => ({ id: p.id, name: p.name }))
                  return (
                    <Link key={project.id} href={projectHref(project, summaries)}>
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition">
                        <div>
                          <p className="font-medium text-foreground">{project.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {project.modules?.length || 0} modules
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-primary">{totalHours}h</span>
                          <span className={`px-2 py-1 text-xs rounded-full capitalize ${
                            project.status === 'active' ? 'bg-primary/10 text-primary' :
                            project.status === 'completed' ? 'bg-green-500/10 text-green-600' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {project.status?.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Capacity Overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Team Capacity</CardTitle>
            <Link href="/capacity">
              <Button size="sm" variant="outline">Manage</Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total Available</span>
                <span className="font-medium text-foreground">{totalAvailable}h</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total Allocated</span>
                <span className="font-medium text-foreground">{totalAllocated}h</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Remaining</span>
                <span className={`font-medium ${totalAvailable - totalAllocated < 0 ? 'text-destructive' : 'text-green-600'}`}>
                  {totalAvailable - totalAllocated}h
                </span>
              </div>
              <div className="pt-2">
                <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${
                      totalAllocated / totalAvailable > 1 ? 'bg-destructive' :
                      totalAllocated / totalAvailable > 0.8 ? 'bg-accent' :
                      'bg-primary'
                    }`}
                    style={{ width: `${Math.min((totalAllocated / totalAvailable) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  {totalAvailable > 0 ? Math.round((totalAllocated / totalAvailable) * 100) : 0}% utilized this month
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Tasks</CardTitle>
            <Link href="/tasks">
              <Button size="sm" variant="outline">View All</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No tasks in your projects yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.slice(0, 5).map((task) => (
                  <div 
                    key={task.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.project?.name} {task.module && `/ ${task.module.name}`}
                      </p>
                    </div>
                    <span className={`ml-2 px-2 py-1 text-xs rounded capitalize whitespace-nowrap ${
                      task.status === 'done' ? 'bg-green-500/10 text-green-600' :
                      task.status === 'in_progress' || task.status === 'inprogress' ? 'bg-primary/10 text-primary' :
                      task.status === 'in_revision' ? 'bg-accent/10 text-accent' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {task.status?.replace('_', ' ')}
                    </span>
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
