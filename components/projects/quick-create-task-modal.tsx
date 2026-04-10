'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { X, Plus } from 'lucide-react'
import { canCreateModules, normalizeRole } from '@/lib/rbac'
import { TaskRichEditor } from '@/components/tasks/task-rich-editor'
import { TaskAttachmentGallery, type GalleryItem } from '@/components/tasks/task-attachment-gallery'

const TASK_ATTACHMENT_ACCEPT = 'image/*,.pdf,application/pdf'

function isAllowedTaskAttachmentFile(file: File): boolean {
  const t = (file.type || '').toLowerCase()
  if (t.startsWith('image/')) return true
  if (t === 'application/pdf') return true
  return file.name.toLowerCase().endsWith('.pdf')
}

export type ProjectPick = { id: string; name: string }

type Me = { role?: string | null }

/** Renders the overlay; parent should mount only when the user opens the dialog (unmount on close resets state). */
export function QuickCreateTaskModal({
  onClose,
  projects,
  defaultProjectId,
}: {
  onClose: () => void
  projects: ProjectPick[]
  defaultProjectId?: string | null
}) {
  const supabase = createClient()
  const [me, setMe] = useState<Me | null>(null)
  const [phase, setPhase] = useState<'select' | 'form'>('select')
  const [projectId, setProjectId] = useState('')
  const [modules, setModules] = useState<{ id: string; name: string }[]>([])
  const [moduleId, setModuleId] = useState('')
  const [loadingModules, setLoadingModules] = useState(false)
  const [showNewModule, setShowNewModule] = useState(false)
  const [newModuleName, setNewModuleName] = useState('')
  const [creatingModule, setCreatingModule] = useState(false)

  const [sprints, setSprints] = useState<{ id: string; name: string }[]>([])
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string | null; email: string }[]>(
    [],
  )
  const [showNewSprintInput, setShowNewSprintInput] = useState(false)
  const [newSprintName, setNewSprintName] = useState('')
  const [creatingSprint, setCreatingSprint] = useState(false)
  const [createDraftId, setCreateDraftId] = useState<string | null>(null)
  const [createStagedAttachments, setCreateStagedAttachments] = useState<GalleryItem[]>([])
  const [newLink, setNewLink] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)
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

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/me')
      if (res.ok) {
        const j = await res.json()
        setMe(j)
      }
    })()
  }, [])

  useEffect(() => {
    if (!defaultProjectId || !projects.some((p) => p.id === defaultProjectId)) return
    setProjectId(defaultProjectId)
  }, [defaultProjectId, projects])

  useEffect(() => {
    if (!projectId) {
      setModules([])
      return
    }
    let cancelled = false
    setLoadingModules(true)
    ;(async () => {
      const { data } = await supabase
        .from('modules')
        .select('id, name')
        .eq('project_id', projectId)
        .order('name')
      if (!cancelled) {
        setModules((data || []) as { id: string; name: string }[])
        setModuleId('')
      }
      if (!cancelled) setLoadingModules(false)
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, supabase])

  const startFormPhase = () => {
    if (!moduleId || !projectId) return
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
    setPhase('form')
    ;(async () => {
      const [sprintsRes, assignableRes] = await Promise.all([
        fetch(`/api/sprints?project_id=${encodeURIComponent(projectId)}`),
        fetch(`/api/team/assignable-users?project_id=${encodeURIComponent(projectId)}&all=true`),
      ])
      if (sprintsRes.ok) {
        try {
          const sj = await sprintsRes.json()
          setSprints(
            (sj.sprints || []).map((s: { id: string; name?: string; sprint_name?: string }) => ({
              id: s.id,
              name: String(s.name ?? s.sprint_name ?? 'Sprint').trim() || 'Sprint',
            })),
          )
        } catch {
          setSprints([])
        }
      } else {
        setSprints([])
      }
      if (assignableRes.ok) {
        try {
          const uj = await assignableRes.json()
          setTeamMembers(
            (uj.users || []).map((u: { id: string; full_name?: string | null; email?: string }) => ({
              id: u.id,
              full_name: u.full_name ?? null,
              email: u.email ?? '',
            })),
          )
        } catch {
          setTeamMembers([])
        }
      } else {
        setTeamMembers([])
      }
    })()
  }

  const handleCreateModule = async () => {
    if (!newModuleName.trim() || !projectId) return
    setCreatingModule(true)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newModuleName.trim() }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error([j.error, j.hint].filter(Boolean).join(' — ') || 'Failed to create module')
      const m = j.module
      const row = { id: String(m.id), name: String(m.name || 'Module') }
      setModules((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)))
      setModuleId(row.id)
      setShowNewModule(false)
      setNewModuleName('')
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to create module')
    } finally {
      setCreatingModule(false)
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Array.from(e.target.files || [])
    const files = raw.filter(isAllowedTaskAttachmentFile)
    const dropped = raw.length - files.length
    if (dropped > 0) alert('Only images and PDF files are allowed.')
    if (!createDraftId) {
      e.target.value = ''
      return
    }
    for (const file of files) {
      try {
        const att = await uploadAttachmentFile(file, 'task_draft', createDraftId)
        setCreateStagedAttachments((prev) => [...prev, att])
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Upload failed')
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
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add link')
    }
  }

  const handleCreateSprint = async () => {
    if (!newSprintName.trim() || !projectId) return
    setCreatingSprint(true)
    try {
      const res = await fetch('/api/sprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSprintName.trim(), project_id: projectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to create sprint')
      const sprint = data.sprint
      const newSprint = { id: sprint.id, name: sprint.name || newSprintName.trim() }
      setSprints((prev) => [...prev, newSprint])
      setNewTask((prev) => ({ ...prev, sprint_id: sprint.id }))
      setNewSprintName('')
      setShowNewSprintInput(false)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error creating sprint')
    } finally {
      setCreatingSprint(false)
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTask.title.trim() || !moduleId || !projectId) return
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
          module_id: moduleId,
          project_id: projectId,
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

      onClose()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error creating task')
    } finally {
      setCreatingTask(false)
    }
  }

  const close = () => {
    onClose()
  }

  const allowCreateModule = canCreateModules(normalizeRole(me?.role ?? null))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      {phase === 'select' ? (
        <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border p-6">
            <h3 className="text-lg font-semibold text-foreground">Create task</h3>
            <button
              type="button"
              onClick={close}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-4 p-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Project *</label>
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value)
                  setModuleId('')
                  setShowNewModule(false)
                }}
                className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground"
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Module *</label>
              {loadingModules ? (
                <p className="text-sm text-muted-foreground">Loading modules…</p>
              ) : (
                <select
                  value={moduleId}
                  onChange={(e) => setModuleId(e.target.value)}
                  disabled={!projectId}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2 text-foreground disabled:opacity-50"
                >
                  <option value="">
                    {!projectId ? 'Choose a project first' : modules.length === 0 ? 'No modules yet' : 'Select module…'}
                  </option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
              {projectId && modules.length === 0 && !loadingModules && (
                <p className="mt-2 text-xs text-muted-foreground">
                  This project has no modules yet. Create one below to continue.
                </p>
              )}
            </div>

            {allowCreateModule && projectId && (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                {!showNewModule ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowNewModule(true)}>
                    <Plus className="mr-1 h-4 w-4" />
                    Create module
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">New module name *</label>
                    <input
                      value={newModuleName}
                      onChange={(e) => setNewModuleName(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      placeholder="e.g. Backend"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCreateModule}
                        disabled={creatingModule || !newModuleName.trim()}
                      >
                        {creatingModule ? 'Creating…' : 'Save module'}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewModule(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="button" disabled={!projectId || !moduleId} onClick={startFormPhase}>
                Continue to task details
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex max-h-[min(90vh,calc(100vh-2rem))] w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-card p-6">
            <h3 className="text-lg font-semibold">Task details</h3>
            <button
              type="button"
              onClick={close}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleCreateTask} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="mb-2 block text-sm">Task name *</label>
                  <input
                    required
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    className="w-full rounded-lg border border-input bg-background px-4 py-2"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-2 block text-sm">Description</label>
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
                  <label className="mb-2 block text-sm">Sprint</label>
                  {showNewSprintInput ? (
                    <div className="flex gap-2">
                      <input
                        value={newSprintName}
                        onChange={(e) => setNewSprintName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void handleCreateSprint())}
                        placeholder="Sprint name…"
                        className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                        autoFocus
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleCreateSprint()}
                        disabled={creatingSprint || !newSprintName.trim()}
                      >
                        {creatingSprint ? '…' : 'Add'}
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
                        className="flex-1 rounded-lg border border-input bg-background px-4 py-2"
                      >
                        <option value="">{sprints.length === 0 ? 'No sprints' : 'Sprint (optional)'}</option>
                        {sprints.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setShowNewSprintInput(true)}
                        title="New sprint"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="mb-2 block text-sm">Assignee</label>
                  <select
                    value={newTask.assignee_id}
                    onChange={(e) => setNewTask({ ...newTask, assignee_id: e.target.value })}
                    className="w-full rounded-lg border border-input bg-background px-4 py-2"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name || member.email}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm">Estimation (h)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={newTask.estimation}
                    onChange={(e) => setNewTask({ ...newTask, estimation: e.target.value })}
                    className="w-full rounded-lg border border-input bg-background px-4 py-2"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm">Start date</label>
                  <input
                    type="date"
                    value={newTask.start_date}
                    onChange={(e) => setNewTask({ ...newTask, start_date: e.target.value })}
                    className="w-full rounded-lg border border-input bg-background px-4 py-2"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm">End date</label>
                  <input
                    type="date"
                    value={newTask.end_date}
                    onChange={(e) => setNewTask({ ...newTask, end_date: e.target.value })}
                    className="w-full rounded-lg border border-input bg-background px-4 py-2"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-2 block text-sm">Document URL</label>
                  <input
                    type="url"
                    value={newTask.document_url}
                    onChange={(e) => setNewTask({ ...newTask, document_url: e.target.value })}
                    placeholder="https://…"
                    className="w-full rounded-lg border border-input bg-background px-4 py-2"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="mb-1 block text-sm">Attachments (images or PDF)</label>
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
                  <label className="mb-1 block text-sm">Extra links</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={newLink}
                      onChange={(e) => setNewLink(e.target.value)}
                      placeholder="https://…"
                      className="flex-1 rounded-lg border border-input bg-background px-4 py-2"
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => void handleAddCreateLink()}>
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 justify-between gap-2 border-t border-border bg-card px-6 py-4">
              <Button type="button" variant="outline" onClick={() => setPhase('select')}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creatingTask || !newTask.title.trim()}>
                  {creatingTask ? 'Creating…' : 'Create task'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
