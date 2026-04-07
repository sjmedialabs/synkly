'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function Home() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)


  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        router.push('/dashboard')
      } else {
        setLoading(false)
      }
    }

    checkAuth()
  }, [supabase, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary">
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="max-w-2xl text-center space-y-8">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 bg-primary rounded-lg"></div>
            <h1 className="text-3xl font-bold text-foreground">synkly</h1>
          </div>

          {/* Heading */}
          <div className="space-y-4">
            <h2 className="text-5xl font-bold text-foreground">Manage Tasks Like a Pro</h2>
            <p className="text-xl text-muted-foreground">
              A powerful task management system to organize, track, and collaborate on your projects effortlessly.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex gap-4 justify-center pt-4">
            <Link href="/auth/login">
              <button className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition">
                Sign In
              </button>
            </Link>
            <Link href="/auth/sign-up">
              <button className="px-8 py-3 bg-accent text-accent-foreground rounded-lg font-semibold hover:bg-accent/90 transition">
                Get Started
              </button>
            </Link>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12">
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-3xl mb-3">📋</div>
              <h3 className="font-semibold text-foreground mb-2">Organize Projects</h3>
              <p className="text-sm text-muted-foreground">Create and manage projects with teams and milestones</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-3xl mb-3">🎯</div>
              <h3 className="font-semibold text-foreground mb-2">Track Tasks</h3>
              <p className="text-sm text-muted-foreground">Assign tasks, set priorities, and monitor progress</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-3xl mb-3">👥</div>
              <h3 className="font-semibold text-foreground mb-2">Collaborate</h3>
              <p className="text-sm text-muted-foreground">Work together with your team in real-time</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
