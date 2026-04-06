'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { UserPlus, X, Pencil, Eye, Trash2, Search } from 'lucide-react'

type TeamMember = {
  id: string
  email: string
  full_name: string | null
  department: string | null
  designation: string | null
  is_active: boolean
  created_at: string
  experience_years: number | null
  skillset: string[] | null
  reporting_manager_id: string | null
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

const RESTRICTED_DESIGNATIONS = ['Super Admin', 'Delivery Manager']

const isNonAssignable = (designation: string | null): boolean => {
  return designation ? RESTRICTED_DESIGNATIONS.includes(designation) : false
}

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
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)

  const [departments, setDepartments] = useState<any[]>([])
  const [designations, setDesignations] = useState<any[]>([])
  const [teamLeads, setTeamLeads] = useState<TeamMember[]>([])
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDepartment, setFilterDepartment] = useState<string>('')

  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    department: '',
    designation: '',
    experience_years: '',
    skillset: '',
    reporting_manager_id: '',
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
        // Fetch all team members directly from the database
        // Note: The database uses 'department' and 'designation' as TEXT columns, not FKs
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select(`
            id,
            email,
            full_name,
            department,
            designation,
            is_active,
            created_at,
            experience_years,
            skillset,
            reporting_manager_id
          `)
          .order('created_at', { ascending: false })

        if (usersError) {
          console.error('[v0] Failed to fetch users:', usersError)
        } else {
          setTeamMembers((usersData as TeamMember[]) || [])
          setFilteredMembers((usersData as TeamMember[]) || [])
          console.log(`[v0] Loaded ${usersData?.length || 0} team members`)

          // Extract unique departments and designations from loaded team members
          const uniqueDepts = Array.from(new Set(
            (usersData as TeamMember[])
              ?.map(m => m.department)
              .filter((d): d is string => d != null)
          )).map((name, idx) => ({ id: `dept-${idx}`, name }))
          
          const uniqueDesigs = Array.from(new Set(
            (usersData as TeamMember[])
              ?.map(m => m.designation)
              .filter((d): d is string => d != null)
          )).map((name, idx) => ({ id: `desig-${idx}`, name }))
          
          setDepartments(uniqueDepts)
          setDesignations(uniqueDesigs)

          // Fetch team leads for reporting manager dropdown
          // For now, any active user can be a reporting manager
          const leads = (usersData as TeamMember[])?.filter(m => m.is_active) || []
          setTeamLeads(leads)
        }
      } catch (err) {
        console.error('[v0] Error during init:', err)
      }

      setLoading(false)
    }

    init()
  }, [router, supabase])

  // Filter team members based on search and filters
  useEffect(() => {
    let filtered = [...teamMembers]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(m => 
        m.full_name?.toLowerCase().includes(query) ||
        m.email.toLowerCase().includes(query) ||
        m.designation?.toLowerCase().includes(query)
      )
    }

    if (filterDepartment) {
      filtered = filtered.filter(m => m.department === filterDepartment)
    }

    setFilteredMembers(filtered)
  }, [searchQuery, filterDepartment, teamMembers])

  const resetForm = () => {
    setFormData({
      email: '',
      full_name: '',
      department: '',
      designation: '',
      experience_years: '',
      skillset: '',
      reporting_manager_id: '',
      is_active: true,
    })
  }

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      // Create user via server API route
      const response = await fetch('/api/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          full_name: formData.full_name,
          department: formData.department || null,
          designation: formData.designation || null,
          experience_years: formData.experience_years ? parseInt(formData.experience_years) : null,
          skillset: formData.skillset ? formData.skillset.split(',').map(s => s.trim()) : null,
          reporting_manager_id: formData.reporting_manager_id || null,
          is_active: formData.is_active,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create team member')
      }

      if (result.user) {
        setTeamMembers([result.user as TeamMember, ...teamMembers])
      }

      setShowCreateModal(false)
      resetForm()
      alert('✓ User created successfully!\n\nA password setup email has been sent to ' + formData.email + '.\nThey can set their password using the link in the email.')
    } catch (error: any) {
      console.error('Error creating team member:', error)
      alert('Error creating team member: ' + error.message)
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
          designation: formData.designation || null,
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

  const openViewModal = (member: TeamMember) => {
    setSelectedMember(member)
    setShowViewModal(true)
  }

  const openEditModal = (member: TeamMember) => {
    setSelectedMember(member)
    setFormData({
      email: member.email,
      full_name: member.full_name || '',
      department: member.department || '',
      designation: member.designation || '',
      experience_years: member.experience_years?.toString() || '',
      skillset: member.skillset?.join(', ') || '',
      reporting_manager_id: member.reporting_manager_id || '',
      is_active: member.is_active,
    })
    setShowEditModal(true)
  }

  const canManageTeam = currentUserRole === 'super_admin' || currentUserRole === 'project_manager'

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
            Create Team Member
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
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
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${designationColors[member.designation?.toLowerCase() || 'junior'] || 'bg-gray-100 text-gray-700'}`}>
                          {member.designation || '—'}
                        </span>
                        {isNonAssignable(member.designation) && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                            Non-Assignable
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {member.department || '—'}
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
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Department *
                  </label>
                  <select
                    required
                    value={formData.department}
                    onChange={(e) => setFormData({...formData, department: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="">Select Department</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.name}>{dept.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Designation *
                  </label>
                  <select
                    required
                    value={formData.designation}
                    onChange={(e) => setFormData({...formData, designation: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="">Select Designation</option>
                    {designations.map(desig => (
                      <option key={desig.id} value={desig.name}>{desig.name}</option>
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
                  <span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-medium ${designationColors[selectedMember.designation?.toLowerCase() || 'junior'] || 'bg-gray-100 text-gray-700'}`}>
                    {selectedMember.designation || '—'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Department</p>
                  <p className="font-medium text-foreground">{selectedMember.department || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Designation</p>
                  <p className="font-medium text-foreground">{selectedMember.designation || '—'}</p>
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
                    value={formData.department}
                    onChange={(e) => setFormData({...formData, department: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="">Select Department</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.name}>{dept.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Designation *
                  </label>
                  <select
                    required
                    value={formData.designation}
                    onChange={(e) => setFormData({...formData, designation: e.target.value})}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="">Select Designation</option>
                    {designations.map(desig => (
                      <option key={desig.id} value={desig.name}>{desig.name}</option>
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
                    {teamLeads.filter(l => l.id !== selectedMember.id).map(lead => (
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
    </DashboardLayout>
  )
}
