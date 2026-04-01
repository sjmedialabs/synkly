'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { useState } from 'react'
import { Shield, Briefcase, Users, Code, Building2, CheckCircle2 } from 'lucide-react'

const roleConfig: Record<string, {
  name: string
  dbName: string
  description: string
  icon: React.ElementType
  color: string
  bgColor: string
}> = {
  'super-admin': {
    name: 'Super Admin',
    dbName: 'super_admin',
    description: 'Full system access and control',
    icon: Shield,
    color: 'text-red-500',
    bgColor: 'bg-red-500',
  },
  'project-manager': {
    name: 'Project Manager',
    dbName: 'project_manager',
    description: 'Manage projects, teams, and deadlines',
    icon: Briefcase,
    color: 'text-primary',
    bgColor: 'bg-primary',
  },
  'delivery-manager': {
    name: 'Delivery Manager',
    dbName: 'delivery_manager',
    description: 'Manage milestones and delivery',
    icon: CheckCircle2,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500',
  },
  'team-lead': {
    name: 'Team Lead',
    dbName: 'team_lead',
    description: 'Lead teams and assign tasks',
    icon: Users,
    color: 'text-green-500',
    bgColor: 'bg-green-500',
  },
  'developer': {
    name: 'Developer',
    dbName: 'employee',
    description: 'Work on assigned tasks and projects',
    icon: Code,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500',
  },
  'client': {
    name: 'Client',
    dbName: 'client',
    description: 'View project progress and reports',
    icon: Building2,
    color: 'text-accent',
    bgColor: 'bg-accent',
  },
}

export default function RoleSignUpPage() {
  const params = useParams()
  const role = params.role as string
  const config = roleConfig[role]

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  if (!config) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6">
            <p className="text-center text-destructive">Invalid role selected</p>
            <Link href="/auth/sign-up" className="block mt-4 text-center text-primary hover:underline">
              Go back to role selection
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const Icon = config.icon

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    if (password !== repeatPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }

    try {
      // Sign up with role metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
            `${window.location.origin}/dashboard`,
          data: {
            full_name: fullName,
            role: config.dbName,
          },
        },
      })

      if (authError) throw authError

      // After signup, update the user's role in the users table
      if (authData.user) {
        const { data: roleData } = await supabase
          .from('roles')
          .select('id')
          .eq('name', config.dbName)
          .single()

        if (roleData) {
          await supabase
            .from('users')
            .update({ 
              role_id: roleData.id,
              full_name: fullName 
            })
            .eq('id', authData.user.id)
        }
      }

      router.push('/auth/sign-up-success?role=' + role)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 md:p-10 bg-gradient-to-br from-background to-secondary">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 bg-primary rounded-lg"></div>
            <h1 className="text-2xl font-bold text-foreground">synkly</h1>
          </div>

          <Card className="border-border">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className={`${config.bgColor} p-2 rounded-lg text-white`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-xl">{config.name}</CardTitle>
                  <CardDescription className="text-xs">{config.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSignUp}>
                <div className="flex flex-col gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="John Doe"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="border-border"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="border-border"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="border-border"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="repeat-password">Confirm Password</Label>
                    <Input
                      id="repeat-password"
                      type="password"
                      required
                      value={repeatPassword}
                      onChange={(e) => setRepeatPassword(e.target.value)}
                      className="border-border"
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button
                    type="submit"
                    className={`w-full ${config.bgColor} hover:opacity-90 text-white`}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Creating account...' : `Sign up as ${config.name}`}
                  </Button>
                </div>
                <div className="mt-4 text-center text-sm space-y-2">
                  <Link
                    href="/auth/sign-up"
                    className="block text-muted-foreground hover:text-foreground"
                  >
                    Choose a different role
                  </Link>
                  <div>
                    Already have an account?{' '}
                    <Link
                      href="/auth/login"
                      className="text-primary hover:underline font-medium"
                    >
                      Sign in
                    </Link>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
