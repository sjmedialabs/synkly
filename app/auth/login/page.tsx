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
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'
import { Shield, Building2, Briefcase, Users, User, LogIn, Loader2 } from 'lucide-react'
import { ROLE_LABELS, normalizeRole, type RoleKey } from '@/lib/rbac'

/** Icon + accent for the post-login “Logging in as …” banner only */
const loginRoleBannerConfig: Record<
  RoleKey,
  { icon: React.ElementType; bgColor: string }
> = {
  master_admin: { icon: Shield, bgColor: 'bg-rose-600' },
  client_admin: { icon: Building2, bgColor: 'bg-blue-600' },
  manager: { icon: Briefcase, bgColor: 'bg-emerald-600' },
  team_lead: { icon: Users, bgColor: 'bg-amber-600' },
  member: { icon: User, bgColor: 'bg-violet-600' },
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [userRole, setUserRole] = useState<RoleKey | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/dashboard'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    const emailNormalized = email.trim().toLowerCase()
    setIsLoading(true)
    setError(null)
    setUserRole(null)

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: emailNormalized,
        password,
      })

      if (authError) throw authError

      // Role + status from server (avoids browser REST to missing `team` / `roles` tables)
      if (authData.user) {
        const metaRole = normalizeRole((authData.user.user_metadata as any)?.role)
        const meRes = await fetch('/api/me')
        const me = meRes.ok ? await meRes.json() : null

        // Prefer server profile when cookies are synced; otherwise metadata still allows redirect
        if (me?.status === 'suspended') {
          await supabase.auth.signOut()
          throw new Error('Your account has been suspended. Please contact support.')
        }

        if (me?.status === 'inactive') {
          await supabase.auth.signOut()
          throw new Error('Your account is inactive. Please contact your administrator.')
        }

        const resolvedRole = (me?.role as RoleKey | null) || metaRole

        if (resolvedRole) {
          setUserRole(resolvedRole)
          
          // Role-based redirects
          setTimeout(() => {
            switch (resolvedRole) {
              case 'master_admin':
                router.push('/admin')
                break
              case 'client_admin':
                router.push('/dashboard')
                break
              case 'manager':
                router.push('/projects')
                break
              case 'team_lead':
                router.push('/tasks')
                break
              case 'member':
                router.push('/tasks')
                break
              default:
                router.push(redirectTo)
            }
          }, 500)
        } else {
          router.push(redirectTo)
        }
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred')
      setIsLoading(false)
    }
  }

  const config = userRole ? loginRoleBannerConfig[userRole] : null
  const Icon = config?.icon

  return (
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
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-border"
                autoComplete="email"
                disabled={isLoading && !!userRole}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link 
                  href="/auth/forgot-password" 
                  className="text-xs text-muted-foreground hover:text-primary"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-border"
                autoComplete="current-password"
                disabled={isLoading && !!userRole}
              />
            </div>
            
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                {error}
              </p>
            )}
            
            {userRole && config && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 flex items-center gap-2">
                <div className={`${config.bgColor} p-1.5 rounded text-white`}>
                  {Icon && <Icon className="w-4 h-4" />}
                </div>
                <span className="text-sm text-emerald-700 dark:text-emerald-300">
                  Logging in as <strong>{ROLE_LABELS[userRole]}</strong>
                </span>
              </div>
            )}
            
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {userRole ? 'Redirecting...' : 'Signing in...'}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  Sign In
                </span>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 md:p-10 bg-gradient-to-br from-background to-secondary/30">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xl">S</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">synkly</h1>
          </div>

          <Suspense fallback={
            <Card className="border-border">
              <CardContent className="p-6">
                <div className="flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          }>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
