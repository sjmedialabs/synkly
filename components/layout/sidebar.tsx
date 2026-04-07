'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { type RoleKey, ROLE_LABELS } from '@/lib/rbac'
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Users,
  Settings,
  LogOut,
  Milestone,
  Target,
  BarChart3,
  Building2,
  Clock,
  UsersRound,
  PieChart,
  ShieldAlert,
  Database,
  ChevronRight,
  Shield,
  Briefcase,
  UserCog,
} from 'lucide-react'

interface UserWithRole {
  id: string
  email: string
  full_name: string | null
  role_name: RoleKey | null
  client_id: string | null
}

const roleColors: Record<RoleKey, string> = {
  master_admin: 'bg-rose-600',
  client_admin: 'bg-blue-600',
  manager: 'bg-emerald-600',
  team_lead: 'bg-amber-600',
  member: 'bg-violet-600',
}

type MenuItem = {
  label: string
  href: string
  icon: React.ElementType
  children?: { label: string; href: string; icon: React.ElementType }[]
}

// Define menu items per role
const menuConfig: Record<RoleKey, MenuItem[]> = {
  master_admin: [
    { label: 'Admin Dashboard', href: '/admin', icon: Shield },
    { label: 'Clients', href: '/admin/clients', icon: Building2 },
    { label: 'All Users', href: '/admin/users', icon: Users },
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Projects', href: '/projects', icon: FolderKanban },
    { label: 'Tasks', href: '/tasks', icon: CheckSquare },
    { label: 'Team', href: '/team', icon: UsersRound },
    { label: 'Milestones', href: '/milestones', icon: Milestone },
    { label: 'Sprints', href: '/sprints', icon: Target },
    { label: 'Reports', href: '/reports', icon: BarChart3 },
    {
      label: 'Settings', href: '/settings', icon: Settings,
      children: [
        { label: 'Master Data', href: '/settings/master-data', icon: Database },
      ]
    },
  ],
  client_admin: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Organization', href: '/organization', icon: Building2 },
    { label: 'Team Management', href: '/team', icon: UsersRound },
    { label: 'Projects', href: '/projects', icon: FolderKanban },
    { label: 'Tasks', href: '/tasks', icon: CheckSquare },
    { label: 'Milestones', href: '/milestones', icon: Milestone },
    { label: 'Sprints', href: '/sprints', icon: Target },
    { label: 'Capacity', href: '/capacity', icon: Clock },
    { label: 'Utilization', href: '/utilization', icon: PieChart },
    { label: 'Risks', href: '/risks', icon: ShieldAlert },
    { label: 'Reports', href: '/reports', icon: BarChart3 },
    {
      label: 'Settings', href: '/organization/settings', icon: Settings,
      children: [
        { label: 'Master Data', href: '/organization/settings', icon: Database },
        { label: 'Users', href: '/organization/users', icon: UserCog },
      ]
    },
  ],
  manager: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Projects', href: '/projects', icon: FolderKanban },
    { label: 'Tasks', href: '/tasks', icon: CheckSquare },
    { label: 'Team', href: '/team', icon: UsersRound },
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
    { label: 'Capacity', href: '/capacity', icon: Clock },
    { label: 'Sprints', href: '/sprints', icon: Target },
  ],
  member: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'My Tasks', href: '/tasks', icon: CheckSquare },
    { label: 'Projects', href: '/projects', icon: FolderKanban },
  ],
}

export function Sidebar() {
  const [user, setUser] = useState<UserWithRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  // Auto-expand Settings when on a settings path
  useEffect(() => {
    if (pathname.startsWith('/settings')) {
      setExpandedItems(prev => prev.includes('/settings') ? prev : [...prev, '/settings'])
    }
  }, [pathname])

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
          client_id,
          roles (name)
        `)
        .eq('id', authUser.id)
        .single()

      if (userData) {
        setUser({
          id: userData.id,
          email: userData.email,
          full_name: userData.full_name,
          role_name: (userData.roles as any)?.name as RoleKey | null,
          client_id: userData.client_id,
        })
      }
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
      <div className="h-full bg-card border-r border-border p-6 flex flex-col">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-32 mb-8"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const roleName = user?.role_name
  const menuItems = roleName ? (menuConfig[roleName] || menuConfig.member) : menuConfig.member

  const toggleExpanded = (href: string) => {
    setExpandedItems(prev =>
      prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href]
    )
  }

  return (
    <div className="h-full bg-card border-r border-border p-6 flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-sm">S</span>
        </div>
        <h1 className="font-bold text-lg text-foreground">synkly</h1>
      </div>

      {/* Role Badge */}
      <div className="mb-6">
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white ${roleName ? roleColors[roleName] : 'bg-gray-500'}`}>
          {roleName ? ROLE_LABELS[roleName] : 'No Role'}
        </span>
      </div>

      {/* Navigation */}
      <nav className="space-y-1 flex-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          const isParentActive = pathname.startsWith(item.href + '/')
          const hasChildren = item.children && item.children.length > 0
          const isExpanded = expandedItems.includes(item.href)

          return (
            <div key={item.href}>
              {hasChildren ? (
                <button
                  onClick={() => toggleExpanded(item.href)}
                  className={`flex items-center gap-3 w-full px-4 py-2 rounded-lg text-sm transition-colors ${
                    isActive || isParentActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground/70 hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="truncate flex-1 text-left">{item.label}</span>
                  <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>
              ) : (
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors ${
                    isActive || isParentActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground/70 hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              )}

              {/* Sub-items */}
              {hasChildren && isExpanded && (
                <div className="mt-1 ml-4 space-y-1 border-l border-border pl-3">
                  {item.children!.map((child) => {
                    const ChildIcon = child.icon
                    const isChildActive = pathname === child.href || pathname.startsWith(child.href + '/')
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isChildActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-foreground/70 hover:text-foreground hover:bg-muted/50'
                        }`}
                      >
                        <ChildIcon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{child.label}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* User Info & Sign Out */}
      <div className="border-t border-border pt-4 mt-4">
        <div className="px-4 py-2 mb-2">
          <p className="text-sm font-medium text-foreground truncate">
            {user?.full_name || user?.email?.split('@')[0]}
          </p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-4 py-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors text-sm"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </div>
  )
}
