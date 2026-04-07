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
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { AlertCircle, CheckCircle2, Lock } from 'lucide-react'

function SetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isValidating, setIsValidating] = useState(true)
  const [tokenUserId, setTokenUserId] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // IMPORTANT: onboarding must bind password update to the invite-token user only.
    // Never rely on an already logged-in browser session.
    const checkSession = async () => {
      const supabase = createClient()
      const isForceReset = searchParams.get('force_reset') === '1'
      const hash = window.location.hash || ''
      const hashParams = new URLSearchParams(hash.replace('#', ''))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const flowType = hashParams.get('type')

      // Force-reset path: authenticated user changing own password.
      if (isForceReset) {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          setError('You must be logged in to reset your password.')
          setIsValidating(false)
          return
        }
        setTokenUserId(session.user.id)
        setIsValidating(false)
        return
      }

      // Invite/recovery path: must have token in URL hash.
      if (!accessToken || !refreshToken || !flowType) {
        setError('Invalid invite link. Please use the latest link from your email.')
        setIsValidating(false)
        return
      }
      if (flowType !== 'invite' && flowType !== 'recovery') {
        setError('Unsupported password setup link.')
        setIsValidating(false)
        return
      }

      // Clear existing browser session first to avoid accidental cross-account update.
      await supabase.auth.signOut()

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (sessionError) {
        setError('Invalid or expired session. Please use the link from your invite email.')
        setIsValidating(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) {
        setError('Could not validate invited user. Please request a new invite.')
        setIsValidating(false)
        return
      }

      setTokenUserId(user.id)
      setIsValidating(false)
    }

    checkSession()
  }, [searchParams])

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    // Validation
    if (!password || !confirmPassword) {
      setError('Both password fields are required')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id || !tokenUserId || user.id !== tokenUserId) {
        throw new Error('Session mismatch. Please reopen your invite link and try again.')
      }

      // Update user password
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) {
        throw updateError
      }

      // Best-effort status sync for app-level user table.
      await fetch('/api/auth/onboarding-complete', { method: 'POST' })

      setSuccess(true)
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to set password'
      setError(message)
      console.error('[v0] Set password error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  if (isValidating) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary"></div>
            </div>
            <p className="text-center mt-4 text-muted-foreground">Validating your session...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Lock className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Set Your Password</CardTitle>
          <CardDescription>
            Create a secure password for your account
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900">Password set successfully!</p>
                <p className="text-sm text-green-700">Redirecting to dashboard...</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter a strong password"
                disabled={isLoading || success}
                required
                minLength={8}
              />
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters long
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                disabled={isLoading || success}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || success}
            >
              {isLoading ? 'Setting password...' : 'Set Password'}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-4">
            By setting your password, you agree to our Terms of Service
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary"></div>
            </div>
            <p className="text-center mt-4 text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    }>
      <SetPasswordForm />
    </Suspense>
  )
}
