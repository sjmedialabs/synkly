'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Shield, Briefcase, Users, Code, Building2, CheckCircle } from 'lucide-react'
import { Suspense } from 'react'

const roleConfig: Record<string, {
  name: string
  icon: React.ElementType
  color: string
  bgColor: string
}> = {
  'super-admin': {
    name: 'Client Admin',
    icon: Shield,
    color: 'text-red-500',
    bgColor: 'bg-red-500',
  },
  'project-manager': {
    name: 'Project Manager',
    icon: Briefcase,
    color: 'text-primary',
    bgColor: 'bg-primary',
  },
  'team-lead': {
    name: 'Team Lead',
    icon: Users,
    color: 'text-green-500',
    bgColor: 'bg-green-500',
  },
  'developer': {
    name: 'Developer',
    icon: Code,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500',
  },
  'client': {
    name: 'Client',
    icon: Building2,
    color: 'text-accent',
    bgColor: 'bg-accent',
  },
}

function SignUpSuccessContent() {
  const searchParams = useSearchParams()
  const role = searchParams.get('role')
  const config = role ? roleConfig[role] : null
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
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="bg-green-100 p-3 rounded-full">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
              </div>
              <CardTitle className="text-2xl">Account Created!</CardTitle>
              <CardDescription>
                {config ? (
                  <span className="flex items-center justify-center gap-2 mt-2">
                    Signed up as
                    <span className={`inline-flex items-center gap-1 ${config.bgColor} text-white px-2 py-0.5 rounded text-xs font-medium`}>
                      {Icon && <Icon className="w-3 h-3" />}
                      {config.name}
                    </span>
                  </span>
                ) : (
                  'Check your email to confirm'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Please check your email to confirm your account before signing in.
              </p>
              
              <div className="bg-secondary/50 rounded-lg p-4 border border-border">
                <p className="text-xs text-muted-foreground text-center">
                  After confirming your email, you can login with your credentials at the login page.
                </p>
              </div>

              <Button asChild className="w-full bg-primary hover:bg-primary/90">
                <Link href="/auth/login">
                  Go to Login
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function SignUpSuccessPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen w-full items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    }>
      <SignUpSuccessContent />
    </Suspense>
  )
}
