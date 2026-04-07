'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  Building2, 
  Users, 
  FolderKanban, 
  CheckSquare,
  ArrowRight,
  Mail,
  Phone,
  MapPin,
  Edit,
  UserPlus,
} from 'lucide-react'
import { type RoleKey } from '@/lib/rbac'

interface OrganizationData {
  id: string
  name: string
  email: string | null
  company: string | null
  phone: string | null
  address: string | null
  is_active: boolean
}

interface OrgStats {
  totalUsers: number
  totalProjects: number
  totalTasks: number
  completedTasks: number
}

interface TeamMember {
  id: string
  full_name: string | null
  email: string
  designation: string | null
  role_name: string | null
  status: string
}

export default function OrganizationPage() {
  const supabase = createClient()
  const router = useRouter()
  const [organization, setOrganization] = useState<OrganizationData | null>(null)
  const [stats, setStats] = useState<OrgStats>({
    totalUsers: 0,
    totalProjects: 0,
    totalTasks: 0,
    completedTasks: 0,
  })
  const [recentMembers, setRecentMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<RoleKey | null>(null)

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Get user's client_id and role
      const { data: userData } = await supabase
        .from('users')
        .select(`
          client_id,
          roles (name)
        `)
        .eq('id', user.id)
        .single()

      const roleName = (userData?.roles as any)?.name as RoleKey | null
      setUserRole(roleName)

      // Only client_admin and master_admin can access this page
      if (!['client_admin', 'master_admin'].includes(roleName || '')) {
        router.push('/dashboard')
        return
      }

      const clientId = userData?.client_id
      if (!clientId) {
        router.push('/dashboard')
        return
      }

      // Fetch organization details
      const { data: orgData } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single()

      if (orgData) {
        setOrganization(orgData)
      }

      // Fetch stats
      const [usersRes, projectsRes, tasksRes] = await Promise.all([
        supabase.from('users').select('id').eq('client_id', clientId).eq('status', 'active'),
        supabase.from('projects').select('id').eq('client_id', clientId),
        supabase.from('tasks').select('id, status, project_id'),
      ])

      // Filter tasks by projects belonging to this client
      const projectIds = (projectsRes.data || []).map(p => p.id)
      const clientTasks = (tasksRes.data || []).filter(t => projectIds.includes(t.project_id))

      setStats({
        totalUsers: usersRes.data?.length || 0,
        totalProjects: projectsRes.data?.length || 0,
        totalTasks: clientTasks.length,
        completedTasks: clientTasks.filter(t => t.status === 'done').length,
      })

      // Fetch recent team members
      const { data: membersData } = await supabase
        .from('users')
        .select(`
          id,
          full_name,
          email,
          designation,
          status,
          roles (name)
        `)
        .eq('client_id', clientId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(5)

      if (membersData) {
        setRecentMembers(membersData.map(m => ({
          ...m,
          role_name: (m.roles as any)?.name || null,
        })))
      }

      setLoading(false)
    }

    fetchData()
  }, [router, supabase])

  if (loading) {
    return (
      <DashboardLayout title="Organization">
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-muted rounded-lg"></div>
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!organization) {
    return (
      <DashboardLayout title="Organization">
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Organization not found</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    )
  }

  const completionRate = stats.totalTasks > 0 
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100) 
    : 0

  return (
    <DashboardLayout 
      title="Organization"
      actions={
        <Link href="/organization/users/new">
          <Button className="bg-primary hover:bg-primary/90">
            <UserPlus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </Link>
      }
    >
      {/* Organization Header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Building2 className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">{organization.name}</h2>
                <p className="text-muted-foreground">{organization.company || 'Organization'}</p>
                <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                  {organization.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-4 h-4" />
                      {organization.email}
                    </span>
                  )}
                  {organization.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-4 h-4" />
                      {organization.phone}
                    </span>
                  )}
                  {organization.address && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" />
                      {organization.address}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm">
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Team Members</p>
                <p className="text-3xl font-bold text-foreground">{stats.totalUsers}</p>
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
                <p className="text-sm text-muted-foreground">Projects</p>
                <p className="text-3xl font-bold text-foreground">{stats.totalProjects}</p>
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
                <p className="text-sm text-muted-foreground">Total Tasks</p>
                <p className="text-3xl font-bold text-foreground">{stats.totalTasks}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <CheckSquare className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completion</p>
                <p className="text-3xl font-bold text-foreground">{completionRate}%</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                <div className="relative w-8 h-8">
                  <svg className="w-8 h-8 transform -rotate-90">
                    <circle
                      cx="16"
                      cy="16"
                      r="12"
                      className="stroke-muted"
                      strokeWidth="4"
                      fill="none"
                    />
                    <circle
                      cx="16"
                      cy="16"
                      r="12"
                      className="stroke-amber-500"
                      strokeWidth="4"
                      fill="none"
                      strokeDasharray={`${completionRate * 0.75} 75`}
                    />
                  </svg>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Team Members */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Recent members in your organization</CardDescription>
            </div>
            <Link href="/organization/users">
              <Button variant="ghost" size="sm">
                View All
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentMembers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-4">No team members yet</p>
                <Link href="/organization/users/new">
                  <Button size="sm">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add Member
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentMembers.map((member) => (
                  <div 
                    key={member.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {(member.full_name || member.email)[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {member.full_name || member.email.split('@')[0]}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.designation || member.email}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground capitalize">
                      {member.role_name?.replace('_', ' ') || 'Member'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common organization management tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/organization/users/new" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add New User
                </Button>
              </Link>
              <Link href="/organization/users" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Users className="w-4 h-4 mr-2" />
                  Manage Users
                </Button>
              </Link>
              <Link href="/projects/new" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <FolderKanban className="w-4 h-4 mr-2" />
                  Create Project
                </Button>
              </Link>
              <Link href="/team" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Users className="w-4 h-4 mr-2" />
                  View Teams
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
