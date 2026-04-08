import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/rbac-server'
import { getAccessibleProjectSummaries } from '@/lib/projects-access'
import { canCreateModules } from '@/lib/rbac'
import { isUuidRef, resolveProjectFromRef } from '@/lib/slug'

function isMissingModulesTable(err: { code?: string; message?: string } | null) {
  if (!err) return false
  if (err.code === 'PGRST205') return true
  const m = String(err.message || '')
  return m.includes('public.modules') || m.includes('Could not find the table')
}

async function resolveProjectIdFromParam(ctx: Awaited<ReturnType<typeof getAuthContext>>, ref: string) {
  const normalized = decodeURIComponent(ref).trim()
  if (isUuidRef(normalized)) return normalized
  const summaries = await getAccessibleProjectSummaries(ctx)
  return resolveProjectFromRef(ref, summaries)?.id ?? null
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectRef } = await params
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!canCreateModules(ctx.role)) {
      return NextResponse.json({ error: 'You do not have permission to create modules' }, { status: 403 })
    }

    const projectId = await resolveProjectIdFromParam(ctx, projectRef)
    if (!projectId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const summaries = await getAccessibleProjectSummaries(ctx)
    if (!summaries.some((p) => p.id === projectId)) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const body = await request.json()
    const name = String(body.name || '').trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const payload = {
      project_id: projectId,
      name,
      description: body.description != null ? String(body.description).trim() || null : null,
      status: typeof body.status === 'string' && body.status ? body.status : 'not_started',
      created_by: ctx.userId,
    }

    const { data, error } = await ctx.adminClient.from('modules').insert(payload).select('*').single()

    if (error) {
      if (isMissingModulesTable(error)) {
        return NextResponse.json(
          {
            error: 'public.modules is missing from this database.',
            hint: 'In Supabase → SQL Editor, run scripts/019_ensure_modules_and_tasks.sql',
          },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ module: data }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
