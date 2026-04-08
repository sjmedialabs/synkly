import { NextRequest, NextResponse } from 'next/server'
import { canCreateProjects, getAuthContext } from '@/lib/rbac-server'
import { getAccessibleProjectSummaries } from '@/lib/projects-access'
import { isUuidRef, resolveProjectFromRef } from '@/lib/slug'

async function resolveProjectIdFromParam(ctx: Awaited<ReturnType<typeof getAuthContext>>, ref: string) {
  const normalized = decodeURIComponent(ref).trim()
  if (isUuidRef(normalized)) return normalized
  const summaries = await getAccessibleProjectSummaries(ctx)
  return resolveProjectFromRef(ref, summaries)?.id ?? null
}

async function loadProjectWithAccessCheck(projectRef: string) {
  const ctx = await getAuthContext()
  if (!ctx.userId) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const projectId = await resolveProjectIdFromParam(ctx, projectRef)
  if (!projectId) {
    return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) }
  }

  const projectRes = await ctx.adminClient.from('projects').select('*').eq('id', projectId).maybeSingle()
  if (projectRes.error || !projectRes.data) {
    return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) }
  }

  const project = projectRes.data as any
  const summaries = await getAccessibleProjectSummaries(ctx)
  if (!summaries.some((p) => p.id === projectId)) {
    return { error: NextResponse.json({ error: 'Access Denied' }, { status: 403 }) }
  }

  return { ctx, project, projectId }
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await loadProjectWithAccessCheck(id)
  if ('error' in result) return result.error
  return NextResponse.json({ project: result.project })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await loadProjectWithAccessCheck(id)
  if ('error' in result) return result.error
  if (!canCreateProjects(result.ctx.role)) {
    return NextResponse.json({ error: 'You do not have permission to edit projects' }, { status: 403 })
  }

  const body = await request.json()
  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const payload = {
    name,
    description: body.description || null,
    priority: body.priority || 'medium',
    status: body.status || 'planning',
    phase: body.phase || 'discovery',
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    budget: body.budget ? Number(body.budget) : null,
    updated_at: new Date().toISOString(),
  }

  const updateRes = await result.ctx.adminClient
    .from('projects')
    .update(payload)
    .eq('id', result.projectId)
    .select('*')
    .single()

  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
  }

  return NextResponse.json({ project: updateRes.data })
}
