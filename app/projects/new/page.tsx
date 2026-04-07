'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
type DepartmentSource = 'master_table' | 'users_text'

type Department = {
  id: string
  name: string
  description?: string | null
  source: DepartmentSource
}

type TeamLead = {
  id: string
  full_name: string | null
  email: string
}

const STEPS = [
  { id: 1, name: 'Department', description: 'Select the department' },
  { id: 2, name: 'Team Lead', description: 'Assign a team lead' },
  { id: 3, name: 'Project Details', description: 'Enter project information' },
  { id: 4, name: 'Review', description: 'Confirm and create' },
]

export default function NewProjectPage() {
  const supabase = createClient()
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  // Data
  const [departments, setDepartments] = useState<Department[]>([])
  const [teamLeads, setTeamLeads] = useState<TeamLead[]>([])

  // Form state
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null)
  const [selectedTeamLead, setSelectedTeamLead] = useState<TeamLead | null>(null)
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
          .from('users')
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

  const fetchTeamLeads = async (department: Department) => {
    // Primary query for normalized schema
    if (department.source === 'master_table') {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('department_id', department.id) // from master_data_values
        .eq('is_active', true)
        .order('full_name')

      if (!error && data && data.length > 0) {
        setTeamLeads(data)
        return
      }

      if (error) {
        console.warn('department_id query failed, falling back to text department:', error.message)
      }
    }

    // Fallback query for legacy schema
    const { data: legacyData, error: legacyError } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('department', department.name)
      .eq('is_active', true)
      .order('full_name')

    if (legacyError) {
      console.error('Legacy department query failed:', legacyError)
      setTeamLeads([])
      return
    }

    setTeamLeads(legacyData || [])
  }

  const handleDepartmentSelect = async (department: Department) => {
    setSelectedDepartment(department)
    setSelectedTeamLead(null) // Reset team lead when department changes
    await fetchTeamLeads(department)
  }

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1)
    }
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
        return selectedTeamLead !== null
      case 3:
        return projectData.name.trim() !== ''
      default:
        return false
    }
  }

  const handleCreate = async () => {
    if (!selectedDepartment || !selectedTeamLead) return

    setCreating(true)
    try {
      const projectPayload: Record<string, unknown> = {
        name: projectData.name.trim(),
        description: projectData.description.trim() || null,
        priority: projectData.priority,
        status: 'active',
        team_lead_id: selectedTeamLead.id,
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
        throw new Error(result?.error || 'Failed to create project')
      }

      router.push(`/projects/${result.project.id}`)
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
                Choose the department this project belongs to. This determines which team members can be assigned.
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

          {/* Step 2: Select Team Lead */}
          {currentStep === 2 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Assign Team Lead</h3>
              <p className="text-muted-foreground mb-6">
                Select a team lead from the {selectedDepartment?.name} department to manage this project.
              </p>
              {teamLeads.length === 0 ? (
                <div className="text-center py-8 bg-muted/50 rounded-lg">
                  <p className="text-muted-foreground">
                    No team members found in this department. Add team members to the department first.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {teamLeads.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => setSelectedTeamLead(lead)}
                      className={`p-4 rounded-lg border-2 text-left transition ${
                        selectedTeamLead?.id === lead.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <h4 className="font-semibold text-foreground">
                        {lead.full_name || 'Unnamed'}
                      </h4>
                      <p className="text-sm text-muted-foreground mt-1">{lead.email}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Project Details */}
          {currentStep === 3 && (
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
                  <textarea
                    value={projectData.description}
                    onChange={(e) => setProjectData({ ...projectData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Brief description of the project..."
                    rows={3}
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

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Review & Create</h3>
              <p className="text-muted-foreground mb-6">
                Review the project details before creating.
              </p>
              <div className="bg-muted/50 rounded-lg p-6 space-y-4 max-w-2xl">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Department</p>
                    <p className="font-medium text-foreground">{selectedDepartment?.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Team Lead</p>
                    <p className="font-medium text-foreground">
                      {selectedTeamLead?.full_name || selectedTeamLead?.email}
                    </p>
                  </div>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">Project Name</p>
                  <p className="font-medium text-foreground text-lg">{projectData.name}</p>
                </div>
                {projectData.description && (
                  <div>
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p className="text-foreground">{projectData.description}</p>
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
        
        {currentStep < 4 ? (
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
            {creating ? 'Creating...' : 'Create Project'}
            <Check className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </DashboardLayout>
  )
}
