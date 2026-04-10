'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Users, 
  UserPlus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  Mail,
  Shield,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ROLE_LABELS, type RoleKey } from '@/lib/rbac'

interface User {
  id: string
  email: string
  full_name: string | null
  designation: string | null
  department: string | null
  phone: string | null
  status: string
  created_at: string
  role_name: RoleKey | null
}

const roleColors: Record<string, string> = {
  client_admin: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  manager: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  team_lead: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  member: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
}

export default function OrganizationUsersPage() {
  const supabase = createClient()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [clientId, setClientId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Get user's client_id and role
      const { data: userData } = await supabase
        .from('team')
        .select(`
          client_id,
          roles (name)
        `)
        .eq('id', user.id)
        .single()

      const roleName = (userData?.roles as any)?.name as RoleKey | null

      // Only client_admin and master_admin can access this page
      if (!['client_admin', 'master_admin'].includes(roleName || '')) {
        router.push('/dashboard')
        return
      }

      const cId = userData?.client_id
      if (!cId) {
        router.push('/dashboard')
        return
      }
      setClientId(cId)

      // Fetch users for this client
      const { data: usersData } = await supabase
        .from('team')
        .select(`
          id,
          email,
          full_name,
          designation,
          department,
          phone,
          status,
          created_at,
          roles (name)
        `)
        .eq('client_id', cId)
        .neq('roles.name', 'master_admin')
        .order('full_name', { ascending: true })

      if (usersData) {
        const sanitized = usersData
          .filter((u: any) => ((u.roles as any)?.name as string | undefined) !== 'master_admin')
        setUsers(sanitized.map(u => ({
          ...u,
          role_name: (u.roles as any)?.name as RoleKey | null,
        })))
      }

      setLoading(false)
    }

    fetchData()
  }, [router, supabase])

  const filteredUsers = users.filter(user =>
    (user.full_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.designation?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  )

  const activeUsers = users.filter(u => u.status === 'active')
  const adminCount = users.filter(u => u.role_name === 'client_admin').length

  if (loading) {
    return (
      <DashboardLayout title="Users">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-muted rounded w-64"></div>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout 
      title="Users"
      actions={
        <Link href="/organization/users/new">
          <Button className="bg-primary hover:bg-primary/90">
            <UserPlus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </Link>
      }
    >
      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold">{users.length}</p>
              </div>
              <Users className="w-8 h-8 text-violet-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Users</p>
                <p className="text-2xl font-bold">{activeUsers.length}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Admins</p>
                <p className="text-2xl font-bold">{adminCount}</p>
              </div>
              <Shield className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users List */}
      {filteredUsers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">
              {searchQuery ? 'No users found matching your search' : 'No users yet'}
            </p>
            {!searchQuery && (
              <Link href="/organization/users/new">
                <Button className="bg-primary hover:bg-primary/90">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add First User
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((user) => (
            <Card key={user.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-lg font-medium text-primary">
                        {(user.full_name || user.email)[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {user.full_name || user.email.split('@')[0]}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="w-3.5 h-3.5" />
                        {user.email}
                      </div>
                      {user.designation && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {user.designation}
                          {user.department && ` - ${user.department}`}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <Badge 
                      variant="secondary"
                      className={user.role_name ? roleColors[user.role_name] : ''}
                    >
                      {user.role_name ? ROLE_LABELS[user.role_name] : 'No Role'}
                    </Badge>
                    
                    <Badge 
                      variant="outline"
                      className={user.status === 'active' 
                        ? 'border-emerald-500 text-emerald-600' 
                        : 'border-muted text-muted-foreground'
                      }
                    >
                      {user.status}
                    </Badge>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Deactivate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  )
}
