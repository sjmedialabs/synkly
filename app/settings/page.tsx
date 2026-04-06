'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Database, Building2, Users, ChevronRight } from 'lucide-react'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      const { data: userData } = await supabase
        .from('users')
        .select('role:roles(name)')
        .eq('id', user.id)
        .single()

      if (userData?.role?.name !== 'super_admin') {
        router.push('/dashboard')
        return
      }

      setLoading(false)
    }

    checkAccess()
  }, [router, supabase])

  if (loading) {
    return (
      <DashboardLayout title="Settings">
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </DashboardLayout>
    )
  }

  const settingsSections = [
    {
      title: 'Master Data',
      description: 'Manage lookup values for departments, designations, priorities, phases and more.',
      href: '/settings/master-data',
      icon: Database,
    },
    {
      title: 'Divisions',
      description: 'Create and manage organisational divisions and their members.',
      href: '/divisions',
      icon: Building2,
    },
    {
      title: 'Team',
      description: 'Manage team members, roles, and access permissions.',
      href: '/team',
      icon: Users,
    },
  ]

  return (
    <DashboardLayout title="Settings">
      <div className="max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">
          Manage application-wide configuration and master data.
        </p>

        <div className="grid gap-4">
          {settingsSections.map((section) => {
            const Icon = section.icon
            return (
              <Link key={section.href} href={section.href}>
                <Card className="hover:border-primary/40 hover:bg-muted/30 transition-colors cursor-pointer">
                  <CardContent className="flex items-center gap-4 p-5">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{section.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </DashboardLayout>
  )
}
