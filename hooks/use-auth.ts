'use client'

import { createClient } from '@/lib/supabase/client'
import { normalizeRole, type RoleKey, ROLE_PERMISSIONS, ROLE_LEVELS, type UserWithRole } from '@/lib/rbac'
import { useEffect, useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'

interface UseAuthReturn {
  user: UserWithRole | null
  authUser: User | null
  isLoading: boolean
  isAuthenticated: boolean
  role: RoleKey | null
  clientId: string | null
  hasPermission: (permission: string) => boolean
  canAccessResource: (requiredRole: RoleKey) => boolean
  isMasterAdmin: boolean
  isClientAdmin: boolean
  isManager: boolean
  isTeamLead: boolean
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [user, setUser] = useState<UserWithRole | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchUserProfile = useCallback(async (authUserId: string) => {
    const supabase = createClient()

    try {
      const meRes = await fetch('/api/me')
      if (meRes.ok) {
        const me = await meRes.json()
        const st = me.status as string | undefined
        setUser({
          id: me.userId,
          email: me.email,
          full_name: me.full_name,
          role_name: me.role,
          role_permissions: null,
          client_id: me.clientId,
          status:
            st === 'suspended' || st === 'inactive' || st === 'active' ? st : 'active',
        })
        return
      }
    } catch {
      /* fall back to auth session only */
    }

    const { data: authData } = await supabase.auth.getUser()
    const authUser = authData.user
    if (authUser?.id === authUserId) {
      const meta = (authUser.user_metadata || {}) as Record<string, unknown>
      setUser({
        id: authUser.id,
        email: authUser.email || '',
        full_name: (typeof meta.full_name === 'string' && meta.full_name) || null,
        role_name: normalizeRole(meta.role as string) || null,
        role_permissions: null,
        client_id: (typeof meta.client_id === 'string' ? meta.client_id : null) || null,
        status: 'active',
      })
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()

    // Get initial session
    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      setAuthUser(currentUser)
      if (currentUser) {
        fetchUserProfile(currentUser.id)
      }
      setIsLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUser = session?.user ?? null
        setAuthUser(currentUser)
        
        if (currentUser) {
          await fetchUserProfile(currentUser.id)
        } else {
          setUser(null)
        }
        setIsLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [fetchUserProfile])

  const role = user?.role_name || null

  const hasPermission = useCallback((permission: string): boolean => {
    if (!role) return false
    const perms = ROLE_PERMISSIONS[role] || []
    return perms.includes('ALL') || perms.includes(permission)
  }, [role])

  const canAccessResource = useCallback((requiredRole: RoleKey): boolean => {
    if (!role) return false
    return ROLE_LEVELS[role] >= ROLE_LEVELS[requiredRole]
  }, [role])

  const signOut = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    setAuthUser(null)
  }, [])

  const refresh = useCallback(async () => {
    if (authUser) {
      await fetchUserProfile(authUser.id)
    }
  }, [authUser, fetchUserProfile])

  return {
    user,
    authUser,
    isLoading,
    isAuthenticated: !!authUser && !!user,
    role,
    clientId: user?.client_id || null,
    hasPermission,
    canAccessResource,
    isMasterAdmin: role === 'master_admin',
    isClientAdmin: role === 'client_admin',
    isManager: role === 'manager',
    isTeamLead: role === 'team_lead',
    signOut,
    refresh,
  }
}
