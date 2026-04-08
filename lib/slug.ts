import type { SupabaseClient } from '@supabase/supabase-js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
  return s
}

export function isUuidRef(ref: string): boolean {
  return UUID_RE.test(decodeURIComponent(ref).trim())
}

function baseSegment(name: string | null | undefined, fallback: string): string {
  return slugify(String(name ?? '')) || fallback
}

/** URL path segment for a project; disambiguate duplicate names with -2, -3, … */
export function projectUrlSegment(
  project: { id: string; name: string | null },
  allProjects: { id: string; name: string | null }[],
): string {
  const base = baseSegment(project.name, 'project')
  const same = allProjects.filter((p) => baseSegment(p.name, 'project') === base)
  if (same.length <= 1) return base
  const sorted = [...same].sort((a, b) => a.id.localeCompare(b.id))
  const idx = sorted.findIndex((p) => p.id === project.id)
  return idx <= 0 ? base : `${base}-${idx + 1}`
}

/** URL path segment for a module within its project */
export function moduleUrlSegment(
  module: { id: string; name: string | null },
  modulesInProject: { id: string; name: string | null }[],
): string {
  const base = baseSegment(module.name, 'module')
  const same = modulesInProject.filter((m) => baseSegment(m.name, 'module') === base)
  if (same.length <= 1) return base
  const sorted = [...same].sort((a, b) => a.id.localeCompare(b.id))
  const idx = sorted.findIndex((m) => m.id === module.id)
  return idx <= 0 ? base : `${base}-${idx + 1}`
}

export function projectHref(project: { id: string; name: string | null }, allProjects: { id: string; name: string | null }[]) {
  return `/projects/${encodeURIComponent(projectUrlSegment(project, allProjects))}`
}

export function projectEditHref(project: { id: string; name: string | null }, allProjects: { id: string; name: string | null }[]) {
  return `${projectHref(project, allProjects)}/edit`
}

export function projectModuleHref(
  project: { id: string; name: string | null },
  module: { id: string; name: string | null },
  allProjects: { id: string; name: string | null }[],
  modulesInProject: { id: string; name: string | null }[],
) {
  return `${projectHref(project, allProjects)}/modules/${encodeURIComponent(moduleUrlSegment(module, modulesInProject))}`
}

export function resolveProjectFromRef(
  ref: string,
  rows: { id: string; name: string | null }[],
): { id: string; name: string | null } | null {
  const normalizedRef = decodeURIComponent(ref).trim()
  if (isUuidRef(normalizedRef)) {
    return rows.find((p) => p.id === normalizedRef) ?? null
  }
  const matches = rows.filter((p) => projectUrlSegment(p, rows) === normalizedRef)
  return matches[0] ?? null
}

export function resolveModuleFromRef<M extends { id: string; name: string | null }>(ref: string, modules: M[]): M | null {
  const normalizedRef = decodeURIComponent(ref).trim()
  if (isUuidRef(normalizedRef)) {
    return modules.find((m) => m.id === normalizedRef) ?? null
  }
  const matches = modules.filter((m) => moduleUrlSegment(m, modules) === normalizedRef)
  return matches[0] ?? null
}

/** Browser client: resolve URL segment to project row (RLS applies). */
export async function fetchProjectFromUrlRef(
  supabase: SupabaseClient,
  ref: string,
): Promise<{ id: string; name: string | null } | null> {
  const raw = decodeURIComponent(ref).trim()
  if (isUuidRef(raw)) {
    const { data } = await supabase.from('projects').select('id, name').eq('id', raw).maybeSingle()
    return data ?? null
  }
  const { data: rows } = await supabase.from('projects').select('id, name')
  return resolveProjectFromRef(ref, rows || [])
}

export async function fetchModuleFromUrlRef(
  supabase: SupabaseClient,
  projectId: string,
  moduleRef: string,
): Promise<{ id: string; name: string | null; project_id: string } | null> {
  const raw = decodeURIComponent(moduleRef).trim()
  if (isUuidRef(raw)) {
    const { data } = await supabase
      .from('modules')
      .select('id, name, project_id')
      .eq('id', raw)
      .eq('project_id', projectId)
      .maybeSingle()
    return data ?? null
  }
  const { data: modules } = await supabase.from('modules').select('id, name, project_id').eq('project_id', projectId)
  const hit = resolveModuleFromRef(moduleRef, modules || [])
  return hit ?? null
}
