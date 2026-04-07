import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessAll, getAuthContext } from '@/lib/rbac-server'

// Sprint API - fetches sprints by project_id

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id') || searchParams.get('projectId')
    const status = searchParams.get('status')

    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    if (!canAccessAll(ctx.role)) {
      // Team Lead: can access own projects; members: only projects where they have tasks.
      const directProjectAccess = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('team_lead_id', ctx.userId)
        .maybeSingle()
      const taskProjectAccess = await supabase
        .from('tasks')
        .select('id')
        .eq('project_id', projectId)
        .eq('assignee_id', ctx.userId)
        .limit(1)
      const hasAccess = !!directProjectAccess.data || (taskProjectAccess.data || []).length > 0
      if (!hasAccess) {
        return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
      }
    }

    // Primary source: modern sprints table
    let modernQuery = supabase
      .from('sprints')
      .select('id, name, start_date, end_date, status, project_id')
      .eq('project_id', projectId)
      .order('start_date', { ascending: false })
    if (status) modernQuery = modernQuery.eq('status', status)

    const modernRes = await modernQuery
    if (!modernRes.error) {
      return NextResponse.json({
        sprints: modernRes.data || [],
        count: modernRes.data?.length || 0,
      })
    }

    // Fallback source: legacy sprint_tracking table
    let legacyQuery = supabase
      .from('sprint_tracking')
      .select('id, sprint_name, start_date, end_date, status, project_id')
      .eq('project_id', projectId)
      .order('start_date', { ascending: false })
    if (status) legacyQuery = legacyQuery.eq('status', status)

    const legacyRes = await legacyQuery
    if (legacyRes.error) {
      console.error('[sprints API] Database error:', legacyRes.error)
      return NextResponse.json({ error: legacyRes.error.message }, { status: 500 })
    }

    const normalized = (legacyRes.data || []).map((s: any) => ({
      id: s.id,
      name: s.sprint_name,
      start_date: s.start_date,
      end_date: s.end_date,
      status: s.status,
      project_id: s.project_id,
    }))

    return NextResponse.json({
      sprints: normalized,
      count: normalized.length,
    })
  } catch (err) {
    console.error('[sprints API] Internal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
