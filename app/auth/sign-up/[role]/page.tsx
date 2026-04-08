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
import { Shield, Building2, Briefcase, Users, User, Loader2 } from 'lucide-react'
import { ROLE_LABELS, ROLE_DESCRIPTIONS, type RoleKey } from '@/lib/rbac'

const roleConfig: Record<string, {
  key: RoleKey
  icon: React.ElementType
  color: string
  bgColor: string
}> = {
  'master-admin': {
    key: 'master_admin',
    icon: Shield,
    color: 'text-rose-600',
    bgColor: 'bg-rose-600',
  },
  'client-admin': {
    key: 'client_admin',
    icon: Building2,
    color: 'text-blue-600',
    bgColor: 'bg-blue-600',
  },
  'manager': {
    key: 'manager',
    icon: Briefcase,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-600',
  },
  'team-lead': {
    key: 'team_lead',
    icon: Users,
    color: 'text-amber-600',
    bgColor: 'bg-amber-600',
  },
  'member': {
    key: 'member',
    icon: User,
    color: 'text-violet-600',
    bgColor: 'bg-violet-600',
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
  const roleLabel = ROLE_LABELS[config.key]
  const roleDescription = ROLE_DESCRIPTIONS[config.key]

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    // Validate passwords
    if (password !== repeatPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      setIsLoading(false)
      return
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase()

    try {
      // Sign up with role metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo:
            process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
            `${window.location.origin}/dashboard`,
          data: {
            full_name: fullName.trim(),
            role: config.key,
          },
        },
      })

      if (authError) throw authError

      // Ensure user profile exists and role is set even when DB trigger is missing/legacy.
      if (authData.user) {
        const { data: roleData } = await supabase
          .from('roles')
          .select('id')
          .eq('name', config.key)
          .single()

        await supabase.from('team').upsert(
          {
            id: authData.user.id,
            email: normalizedEmail,
            full_name: fullName.trim(),
            status: 'active',
            role: config.key,
            role_id: roleData?.id ?? null,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: 'id' },
        )
      }

      router.push('/auth/sign-up-success?role=' + role)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

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

          <Card className="border-border">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className={`${config.bgColor} p-2.5 rounded-lg text-white`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-xl">{roleLabel}</CardTitle>
                  <CardDescription className="text-xs">{roleDescription}</CardDescription>
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
                      autoComplete="name"
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
                      autoComplete="email"
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
                      autoComplete="new-password"
                      minLength={8}
                    />
                    <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
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
                      autoComplete="new-password"
                    />
                  </div>
                  
                  {error && (
                    <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                      {error}
                    </p>
                  )}
                  
                  <Button
                    type="submit"
                    className={`w-full ${config.bgColor} hover:opacity-90 text-white`}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating account...
                      </span>
                    ) : (
                      `Sign up as ${roleLabel}`
                    )}
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
