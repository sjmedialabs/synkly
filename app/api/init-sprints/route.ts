import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check if sprints already exist for the project
    const { data: existingSprints } = await supabase
      .from('sprint_tracking')
      .select('id')
      .limit(1)

    if (existingSprints && existingSprints.length > 0) {
      return NextResponse.json({ message: 'Sprints already exist', count: existingSprints.length })
    }

    // Get or create the project
    const { data: projects } = await supabase
      .from('projects')
      .select('id')
      .limit(1)

    if (!projects || projects.length === 0) {
      return NextResponse.json({ error: 'No projects found' }, { status: 400 })
    }

    const projectId = projects[0].id

    // Create sample sprints
    const now = new Date()
    const sprints = [
      {
        project_id: projectId,
        sprint_name: `Sprint 1 (Apr 1 - Apr 17)`,
        start_date: new Date('2026-04-01'),
        end_date: new Date('2026-04-17'),
        status: 'active'
      },
      {
        project_id: projectId,
        sprint_name: `Sprint 2 (Apr 6 - Apr 20)`,
        start_date: new Date('2026-04-06'),
        end_date: new Date('2026-04-20'),
        status: 'active'
      },
      {
        project_id: projectId,
        sprint_name: `Sprint 3 (Apr 21 - May 5)`,
        start_date: new Date('2026-04-21'),
        end_date: new Date('2026-05-05'),
        status: 'planned'
      }
    ]

    const { data: created, error } = await supabase
      .from('sprint_tracking')
      .insert(sprints)
      .select()

    if (error) {
      console.error('[init-sprints] Insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[init-sprints] Created sprints:', created?.length || 0)
    return NextResponse.json({ success: true, count: created?.length || 0, sprints: created })
  } catch (err) {
    console.error('[init-sprints] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
