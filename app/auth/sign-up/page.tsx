'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { Shield, Briefcase, Users, Code, Building2, CheckCircle2 } from 'lucide-react'

const roles = [
  {
    id: 'super-admin',
    name: 'Super Admin',
    description: 'Full system access and control',
    icon: Shield,
    color: 'bg-red-500',
    href: '/auth/sign-up/super-admin',
  },
  {
    id: 'project-manager',
    name: 'Project Manager',
    description: 'Manage projects, teams, and deadlines',
    icon: Briefcase,
    color: 'bg-primary',
    href: '/auth/sign-up/project-manager',
  },
  {
    id: 'delivery-manager',
    name: 'Delivery Manager',
    description: 'Manage milestones and delivery',
    icon: CheckCircle2,
    color: 'bg-cyan-500',
    href: '/auth/sign-up/delivery-manager',
  },
  {
    id: 'team-lead',
    name: 'Team Lead',
    description: 'Lead teams and assign tasks',
    icon: Users,
    color: 'bg-green-500',
    href: '/auth/sign-up/team-lead',
  },
  {
    id: 'developer',
    name: 'Developer',
    description: 'Work on assigned tasks and projects',
    icon: Code,
    color: 'bg-purple-500',
    href: '/auth/sign-up/developer',
  },
  {
    id: 'client',
    name: 'Client',
    description: 'View project progress and reports',
    icon: Building2,
    color: 'bg-accent',
    href: '/auth/sign-up/client',
  },
]

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 md:p-10 bg-gradient-to-br from-background to-secondary">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col gap-6">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 bg-primary rounded-lg"></div>
            <h1 className="text-2xl font-bold text-foreground">synkly</h1>
          </div>

          <Card className="border-border">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Create Your Account</CardTitle>
              <CardDescription>Select your role to get started</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {roles.map((role) => {
                  const Icon = role.icon
                  return (
                    <Link
                      key={role.id}
                      href={role.href}
                      className="group flex items-start gap-4 p-4 rounded-lg border border-border hover:border-primary hover:bg-secondary/50 transition-all"
                    >
                      <div className={`${role.color} p-3 rounded-lg text-white`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {role.name}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {role.description}
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
