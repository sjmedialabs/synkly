'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Users,
  Settings,
  LogOut,
  Milestone,
  Target,
  FileText,
  BarChart3,
  Building2,
  Clock,
  UsersRound,
  PieChart,
  ShieldAlert,
} from 'lucide-react'

interface UserWithRole {
  id: string
  email: string
  full_name: string | null
  role: {
    name: string
  } | null
}

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  project_manager: 'Project Manager',
  delivery_manager: 'Delivery Manager',
  team_lead: 'Team Lead',
  employee: 'Developer',
}

const roleColors: Record<string, string> = {
  super_admin: 'bg-red-500',
  project_manager: 'bg-primary',
  delivery_manager: 'bg-cyan-500',
  team_lead: 'bg-green-500',
  employee: 'bg-purple-500',
}

// Define menu items per role
const menuConfig: Record<string, { label: string; href: string; icon: React.ElementType }[]> = {
  super_admin: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Projects', href: '/projects', icon: FolderKanban },
    { label: 'Tasks', href: '/tasks', icon: CheckSquare },
    { label: 'Team', href: '/team', icon: Users },
    { label: 'Divisions', href: '/divisions', icon: Building2 },
    { label: 'Capacity', href: '/capacity', icon: Clock },
    { label: 'Utilization', href: '/utilization', icon: PieChart },
    { label: 'Risks', href: '/risks', icon: ShieldAlert },
    { label: 'Milestones', href: '/milestones', icon: Milestone },
    { label: 'Sprints', href: '/sprints', icon: Target },
    { label: 'Reports', href: '/reports', icon: BarChart3 },
    { label: 'Settings', href: '/settings', icon: Settings },
  ],
  project_manager: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Projects', href: '/projects', icon: FolderKanban },
    { label: 'Tasks', href: '/tasks', icon: CheckSquare },
    { label: 'Team', href: '/team', icon: Users },
    { label: 'Divisions', href: '/divisions', icon: Building2 },
    { label: 'Capacity', href: '/capacity', icon: Clock },
    { label: 'Utilization', href: '/utilization', icon: PieChart },
    { label: 'Risks', href: '/risks', icon: ShieldAlert },
    { label: 'Milestones', href: '/milestones', icon: Milestone },
    { label: 'Sprints', href: '/sprints', icon: Target },
    { label: 'Reports', href: '/reports', icon: BarChart3 },
  ],
  delivery_manager: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Projects', href: '/projects', icon: FolderKanban },
    { label: 'Divisions', href: '/divisions', icon: Building2 },
    { label: 'Capacity', href: '/capacity', icon: Clock },
    { label: 'Utilization', href: '/utilization', icon: PieChart },
    { label: 'Risks', href: '/risks', icon: ShieldAlert },
    { label: 'Milestones', href: '/milestones', icon: Milestone },
    { label: 'Sprints', href: '/sprints', icon: Target },
    { label: 'Reports', href: '/reports', icon: BarChart3 },
  ],
  team_lead: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'My Team', href: '/my-team', icon: UsersRound },
    { label: 'Projects', href: '/projects', icon: FolderKanban },
    { label: 'Tasks', href: '/tasks', icon: CheckSquare },
    { label: 'Team', href: '/team', icon: Users },
    { label: 'Capacity', href: '/capacity', icon: Clock },
    { label: 'Sprints', href: '/sprints', icon: Target },
  ],
  employee: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'My Tasks', href: '/tasks', icon: CheckSquare },
    { label: 'Projects', href: '/projects', icon: FolderKanban },
  ],
}

export function Sidebar() {
  const [user, setUser] = useState<UserWithRole | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      
      if (!authUser) {
        router.push('/auth/login')
        return
      }

      const { data: userData } = await supabase
        .from('users')
        .select(`
          id,
          email,
          full_name,
          role:roles(name)
        `)
        .eq('id', authUser.id)
        .single()

      setUser(userData as UserWithRole)
      setLoading(false)
    }

    fetchUser()
  }, [router, supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  if (loading) {
    return (
      <aside className="w-64 bg-sidebar border-r border-sidebar-border p-6 flex flex-col">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-32 mb-8"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </aside>
    )
  }

  const roleName = user?.role?.name || 'employee'
  const menuItems = menuConfig[roleName] || menuConfig.employee

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border p-6 flex flex-col relative">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 bg-primary rounded-lg"></div>
        <h1 className="font-bold text-lg text-sidebar-foreground">synkly</h1>
      </div>

      {/* Role Badge */}
      <div className="mb-6">
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white ${roleColors[roleName]}`}>
          {roleLabels[roleName] || roleName}
        </span>
      </div>

      {/* Navigation */}
      <nav className="space-y-1 flex-1">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-sidebar-primary/10 text-sidebar-primary font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/10'
              }`}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User Info & Sign Out */}
      <div className="border-t border-sidebar-border pt-4 mt-4">
        <div className="px-4 py-2 mb-2">
          <p className="text-sm font-medium text-sidebar-foreground truncate">
            {user?.full_name || user?.email?.split('@')[0]}
          </p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
