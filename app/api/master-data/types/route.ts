import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function GET() {
  try {
    const adminClient = getAdminClient()
    
    const { data, error } = await adminClient
      .from('master_data_types')
      .select('id, name')
      .order('name')
    
    if (error) {
      console.error('[master-data API] Failed to fetch types:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ types: data || [] })
  } catch (err: unknown) {
    console.error('[master-data API] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name } = body
    
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Type name is required' }, { status: 400 })
    }
    
    const adminClient = getAdminClient()
    
    const { data, error } = await adminClient
      .from('master_data_types')
      .insert({ name: name.trim() })
      .select()
      .single()
    
    if (error) {
      console.error('[master-data API] Failed to create type:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ type: data }, { status: 201 })
  } catch (err: unknown) {
    console.error('[master-data API] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
