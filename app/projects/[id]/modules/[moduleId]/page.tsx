'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { SmartAssignModal } from '@/components/tasks/smart-assign-modal'
import { ArrowLeft, Plus, X, Pencil, User, Calendar, Clock, ListTodo, CheckCircle2, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hasPermission, isFullAccessRole, type RoleKey } from '@/lib/rbac'
import { normalizeTaskWorkflowStatus } from '@/lib/task-workflow-status'
import { sanitizeTaskDescriptionHtml } from '@/lib/sanitize-task-html'
import {
  fetchModuleFromUrlRef,
  fetchProjectFromUrlRef,
  moduleUrlSegment,
  projectHref,
} from '@/lib/slug'
import { hydrateTaskAssigneesClient } from '@/lib/hydrate-task-assignees-client'
import { TaskRichEditor } from '@/components/tasks/task-rich-editor'
import { TaskAttachmentGallery, type GalleryItem } from '@/components/tasks/task-attachment-gallery'

type ModuleRecord = {
  id: string
  project_id: string
  name: string
  description: string | null
  status: string
  estimated_hours: number | null
  is_active?: boolean
}

type TaskRecord = {
  id: string
  title: string
  status: string
  description?: string | null
  document_url?: string | null
  completed_at?: string | null
  assignee_id?: string | null
  assignee?: { full_name: string | null; email: string } | null
  estimation?: number | null
  estimated_hours?: number | null
  start_date?: string | null
  end_date?: string | null
  created_at?: string
  priority?: string | null
  task_type?: string | null
  due_date?: string | null
  sprint_id?: string | null
  project_id?: string | null
  carried_from_sprint_id?: string | null
}

const TASK_ATTACHMENT_ACCEPT = 'image/*,.pdf,application/pdf'

const TASK_CARD_ACCENTS = [
  'from-primary/80 via-primary/35 to-transparent',
  'from-cyan-500/65 via-cyan-400/22 to-transparent',
  'from-violet-500/65 via-violet-400/22 to-transparent',
  'from-emerald-500/65 via-emerald-400/22 to-transparent',
  'from-amber-500/60 via-amber-400/20 to-transparent',
  'from-rose-500/55 via-rose-400/18 to-transparent',
]

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

const priorityColors: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-destructive',
  medium: 'bg-accent',
  low: 'bg-green-500',
}

const taskTypeIcons: Record<string, string> = {
  task: 'T',
  bug: 'B',
  feature: 'F',
  improvement: 'I',
  epic: 'E',
  story: 'S',
}

function ModuleTaskListRow({
  task,
  accentClass,
  isSelected,
  canAssignTask,
  onSelect,
  onStatusChange,
  onAssign,
}: {
  task: TaskRecord
  accentClass: string
  isSelected: boolean
  canAssignTask: boolean
  onSelect: (task: TaskRecord) => void
  onStatusChange: (taskId: string, status: string) => void
  onAssign: (task: TaskRecord) => void
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onSelect(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(task)
        }
      }}
      className={cn(
        'relative cursor-pointer overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all',
        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border/80 hover:border-primary/30',
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r', accentClass)} aria-hidden />
      <div className="p-3 pl-3.5">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white',
              task.task_type === 'bug'
                ? 'bg-destructive'
                : task.task_type === 'feature'
                  ? 'bg-green-500'
                  : task.task_type === 'epic'
                    ? 'bg-purple-500'
                    : 'bg-primary',
            )}
          >
            {taskTypeIcons[task.task_type || 'task'] || 'T'}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{task.title}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="capitalize text-foreground/90">
                {normalizeTaskWorkflowStatus(task.status).replace(/_/g, ' ')}
              </span>
              {task.priority ? (
                <span className="inline-flex items-center gap-1">
                  <span className={cn('h-1.5 w-1.5 rounded-full', priorityColors[task.priority] || 'bg-muted')} />
                  <span className="capitalize">{task.priority}</span>
                </span>
              ) : null}
              {task.assignee ? (
                <span className="truncate">
                  {(task.assignee.full_name || task.assignee.email)?.split(' ')[0]}
                </span>
              ) : (
                <span className="text-amber-700/90 dark:text-amber-400/90">Unassigned</span>
              )}
            </div>
            <div
              className="mt-2 flex flex-wrap gap-2 border-t border-border/50 pt-2"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <select
                value={normalizeTaskWorkflowStatus(task.status)}
                onChange={(e) => onStatusChange(task.id, e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="in_review">In Review</option>
                <option value="done">Done</option>
              </select>
              {canAssignTask ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  onClick={() => onAssign(task)}
                >
                  Assign
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

function isAllowedTaskAttachmentFile(file: File): boolean {
  const t = (file.type || '').toLowerCase()
  if (t.startsWith('image/')) return true
  if (t === 'application/pdf') return true
  const lower = file.name.toLowerCase()
  return lower.endsWith('.pdf')
}

export default function ProjectModuleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const projectIdParam = params.id
  const moduleIdParam = params.moduleId
  const projectRef = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam
  const moduleRef = Array.isArray(moduleIdParam) ? moduleIdParam[0] : moduleIdParam

  const [projectNav, setProjectNav] = useState<{ id: string; name: string | null } | null>(null)
  const [projectSummaries, setProjectSummaries] = useState<{ id: string; name: string | null }[]>([])

  const [loading, setLoading] = useState(true)
  const [module, setModule] = useState<ModuleRecord | null>(null)
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [sprints, setSprints] = useState<{ id: string; name: string }[]>([])
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
  const [showEditTaskModal, setShowEditTaskModal] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)
  const [editingTask, setEditingTask] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [showNewSprintInput, setShowNewSprintInput] = useState(false)
  const [newSprintName, setNewSprintName] = useState('')
  const [creatingSprint, setCreatingSprint] = useState(false)
  const [createDraftId, setCreateDraftId] = useState<string | null>(null)
  const [createStagedAttachments, setCreateStagedAttachments] = useState<GalleryItem[]>([])
  const [newLink, setNewLink] = useState('')
  const [editAttachmentList, setEditAttachmentList] = useState<GalleryItem[]>([])
  const [editNewLink, setEditNewLink] = useState('')
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    document_url: '',
    sprint_id: '',
    assignee_id: '',
    estimation: '',
    start_date: '',
    end_date: '',
  })
  const [editTask, setEditTask] = useState({
    title: '',
    description: '',
    document_url: '',
    sprint_id: '',
    assignee_id: '',
    estimation: '',
    start_date: '',
    end_date: '',
    status: 'todo',
  })
  const [userRole, setUserRole] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedTaskForAssign, setSelectedTaskForAssign] = useState<TaskRecord | null>(null)

  useEffect(() => {
    async function load() {
      if (!projectRef || !moduleRef) {
        return
      }

      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        router.push('/auth/login')
        return
      }

      const meRes = await fetch('/api/me')
      if (meRes.ok) {
        const me = await meRes.json()
        setUserRole(me.role ?? null)
      }

      const { data: summaryRows } = await supabase.from('projects').select('id, name')
      const summaries = summaryRows || []
      setProjectSummaries(summaries)

      const projectRow = await fetchProjectFromUrlRef(supabase, projectRef)
      if (!projectRow) {
        router.push('/projects')
        return
      }
      setProjectNav(projectRow)

      const moduleStub = await fetchModuleFromUrlRef(supabase, projectRow.id, moduleRef)
      if (!moduleStub) {
        router.push(projectHref(projectRow, summaries))
        return
      }

      const { data: modulesInProject } = await supabase
        .from('modules')
        .select('id, name')
        .eq('project_id', projectRow.id)

      const moduleList = modulesInProject || []
      const canonicalModSeg = moduleUrlSegment(moduleStub, moduleList)
      if (decodeURIComponent(moduleRef).trim() !== canonicalModSeg) {
        router.replace(`${projectHref(projectRow, summaries)}/modules/${encodeURIComponent(canonicalModSeg)}`)
      }

      const moduleRes = await supabase
        .from('modules')
        .select('*')
        .eq('id', moduleStub.id)
        .eq('project_id', projectRow.id)
        .maybeSingle()

      let moduleData = moduleRes.data
        ? ({
            id: moduleRes.data.id,
            project_id: moduleRes.data.project_id,
            name: moduleRes.data.name || 'Untitled Module',
            description: moduleRes.data.description ?? null,
            status: moduleRes.data.status || 'active',
            estimated_hours: Number(moduleRes.data.estimated_hours ?? 0),
            is_active: moduleRes.data.is_active ?? true,
          } as ModuleRecord)
        : null
      if (moduleRes.error) {
        const legacy = await supabase
          .from('modules')
          .select('id, project_id, name, description, status, estimated_hours')
          .eq('id', moduleStub.id)
          .eq('project_id', projectRow.id)
          .maybeSingle()

        if (legacy.data) {
          moduleData = { ...legacy.data, is_active: true } as ModuleRecord
        } else {
          const minimal = await supabase
            .from('modules')
            .select('id, project_id, name, description')
            .eq('id', moduleStub.id)
            .eq('project_id', projectRow.id)
            .maybeSingle()

          moduleData = minimal.data
            ? ({
                ...minimal.data,
                status: 'active',
                estimated_hours: 0,
                is_active: true,
              } as ModuleRecord)
            : null
        }
      }

      if (!moduleData) {
        router.push(projectHref(projectRow, summaries))
        return
      }

      const tasksRes = await supabase
        .from('tasks')
        .select('*')
        .eq('module_id', moduleData.id)
        .order('created_at', { ascending: false })

      const [sprintsRes, assignableRes] = await Promise.all([
        fetch(`/api/sprints?project_id=${moduleData.project_id}`),
        fetch(`/api/team/assignable-users?project_id=${encodeURIComponent(moduleData.project_id)}&all=true`),
      ])

      setModule(moduleData)
      let members: { id: string; full_name: string | null; email: string }[] = []
      if (assignableRes.ok) {
        try {
          const uj = await assignableRes.json()
          members = (uj.users || []).map((u: any) => ({
            id: u.id,
            full_name: u.full_name ?? null,
            email: u.email ?? '',
          }))
        } catch {
          members = []
        }
      } else {
        let errBody: string | undefined
        try {
          const j = await assignableRes.json()
          errBody = j?.error || assignableRes.statusText
        } catch {
          errBody = assignableRes.statusText
        }
        console.warn('[module] assignable-users failed:', assignableRes.status, errBody)
      }
      const taskRows = (tasksRes.data || []) as Record<string, unknown>[]
      const hydratedTasks = await hydrateTaskAssigneesClient(supabase, taskRows, members)
      setTasks(hydratedTasks as TaskRecord[])
      let sprintJson: { sprints?: any[]; error?: string } = { sprints: [] }
      try {
        sprintJson = await sprintsRes.json()
      } catch {
        sprintJson = {}
      }
      if (!sprintsRes.ok) {
        console.warn('[module] /api/sprints failed:', sprintsRes.status, sprintJson?.error || sprintJson)
      }
      setSprints(
        (sprintJson.sprints || []).map((s: any) => ({
          id: s.id,
          name: String(s.name ?? s.sprint_name ?? 'Sprint').trim() || 'Sprint',
        })),
      )
      setTeamMembers(members)
      setLoading(false)
    }

    load()
  }, [moduleRef, projectRef, router, supabase])

  useEffect(() => {
    setSelectedTask((prev) => {
      if (tasks.length === 0) return null
      if (prev) {
        const next = tasks.find((t) => t.id === prev.id)
        return next ?? tasks[0] ?? null
      }
      return tasks[0] ?? null
    })
  }, [tasks])

  if (loading) {
    return (
      <DashboardLayout title="Module Details">
        <div className="p-6 text-muted-foreground">Loading module...</div>
      </DashboardLayout>
    )
  }

  if (!module) return null

  const role = userRole as RoleKey | null
  const canAssignTask = !!role && (isFullAccessRole(role) || hasPermission(role, 'ASSIGN_TASK'))

  const handleTaskStatusChange = async (taskId: string, newStatus: string) => {
    const current = tasks.find((t) => t.id === taskId)
    const canonical = normalizeTaskWorkflowStatus(newStatus)
    if (!current || normalizeTaskWorkflowStatus(current.status) === canonical) return

    const previousStatus = current.status
    const previousCompletedAt = current.completed_at
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: canonical,
              completed_at: canonical === 'done' ? new Date().toISOString() : null,
            }
          : task,
      ),
    )
    setSelectedTask((prev) =>
      prev?.id === taskId
        ? {
            ...prev,
            status: canonical,
            completed_at: canonical === 'done' ? new Date().toISOString() : null,
          }
        : prev,
    )

    try {
      const statusRes = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, status: canonical }),
      })
      const statusJson = await statusRes.json()
      if (!statusRes.ok) throw new Error(statusJson.error || 'Failed to update task')
      if (statusJson.task) {
        const patch = statusJson.task as Partial<TaskRecord>
        setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, ...patch } : task)))
        setSelectedTask((prev) => (prev?.id === taskId ? { ...prev, ...patch } : prev))
      }
    } catch (e: unknown) {
      console.error(e)
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId ? { ...task, status: previousStatus, completed_at: previousCompletedAt } : task,
        ),
      )
      setSelectedTask((prev) =>
        prev?.id === taskId ? { ...prev, status: previousStatus, completed_at: previousCompletedAt } : prev,
      )
      alert('Error updating task: ' + (e instanceof Error ? e.message : 'Unknown error'))
    }
  }

  async function uploadAttachmentFile(
    file: File,
    entityType: 'task_draft' | 'task',
    entityId: string,
  ): Promise<GalleryItem & { id: string }> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('entity_type', entityType)
    formData.append('entity_id', entityId)
    const res = await fetch('/api/attachments', { method: 'POST', body: formData })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error || 'Upload failed')
    const a = j.attachment
    return {
      id: a.id,
      url: a.url ?? null,
      file_name: a.file_name ?? null,
      file_type: a.file_type ?? null,
    }
  }

  async function postLinkAttachment(entityType: 'task_draft' | 'task', entityId: string, url: string) {
    const res = await fetch('/api/attachments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, url }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error || 'Failed to save link')
    const a = j.attachment
    return {
      id: a.id as string,
      url: (a.url as string | null) ?? url,
      file_name: (a.file_name as string | null) ?? url,
      file_type: (a.file_type as string | null) ?? 'link',
    } as GalleryItem & { id: string }
  }

  const removeAttachmentById = async (id: string) => {
    await fetch(`/api/attachments?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  const openCreateTaskModal = () => {
    setCreateDraftId(crypto.randomUUID())
    setCreateStagedAttachments([])
    setNewLink('')
    setNewTask({
      title: '',
      description: '',
      document_url: '',
      sprint_id: '',
      assignee_id: '',
      estimation: '',
      start_date: '',
      end_date: '',
    })
    setShowCreateTaskModal(true)
  }

  const closeCreateTaskModal = () => {
    setShowCreateTaskModal(false)
    setCreateDraftId(null)
    setCreateStagedAttachments([])
    setNewLink('')
  }

  const uploadEditorImageCreate = async (file: File): Promise<string | null> => {
    if (!createDraftId) return null
    try {
      const att = await uploadAttachmentFile(file, 'task_draft', createDraftId)
      setCreateStagedAttachments((prev) => [...prev, att])
      return att.url
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Image upload failed')
      return null
    }
  }

  const uploadEditorImageEdit = async (file: File): Promise<string | null> => {
    if (!editingTaskId) return null
    try {
      const att = await uploadAttachmentFile(file, 'task', editingTaskId)
      setEditAttachmentList((prev) => [...prev, att])
      return att.url
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Image upload failed')
      return null
    }
  }

  const fetchTasks = async () => {
    if (!module?.id) return
    const tasksRes = await supabase
      .from('tasks')
      .select('*')
      .eq('module_id', module.id)
      .order('created_at', { ascending: false })
    const rows = (tasksRes.data || []) as Record<string, unknown>[]
    const hydrated = await hydrateTaskAssigneesClient(supabase, rows, teamMembers)
    setTasks(hydrated as TaskRecord[])
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTask.title.trim() || !module) return
    setCreatingTask(true)
    try {
      const docFromField = newTask.document_url.trim() || null
      const descRaw = (newTask.description || '').trim()
      const descriptionHtml =
        !descRaw || descRaw === '<p></p>' || descRaw === '<p><br></p>' ? null : newTask.description
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTask.title.trim(),
          description: descriptionHtml,
          module_id: module.id,
          project_id: module.project_id,
          sprint_id: newTask.sprint_id || null,
          assignee_id: newTask.assignee_id || null,
          estimation: newTask.estimation ? Number(newTask.estimation) : 0,
          start_date: newTask.start_date || null,
          end_date: newTask.end_date || null,
          status: 'todo',
          ...(docFromField ? { document_url: docFromField } : {}),
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to create task')
      }

      const taskId = result.task?.id as string | undefined
      if (taskId && createDraftId) {
        await fetch('/api/attachments/reassign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft_entity_id: createDraftId, task_id: taskId }),
        })
      }
      const stagedFirstUrl = createStagedAttachments.find((a) => a.url)?.url ?? null
      if (taskId && !docFromField && stagedFirstUrl) {
        await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_url: stagedFirstUrl }),
        })
      }
      await fetchTasks()
      setShowCreateTaskModal(false)
      setCreateDraftId(null)
      setCreateStagedAttachments([])
      setNewLink('')
      setNewTask({
        title: '',
        description: '',
        document_url: '',
        sprint_id: '',
        assignee_id: '',
        estimation: '',
        start_date: '',
        end_date: '',
      })
    } catch (err: any) {
      alert(`Error creating task: ${err.message}`)
    } finally {
      setCreatingTask(false)
    }
  }

  const handleCreateSprint = async () => {
    if (!newSprintName.trim() || !module) return
    setCreatingSprint(true)
    try {
      const res = await fetch('/api/sprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSprintName.trim(),
          project_id: module.project_id,
          status: 'active',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create sprint')
      const sprint = data.sprint
      const newSprint = { id: sprint.id, name: sprint.name || newSprintName.trim() }
      setSprints((prev) => [...prev, newSprint])
      setNewTask((prev) => ({ ...prev, sprint_id: sprint.id }))
      setNewSprintName('')
      setShowNewSprintInput(false)
    } catch (err: any) {
      alert('Error creating sprint: ' + err.message)
    } finally {
      setCreatingSprint(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Array.from(e.target.files || [])
    const files = raw.filter(isAllowedTaskAttachmentFile)
    const dropped = raw.length - files.length
    if (dropped > 0) {
      alert('Only images and PDF files are allowed.')
    }
    if (!createDraftId) {
      alert('Draft not ready — close and reopen Create Task.')
      e.target.value = ''
      return
    }
    for (const file of files) {
      try {
        const att = await uploadAttachmentFile(file, 'task_draft', createDraftId)
        setCreateStagedAttachments((prev) => [...prev, att])
      } catch (err: any) {
        alert(err.message || 'Upload failed')
      }
    }
    e.target.value = ''
  }

  const handleEditFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Array.from(e.target.files || [])
    const files = raw.filter(isAllowedTaskAttachmentFile)
    const dropped = raw.length - files.length
    if (dropped > 0) {
      alert('Only images and PDF files are allowed.')
    }
    const tid = editingTaskId
    if (!tid) {
      e.target.value = ''
      return
    }
    for (const file of files) {
      try {
        const att = await uploadAttachmentFile(file, 'task', tid)
        setEditAttachmentList((prev) => [...prev, att])
      } catch (err: any) {
        alert(err.message || 'Upload failed')
      }
    }
    e.target.value = ''
  }

  const handleAddCreateLink = async () => {
    const url = newLink.trim()
    if (!url || !createDraftId) return
    try {
      const att = await postLinkAttachment('task_draft', createDraftId, url)
      setCreateStagedAttachments((prev) => [...prev, att])
      setNewLink('')
    } catch (err: any) {
      alert(err.message || 'Failed to add link')
    }
  }

  const handleAddEditLink = async () => {
    const url = editNewLink.trim()
    if (!url || !editingTaskId) return
    try {
      const att = await postLinkAttachment('task', editingTaskId, url)
      setEditAttachmentList((prev) => [...prev, att])
      setEditNewLink('')
    } catch (err: any) {
      alert(err.message || 'Failed to add link')
    }
  }

  const openEditTaskModal = async (task: TaskRecord) => {
    setEditingTaskId(task.id)
    setEditTask({
      title: task.title || '',
      description: task.description || '',
      document_url: task.document_url || '',
      sprint_id: (task as { sprint_id?: string }).sprint_id || '',
      assignee_id: task.assignee_id || '',
      estimation: String(task.estimation ?? task.estimated_hours ?? ''),
      start_date: task.start_date || '',
      end_date: task.end_date || '',
      status: task.status || 'todo',
    })
    setEditNewLink('')
    let list: GalleryItem[] = []
    try {
      const r = await fetch(`/api/attachments?entity_type=task&entity_id=${encodeURIComponent(task.id)}`)
      const j = await r.json()
      list = (j.attachments || []).map((a: unknown) => {
        const row = a as GalleryItem & { id: string }
        return {
          id: row.id,
          url: row.url ?? null,
          file_name: row.file_name ?? null,
          file_type: row.file_type ?? null,
        }
      })
    } catch {
      list = []
    }
    setEditAttachmentList(list)
    setShowEditTaskModal(true)
  }

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTaskId || !editTask.title.trim()) return
    setEditingTask(true)
    try {
      const editDescRaw = (editTask.description || '').trim()
      const editDescriptionHtml =
        !editDescRaw || editDescRaw === '<p></p>' || editDescRaw === '<p><br></p>'
          ? null
          : editTask.description
      const response = await fetch(`/api/tasks/${editingTaskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTask.title.trim(),
          description: editDescriptionHtml,
          document_url: editTask.document_url.trim() || null,
          sprint_id: editTask.sprint_id || null,
          assignee_id: editTask.assignee_id || null,
          estimation: editTask.estimation ? Number(editTask.estimation) : 0,
          start_date: editTask.start_date || null,
          end_date: editTask.end_date || null,
          status: editTask.status || 'todo',
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || 'Failed to update task')

      const docField = editTask.document_url.trim()
      const stagedFirst = editAttachmentList.find((a) => a.url)?.url ?? null
      if (editingTaskId && !docField && stagedFirst) {
        await fetch(`/api/tasks/${editingTaskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_url: stagedFirst }),
        })
      }

      await fetchTasks()
      setShowEditTaskModal(false)
      setEditingTaskId(null)
    } catch (err: any) {
      alert(`Error updating task: ${err.message}`)
    } finally {
      setEditingTask(false)
    }
  }

  return (
    <DashboardLayout
      title={module.name}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openCreateTaskModal}>
            <Plus className="w-4 h-4 mr-2" />
            Create Task
          </Button>
          <Link href={projectNav ? projectHref(projectNav, projectSummaries) : '/projects'}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Project
            </Button>
          </Link>
        </div>
      }
    >
      <p className="mb-6 text-xs text-muted-foreground">
        Module status: <span className="text-foreground">{module.status.replace(/_/g, ' ')}</span>
        {module.description ? (
          <>
            <span className="mx-2 text-border">·</span>
            {module.description}
          </>
        ) : null}
      </p>

      <div className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tasks</h2>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No tasks in this module yet. Create one to get started.
        </p>
      ) : (
        <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[2fr_3fr] lg:items-start">
          <div
            className={cn(
              'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/50 shadow-sm',
              'h-[min(75vh,680px)] max-h-[min(75vh,680px)]',
            )}
          >
            <div className="shrink-0 border-b border-border/60 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Task list ({tasks.length})
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain px-2 py-3">
              {tasks.map((task, i) => (
                <ModuleTaskListRow
                  key={task.id}
                  task={task}
                  accentClass={TASK_CARD_ACCENTS[i % TASK_CARD_ACCENTS.length]}
                  isSelected={selectedTask?.id === task.id}
                  canAssignTask={canAssignTask}
                  onSelect={setSelectedTask}
                  onStatusChange={handleTaskStatusChange}
                  onAssign={(t) => {
                    setSelectedTaskForAssign(t)
                    setShowAssignModal(true)
                  }}
                />
              ))}
            </div>
          </div>

          <div className="min-h-0 lg:sticky lg:top-4">
            {selectedTask ? (
              <div className="flex h-[min(75vh,680px)] max-h-[min(75vh,680px)] min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="shrink-0 border-b border-border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold leading-snug text-foreground">{selectedTask.title}</h3>
                    <div className="flex shrink-0 items-center gap-2">
                      {canAssignTask ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => {
                            setSelectedTaskForAssign(selectedTask)
                            setShowAssignModal(true)
                          }}
                        >
                          Assign
                        </Button>
                      ) : null}
                      <Button type="button" size="sm" variant="outline" onClick={() => void openEditTaskModal(selectedTask)} title="Edit task">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 text-sm">
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground">Description</p>
                    {selectedTask.description ? (
                      <div
                        className="mt-1 max-w-none overflow-x-auto text-foreground [&_img]:max-w-full [&_img]:h-auto [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeTaskDescriptionHtml(selectedTask.description),
                        }}
                      />
                    ) : (
                      <p className="mt-1 text-muted-foreground">No description</p>
                    )}
                  </div>
                  <div className="mb-4">
                    <label htmlFor="module-task-status" className="text-xs text-muted-foreground">
                      Status
                    </label>
                    <select
                      id="module-task-status"
                      value={normalizeTaskWorkflowStatus(selectedTask.status)}
                      onChange={(e) => handleTaskStatusChange(selectedTask.id, e.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="in_review">In Review</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                  <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex gap-2 rounded-lg bg-muted/30 p-3 ring-1 ring-border/50">
                      <Layers className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Module</dt>
                        <dd className="text-sm font-medium text-foreground">{module.name}</dd>
                      </div>
                    </div>
                    <div className="flex gap-2 rounded-lg bg-muted/30 p-3 ring-1 ring-border/50">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Priority</dt>
                        <dd className="text-sm font-medium capitalize text-foreground">{selectedTask.priority || '—'}</dd>
                      </div>
                    </div>
                    <div className="flex gap-2 rounded-lg bg-muted/30 p-3 ring-1 ring-border/50">
                      <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Assignee</dt>
                        <dd className="text-sm font-medium text-foreground">
                          {selectedTask.assignee
                            ? selectedTask.assignee.full_name || selectedTask.assignee.email
                            : '—'}
                        </dd>
                      </div>
                    </div>
                    <div className="flex gap-2 rounded-lg bg-muted/30 p-3 ring-1 ring-border/50">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Estimate (h)</dt>
                        <dd className="text-sm font-medium tabular-nums text-foreground">
                          {selectedTask.estimation ?? selectedTask.estimated_hours ?? '—'}
                        </dd>
                      </div>
                    </div>
                    <div className="flex gap-2 rounded-lg bg-muted/30 p-3 ring-1 ring-border/50">
                      <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Start</dt>
                        <dd className="text-sm font-medium text-foreground">{fmtDate(selectedTask.start_date)}</dd>
                      </div>
                    </div>
                    <div className="flex gap-2 rounded-lg bg-muted/30 p-3 ring-1 ring-border/50">
                      <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Target end</dt>
                        <dd className="text-sm font-medium text-foreground">{fmtDate(selectedTask.end_date)}</dd>
                      </div>
                    </div>
                    <div className="flex gap-2 rounded-lg bg-muted/30 p-3 ring-1 ring-border/50">
                      <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Due</dt>
                        <dd className="text-sm font-medium text-foreground">{fmtDate(selectedTask.due_date)}</dd>
                      </div>
                    </div>
                    <div className="flex gap-2 rounded-lg bg-muted/30 p-3 ring-1 ring-border/50">
                      <ListTodo className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Created</dt>
                        <dd className="text-sm font-medium text-foreground">{fmtDateTime(selectedTask.created_at)}</dd>
                      </div>
                    </div>
                    {selectedTask.completed_at ? (
                      <div className="flex gap-2 rounded-lg bg-muted/30 p-3 ring-1 ring-border/50 sm:col-span-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                        <div>
                          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Completed</dt>
                          <dd className="text-sm font-medium text-foreground">{fmtDateTime(selectedTask.completed_at)}</dd>
                        </div>
                      </div>
                    ) : null}
                  </dl>
                  {selectedTask.document_url ? (
                    <p className="mt-4 text-xs">
                      <span className="text-muted-foreground">Document: </span>
                      <a
                        href={selectedTask.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary underline"
                      >
                        Open link
                      </a>
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex h-[min(75vh,680px)] max-h-[min(75vh,680px)] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 text-center text-sm text-muted-foreground">
                Select a task to view details
              </div>
            )}
          </div>
        </div>
      )}

      {showAssignModal && selectedTaskForAssign ? (
        <SmartAssignModal
          task={{
            id: selectedTaskForAssign.id,
            title: selectedTaskForAssign.title,
            estimated_hours: selectedTaskForAssign.estimated_hours,
            project_id: selectedTaskForAssign.project_id ?? module.project_id,
            sprint_id: selectedTaskForAssign.sprint_id,
          }}
          onClose={() => {
            setShowAssignModal(false)
            setSelectedTaskForAssign(null)
          }}
          onAssign={async (employeeId, estimatedHours, sprintId, targetEndDate) => {
            try {
              const task_id = String(selectedTaskForAssign.id ?? '').trim()
              if (!task_id) {
                throw new Error('Task ID is missing — refresh the page and try again.')
              }
              const response = await fetch('/api/tasks/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  task_id,
                  assignee_id: employeeId,
                  estimated_hours: estimatedHours,
                  sprint_id: sprintId,
                  month: new Date().toISOString().slice(0, 7),
                  ...(targetEndDate ? { end_date: targetEndDate } : {}),
                }),
              })
              const result = await response.json()
              if (!response.ok) throw new Error(result.error || 'Failed to assign task')
              const updatedTask = result.task as TaskRecord
              const assignee = teamMembers.find((m) => m.id === employeeId)
              setTasks((prevTasks) =>
                prevTasks.map((task) =>
                  task.id === selectedTaskForAssign.id
                    ? {
                        ...task,
                        assignee_id: employeeId,
                        assignee: assignee ? { full_name: assignee.full_name, email: assignee.email } : null,
                        estimated_hours: updatedTask?.estimated_hours ?? estimatedHours,
                        sprint_id: updatedTask?.sprint_id ?? null,
                        end_date: updatedTask?.end_date ?? task.end_date ?? null,
                        carried_from_sprint_id: updatedTask?.carried_from_sprint_id ?? task.carried_from_sprint_id,
                      }
                    : task,
                ),
              )
              setSelectedTask((prev) =>
                prev?.id === selectedTaskForAssign.id
                  ? {
                      ...prev,
                      assignee_id: employeeId,
                      assignee: assignee ? { full_name: assignee.full_name, email: assignee.email } : null,
                      estimated_hours: updatedTask?.estimated_hours ?? estimatedHours,
                      sprint_id: updatedTask?.sprint_id ?? null,
                      end_date: updatedTask?.end_date ?? prev.end_date ?? null,
                      carried_from_sprint_id: updatedTask?.carried_from_sprint_id ?? prev.carried_from_sprint_id,
                    }
                  : prev,
              )
              if (result.sprintAssignmentSkipped) {
                alert(
                  'Task was assigned successfully, but sprint assignments may be limited until migrations are applied.',
                )
              }
              setShowAssignModal(false)
              setSelectedTaskForAssign(null)
            } catch (err) {
              console.error(err)
              throw err
            }
          }}
        />
      ) : null}

      {showCreateTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="flex max-h-[min(90vh,calc(100vh-2rem))] w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-card p-6">
              <h3 className="text-lg font-semibold">Create Task</h3>
              <button
                type="button"
                onClick={closeCreateTaskModal}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm mb-2">Task Name *</label>
                  <input
                    required
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm mb-2">Description</label>
                  {createDraftId ? (
                    <TaskRichEditor
                      key={createDraftId}
                      content={newTask.description}
                      onChange={(html) => setNewTask({ ...newTask, description: html })}
                      uploadImage={uploadEditorImageCreate}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">Preparing editor…</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm mb-2">Sprint</label>
                  {showNewSprintInput ? (
                    <div className="flex gap-2">
                      <input
                        value={newSprintName}
                        onChange={(e) => setNewSprintName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreateSprint())}
                        placeholder="Sprint name..."
                        className="flex-1 px-4 py-2 border border-input rounded-lg bg-background text-sm"
                        autoFocus
                      />
                      <Button type="button" size="sm" onClick={handleCreateSprint} disabled={creatingSprint || !newSprintName.trim()}>
                        {creatingSprint ? '...' : 'Add'}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setShowNewSprintInput(false)}>
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        value={newTask.sprint_id}
                        onChange={(e) => setNewTask({ ...newTask, sprint_id: e.target.value })}
                        className="flex-1 px-4 py-2 border border-input rounded-lg bg-background"
                      >
                        <option value="">{sprints.length === 0 ? 'No sprints yet' : 'Select sprint (optional)'}</option>
                        {sprints.map((sprint) => (
                          <option key={sprint.id} value={sprint.id}>{sprint.name}</option>
                        ))}
                      </select>
                      <Button type="button" size="sm" variant="outline" onClick={() => setShowNewSprintInput(true)} title="Create new sprint">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm mb-2">Assignee</label>
                  <select
                    value={newTask.assignee_id}
                    onChange={(e) => setNewTask({ ...newTask, assignee_id: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>{member.full_name || member.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-2">Estimation</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={newTask.estimation}
                    onChange={(e) => setNewTask({ ...newTask, estimation: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2">Start Date</label>
                  <input
                    type="date"
                    value={newTask.start_date}
                    onChange={(e) => setNewTask({ ...newTask, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2">End Date</label>
                  <input
                    type="date"
                    value={newTask.end_date}
                    onChange={(e) => setNewTask({ ...newTask, end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm mb-2">Document or reference URL</label>
                  <input
                    type="url"
                    value={newTask.document_url}
                    onChange={(e) => setNewTask({ ...newTask, document_url: e.target.value })}
                    placeholder="https://…"
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Optional. You can also add images or PDFs and links below; the first successful upload or link is stored on the task when the field is empty.
                  </p>
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="block text-sm mb-1">Attachments (images or PDF)</label>
                  <p className="text-xs text-muted-foreground">
                    Files upload immediately. Thumbnails open a preview; use Download in the preview or below.
                  </p>
                  <TaskAttachmentGallery
                    items={createStagedAttachments}
                    onRemove={async (id) => {
                      await removeAttachmentById(id)
                      setCreateStagedAttachments((prev) => prev.filter((a) => a.id !== id))
                    }}
                  />
                  <input
                    type="file"
                    accept={TASK_ATTACHMENT_ACCEPT}
                    multiple
                    onChange={handleFileSelect}
                    className="block w-full text-sm text-muted-foreground file:mr-2 file:rounded file:border file:bg-background file:px-2 file:py-1"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="block text-sm mb-1">Extra links (saved as attachments)</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={newLink}
                      onChange={(e) => setNewLink(e.target.value)}
                      placeholder="https://…"
                      className="flex-1 px-4 py-2 border border-input rounded-lg bg-background"
                    />
                    <Button type="button" size="sm" variant="outline" onClick={handleAddCreateLink}>
                      Add
                    </Button>
                  </div>
                </div>
              </div>
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-card px-6 py-4">
                <Button type="button" variant="outline" onClick={closeCreateTaskModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creatingTask || !newTask.title.trim()}>
                  {creatingTask ? 'Creating...' : 'Create Task'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showEditTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="flex max-h-[min(90vh,calc(100vh-2rem))] w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-card p-6">
              <h3 className="text-lg font-semibold">Edit Task</h3>
              <button
                type="button"
                onClick={() => {
                  setShowEditTaskModal(false)
                  setEditAttachmentList([])
                  setEditNewLink('')
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateTask} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm mb-2">Task Name *</label>
                  <input
                    required
                    value={editTask.title}
                    onChange={(e) => setEditTask({ ...editTask, title: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm mb-2">Description</label>
                  {editingTaskId ? (
                    <TaskRichEditor
                      key={editingTaskId}
                      content={editTask.description}
                      onChange={(html) => setEditTask({ ...editTask, description: html })}
                      uploadImage={uploadEditorImageEdit}
                    />
                  ) : null}
                </div>
                <div>
                  <label className="block text-sm mb-2">Sprint</label>
                  <select
                    value={editTask.sprint_id}
                    onChange={(e) => setEditTask({ ...editTask, sprint_id: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  >
                    <option value="">No sprint</option>
                    {sprints.map((sprint) => (
                      <option key={sprint.id} value={sprint.id}>{sprint.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-2">Assignee</label>
                  <select
                    value={editTask.assignee_id}
                    onChange={(e) => setEditTask({ ...editTask, assignee_id: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>{member.full_name || member.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-2">Status</label>
                  <select
                    value={editTask.status}
                    onChange={(e) => setEditTask({ ...editTask, status: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="in_review">In Review</option>
                    <option value="done">Done</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-2">Estimation</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editTask.estimation}
                    onChange={(e) => setEditTask({ ...editTask, estimation: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2">Start Date</label>
                  <input
                    type="date"
                    value={editTask.start_date}
                    onChange={(e) => setEditTask({ ...editTask, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2">End Date</label>
                  <input
                    type="date"
                    value={editTask.end_date}
                    onChange={(e) => setEditTask({ ...editTask, end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Target date set by assigner / planner.</p>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm mb-2">Document or reference URL</label>
                  <input
                    type="url"
                    value={editTask.document_url}
                    onChange={(e) => setEditTask({ ...editTask, document_url: e.target.value })}
                    placeholder="https://…"
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="block text-sm mb-1">Attachments (images or PDF)</label>
                  <TaskAttachmentGallery
                    items={editAttachmentList}
                    onRemove={async (id) => {
                      await removeAttachmentById(id)
                      setEditAttachmentList((prev) => prev.filter((a) => a.id !== id))
                    }}
                  />
                  <input
                    type="file"
                    accept={TASK_ATTACHMENT_ACCEPT}
                    multiple
                    onChange={handleEditFileSelect}
                    className="block w-full text-sm text-muted-foreground file:mr-2 file:rounded file:border file:bg-background file:px-2 file:py-1"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="block text-sm mb-1">Add links</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={editNewLink}
                      onChange={(e) => setEditNewLink(e.target.value)}
                      placeholder="https://…"
                      className="flex-1 px-4 py-2 border border-input rounded-lg bg-background"
                    />
                    <Button type="button" size="sm" variant="outline" onClick={handleAddEditLink}>
                      Add
                    </Button>
                  </div>
                </div>
              </div>
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-card px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowEditTaskModal(false)
                    setEditAttachmentList([])
                    setEditNewLink('')
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={editingTask || !editTask.title.trim()}>
                  {editingTask ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
