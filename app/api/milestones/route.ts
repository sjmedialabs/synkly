import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/rbac-server'
import { isMissingCapacityTable } from '@/lib/capacity-server'

type MilestoneRow = {
  id: string
  name: string
  description: string | null
  project_id: string
  status: string
  priority: string
  start_date: string | null
  end_date: string | null
  created_at: string
  project?: { name: string } | null
}

function hydrateProjects(admin: any, rows: Record<string, unknown>[]): Promise<MilestoneRow[]> {
  const pids = [...new Set(rows.map((r) => String(r.project_id)).filter(Boolean))]
  if (pids.length === 0) {
    return Promise.resolve(
      rows.map((r) => ({ ...(r as object), project: null }) as MilestoneRow),
    )
  }
  return admin
    .from('projects')
    .select('id, name')
    .in('id', pids)
    .then(({ data }: { data: { id: string; name: string }[] | null }) => {
      const pmap = new Map((data || []).map((p) => [String(p.id), String(p.name || 'Project')]))
      return rows.map((r) => {
        const pid = String(r.project_id)
        return {
          ...(r as object),
          project: pmap.has(pid) ? { name: pmap.get(pid)! } : null,
        } as MilestoneRow
      })
    })
}

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = ctx.adminClient
  const selects = ['*, project:projects(name)', '*']

  for (const sel of selects) {
    const { data, error } = await admin
      .from('milestones')
      .select(sel)
      .order('created_at', { ascending: false })

    if (error && isMissingCapacityTable(error, 'milestones')) {
      return NextResponse.json({ milestones: [], missingTable: true })
    }
    if (error?.code === 'PGRST204') continue
    if (error) continue
    if (!data || !Array.isArray(data)) continue

    const raw = data as Record<string, unknown>[]
    if (sel.includes('project:')) {
      const list = raw.map((r) => {
        const emb = r.project
        const project =
          emb && typeof emb === 'object' && emb !== null && 'name' in emb
            ? { name: String((emb as { name: unknown }).name) }
            : null
        const { project: _p, ...rest } = r
        return { ...rest, project } as MilestoneRow
      })
      return NextResponse.json({ milestones: list })
    }

    const hydrated = await hydrateProjects(admin, raw)
    return NextResponse.json({ milestones: hydrated })
  }

  return NextResponse.json({ milestones: [] })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const name = String(body.name || '').trim()
  const project_id = String(body.project_id || '').trim()
  if (!name || !project_id) {
    return NextResponse.json({ error: 'name and project_id are required' }, { status: 400 })
  }

  const admin = ctx.adminClient
  const payloads: Record<string, unknown>[] = [
    {
      name,
      description: body.description || null,
      project_id,
      status: String(body.status || 'not_started'),
      priority: String(body.priority || 'medium'),
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      created_by: ctx.userId,
      updated_at: new Date().toISOString(),
    },
    {
      name,
      description: body.description || null,
      project_id,
      status: String(body.status || 'not_started'),
      priority: String(body.priority || 'medium'),
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      updated_at: new Date().toISOString(),
    },
    {
      name,
      description: body.description || null,
      project_id,
      status: String(body.status || 'not_started'),
      priority: String(body.priority || 'medium'),
      start_date: body.start_date || null,
      end_date: body.end_date || null,
    },
  ]

  let lastErr: { message?: string; code?: string } | null = null
  for (const insertPayload of payloads) {
    const ins = await admin.from('milestones').insert(insertPayload).select('*').maybeSingle()
    if (!ins.error && ins.data) {
      const row = ins.data as Record<string, unknown>
      const list = await hydrateProjects(admin, [row])
      return NextResponse.json({ milestone: list[0] }, { status: 201 })
    }
    lastErr = ins.error
    if (ins.error && isMissingCapacityTable(ins.error, 'milestones')) {
      return NextResponse.json(
        {
          error:
            'milestones table is missing. Run scripts/021_ensure_milestones_table.sql in Supabase SQL Editor.',
          details: ins.error.message,
        },
        { status: 503 },
      )
    }
  }

  return NextResponse.json({ error: lastErr?.message || 'Could not create milestone', code: lastErr?.code }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const id = String(body.id || '').trim()
  const status = body.status != null ? String(body.status) : ''
  if (!id || !status) {
    return NextResponse.json({ error: 'id and status are required' }, { status: 400 })
  }

  const admin = ctx.adminClient
  const up = await admin
    .from('milestones')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (up.error) {
    if (isMissingCapacityTable(up.error, 'milestones')) {
      return NextResponse.json({ error: 'milestones table is missing.' }, { status: 503 })
    }
    return NextResponse.json({ error: up.error.message }, { status: 400 })
  }
  if (!up.data) {
    return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })
  }

  const list = await hydrateProjects(admin, [up.data as Record<string, unknown>])
  return NextResponse.json({ milestone: list[0] })
}
