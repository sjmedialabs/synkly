'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  Building2, 
  Users, 
  FolderKanban, 
  CheckSquare,
  Plus,
  ArrowRight,
  Shield,
  TrendingUp,
  Activity,
} from 'lucide-react'

interface PlatformStats {
  totalClients: number
  activeClients: number
  totalUsers: number
  totalProjects: number
  totalTasks: number
  completedTasks: number
}

interface Client {
  id: string
  name: string
  company: string | null
  is_active: boolean
  created_at: string
  _count?: {
    users: number
    projects: number
  }
}

export default function AdminDashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const [stats, setStats] = useState<PlatformStats>({
    totalClients: 0,
    activeClients: 0,
    totalUsers: 0,
    totalProjects: 0,
    totalTasks: 0,
    completedTasks: 0,
  })
  const [recentClients, setRecentClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Verify user is master admin
      const { data: userData } = await supabase
        .from('team')
        .select('full_name, role')
        .eq('id', user.id)
        .single()

      const roleName = userData?.role
      if (roleName !== 'master_admin') {
        router.push('/dashboard')
        return
      }

      setUserName(userData?.full_name || 'Admin')

      // Fetch platform stats
      const [clientsRes, usersRes, projectsRes, tasksRes] = await Promise.all([
        supabase.from('clients').select('id, is_active'),
        supabase.from('team').select('id').eq('status', 'active'),
        supabase.from('projects').select('id'),
        supabase.from('tasks').select('id, status'),
      ])

      const clients = clientsRes.data || []
      const tasks = tasksRes.data || []

      setStats({
        totalClients: clients.length,
        activeClients: clients.filter(c => c.is_active).length,
        totalUsers: usersRes.data?.length || 0,
        totalProjects: projectsRes.data?.length || 0,
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.status === 'done').length,
      })

      // Fetch recent clients with counts
      const { data: recentClientsData } = await supabase
        .from('clients')
        .select('id, name, company, is_active, created_at')
        .order('created_at', { ascending: false })
        .limit(5)

      if (recentClientsData) {
        // Get user and project counts per client
        const clientsWithCounts = await Promise.all(
          recentClientsData.map(async (client) => {
            const [usersCount, projectsCount] = await Promise.all([
              supabase.from('team').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
              supabase.from('projects').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
            ])
            return {
              ...client,
              _count: {
                users: usersCount.count || 0,
                projects: projectsCount.count || 0,
              },
            }
          })
        )
        setRecentClients(clientsWithCounts)
      }

      setLoading(false)
    }

    fetchData()
  }, [router, supabase])

  if (loading) {
    return (
      <DashboardLayout title="Admin Dashboard">
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

  const completionRate = stats.totalTasks > 0 
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100) 
    : 0

  return (
    <DashboardLayout 
      title="Admin Dashboard"
      actions={
        <Link href="/admin/clients/new">
          <Button className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" />
            Add Client
          </Button>
        </Link>
      }
    >
      {/* Welcome Section */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-rose-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-foreground">
              Welcome, {userName}
            </h3>
            <p className="text-muted-foreground">
              Master Admin - Platform Controls
            </p>
          </div>
        </div>
      </div>

      {/* Platform Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Clients</p>
                <p className="text-3xl font-bold text-foreground">{stats.totalClients}</p>
                <p className="text-xs text-emerald-600 mt-1">{stats.activeClients} active</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-3xl font-bold text-foreground">{stats.totalUsers}</p>
                <p className="text-xs text-muted-foreground mt-1">Across all clients</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-violet-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Projects</p>
                <p className="text-3xl font-bold text-foreground">{stats.totalProjects}</p>
                <p className="text-xs text-muted-foreground mt-1">Platform-wide</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <FolderKanban className="w-6 h-6 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Task Completion</p>
                <p className="text-3xl font-bold text-foreground">{completionRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">{stats.completedTasks}/{stats.totalTasks} done</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Clients */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Clients</CardTitle>
            <Link href="/admin/clients">
              <Button variant="ghost" size="sm">
                View All
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentClients.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">No clients yet</p>
                <Link href="/admin/clients/new">
                  <Button className="bg-primary hover:bg-primary/90">
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Client
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {recentClients.map((client) => (
                  <Link key={client.id} href={`/admin/clients/${client.id}`}>
                    <div className="p-4 border border-border rounded-lg hover:shadow-md transition-shadow cursor-pointer flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                          <h5 className="font-semibold text-foreground">{client.name}</h5>
                          <p className="text-sm text-muted-foreground">
                            {client.company || 'No company'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          <span>{client._count?.users || 0}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <FolderKanban className="w-4 h-4" />
                          <span>{client._count?.projects || 0}</span>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          client.is_active 
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' 
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {client.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/admin/clients/new" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Building2 className="w-4 h-4 mr-2" />
                  Add New Client
                </Button>
              </Link>
              <Link href="/settings/master-data" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Activity className="w-4 h-4 mr-2" />
                  Manage Master Data
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
