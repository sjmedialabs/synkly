import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const typeParam = searchParams.get('type')
    
    if (!typeParam) {
      return NextResponse.json({ error: 'Type parameter is required' }, { status: 400 })
    }
    
    const adminClient = getAdminClient()
    
    // Get type ID from name
    const { data: typeData, error: typeError } = await adminClient
      .from('master_data_types')
      .select('id')
      .eq('name', typeParam)
      .single()
    
    if (typeError || !typeData) {
      return NextResponse.json({ error: 'Type not found' }, { status: 404 })
    }
    
    // Get values for this type
    const { data: values, error } = await adminClient
      .from('master_data_values')
      .select('id, name, is_active')
      .eq('type_id', typeData.id)
      .eq('is_active', true)
      .order('name')
    
    if (error) {
      console.error('[master-data values API] Failed to fetch values:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ values: values || [] })
  } catch (err: unknown) {
    console.error('[master-data values API] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, name } = body
    
    if (!type || !name || !name.trim()) {
      return NextResponse.json({ error: 'Type and name are required' }, { status: 400 })
    }
    
    const adminClient = getAdminClient()
    
    // Get type ID
    const { data: typeData, error: typeError } = await adminClient
      .from('master_data_types')
      .select('id')
      .eq('name', type)
      .single()
    
    if (typeError || !typeData) {
      return NextResponse.json({ error: 'Type not found' }, { status: 404 })
    }
    
    // Insert new value
    const { data, error } = await adminClient
      .from('master_data_values')
      .insert({
        type_id: typeData.id,
        name: name.trim(),
        is_active: true
      })
      .select()
      .single()
    
    if (error) {
      console.error('[master-data values API] Failed to create value:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ value: data }, { status: 201 })
  } catch (err: unknown) {
    console.error('[master-data values API] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Value ID is required' }, { status: 400 })
    }

    const adminClient = getAdminClient()
    const { error } = await adminClient
      .from('master_data_values')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[master-data values API] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
