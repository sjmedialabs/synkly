'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { UserPlus, X, Pencil, Eye, Trash2, Search } from 'lucide-react'
import { normalizeRole, resolveRole, type RoleKey } from '@/lib/rbac'

type TeamMember = {
  id: string
  email: string
  full_name: string | null
  /** Plain text or Supabase join object `{ id, name }` */
  department?: string | null | { id: string; name: string }
  department_id?: string | null
  department_name?: string | null
  division_id?: string | null
  designation?: string | null | { id: string; name: string }
  designation_id?: string | null
  designation_name?: string | null
  tenant_id?: string | null
  is_active: boolean
  created_at: string
  experience_years: number | null
  skillset: string[] | null
  reporting_manager_id: string | null
  role?: string | null
}

type MasterDataValue = {
  id: string
  name: string
  parent_id?: string | null
}

const designationColors: Record<string, string> = {
  team_lead: 'bg-indigo-100 text-indigo-700',
  senior: 'bg-blue-100 text-blue-700',
  mid: 'bg-green-100 text-green-700',
  junior: 'bg-yellow-100 text-yellow-700',
}

const experienceLevels = [
  'Fresher',
  '1-2 years',
  '2-4 years',
  '4-6 years',
  '6-8 years',
  '8+ years',
]

const RESTRICTED_DESIGNATIONS = ['Client Admin', 'Super Admin', 'Delivery Manager']
const ROLE_OPTIONS = [
  { value: 'client_admin', label: 'Client Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'member', label: 'Member' },
] as const

const roleLevel: Record<string, number> = {
  member: 1,
  team_lead: 2,
  manager: 3,
  client_admin: 4,
  master_admin: 5,
}

/** Role level for hierarchy (uses designation when RBAC role string is missing). */
function leadRoleLevel(m: TeamMember): number {
  const key = resolveRole({
    role: typeof m.role === 'string' ? m.role : null,
    designation: memberDesignationLabel(m),
  })
  if (key && roleLevel[key] != null) return roleLevel[key]
  return 0
}

const isNonAssignable = (designation: string | null): boolean => {
  return designation ? RESTRICTED_DESIGNATIONS.includes(designation) : false
}

/** Master-data value: string, join `{ id, name }`, or empty */
const displayLabel = (value: unknown): string => {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && 'name' in value) {
    const n = (value as { name?: unknown }).name
    if (typeof n === 'string') return n
  }
  return ''
}

const toSafeLower = (value: unknown): string => displayLabel(value).toLowerCase()

const memberDepartmentLabel = (m: TeamMember) =>
  displayLabel(m.department) || m.department_name || ''

const memberDesignationLabel = (m: TeamMember) =>
  displayLabel(m.designation) || m.designation_name || ''

export default function TeamPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [filteredMembers, setFilteredMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<TeamMember | null>(null)
  const [adminPassword, setAdminPassword] = useState('')
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('')
  const [forceResetPassword, setForceResetPassword] = useState(false)

  const [departments, setDepartments] = useState<any[]>([])
  const [divisions, setDivisions] = useState<MasterDataValue[]>([])
  const [designations, setDesignations] = useState<MasterDataValue[]>([])
  const [teamLeads, setTeamLeads] = useState<TeamMember[]>([])
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [managerSearch, setManagerSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDepartment, setFilterDepartment] = useState<string>('')

  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    department: '',
    department_id: '',
    division_id: '',
    designation: '',
    designation_id: '',
    experience_years: '',
    skillset: '',
    reporting_manager_id: '',
    role: '',
    password: '',
    confirm_password: '',
    tenant_id: '',
    is_active: true,
  })

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }
      setUser(user)

      try {
        const teamRes = await fetch('/api/team')
        const teamJson = await teamRes.json()
        const usersData = ((teamJson.users || []) as TeamMember[]) || []

        if (!teamRes.ok) {
          console.error('[v0] Failed to fetch users:', teamJson.error)
        } else {
          setTeamMembers(usersData)
          setFilteredMembers(usersData)
          console.log(`[v0] Loaded ${usersData.length || 0} team members`)

          // Prefer centralized master data; fallback to distinct text values from users.
          const [deptRes, desigRes, divRes] = await Promise.all([
            fetch('/api/master-data/values?type=department'),
            fetch('/api/master-data/values?type=designation'),
            fetch('/api/divisions'),
          ])

          if (deptRes.ok) {
            const deptJson = await deptRes.json()
            const safeDepts = (deptJson.values || []).filter((d: any) => d?.id && d?.name)
            setDepartments(safeDepts as MasterDataValue[])
          } else {
            const uniqueDepts = Array.from(
              new Set(
                (usersData as TeamMember[])
                  ?.map((m) => memberDepartmentLabel(m))
                  .filter((d): d is string => Boolean(d)),
              ),
            ).map((name, idx) => ({ id: `dept-${idx}`, name }))
            setDepartments(uniqueDepts)
          }

          if (desigRes.ok) {
            const desigJson = await desigRes.json()
            const safeDesigs = (desigJson.values || []).filter((d: any) => d?.id && d?.name)
            setDesignations(safeDesigs as MasterDataValue[])
          } else {
            const uniqueDesigs = Array.from(
              new Set(
                (usersData as TeamMember[])
                  ?.map((m) => memberDesignationLabel(m))
                  .filter((d): d is string => Boolean(d)),
              ),
            ).map((name, idx) => ({ id: `desig-${idx}`, name }))
            setDesignations(uniqueDesigs)
          }

          // Load divisions from dedicated divisions table
          if (divRes.ok) {
            const divJson = await divRes.json()
            const safeDivs = (divJson.divisions || []).filter((d: any) => d?.id && d?.name)
            setDivisions(safeDivs as MasterDataValue[])
          }

          // Fetch team leads for reporting manager dropdown
          // For now, any active user can be a reporting manager
          const leads = (usersData as TeamMember[])?.filter(m => m.is_active) || []
          setTeamLeads(leads)
        }

        // Resolve role from server-backed auth context (robust across schema variants).
        const meRes = await fetch('/api/me')
        if (meRes.ok) {
          const meJson = await meRes.json()
          setCurrentUserRole(normalizeRole(meJson?.role))
        } else {
          // Fallback to previous client-side lookup if /api/me is unavailable.
          const selfRoleRes = await supabase
            .from('team')
            .select('role, role_id, roles:role_id (name), designation')
            .eq('id', user.id)
            .maybeSingle()
          if (!selfRoleRes.error && selfRoleRes.data) {
            const roleName = (selfRoleRes.data as any)?.roles?.name || (selfRoleRes.data as any)?.role || null
            setCurrentUserRole(normalizeRole(roleName) || normalizeRole((selfRoleRes.data as any)?.designation))
          }
        }
      } catch (err) {
        console.error('[v0] Error during init:', err)
        // Keep dropdowns usable even if APIs fail
        setDepartments((prev) => (prev.length ? prev : []))
        setDesignations((prev) => (prev.length ? prev : []))
      }

      setLoading(false)
    }

    init()
  }, [router, supabase])

  // Divisions are loaded during init from /api/divisions (not department-specific)

  // Subject = person receiving a reporting line. Default to "member" level until role is chosen (create flow).
  const subjectRoleKey: RoleKey | null = formData.role
    ? (normalizeRole(formData.role) as RoleKey | null)
    : 'member'
  const subjectRoleLevel =
    subjectRoleKey && roleLevel[subjectRoleKey] != null ? roleLevel[subjectRoleKey] : roleLevel.member

  // Anyone strictly higher in the role hierarchy can be a reporting manager (any department).
  const reportingManagerOptions = teamLeads
    .filter((lead) => {
      if (!lead.is_active) return false
      const mgrLevel = leadRoleLevel(lead)
      if (mgrLevel <= subjectRoleLevel) return false
      return true
    })
    .sort(
      (a, b) =>
        leadRoleLevel(b) - leadRoleLevel(a) ||
        (a.full_name || a.email).localeCompare(b.full_name || b.email, undefined, { sensitivity: 'base' }),
    )

  // Filter team members based on search and filters
  useEffect(() => {
    let filtered = [...teamMembers]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(m => 
        toSafeLower(m.full_name).includes(query) ||
        toSafeLower(m.email).includes(query) ||
        toSafeLower(memberDesignationLabel(m)).includes(query)
      )
    }

    if (filterDepartment) {
      filtered = filtered.filter((m) => memberDepartmentLabel(m) === filterDepartment)
    }

    setFilteredMembers(filtered)
  }, [searchQuery, filterDepartment, teamMembers])

  const resetForm = () => {
    setFormData({
      email: '',
      full_name: '',
      department: '',
      department_id: '',
      division_id: '',
      designation: '',
      designation_id: '',
      experience_years: '',
      skillset: '',
      reporting_manager_id: '',
      role: '',
      password: '',
      confirm_password: '',
      tenant_id: '',
      is_active: true,
    })
    setValidationErrors({})
    setManagerSearch('')
  }

  const validateCreateForm = () => {
    const errors: Record<string, string> = {}
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) errors.email = 'Enter a valid email address'
    if (!formData.full_name.trim()) errors.full_name = 'Full name is required'
    if (!formData.department_id) errors.department_id = 'Department is required'
    if (!formData.designation_id) errors.designation_id = 'Designation is required'
    if (!formData.role) errors.role = 'Role is required'
    if (formData.password && formData.password.length < 8) errors.password = 'Password must be at least 8 characters'
    if (formData.password && formData.password !== formData.confirm_password) {
      errors.confirm_password = 'Passwords do not match'
    }
    const exp = Number(formData.experience_years || 0)
    if (!Number.isFinite(exp) || exp < 0 || exp > 50) errors.experience_years = 'Experience must be 0 to 50'
    if (formData.reporting_manager_id && formData.reporting_manager_id === user?.id) {
      errors.reporting_manager_id = 'Reporting manager cannot be same as current user'
    }
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }
  const isCreateFormValid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) &&
    !!formData.full_name.trim() &&
    !!formData.department_id &&
    !!formData.designation_id &&
    !!formData.role &&
    (!formData.password || formData.password.length >= 8) &&
    (!formData.password || formData.password === formData.confirm_password) &&
    Number(formData.experience_years || 0) >= 0 &&
    Number(formData.experience_years || 0) <= 50 &&
    (!formData.reporting_manager_id || formData.reporting_manager_id !== user?.id)

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateCreateForm()) return
    setSaving(true)
    setSuccessMessage('')

    try {
      const response = await fetch('/api/team-members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          full_name: formData.full_name,
          department: formData.department || '',
          department_id: formData.department_id || null,
          division: divisions.find((d) => d.id === formData.division_id)?.name || '',
          division_id: formData.division_id || null,
          designation: formData.designation || '',
          designation_id: formData.designation_id || null,
          experience_years: formData.experience_years ? parseInt(formData.experience_years) : null,
          skills: formData.skillset ? formData.skillset.split(',').map(s => s.trim()).filter(Boolean) : [],
          reporting_manager_id: formData.reporting_manager_id || null,
          role: formData.role,
          password: formData.password || undefined,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create team member')
      }

      if (result.user) {
        const newMember: TeamMember = {
          ...result.user,
          id: result.user.id,
          email: formData.email,
          full_name: formData.full_name,
          department: formData.department || null,
          department_id: formData.department_id || null,
          department_name: formData.department || null,
          division_id: formData.division_id || null,
          designation: formData.designation || null,
          designation_id: formData.designation_id || null,
          designation_name: formData.designation || null,
          experience_years: formData.experience_years ? parseInt(formData.experience_years) : null,
          skillset: formData.skillset ? formData.skillset.split(',').map(s => s.trim()).filter(Boolean) : null,
          reporting_manager_id: formData.reporting_manager_id || null,
          role: formData.role || null,
          is_active: formData.is_active,
          created_at: result.user.created_at || new Date().toISOString(),
        }
        setTeamMembers([newMember, ...teamMembers])
      }

      setShowCreateModal(false)
      resetForm()
      setSuccessMessage(`Team member created successfully: ${formData.email}`)
    } catch (error: any) {
      console.error('Error creating team member:', error)
      setValidationErrors({ form: error.message })
    } finally {
      setSaving(false)
    }
  }

  const handleEditMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMember) return
    setSaving(true)

    try {
      // Use server API for updates
      const response = await fetch('/api/team', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: selectedMember.id,
          full_name: formData.full_name,
          department: formData.department || null,
          department_id: formData.department_id || null,
          division_id: formData.division_id || null,
          designation: formData.designation || null,
          designation_id: formData.designation_id || null,
          tenant_id: formData.tenant_id || null,
          experience_years: formData.experience_years ? parseInt(formData.experience_years) : null,
          skillset: formData.skillset ? formData.skillset.split(',').map(s => s.trim()) : null,
          reporting_manager_id: formData.reporting_manager_id || null,
          is_active: formData.is_active,
        }),
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update team member')
      }

      const data = result.user

      setTeamMembers(teamMembers.map(m => m.id === selectedMember.id ? data as TeamMember : m))
      setShowEditModal(false)
      setSelectedMember(null)
      resetForm()
      alert('Team member updated successfully!')
    } catch (error: any) {
      console.error('Error updating team member:', error)
      alert('Error updating team member: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteMember = async (member: TeamMember) => {
    if (!confirm(`Are you sure you want to delete ${member.full_name || member.email}? This action cannot be undone.`)) {
      return
    }

    try {
      // Use server API for delete
      const response = await fetch(`/api/team?id=${member.id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete team member')
      }

      setTeamMembers(teamMembers.filter(m => m.id !== member.id))
      alert('Team member deleted successfully!')
    } catch (error: any) {
      console.error('Error deleting team member:', error)
      alert('Error deleting team member: ' + error.message)
    }
  }

  const handleAdminSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordTarget) return
    if (!adminPassword || adminPassword.length < 8) {
      setValidationErrors({ password_modal: 'Password must be at least 8 characters' })
      return
    }
    if (adminPassword !== adminPasswordConfirm) {
      setValidationErrors({ password_modal: 'Passwords do not match' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/set-user-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: passwordTarget.id,
          password: adminPassword,
          force_reset: forceResetPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to set password')
      setShowPasswordModal(false)
      setPasswordTarget(null)
      setAdminPassword('')
      setAdminPasswordConfirm('')
      setForceResetPassword(false)
      setSuccessMessage('Password updated successfully')
      setValidationErrors({})
    } catch (err: any) {
      setValidationErrors({ password_modal: err.message })
    } finally {
      setSaving(false)
    }
  }

  const openViewModal = (member: TeamMember) => {
    setSelectedMember(member)
    setShowViewModal(true)
  }

  const openEditModal = (member: TeamMember) => {
    setSelectedMember(member)
    const resolvedMemberRole =
      resolveRole({
        role: typeof member.role === 'string' ? member.role : null,
        designation: memberDesignationLabel(member),
      }) || ''
    setFormData({
      email: member.email,
      full_name: member.full_name || '',
      department: memberDepartmentLabel(member) || '',
      department_id: member.department_id || '',
      division_id: member.division_id || '',
      designation: memberDesignationLabel(member) || '',
      designation_id: member.designation_id || '',
      role: resolvedMemberRole,
      experience_years: member.experience_years?.toString() || '',
      skillset: member.skillset?.join(', ') || '',
      reporting_manager_id: member.reporting_manager_id || '',
      password: '',
      confirm_password: '',
      tenant_id: member.tenant_id || '',
      is_active: member.is_active,
    })
    setShowEditModal(true)
  }

  // Master Admin and Client Admin can manage team
  const canManageTeam = currentUserRole === 'master_admin' || currentUserRole === 'client_admin'

  if (loading) {
    return (
      <DashboardLayout title="Team">
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-lg"></div>
            ))}
          </div>
          <div className="h-64 bg-muted rounded-lg"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout 
      title="Team Members"
      actions={
        canManageTeam ? (
          <Button
            onClick={() => {
              resetForm()
              setShowCreateModal(true)
            }}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add Team Member
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {successMessage && (
          <div className="p-3 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm">
            {successMessage}
          </div>
        )}
        {/* Search and Filters */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name, email, or designation..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-input rounded-lg bg-background text-foreground"
                />
              </div>
            </div>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="px-4 py-2 border border-input rounded-lg bg-background text-foreground"
            >
              <option value="">All Departments</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.name}>{dept.name}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <h3 className="text-xl font-semibold text-foreground mb-2">No Team Members Found</h3>
            <p className="text-muted-foreground mb-4">
              {teamMembers.length === 0 ? 'Create your first team member to get started.' : 'Try adjusting your search or filters.'}
            </p>
            {canManageTeam && teamMembers.length === 0 && (
              <Button onClick={() => setShowCreateModal(true)}>
                Create First Member
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-secondary border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Name</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Designation</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Department</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Experience</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-secondary/50 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                          <span className="text-primary font-medium">
                            {(member.full_name || member.email)?.[0]?.toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-foreground block">{member.full_name || 'N/A'}</span>
                          <span className="text-xs text-muted-foreground">{member.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${designationColors[toSafeLower(memberDesignationLabel(member)) || 'junior'] || 'bg-gray-100 text-gray-700'}`}
                        >
                          {memberDesignationLabel(member) || '—'}
                        </span>
                        {isNonAssignable(memberDesignationLabel(member) || null) && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                            Non-Assignable
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {memberDepartmentLabel(member) || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {member.experience_years ? `${member.experience_years} years` : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        member.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {member.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openViewModal(member)}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canManageTeam && (
                          <>
                            <button
                              onClick={() => openEditModal(member)}
                              className="p-2 text-muted-foreground hover:text-accent hover:bg-accent/10 rounded-lg transition"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setPasswordTarget(member)
                                setShowPasswordModal(true)
                                setValidationErrors({})
                              }}
                              className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition"
                              title="Set / Reset Password"
                            >
                              🔑
                            </button>
                            <button
                              onClick={() => handleDeleteMember(member)}
                              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!canManageTeam && (
        <div className="mt-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-sm">
          Only Client Admin can create team members.
        </div>
      )}

      {/* Create Team Member Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-lg w-full max-w-2xl my-8">
            <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card">
              <h3 className="text-lg font-semibold text-foreground">Create Team Member</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateMember} className="p-6 space-y-4">
              {validationErrors.form && (
                <div className="p-2 rounded bg-destructive/10 text-destructive text-sm">{validationErrors.form}</div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                    placeholder="john@company.com"
                  />
                  {validationErrors.email && <p className="text-xs text-destructive mt-1">{validationErrors.email}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                    placeholder="John Doe"
                  />
                  {validationErrors.full_name && <p className="text-xs text-destructive mt-1">{validationErrors.full_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Department *
                  </label>
                  <select
                    required
                    value={formData.department_id}
                    onChange={(e) => {
                      const selected = departments.find((d: MasterDataValue) => d.id === e.target.value)
                      setFormData({
                        ...formData,
                        department_id: e.target.value,
                        department: selected?.name || '',
                        division_id: '',
                      })
                    }}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="">Select Department</option>
                    {departments.map((dept: MasterDataValue) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                  {validationErrors.department_id && <p className="text-xs text-destructive mt-1">{validationErrors.department_id}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Division
                  </label>
                  <select
                    value={formData.division_id}
                    onChange={(e) => setFormData({ ...formData, division_id: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="">Select Division</option>
                    {divisions.map((division) => (
                      <option key={division.id} value={division.id}>{division.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Designation *
                  </label>
                  <select
                    required
                    value={formData.designation_id}
                    onChange={(e) => {
                      const selected = designations.find((d) => d.id === e.target.value)
                      setFormData({
                        ...formData,
                        designation_id: e.target.value,
                        designation: selected?.name || '',
                      })
                    }}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="">Select Designation</option>
                    {designations.map(desig => (
                      <option key={desig.id} value={desig.id}>{desig.name}</option>
                    ))}
                  </select>
                  {validationErrors.designation_id && <p className="text-xs text-destructive mt-1">{validationErrors.designation_id}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Role *
                  </label>
                  <select
                    required
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value, reporting_manager_id: '' })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="">Search/Select Role</option>
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                  {validationErrors.role && <p className="text-xs text-destructive mt-1">{validationErrors.role}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Reporting Manager
                  </label>
                  <input
                    type="text"
                    placeholder="Search manager..."
                    value={managerSearch}
                    onChange={(e) => setManagerSearch(e.target.value)}
                    className="w-full mb-2 px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  />
                  <select
                    value={formData.reporting_manager_id}
                    onChange={(e) => setFormData({ ...formData, reporting_manager_id: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="">Select Manager</option>
                    {reportingManagerOptions
                      .filter((lead) => {
                        const q = managerSearch.trim().toLowerCase()
                        if (!q) return true
                        return (lead.full_name || '').toLowerCase().includes(q) || lead.email.toLowerCase().includes(q)
                      })
                      .map((lead) => (
                      <option key={lead.id} value={lead.id}>{lead.full_name || lead.email}</option>
                    ))}
                  </select>
                  {validationErrors.reporting_manager_id && <p className="text-xs text-destructive mt-1">{validationErrors.reporting_manager_id}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Experience (Years)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={formData.experience_years}
                    onChange={(e) => setFormData({...formData, experience_years: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                    placeholder="0"
                  />
                  {validationErrors.experience_years && <p className="text-xs text-destructive mt-1">{validationErrors.experience_years}</p>}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Skills (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={formData.skillset}
                    onChange={(e) => setFormData({...formData, skillset: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                    placeholder="React, Node.js, TypeScript"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Enter skills separated by commas</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Password (optional)
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                    placeholder="Leave empty to send invite"
                  />
                  {validationErrors.password && <p className="text-xs text-destructive mt-1">{validationErrors.password}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={formData.confirm_password}
                    onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                    placeholder="Re-enter password"
                  />
                  {validationErrors.confirm_password && <p className="text-xs text-destructive mt-1">{validationErrors.confirm_password}</p>}
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                      className="w-4 h-4 rounded border-input"
                    />
                    <span className="text-sm font-medium text-foreground">Active</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4 border-t border-border">
                <Button type="submit" disabled={saving || !canManageTeam || !isCreateFormValid} className="flex-1 bg-primary">
                  {saving ? 'Creating...' : 'Create Team Member'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Team Member Modal */}
      {showViewModal && selectedMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Team Member Details</h3>
              <button onClick={() => setShowViewModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 pb-4 border-b border-border">
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
                  <span className="text-primary text-2xl font-bold">
                    {(selectedMember.full_name || selectedMember.email)?.[0]?.toUpperCase()}
                  </span>
                </div>
                <div>
                  <h4 className="text-xl font-semibold text-foreground">{selectedMember.full_name || 'N/A'}</h4>
                  <p className="text-muted-foreground">{selectedMember.email}</p>
                  <span
                    className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-medium ${designationColors[toSafeLower(memberDesignationLabel(selectedMember)) || 'junior'] || 'bg-gray-100 text-gray-700'}`}
                  >
                    {memberDesignationLabel(selectedMember) || '—'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Department</p>
                  <p className="font-medium text-foreground">{memberDepartmentLabel(selectedMember) || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Designation</p>
                  <p className="font-medium text-foreground">{memberDesignationLabel(selectedMember) || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Experience</p>
                  <p className="font-medium text-foreground">{selectedMember.experience_years || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Reporting Manager</p>
                  <p className="font-medium text-foreground">{teamMembers.find(m => m.id === selectedMember.reporting_manager_id)?.full_name || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    selectedMember.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedMember.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Skills</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedMember.skillset?.length ? (
                      selectedMember.skillset.map((skill, i) => (
                        <span key={i} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                          {skill}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Joined</p>
                  <p className="font-medium text-foreground">
                    {new Date(selectedMember.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4 border-t border-border">
                {canManageTeam && (
                  <Button
                    onClick={() => {
                      setShowViewModal(false)
                      openEditModal(selectedMember)
                    }}
                    className="flex-1"
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                )}
                <Button variant="outline" onClick={() => setShowViewModal(false)} className={canManageTeam ? '' : 'flex-1'}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Team Member Modal */}
      {showEditModal && selectedMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-lg w-full max-w-2xl my-8">
            <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card">
              <h3 className="text-lg font-semibold text-foreground">Edit Team Member</h3>
              <button onClick={() => setShowEditModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditMember} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    disabled
                    value={formData.email}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-muted text-muted-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Department *
                  </label>
                  <select
                    required
                    value={formData.department_id}
                    onChange={(e) => {
                      const selected = departments.find((d: MasterDataValue) => d.id === e.target.value)
                      setFormData({
                        ...formData,
                        department_id: e.target.value,
                        department: selected?.name || '',
                        division_id: '',
                      })
                    }}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="">Select Department</option>
                    {departments.map((dept: MasterDataValue) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Division
                  </label>
                  <select
                    value={formData.division_id}
                    onChange={(e) => setFormData({ ...formData, division_id: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="">Select Division</option>
                    {divisions.map((division) => (
                      <option key={division.id} value={division.id}>{division.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Designation *
                  </label>
                  <select
                    required
                    value={formData.designation_id}
                    onChange={(e) => {
                      const selected = designations.find((d) => d.id === e.target.value)
                      setFormData({
                        ...formData,
                        designation_id: e.target.value,
                        designation: selected?.name || '',
                      })
                    }}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="">Select Designation</option>
                    {designations.map(desig => (
                      <option key={desig.id} value={desig.id}>{desig.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Experience (Years)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.experience_years}
                    onChange={(e) => setFormData({...formData, experience_years: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Reporting Manager
                  </label>
                  <select
                    value={formData.reporting_manager_id}
                    onChange={(e) => setFormData({...formData, reporting_manager_id: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="">Select Manager</option>
                    {reportingManagerOptions
                      .filter((l) => l.id !== selectedMember?.id)
                      .map((lead) => (
                      <option key={lead.id} value={lead.id}>{lead.full_name || lead.email}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Skills (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={formData.skillset}
                    onChange={(e) => setFormData({...formData, skillset: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                      className="w-4 h-4 rounded border-input"
                    />
                    <span className="text-sm font-medium text-foreground">Active</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4 border-t border-border">
                <Button type="submit" disabled={saving} className="flex-1 bg-primary">
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPasswordModal && passwordTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Set / Reset Password</h3>
              <button
                onClick={() => setShowPasswordModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdminSetPassword} className="p-6 space-y-4">
              {validationErrors.password_modal && (
                <div className="p-2 rounded bg-destructive/10 text-destructive text-sm">
                  {validationErrors.password_modal}
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Update password for <span className="font-medium">{passwordTarget.full_name || passwordTarget.email}</span>
              </p>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">New Password</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Confirm Password</label>
                <input
                  type="password"
                  value={adminPasswordConfirm}
                  onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  minLength={8}
                  required
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceResetPassword}
                  onChange={(e) => setForceResetPassword(e.target.checked)}
                  className="w-4 h-4 rounded border-input"
                />
                <span className="text-sm text-foreground">Force reset on next login</span>
              </label>
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? 'Updating...' : 'Update Password'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowPasswordModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
