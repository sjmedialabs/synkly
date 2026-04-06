import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Sprint API - fetches sprints by project_id

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const status = searchParams.get('status')

    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    let query = supabase
      .from('sprint_tracking')
      .select('id, sprint_name, start_date, end_date, status')
      .eq('project_id', projectId)
      .order('start_date', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data: sprints, error } = await query

    console.log('[v0 sprints API] Query result for project:', projectId, 'found:', sprints?.length || 0, 'sprints')
    if (sprints?.length) {
      console.log('[v0 sprints API] Sprint IDs:', sprints.map(s => ({ id: s.id, name: s.sprint_name })))
    }

    if (error) {
      console.error('[sprints API] Database error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      sprints: sprints || [],
      count: sprints?.length || 0 
    })
  } catch (err) {
    console.error('[sprints API] Internal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
