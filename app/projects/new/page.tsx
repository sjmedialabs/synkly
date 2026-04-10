'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { projectHref } from '@/lib/slug'
import { canManageProjects } from '@/lib/rbac'
import { TaskRichEditor } from '@/components/tasks/task-rich-editor'
import { TaskAttachmentGallery, type GalleryItem } from '@/components/tasks/task-attachment-gallery'
import { sanitizeTaskDescriptionHtml } from '@/lib/sanitize-task-html'

const PROJECT_ATTACHMENT_ACCEPT = 'image/*,.pdf,application/pdf'

function isAllowedProjectAttachmentFile(file: File): boolean {
  const t = (file.type || '').toLowerCase()
  if (t.startsWith('image/')) return true
  if (t === 'application/pdf') return true
  return file.name.toLowerCase().endsWith('.pdf')
}

type DepartmentSource = 'master_table' | 'users_text'

type Department = {
  id: string
  name: string
  description?: string | null
  source: DepartmentSource
}

const STEPS = [
  { id: 1, name: 'Select Department', description: 'Choose the owning department' },
  { id: 2, name: 'Project Details', description: 'Enter project information' },
  { id: 3, name: 'Review and Publish', description: 'Confirm and publish' },
]

export default function NewProjectPage() {
  const supabase = createClient()
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  // Data
  const [departments, setDepartments] = useState<Department[]>([])

  // Form state
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null)
  const [projectDraftId, setProjectDraftId] = useState<string | null>(null)
  const [projectStagedAttachments, setProjectStagedAttachments] = useState<GalleryItem[]>([])
  const [projectData, setProjectData] = useState({
    name: '',
    description: '',
    priority: 'medium',
    onboarded_date: '',
    assigned_date: '',
    projected_end_date: '',
    inputs: '',
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/auth/login')
          return
        }

        const meRes = await fetch('/api/me')
        if (meRes.ok) {
          const me = await meRes.json()
          if (!canManageProjects(me.role)) {
            router.push('/projects')
            return
          }
        }

        // Preferred source: centralized master-data API
        const departmentsRes = await fetch('/api/master-data/values?type=department')
        if (departmentsRes.ok) {
          const departmentsJson = await departmentsRes.json()
          const departmentsData = departmentsJson.values || []
          if (departmentsData.length > 0) {
            setDepartments(
              departmentsData.map((department: any) => ({
                id: department.id,
                name: department.name,
                source: 'master_table' as const,
              }))
            )
            return
          }
        }

        // Secondary source: legacy departments table
        const { data: legacyDepartmentsData, error: legacyDepartmentsError } = await supabase
          .from('departments')
          .select('id, name')
          .order('name')

        if (!legacyDepartmentsError && legacyDepartmentsData && legacyDepartmentsData.length > 0) {
          setDepartments(
            legacyDepartmentsData.map((department) => ({
              id: department.id,
              name: department.name,
              source: 'master_table' as const,
            }))
          )
          return
        }

        // Fallback source: distinct department names from legacy users table
        const { data: usersData, error: usersError } = await supabase
          .from('team')
          .select('department')
          .eq('is_active', true)
          .not('department', 'is', null)

        if (usersError) throw usersError

        const uniqueDepartments = Array.from(
          new Set(
            (usersData || [])
              .map((user) => user.department)
              .filter((department): department is string => Boolean(department))
          )
        ).sort((a, b) => a.localeCompare(b))

        setDepartments(
          uniqueDepartments.map((department) => ({
            id: department,
            name: department,
            source: 'users_text' as const,
          }))
        )
      } catch (error) {
        console.error('Error loading project setup data:', error)
        setDepartments([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router, supabase])

  const handleDepartmentSelect = (department: Department) => {
    setSelectedDepartment(department)
  }

  const handleNext = () => {
    if (currentStep < 3) {
      if (currentStep === 1) {
        setProjectDraftId((id) => id || crypto.randomUUID())
      }
      setCurrentStep(currentStep + 1)
    }
  }

  async function uploadAttachmentFile(
    file: File,
    entityType: 'project_draft' | 'project',
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

  const removeAttachmentById = async (id: string) => {
    await fetch(`/api/attachments?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  const uploadEditorImage = async (file: File): Promise<string | null> => {
    if (!projectDraftId) return null
    try {
      const att = await uploadAttachmentFile(file, 'project_draft', projectDraftId)
      setProjectStagedAttachments((prev) => [...prev, att])
      return att.url
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Image upload failed')
      return null
    }
  }

  const handleProjectAttachmentFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Array.from(e.target.files || [])
    const files = raw.filter(isAllowedProjectAttachmentFile)
    const dropped = raw.length - files.length
    if (dropped > 0) alert('Only images and PDF files are allowed.')
    if (!projectDraftId) {
      e.target.value = ''
      return
    }
    for (const file of files) {
      try {
        const att = await uploadAttachmentFile(file, 'project_draft', projectDraftId)
        setProjectStagedAttachments((prev) => [...prev, att])
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Upload failed')
      }
    }
    e.target.value = ''
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return selectedDepartment !== null
      case 2:
        return projectData.name.trim() !== ''
      case 3:
        return selectedDepartment !== null && projectData.name.trim() !== ''
      default:
        return false
    }
  }

  const handleCreate = async () => {
    if (!selectedDepartment) return

    setCreating(true)
    try {
      const descRaw = (projectData.description || '').trim()
      const descriptionHtml =
        !descRaw || descRaw === '<p></p>' || descRaw === '<p><br></p>' ? null : projectData.description

      const projectPayload: Record<string, unknown> = {
        name: projectData.name.trim(),
        description: descriptionHtml,
        priority: projectData.priority,
        status: 'active',
        onboarded_date: projectData.onboarded_date || null,
        assigned_date: projectData.assigned_date || null,
        projected_end_date: projectData.projected_end_date || null,
        inputs: projectData.inputs ? { notes: projectData.inputs } : {},
      }

      if (selectedDepartment.source === 'master_table') {
        projectPayload.department_id = selectedDepartment.id
      }

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectPayload),
      })
      const result = await response.json()
      if (!response.ok || !result?.project?.id) {
        const detail = [result?.error, result?.hint].filter(Boolean).join(' — ')
        throw new Error(detail || 'Failed to create project')
      }

      const newProjectId = result.project.id as string
      if (projectDraftId) {
        await fetch('/api/attachments/reassign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draft_entity_id: projectDraftId,
            from_entity_type: 'project_draft',
            to_entity_type: 'project',
            target_entity_id: newProjectId,
          }),
        })
      }

      setProjectStagedAttachments([])
      setProjectDraftId(null)

      // Avoid browser `from('projects')` here: same PostgREST schema as the API; for a new row,
      // slug disambiguation only needs this project.
      router.push(projectHref(result.project, [result.project]))
    } catch (error: any) {
      console.error('Error creating project:', error)
      alert('Error creating project: ' + error.message)
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Create Project">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout 
      title="Create New Project"
      subtitle="Follow the steps to set up your project"
      actions={
        <Link href="/projects">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Projects
          </Button>
        </Link>
      }
    >
      {/* Progress Steps */}
      <div className="mb-8">
        <nav aria-label="Progress">
          <ol className="flex items-center">
            {STEPS.map((step, stepIdx) => (
              <li key={step.name} className={`relative ${stepIdx !== STEPS.length - 1 ? 'flex-1 pr-8' : ''}`}>
                <div className="flex items-center">
                  <div
                    className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                      currentStep > step.id
                        ? 'bg-primary border-primary text-white'
                        : currentStep === step.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground'
                    }`}
                  >
                    {currentStep > step.id ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <span className="text-sm font-medium">{step.id}</span>
                    )}
                  </div>
                  {stepIdx !== STEPS.length - 1 && (
                    <div
                      className={`absolute left-10 top-5 h-0.5 w-full -translate-y-1/2 ${
                        currentStep > step.id ? 'bg-primary' : 'bg-border'
                      }`}
                    />
                  )}
                </div>
                <div className="mt-2">
                  <span className={`text-sm font-medium ${
                    currentStep >= step.id ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {step.name}
                  </span>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* Step Content */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          {/* Step 1: Select Department */}
          {currentStep === 1 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Select Department</h3>
              <p className="text-muted-foreground mb-6">
                Choose the department this project belongs to.
              </p>
              {departments.length === 0 ? (
                <div className="text-center py-8 bg-muted/50 rounded-lg">
                  <p className="text-muted-foreground mb-4">No departments have been created yet.</p>
                  <Link href="/settings/master-data">
                    <Button variant="outline">Create Department First</Button>
                  </Link>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {departments.map((department) => (
                    <button
                      key={department.id}
                      onClick={() => handleDepartmentSelect(department)}
                      className={`p-4 rounded-lg border-2 text-left transition ${
                        selectedDepartment?.id === department.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <h4 className="font-semibold text-foreground">{department.name}</h4>
                      {department.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {department.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Project Details */}
          {currentStep === 2 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Project Details</h3>
              <p className="text-muted-foreground mb-6">
                Enter the project information and timeline.
              </p>
              <div className="grid gap-6 max-w-2xl">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={projectData.name}
                    onChange={(e) => setProjectData({ ...projectData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Enter project name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Description
                  </label>
                  {projectDraftId ? (
                    <TaskRichEditor
                      key={projectDraftId}
                      content={projectData.description}
                      onChange={(html) => setProjectData({ ...projectData, description: html })}
                      placeholder="Describe the project… Paste images from clipboard."
                      uploadImage={uploadEditorImage}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">Open this step from “Next” after selecting a department.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">Attachments</label>
                  <p className="text-xs text-muted-foreground">
                    Images or PDF only. Files upload as you add them; thumbnails open a preview with download.
                  </p>
                  <TaskAttachmentGallery
                    items={projectStagedAttachments}
                    onRemove={
                      projectDraftId
                        ? async (id) => {
                            await removeAttachmentById(id)
                            setProjectStagedAttachments((prev) => prev.filter((a) => a.id !== id))
                          }
                        : undefined
                    }
                  />
                  <input
                    type="file"
                    accept={PROJECT_ATTACHMENT_ACCEPT}
                    multiple
                    onChange={handleProjectAttachmentFiles}
                    disabled={!projectDraftId}
                    className="block w-full text-sm text-muted-foreground file:mr-2 file:rounded file:border file:bg-background file:px-2 file:py-1 disabled:opacity-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Priority
                    </label>
                    <select
                      value={projectData.priority}
                      onChange={(e) => setProjectData({ ...projectData, priority: e.target.value })}
                      className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Onboarded Date
                    </label>
                    <input
                      type="date"
                      value={projectData.onboarded_date}
                      onChange={(e) => setProjectData({ ...projectData, onboarded_date: e.target.value })}
                      className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Assigned Date
                    </label>
                    <input
                      type="date"
                      value={projectData.assigned_date}
                      onChange={(e) => setProjectData({ ...projectData, assigned_date: e.target.value })}
                      className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Projected End Date
                    </label>
                    <input
                      type="date"
                      value={projectData.projected_end_date}
                      onChange={(e) => setProjectData({ ...projectData, projected_end_date: e.target.value })}
                      className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Additional Inputs / Notes
                  </label>
                  <textarea
                    value={projectData.inputs}
                    onChange={(e) => setProjectData({ ...projectData, inputs: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Any additional notes or requirements..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Review and Publish */}
          {currentStep === 3 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Review and Publish</h3>
              <p className="text-muted-foreground mb-6">
                Review the project details, then publish to create it.
              </p>
              <div className="bg-muted/50 rounded-lg p-6 space-y-4 max-w-2xl">
                <div>
                  <p className="text-sm text-muted-foreground">Department</p>
                  <p className="font-medium text-foreground">{selectedDepartment?.name}</p>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">Project Name</p>
                  <p className="font-medium text-foreground text-lg">{projectData.name}</p>
                </div>
                {projectData.description &&
                  projectData.description.trim() !== '' &&
                  projectData.description.trim() !== '<p></p>' &&
                  projectData.description.trim() !== '<p><br></p>' && (
                  <div>
                    <p className="text-sm text-muted-foreground">Description</p>
                    <div
                      className="text-foreground text-sm max-w-none [&_img]:max-w-full [&_img]:h-auto [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeTaskDescriptionHtml(projectData.description),
                      }}
                    />
                  </div>
                )}
                {projectStagedAttachments.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Attachments</p>
                    <TaskAttachmentGallery items={projectStagedAttachments} />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Priority</p>
                    <p className="font-medium text-foreground capitalize">{projectData.priority}</p>
                  </div>
                  {projectData.projected_end_date && (
                    <div>
                      <p className="text-sm text-muted-foreground">Projected End Date</p>
                      <p className="font-medium text-foreground">
                        {new Date(projectData.projected_end_date).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 1}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        
        {currentStep < 3 ? (
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="bg-primary"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleCreate}
            disabled={creating || !canProceed()}
            className="bg-primary"
          >
            {creating ? 'Publishing...' : 'Publish project'}
            <Check className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </DashboardLayout>
  )
}
