import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, type AuthContextResult } from '@/lib/rbac-server'
import { getAccessibleProjectSummaries } from '@/lib/projects-access'

function isMissingSprintsTableMessage(messages: string[]) {
  const blob = messages.join(' ').toLowerCase()
  return (
    blob.includes('public.sprints') ||
    blob.includes('pgrst205') ||
    blob.includes('schema cache') ||
    blob.includes('could not find the table')
  )
}

function normalizeSprintRows(rows: any[] | null) {
  return (rows || []).map((s) => ({
    id: s.id,
    name: String(s.name ?? s.sprint_name ?? 'Sprint').trim() || 'Sprint',
    start_date: s.start_date ?? null,
    end_date: s.end_date ?? null,
    status: s.status ?? 'planned',
    project_id: s.project_id,
  }))
}

async function userCanReadSprintsForProject(ctx: AuthContextResult, projectId: string): Promise<boolean> {
  if (!ctx.userId) return false
  if (ctx.isMasterAdmin) return true
  const summaries = await getAccessibleProjectSummaries(ctx)
  return summaries.some((p) => p.id === projectId)
}

async function loadSprintsForProject(adminClient: AuthContextResult['adminClient'], projectId: string) {
  // Query both tables: an empty `sprints` result must not win over rows in `sprint_tracking`
  // (the old loop used `length >= 0`, which is always true and skipped the legacy table).
  const [sprintRes, trackingRes] = await Promise.all([
    adminClient
      .from('sprints')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    adminClient
      .from('sprint_tracking')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
  ])

  const sprintRows = !sprintRes.error && Array.isArray(sprintRes.data) ? sprintRes.data : []
  const trackingRows = !trackingRes.error && Array.isArray(trackingRes.data) ? trackingRes.data : []

  if (sprintRows.length > 0) {
    return normalizeSprintRows(sprintRows)
  }
  if (trackingRows.length > 0) {
    return normalizeSprintRows(trackingRows)
  }

  return []
}

// Sprint API - fetches sprints by project_id

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id') || searchParams.get('projectId')
    const status = searchParams.get('status')

    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    const allowed = await userCanReadSprintsForProject(ctx, projectId)
    if (!allowed) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    let sprints = await loadSprintsForProject(ctx.adminClient, projectId)
    if (status) {
      sprints = sprints.filter((s) => s.status === status)
    }

    return NextResponse.json({
      sprints,
      count: sprints.length,
    })
  } catch (err) {
    console.error('[sprints API] Internal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const sprintName = String(body?.sprint_name ?? body?.name ?? '').trim()
    const projectId = String(body?.project_id ?? '').trim()
    const startDateRaw = body?.start_date
    const endDateRaw = body?.end_date
    const startDate =
      startDateRaw != null && String(startDateRaw).trim() !== '' ? String(startDateRaw).trim() : null
    const endDate =
      endDateRaw != null && String(endDateRaw).trim() !== '' ? String(endDateRaw).trim() : null
    const status = String(body?.status || 'planned').trim() || 'planned'

    if (!sprintName) {
      return NextResponse.json({ error: 'sprint_name is required' }, { status: 400 })
    }
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    const allowed = await userCanReadSprintsForProject(ctx, projectId)
    if (!allowed) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const errors: string[] = []

    const insertSprintsRow = async (payload: Record<string, unknown>) => {
      const res = await ctx.adminClient.from('sprints').insert(payload).select('*')
      if (res.error) {
        errors.push(res.error.message || 'sprints insert failed')
        return null
      }
      const row = Array.isArray(res.data) ? res.data[0] : res.data
      return row ?? null
    }

    const sprintsPayloads: Record<string, unknown>[] = [
      { name: sprintName, project_id: projectId, start_date: startDate, end_date: endDate, status },
      { name: sprintName, project_id: projectId, start_date: startDate, end_date: endDate, status: 'active' },
      { name: sprintName, project_id: projectId, start_date: startDate, end_date: endDate },
      { name: sprintName, project_id: projectId },
      { sprint_name: sprintName, project_id: projectId, start_date: startDate, end_date: endDate, status },
      { sprint_name: sprintName, project_id: projectId },
      { title: sprintName, project_id: projectId, start_date: startDate, end_date: endDate, status },
      { title: sprintName, project_id: projectId },
    ]

    let created: any = null
    for (const payload of sprintsPayloads) {
      created = await insertSprintsRow(payload)
      if (created) break
    }

    if (!created) {
      if (isMissingSprintsTableMessage(errors)) {
        return NextResponse.json(
          {
            error: 'public.sprints is missing from this database.',
            hint: 'In Supabase → SQL Editor, run scripts/019_ensure_modules_and_tasks.sql (includes sprints) or scripts/015_ensure_sprints_table.sql.',
          },
          { status: 503 },
        )
      }

      const legacyRes = await ctx.adminClient
        .from('sprint_tracking')
        .insert({
          sprint_name: sprintName,
          project_id: projectId,
          start_date: startDate,
          end_date: endDate,
          status,
        })
        .select('*')
      if (!legacyRes.error) {
        created = Array.isArray(legacyRes.data) ? legacyRes.data[0] : legacyRes.data
      } else {
        const msg = legacyRes.error.message || ''
        if (msg.includes('sprint_tracking') && (msg.includes('schema cache') || msg.includes('not find'))) {
          errors.push(
            'No sprint table available: create `public.sprints` (see scripts/019_ensure_modules_and_tasks.sql or 015_ensure_sprints_table.sql) or legacy `public.sprint_tracking` (see scripts/006_sprint_management.sql).',
          )
        } else {
          errors.push(msg)
        }
      }
    }

    if (!created) {
      const hint =
        'Create `public.sprints` (scripts/019_ensure_modules_and_tasks.sql or 015_ensure_sprints_table.sql) or legacy `public.sprint_tracking` (scripts/006_sprint_management.sql) in Supabase, then retry.'
      const detail = [...new Set(errors.filter(Boolean))].slice(0, 4).join(' | ')
      return NextResponse.json(
        {
          error: detail ? `${detail} ${hint}` : `Failed to create sprint. ${hint}`,
        },
        { status: 500 },
      )
    }

    const sprint = normalizeSprintRows([created])[0]
    return NextResponse.json({ sprint }, { status: 201 })
  } catch (err) {
    console.error('[sprints API] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
