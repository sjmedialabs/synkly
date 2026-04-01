import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Create admin client with service role key for user management
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

// GET - Sync auth users to users table and return all team members
export async function GET() {
  try {
    const adminClient = getAdminClient()
    
    // Get all auth users
    const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers()
    
    if (authError) {
      console.error('[team API] Failed to list auth users:', authError)
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }
    
    // Get existing users from public.users
    const { data: existingUsers } = await adminClient
      .from('users')
      .select('id')
    
    const existingIds = new Set(existingUsers?.map(u => u.id) || [])
    
    // Find auth users not in public.users
    const missingUsers = authUsers?.users?.filter(u => !existingIds.has(u.id)) || []
    
    // Insert missing users
    if (missingUsers.length > 0) {
      const toInsert = missingUsers.map(u => ({
        id: u.id,
        email: u.email,
        full_name: u.user_metadata?.full_name || u.email?.split('@')[0] || 'Unknown',
        is_active: true,
      }))
      
      const { error: insertError } = await adminClient
        .from('users')
        .insert(toInsert)
        .select()
      
      if (insertError) {
        console.error('[team API] Failed to sync users:', insertError)
      }
    }
    
    // Return all users
    const { data: allUsers, error: fetchError } = await adminClient
      .from('users')
      .select(`
        id,
        email,
        full_name,
        role_id,
        department,
        designation,
        is_active,
        created_at,
        experience_years,
        skillset,
        division_id,
        reporting_manager_id,
        divisions (id, name),
        reporting_manager:users!users_reporting_manager_id_fkey (id, full_name, email),
        roles (id, name, description)
      `)
      .order('created_at', { ascending: false })
    
    if (fetchError) {
      console.error('[team API] Failed to fetch users:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }
    
    return NextResponse.json({ users: allUsers, synced: missingUsers.length })
  } catch (err) {
    console.error('[team API] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      email,
      full_name,
      role_id,
      department,
      designation,
      experience_years,
      skillset,
      division_id,
      reporting_manager_id,
      is_active = true
    } = body

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const adminClient = getAdminClient()
    const tempPassword = Math.random().toString(36).slice(-12) + 'A1!'

    // Try to create auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name }
    })

    let userId: string

    if (authError) {
      // If user already exists in auth, find them by email
      if (authError.code === 'email_exists') {
        const { data: existingUsers } = await adminClient.auth.admin.listUsers()
        const existingUser = existingUsers?.users?.find(u => u.email === email)
        
        if (!existingUser) {
          return NextResponse.json({ error: 'User exists but could not be found' }, { status: 500 })
        }
        
        userId = existingUser.id
      } else {
        console.error('[team API] Auth error:', authError)
        return NextResponse.json({ error: authError.message }, { status: 500 })
      }
    } else if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create auth user' }, { status: 500 })
    } else {
      userId = authData.user.id
    }

    const skillsetArr = skillset
      ? (Array.isArray(skillset) ? skillset : skillset.split(',').map((s: string) => s.trim()).filter(Boolean))
      : null

    // Upsert into users table (the main table used throughout the app)
    const { data: userData, error: upsertError } = await adminClient
      .from('users')
      .upsert({
        id: userId,
        email,
        full_name,
        role_id: role_id || null,
        department: department || null,
        designation: designation || null,
        experience_years: experience_years || null,
        skillset: skillsetArr,
        division_id: division_id || null,
        reporting_manager_id: reporting_manager_id || null,
        is_active,
      }, { onConflict: 'id' })
      .select(`
        *,
        divisions (id, name),
        reporting_manager:users!users_reporting_manager_id_fkey (id, full_name, email),
        roles (id, name, description)
      `)
      .single()

    if (upsertError) {
      console.error('[team API] Users upsert error:', upsertError)
      // Don't delete auth user - they may already have existed
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({ user: userData, created: true, tempPassword })
  } catch (err) {
    console.error('[team API] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      id,
      full_name,
      role_id,
      department,
      designation,
      experience_years,
      skillset,
      division_id,
      reporting_manager_id,
      is_active
    } = body

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const adminClient = getAdminClient()

    const skillsetArr = skillset
      ? (Array.isArray(skillset) ? skillset : skillset.split(',').map((s: string) => s.trim()).filter(Boolean))
      : null

    const { data: updatedUser, error } = await adminClient
      .from('users')
      .update({
        full_name,
        role_id: role_id || null,
        department: department || null,
        designation: designation || null,
        experience_years: experience_years || null,
        skillset: skillsetArr,
        division_id: division_id || null,
        reporting_manager_id: reporting_manager_id || null,
        is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        divisions (id, name),
        reporting_manager:users!users_reporting_manager_id_fkey (id, full_name, email),
        roles (id, name, description)
      `)
      .single()

    if (error) {
      console.error('[team API] PUT error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ user: updatedUser, updated: true })
  } catch (err) {
    console.error('[team API] PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const adminClient = getAdminClient()

    // Delete from auth.users first (will cascade to users table if FK set up)
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(id)

    if (authDeleteError) {
      console.error('[team API] Auth delete error:', authDeleteError)
      // If auth delete fails, still try to delete from users table
    }

    // Also delete from users table directly to ensure cleanup
    await adminClient.from('users').delete().eq('id', id)

    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('[team API] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
