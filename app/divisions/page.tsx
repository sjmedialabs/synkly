'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, X, Users, FolderKanban, Edit2, Trash2 } from 'lucide-react'
import { isAdminRole, normalizeRole, type RoleKey } from '@/lib/rbac'

type Division = {
  id: string
  name: string
  description: string | null
  created_at: string
  user_count?: number
  project_count?: number
}

export default function DivisionsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [userRole, setUserRole] = useState<RoleKey | null>(null)
  const [divisions, setDivisions] = useState<Division[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingDivision, setEditingDivision] = useState<Division | null>(null)
  const [formData, setFormData] = useState({ name: '', description: '' })
  const [saving, setSaving] = useState(false)

  const canManageDivisions = !!userRole && isAdminRole(userRole)

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (!authUser) {
        router.push('/auth/login')
        return
      }

      const { data: userData } = await supabase
        .from('team')
        .select('roles(name)')
        .eq('id', authUser.id)
        .single()

      const role = normalizeRole((userData?.roles as { name?: string } | null)?.name ?? null)
      setUserRole(role)

      const listRes = await fetch('/api/divisions')
      const listJson = await listRes.json()
      if (!listRes.ok) {
        console.error(listJson.error)
        setDivisions([])
        setLoading(false)
        return
      }

      const divisionsData = (listJson.divisions || []) as Division[]
      const divisionsWithCounts = await Promise.all(
        divisionsData.map(async (division) => {
          try {
            const [usersRes, projectsRes] = await Promise.all([
              supabase.from('team').select('id', { count: 'exact', head: true }).eq('division_id', division.id),
              supabase
                .from('projects')
                .select('id', { count: 'exact', head: true })
                .eq('division_id', division.id),
            ])
            return {
              ...division,
              user_count: usersRes.count ?? 0,
              project_count: projectsRes.count ?? 0,
            }
          } catch {
            return { ...division, user_count: 0, project_count: 0 }
          }
        }),
      )
      setDivisions(divisionsWithCounts)

      setLoading(false)
    }

    fetchData()
  }, [router, supabase])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return

    setSaving(true)
    try {
      const res = await fetch('/api/divisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create')

      const data = json.division
      setDivisions([...divisions, { ...data, user_count: 0, project_count: 0 }])
      setShowCreateModal(false)
      setFormData({ name: '', description: '' })
    } catch (error: any) {
      console.error('Error creating division:', error)
      alert('Error creating division: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !editingDivision) return

    setSaving(true)
    try {
      const res = await fetch('/api/divisions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingDivision.id,
          name: formData.name.trim(),
          description: formData.description.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update')

      setDivisions(
        divisions.map((d) =>
          d.id === editingDivision.id
            ? {
                ...d,
                name: formData.name.trim(),
                description: formData.description.trim() || null,
              }
            : d,
        ),
      )
      setShowEditModal(false)
      setEditingDivision(null)
      setFormData({ name: '', description: '' })
    } catch (error: any) {
      console.error('Error updating division:', error)
      alert('Error updating division: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (divisionId: string) => {
    if (!confirm('Are you sure you want to delete this division? This action cannot be undone.')) return

    try {
      const res = await fetch(`/api/divisions?id=${encodeURIComponent(divisionId)}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to delete')

      setDivisions(divisions.filter((d) => d.id !== divisionId))
    } catch (error: any) {
      console.error('Error deleting division:', error)
      alert('Error deleting division: ' + error.message)
    }
  }

  const openEditModal = (division: Division) => {
    setEditingDivision(division)
    setFormData({ name: division.name, description: division.description || '' })
    setShowEditModal(true)
  }

  if (loading) {
    return (
      <DashboardLayout title="Divisions" subtitle="Manage organizational divisions">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout 
      title="Divisions" 
      subtitle="Manage organizational divisions and team structure"
      actions={
        canManageDivisions && (
          <Button 
            onClick={() => setShowCreateModal(true)}
            className="bg-primary hover:bg-primary/90 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Division
          </Button>
        )
      }
    >
      {/* Divisions Grid */}
      {divisions.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <FolderKanban className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No divisions yet</h3>
              <p className="text-muted-foreground mb-4">
                Create divisions to organize your teams and projects.
              </p>
              {canManageDivisions && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Division
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {divisions.map((division) => (
            <Card key={division.id} className="hover:shadow-lg transition">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">{division.name}</CardTitle>
                  {division.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {division.description}
                    </p>
                  )}
                </div>
                {canManageDivisions && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEditModal(division)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(division.id)}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground font-medium">{division.user_count}</span>
                    <span className="text-muted-foreground">employees</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FolderKanban className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground font-medium">{division.project_count}</span>
                    <span className="text-muted-foreground">projects</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Create Division</h3>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Division Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="e.g., Engineering"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Brief description of this division..."
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-4 pt-4 border-t border-border">
                <Button
                  type="submit"
                  disabled={saving || !formData.name.trim()}
                  className="flex-1 bg-primary"
                >
                  {saving ? 'Creating...' : 'Create Division'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingDivision && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Edit Division</h3>
              <button 
                onClick={() => {
                  setShowEditModal(false)
                  setEditingDivision(null)
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Division Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-4 pt-4 border-t border-border">
                <Button
                  type="submit"
                  disabled={saving || !formData.name.trim()}
                  className="flex-1 bg-primary"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingDivision(null)
                  }}
                >
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
