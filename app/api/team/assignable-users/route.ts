import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Restricted designation names
const RESTRICTED_DESIGNATIONS = ['Super Admin', 'Delivery Manager']

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  try {
    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get('project_id')

    console.log('[assignable-users] Request with project_id:', projectId)

    // Fetch all active users from users table with TEXT designation
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('id, email, full_name, designation, department, is_active')
      .eq('is_active', true)
      .order('full_name', { ascending: true })

    if (usersError) {
      console.error('[assignable-users] Error fetching users:', usersError)
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    console.log('[assignable-users] Found active users:', allUsers?.length || 0)

    // Filter out restricted designations (TEXT comparison)
    const assignableUsers = (allUsers || []).filter(user => {
      if (!user.designation) return true // Allow users without designation
      return !RESTRICTED_DESIGNATIONS.includes(user.designation)
    })

    console.log('[assignable-users] After restriction filter:', assignableUsers.length)

    // If project_id provided, filter to only users on that project
    let finalUsers = assignableUsers
    if (projectId) {
      const { data: projectUsers, error: projectError } = await supabase
        .from('project_users')
        .select('user_id')
        .eq('project_id', projectId)

      if (projectError) {
        console.error('[assignable-users] Error fetching project users:', projectError)
      } else {
        const projectUserIds = new Set((projectUsers || []).map(pu => pu.user_id))
        finalUsers = assignableUsers.filter(u => projectUserIds.has(u.id))
        console.log('[assignable-users] After project filter:', finalUsers.length)
      }
    }

    console.log('[assignable-users] Returning', finalUsers.length, 'assignable users')

    return NextResponse.json({
      users: finalUsers,
      total: finalUsers.length,
      restrictedDesignations: RESTRICTED_DESIGNATIONS
    })
  } catch (err) {
    console.error('[assignable-users] Catch error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
