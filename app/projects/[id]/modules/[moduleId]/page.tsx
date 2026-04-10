'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Plus, X, Pencil } from 'lucide-react'
import {
  fetchModuleFromUrlRef,
  fetchProjectFromUrlRef,
  moduleUrlSegment,
  projectHref,
} from '@/lib/slug'

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
}

const TASK_ATTACHMENT_ACCEPT = 'image/*,.pdf,application/pdf'

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
  const [taskAttachments, setTaskAttachments] = useState<File[]>([])
  const [taskLinks, setTaskLinks] = useState<string[]>([])
  const [newLink, setNewLink] = useState('')
  const [editTaskAttachments, setEditTaskAttachments] = useState<File[]>([])
  const [editTaskLinks, setEditTaskLinks] = useState<string[]>([])
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
      setTasks(((tasksRes.data || []) as any[]).map((task) => ({
        ...task,
        assignee: null,
      })))
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
      }
      setTeamMembers(members)
      setLoading(false)
    }

    load()
  }, [moduleRef, projectRef, router, supabase])

  if (loading) {
    return (
      <DashboardLayout title="Module Details">
        <div className="p-6 text-muted-foreground">Loading module...</div>
      </DashboardLayout>
    )
  }

  if (!module) return null

  const totalEstimation = tasks.reduce(
    (sum, task) => sum + Number(task.estimation ?? task.estimated_hours ?? 0),
    0,
  )

  async function uploadTaskAttachments(
    taskId: string,
    files: File[],
    linkUrls: string[],
  ): Promise<string | null> {
    let firstUrl: string | null = null
    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('entity_type', 'task')
      formData.append('entity_id', taskId)
      const res = await fetch('/api/attachments', { method: 'POST', body: formData })
      let j: { attachment?: { url?: string | null } } = {}
      try {
        j = await res.json()
      } catch {
        j = {}
      }
      const u = j.attachment?.url
      if (typeof u === 'string' && u.trim() && !firstUrl) firstUrl = u.trim()
    }
    for (const url of linkUrls) {
      const res = await fetch('/api/attachments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: 'task', entity_id: taskId, url }),
      })
      let j: { attachment?: { url?: string | null } } = {}
      try {
        j = await res.json()
      } catch {
        j = {}
      }
      const u = (typeof j.attachment?.url === 'string' && j.attachment.url.trim()
        ? j.attachment.url.trim()
        : null) || url.trim()
      if (u && !firstUrl) firstUrl = u
    }
    return firstUrl
  }

  const fetchTasks = async () => {
    if (!module?.id) return
    const tasksRes = await supabase
      .from('tasks')
      .select('*')
      .eq('module_id', module.id)
      .order('created_at', { ascending: false })
    setTasks(((tasksRes.data || []) as any[]).map((task) => ({
      ...task,
      assignee: null,
    })))
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTask.title.trim() || !module) return
    setCreatingTask(true)
    try {
      const docFromField = newTask.document_url.trim() || null
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTask.title.trim(),
          description: newTask.description.trim() || null,
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
      if (taskId && (taskAttachments.length > 0 || taskLinks.length > 0)) {
        const uploadedFirst = await uploadTaskAttachments(taskId, taskAttachments, taskLinks)
        if (!docFromField && uploadedFirst) {
          await fetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ document_url: uploadedFirst }),
          })
        }
      }
      await fetchTasks()
      setShowCreateTaskModal(false)
      setTaskAttachments([])
      setTaskLinks([])
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(isAllowedTaskAttachmentFile)
    const dropped = Array.from(e.target.files || []).length - files.length
    if (dropped > 0) {
      alert('Only images and PDF files are allowed.')
    }
    setTaskAttachments((prev) => [...prev, ...files])
    e.target.value = ''
  }

  const handleEditFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(isAllowedTaskAttachmentFile)
    const dropped = Array.from(e.target.files || []).length - files.length
    if (dropped > 0) {
      alert('Only images and PDF files are allowed.')
    }
    setEditTaskAttachments((prev) => [...prev, ...files])
    e.target.value = ''
  }

  const handleAddLink = () => {
    const url = newLink.trim()
    if (!url) return
    setTaskLinks((prev) => [...prev, url])
    setNewLink('')
  }

  const openEditTaskModal = (task: TaskRecord) => {
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
    setEditTaskAttachments([])
    setEditTaskLinks([])
    setEditNewLink('')
    setShowEditTaskModal(true)
  }

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTaskId || !editTask.title.trim()) return
    setEditingTask(true)
    try {
      const response = await fetch(`/api/tasks/${editingTaskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTask.title.trim(),
          description: editTask.description.trim() || null,
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
      if (editingTaskId && (editTaskAttachments.length > 0 || editTaskLinks.length > 0)) {
        const uploadedFirst = await uploadTaskAttachments(
          editingTaskId,
          editTaskAttachments,
          editTaskLinks,
        )
        if (!docField && uploadedFirst) {
          await fetch(`/api/tasks/${editingTaskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ document_url: uploadedFirst }),
          })
        }
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
          <Button size="sm" onClick={() => setShowCreateTaskModal(true)}>
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
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="font-semibold">{module.status}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Tasks</p>
            <p className="font-semibold">{tasks.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Estimation</p>
            <p className="font-semibold">{totalEstimation}h</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-muted-foreground">No tasks found for this module</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2">Task</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Assignee</th>
                    <th className="text-left px-3 py-2">Estimation</th>
                    <th className="text-left px-3 py-2">Start Date</th>
                    <th className="text-left px-3 py-2">Target End</th>
                    <th className="text-left px-3 py-2">Completed</th>
                    <th className="text-right px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id} className="border-t border-border">
                      <td className="px-3 py-2">{task.title}</td>
                      <td className="px-3 py-2">{task.status}</td>
                      <td className="px-3 py-2">{task.assignee?.full_name || task.assignee?.email || 'Unassigned'}</td>
                      <td className="px-3 py-2">{Number(task.estimation ?? task.estimated_hours ?? 0)}h</td>
                      <td className="px-3 py-2">{task.start_date ? new Date(task.start_date).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2">{task.end_date ? new Date(task.end_date).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2">
                        {task.completed_at ? new Date(task.completed_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => openEditTaskModal(task)}>
                          <Pencil className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showCreateTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="flex max-h-[min(90vh,calc(100vh-2rem))] w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-card p-6">
              <h3 className="text-lg font-semibold">Create Task</h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreateTaskModal(false)
                  setTaskAttachments([])
                  setTaskLinks([])
                  setNewLink('')
                }}
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
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                    rows={3}
                  />
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
                  <input
                    type="file"
                    accept={TASK_ATTACHMENT_ACCEPT}
                    multiple
                    onChange={handleFileSelect}
                    className="block w-full text-sm text-muted-foreground file:mr-2 file:rounded file:border file:bg-background file:px-2 file:py-1"
                  />
                  {taskAttachments.length > 0 && (
                    <ul className="text-xs space-y-1">
                      {taskAttachments.map((f, i) => (
                        <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                          <span className="truncate">{f.name}</span>
                          <button
                            type="button"
                            className="text-destructive shrink-0"
                            onClick={() =>
                              setTaskAttachments((prev) => prev.filter((_, idx) => idx !== i))
                            }
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
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
                    <Button type="button" size="sm" variant="outline" onClick={handleAddLink}>
                      Add
                    </Button>
                  </div>
                  {taskLinks.length > 0 && (
                    <ul className="text-xs space-y-1 break-all">
                      {taskLinks.map((u, i) => (
                        <li key={u + i} className="flex items-start justify-between gap-2">
                          <span>{u}</span>
                          <button
                            type="button"
                            className="text-destructive shrink-0"
                            onClick={() => setTaskLinks((prev) => prev.filter((_, idx) => idx !== i))}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-card px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateTaskModal(false)
                    setTaskAttachments([])
                    setTaskLinks([])
                    setNewLink('')
                  }}
                >
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
                  setEditTaskAttachments([])
                  setEditTaskLinks([])
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
                  <textarea
                    value={editTask.description}
                    onChange={(e) => setEditTask({ ...editTask, description: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background"
                    rows={3}
                  />
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
                  <label className="block text-sm mb-1">Add attachments (images or PDF)</label>
                  <input
                    type="file"
                    accept={TASK_ATTACHMENT_ACCEPT}
                    multiple
                    onChange={handleEditFileSelect}
                    className="block w-full text-sm text-muted-foreground file:mr-2 file:rounded file:border file:bg-background file:px-2 file:py-1"
                  />
                  {editTaskAttachments.length > 0 && (
                    <ul className="text-xs space-y-1">
                      {editTaskAttachments.map((f, i) => (
                        <li key={`${f.name}-e-${i}`} className="flex items-center justify-between gap-2">
                          <span className="truncate">{f.name}</span>
                          <button
                            type="button"
                            className="text-destructive shrink-0"
                            onClick={() =>
                              setEditTaskAttachments((prev) => prev.filter((_, idx) => idx !== i))
                            }
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
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
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const url = editNewLink.trim()
                        if (!url) return
                        setEditTaskLinks((prev) => [...prev, url])
                        setEditNewLink('')
                      }}
                    >
                      Add
                    </Button>
                  </div>
                  {editTaskLinks.length > 0 && (
                    <ul className="text-xs space-y-1 break-all">
                      {editTaskLinks.map((u, i) => (
                        <li key={u + i} className="flex items-start justify-between gap-2">
                          <span>{u}</span>
                          <button
                            type="button"
                            className="text-destructive shrink-0"
                            onClick={() =>
                              setEditTaskLinks((prev) => prev.filter((_, idx) => idx !== i))
                            }
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-card px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowEditTaskModal(false)
                    setEditTaskAttachments([])
                    setEditTaskLinks([])
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
