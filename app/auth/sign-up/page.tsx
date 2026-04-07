'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { Shield, Building2, Briefcase, Users, User } from 'lucide-react'
import { ROLE_LABELS, ROLE_DESCRIPTIONS, type RoleKey } from '@/lib/rbac'

const roles: Array<{
  id: string
  key: RoleKey
  icon: React.ElementType
  color: string
  href: string
}> = [
  {
    id: 'master-admin',
    key: 'master_admin',
    icon: Shield,
    color: 'bg-rose-600',
    href: '/auth/sign-up/master-admin',
  },
  {
    id: 'client-admin',
    key: 'client_admin',
    icon: Building2,
    color: 'bg-blue-600',
    href: '/auth/sign-up/client-admin',
  },
  {
    id: 'manager',
    key: 'manager',
    icon: Briefcase,
    color: 'bg-emerald-600',
    href: '/auth/sign-up/manager',
  },
  {
    id: 'team-lead',
    key: 'team_lead',
    icon: Users,
    color: 'bg-amber-600',
    href: '/auth/sign-up/team-lead',
  },
  {
    id: 'member',
    key: 'member',
    icon: User,
    color: 'bg-violet-600',
    href: '/auth/sign-up/member',
  },
]

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 md:p-10 bg-gradient-to-br from-background to-secondary/30">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col gap-6">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xl">S</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">synkly</h1>
          </div>

          <Card className="border-border">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Create Your Account</CardTitle>
              <CardDescription>Select your role to get started with Synkly</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {roles.map((role) => {
                  const Icon = role.icon
                  return (
                    <Link
                      key={role.id}
                      href={role.href}
                      className="group flex items-start gap-4 p-4 rounded-lg border border-border hover:border-primary hover:bg-secondary/50 transition-all"
                    >
                      <div className={`${role.color} p-3 rounded-lg text-white shrink-0`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {ROLE_LABELS[role.key]}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {ROLE_DESCRIPTIONS[role.key]}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>

              <div className="mt-6 text-center text-sm">
                Already have an account?{' '}
                <Link
                  href="/auth/login"
                  className="text-primary hover:underline font-medium"
                >
                  Sign in
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
