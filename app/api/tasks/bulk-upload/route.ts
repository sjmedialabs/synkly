import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/rbac-server'
import { hasPermission, isFullAccessRole } from '@/lib/rbac'
import { hasModulePermission } from '@/lib/rbac-server'
import { getAccessibleProjectSummaries } from '@/lib/projects-access'
import * as XLSX from 'xlsx'

type RowData = {
  row: number
  project_name: string
  module_name: string
  task_name: string
  description: string
  estimation: number
  start_date: string | null
  end_date: string | null
}

type ImportResult = {
  row: number
  task_name: string
  project_name: string
  module_name: string
  status: 'created' | 'error'
  error?: string
  task_id?: string
}

function parseDate(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(val).trim()
  if (!s) return null
  const parsed = new Date(s)
  if (isNaN(parsed.getTime())) return null
  return parsed.toISOString().split('T')[0]
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (
      !isFullAccessRole(ctx.role) &&
      !hasPermission(ctx.role, 'CREATE_TASK') &&
      !hasModulePermission(ctx, 'tasks', 'create') &&
      !hasModulePermission(ctx, 'bulk_upload', 'view') &&
      !hasModulePermission(ctx, 'bulk_upload', 'create')
    ) {
      return NextResponse.json({ error: 'You do not have permission to create tasks' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Excel file is required' }, { status: 400 })

    const fixedProjectId = String((formData.get('project_id') as string | null) || '').trim()
    let lockedProject: { id: string; name: string } | null = null
    if (fixedProjectId) {
      const summaries = await getAccessibleProjectSummaries(ctx)
      const found = summaries.find((s) => s.id === fixedProjectId)
      if (!found) {
        return NextResponse.json(
          { error: 'Selected project was not found or you do not have access to it.' },
          { status: 403 },
        )
      }
      lockedProject = { id: found.id, name: (found.name || 'Project').trim() || 'Project' }
    }

    // Parse Excel
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) return NextResponse.json({ error: 'No worksheet found in the file' }, { status: 400 })

    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }) as Record<string, unknown>[]
    if (rawRows.length === 0) return NextResponse.json({ error: 'The spreadsheet is empty' }, { status: 400 })

    // Normalize column headers (case-insensitive, trim, underscores)
    const normalize = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_')
    const colMap: Record<string, string> = {
      project_name: 'project_name', project: 'project_name',
      module_name: 'module_name', module: 'module_name',
      task_name: 'task_name', task: 'task_name', title: 'task_name',
      description: 'description', desc: 'description',
      estimation: 'estimation', estimated_hours: 'estimation', hours: 'estimation',
      start_date: 'start_date', start: 'start_date',
      end_date: 'end_date', end: 'end_date',
    }

    const rows: RowData[] = rawRows.map((raw, idx) => {
      const mapped: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(raw)) {
        const norm = normalize(key)
        const target = colMap[norm]
        if (target) mapped[target] = val
      }
      return {
        row: idx + 2, // 1-indexed + header
        project_name: String(mapped.project_name || '').trim(),
        module_name: String(mapped.module_name || '').trim(),
        task_name: String(mapped.task_name || '').trim(),
        description: String(mapped.description || '').trim(),
        estimation: Number(mapped.estimation) || 0,
        start_date: parseDate(mapped.start_date),
        end_date: parseDate(mapped.end_date),
      }
    }).filter((r) => r.task_name) // skip empty rows

    if (rows.length === 0) {
      return NextResponse.json({
        error: lockedProject
          ? 'No valid task rows found. Ensure each row has Module Name and Task Name (Project Name can be omitted when a project is selected on the upload form).'
          : 'No valid task rows found. Ensure columns: Project Name, Module Name, Task Name',
      }, { status: 400 })
    }

    const admin = ctx.adminClient

    const projectsByName = new Map<string, { id: string; name: string }>()
    let projectIds: string[] = []

    if (lockedProject) {
      projectIds = [lockedProject.id]
      projectsByName.set(lockedProject.name.toLowerCase().trim(), lockedProject)
    } else {
      // Pre-fetch all projects accessible in the same way as name-based import
      let projectsQuery = admin.from('projects').select('id, name, client_id')
      if (!ctx.isMasterAdmin && ctx.clientId) {
        projectsQuery = projectsQuery.eq('client_id', ctx.clientId)
      }
      const { data: projectRows } = await projectsQuery
      for (const p of projectRows || []) {
        projectsByName.set(String(p.name).toLowerCase().trim(), { id: p.id, name: p.name })
      }
      projectIds = [...new Set([...projectsByName.values()].map((p) => p.id))]
    }

    // Pre-fetch all modules for involved projects
    let modulesByProjectAndName = new Map<string, { id: string; project_id: string }>()
    if (projectIds.length > 0) {
      const { data: moduleRows } = await admin
        .from('modules')
        .select('id, name, project_id')
        .in('project_id', projectIds)
      for (const m of moduleRows || []) {
        const key = `${m.project_id}::${String(m.name).toLowerCase().trim()}`
        modulesByProjectAndName.set(key, { id: m.id, project_id: m.project_id })
      }
    }

    // Process each row
    const results: ImportResult[] = []
    const createdModules = new Map<string, string>() // key → module_id (for dedup within batch)

    for (const row of rows) {
      const result: ImportResult = {
        row: row.row,
        task_name: row.task_name,
        project_name: row.project_name || lockedProject?.name || '',
        module_name: row.module_name,
        status: 'error',
      }

      if (!row.module_name) {
        result.error = 'Module Name is required'
        results.push(result)
        continue
      }

      let project: { id: string; name: string } | null = null
      if (lockedProject) {
        project = lockedProject
      } else {
        if (!row.project_name) {
          result.error = 'Project Name is required when no project is selected on the upload form'
          results.push(result)
          continue
        }
        project = projectsByName.get(row.project_name.toLowerCase().trim()) || null
        if (!project) {
          result.error = `Project "${row.project_name}" not found`
          results.push(result)
          continue
        }
      }
      result.project_name = project.name

      // Resolve or create module
      const moduleKey = `${project.id}::${row.module_name.toLowerCase()}`
      let moduleId = modulesByProjectAndName.get(moduleKey)?.id || createdModules.get(moduleKey)

      if (!moduleId) {
        // Auto-create module under the project
        const { data: newMod, error: modErr } = await admin
          .from('modules')
          .insert({ name: row.module_name, project_id: project.id, status: 'active' })
          .select('id')
          .single()
        if (modErr || !newMod) {
          result.error = `Failed to create module "${row.module_name}": ${modErr?.message || 'unknown'}`
          results.push(result)
          continue
        }
        moduleId = newMod.id
        createdModules.set(moduleKey, moduleId)
        modulesByProjectAndName.set(moduleKey, { id: moduleId, project_id: project.id })
      }

      // Create task
      const taskBase = {
        title: row.task_name,
        description: row.description || null,
        module_id: moduleId,
        project_id: project.id,
        status: 'todo',
        created_by: ctx.userId,
      }

      // Try with estimation + dates, fall back on schema mismatches
      const payloads = [
        { ...taskBase, estimation: row.estimation, start_date: row.start_date, end_date: row.end_date },
        { ...taskBase, estimated_hours: row.estimation, start_date: row.start_date, end_date: row.end_date },
        { ...taskBase, start_date: row.start_date, end_date: row.end_date },
        { ...taskBase, estimation: row.estimation },
        { ...taskBase, estimated_hours: row.estimation },
        { ...taskBase },
      ]

      let created = false
      for (const payload of payloads) {
        const res = await admin.from('tasks').insert(payload).select('id')
        if (!res.error && res.data && res.data.length > 0) {
          result.status = 'created'
          result.task_id = res.data[0].id
          created = true
          break
        }
      }

      if (!created) {
        result.error = 'Failed to insert task (check DB schema)'
      }

      results.push(result)
    }

    const created = results.filter((r) => r.status === 'created').length
    const errors = results.filter((r) => r.status === 'error').length

    return NextResponse.json({
      summary: { total: results.length, created, errors },
      results,
    })
  } catch (err: any) {
    console.error('[bulk-upload] Error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

/** GET - download template */
export async function GET() {
  const headers = ['Project Name', 'Module Name', 'Task Name', 'Description', 'Estimation', 'Start Date', 'End Date']
  const sample = [
    ['My Project', 'Backend', 'Setup database', 'Create tables and indexes', 8, '2025-01-15', '2025-01-20'],
    ['My Project', 'Backend', 'Build REST API', 'CRUD endpoints', 16, '2025-01-20', '2025-01-30'],
    ['My Project', 'Frontend', 'Login page', 'Auth UI with validation', 12, '2025-01-15', '2025-01-25'],
  ]

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample])
  ws['!cols'] = [
    { wch: 20 }, { wch: 18 }, { wch: 30 }, { wch: 40 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Tasks')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="synkly-task-import-template.xlsx"',
    },
  })
}
