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
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Shield, Briefcase, Users, Code, Building2, LogIn } from 'lucide-react'

const roleConfig: Record<string, {
  name: string
  icon: React.ElementType
  bgColor: string
}> = {
  'super_admin': {
    name: 'Super Admin',
    icon: Shield,
    bgColor: 'bg-red-500',
  },
  'project_manager': {
    name: 'Project Manager',
    icon: Briefcase,
    bgColor: 'bg-primary',
  },
  'delivery_manager': {
    name: 'Delivery Manager',
    icon: Briefcase,
    bgColor: 'bg-blue-500',
  },
  'team_lead': {
    name: 'Team Lead',
    icon: Users,
    bgColor: 'bg-green-500',
  },
  'employee': {
    name: 'Developer',
    icon: Code,
    bgColor: 'bg-purple-500',
  },
  'client': {
    name: 'Client',
    icon: Building2,
    bgColor: 'bg-accent',
  },
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)
    setUserRole(null)

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) throw authError

      // Fetch user's role
      if (authData.user) {
        const { data: userData } = await supabase
          .from('users')
          .select(`
            *,
            roles (name)
          `)
          .eq('id', authData.user.id)
          .single()

        if (userData?.roles?.name) {
          setUserRole(userData.roles.name)
        }
      }

      router.push('/dashboard')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const config = userRole ? roleConfig[userRole] : null
  const Icon = config?.icon

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
              <CardTitle className="text-2xl">Welcome Back</CardTitle>
              <CardDescription>
                Sign in to your account to continue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin}>
                <div className="flex flex-col gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="m@example.com"
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
                  
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  
                  {userRole && config && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                      <div className={`${config.bgColor} p-1.5 rounded text-white`}>
                        {Icon && <Icon className="w-4 h-4" />}
                      </div>
                      <span className="text-sm text-green-700">
                        Logging in as <strong>{config.name}</strong>
                      </span>
                    </div>
                  )}
                  
                  <Button
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      'Signing in...'
                    ) : (
                      <span className="flex items-center gap-2">
                        <LogIn className="w-4 h-4" />
                        Sign In
                      </span>
                    )}
                  </Button>
                </div>
                <div className="mt-4 text-center text-sm">
                  Don&apos;t have an account?{' '}
                  <Link
                    href="/auth/sign-up"
                    className="text-primary hover:underline font-medium"
                  >
                    Sign up
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Quick Login Hints */}
          <Card className="border-border bg-secondary/30">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground text-center mb-3">
                Test accounts (create via Sign Up):
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(roleConfig).slice(0, 4).map(([key, value]) => {
                  const RoleIcon = value.icon
                  return (
                    <div key={key} className="flex items-center gap-1.5 text-muted-foreground">
                      <div className={`${value.bgColor} p-1 rounded text-white`}>
                        <RoleIcon className="w-3 h-3" />
                      </div>
                      <span>{value.name}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
