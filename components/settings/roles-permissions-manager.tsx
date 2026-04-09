'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Copy, Pencil, Trash2, Save, X } from 'lucide-react'
import { PERMISSION_MODULES, PERMISSION_ACTIONS } from '@/lib/rbac'

type Role = {
  id: string
  name: string
  description: string | null
  permissions: Record<string, Record<string, boolean>> | null
  created_at: string
}

const PROTECTED_ROLES = ['master_admin', 'super_admin', 'client_admin', 'manager', 'team_lead', 'member', 'employee']

const formatName = (name: string) =>
  name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const MODULE_LABELS: Record<string, string> = {
  projects: 'Projects',
  tasks: 'Tasks',
  modules: 'Modules',
  team: 'Team',
  reports: 'Reports',
  settings: 'Settings',
  master_data: 'Master Data',
  sprints: 'Sprints',
  milestones: 'Milestones',
}

const ACTION_LABELS: Record<string, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  assign: 'Assign',
  export: 'Export',
  view_all: 'View All',
}

export function RolesPermissionsManager() {
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [editPermissions, setEditPermissions] = useState<Record<string, Record<string, boolean>>>({})
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleDesc, setNewRoleDesc] = useState('')

  useEffect(() => {
    loadRoles()
  }, [])

  async function loadRoles() {
    try {
      const res = await fetch('/api/roles')
      if (!res.ok) throw new Error('Failed to load roles')
      const data = await res.json()
      setRoles(data.roles || [])
      if (!selectedRole && data.roles?.length > 0) {
        selectRole(data.roles[0])
      }
    } catch (err) {
      setError('Failed to load roles')
    } finally {
      setLoading(false)
    }
  }

  function selectRole(role: Role) {
    setSelectedRole(role)
    setEditPermissions(role.permissions || {})
    setIsEditing(false)
  }

  function togglePermission(module: string, action: string) {
    setEditPermissions((prev) => ({
      ...prev,
      [module]: {
        ...(prev[module] || {}),
        [action]: !(prev[module]?.[action] ?? false),
      },
    }))
  }

  async function handleSave() {
    if (!selectedRole) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedRole.id, permissions: editPermissions }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save')
      const data = await res.json()
      setRoles((prev) => prev.map((r) => (r.id === selectedRole.id ? data.role : r)))
      setSelectedRole(data.role)
      setIsEditing(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleCreate() {
    if (!newRoleName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoleName, description: newRoleDesc, permissions: {} }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create role')
      const data = await res.json()
      setRoles((prev) => [...prev, data.role])
      selectRole(data.role)
      setShowCreate(false)
      setNewRoleName('')
      setNewRoleDesc('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleClone(role: Role) {
    const cloneName = `${role.name}_copy`
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cloneName,
          description: `Clone of ${formatName(role.name)}`,
          clone_from: role.id,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to clone role')
      const data = await res.json()
      setRoles((prev) => [...prev, data.role])
      selectRole(data.role)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(role: Role) {
    if (!confirm(`Delete role "${formatName(role.name)}"?`)) return
    try {
      const res = await fetch(`/api/roles?id=${role.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete')
      setRoles((prev) => prev.filter((r) => r.id !== role.id))
      if (selectedRole?.id === role.id) {
        setSelectedRole(null)
        setIsEditing(false)
      }
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Loading roles...</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Roles List */}
      <div>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Roles</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <CardDescription>Select a role to manage permissions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {roles.map((role) => (
                <div key={role.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => selectRole(role)}
                    className={`flex-1 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                      selectedRole?.id === role.id
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-muted hover:bg-muted/80 text-foreground'
                    }`}
                  >
                    {formatName(role.name)}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClone(role)}
                    className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                    title="Clone"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {!PROTECTED_ROLES.includes(role.name) && (
                    <button
                      type="button"
                      onClick={() => handleDelete(role)}
                      className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Create Role Modal */}
        {showCreate && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm">New Role</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Role name"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
              />
              <Input
                placeholder="Description (optional)"
                value={newRoleDesc}
                onChange={(e) => setNewRoleDesc(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreate} disabled={saving || !newRoleName.trim()}>
                  Create
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Permission Matrix */}
      <div className="lg:col-span-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">
                  {selectedRole ? `${formatName(selectedRole.name)} Permissions` : 'Select a Role'}
                </CardTitle>
                <CardDescription>
                  {selectedRole?.description || 'Configure module-level permissions'}
                </CardDescription>
              </div>
              {selectedRole && (
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button size="sm" onClick={handleSave} disabled={saving}>
                        <Save className="w-4 h-4 mr-1" />
                        {saving ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditPermissions(selectedRole.permissions || {})
                          setIsEditing(false)
                        }}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                      <Pencil className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="p-3 mb-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}

            {selectedRole ? (
              <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                  {/* Header row */}
                  <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: `160px repeat(${PERMISSION_ACTIONS.length}, 1fr)` }}>
                    <div className="text-sm font-semibold text-foreground">Module</div>
                    {PERMISSION_ACTIONS.map((action) => (
                      <div key={action} className="text-sm font-semibold text-foreground text-center">
                        {ACTION_LABELS[action] || action}
                      </div>
                    ))}
                  </div>

                  {/* Module rows */}
                  {PERMISSION_MODULES.map((module) => (
                    <div
                      key={module}
                      className="grid gap-2 py-2 border-t border-border"
                      style={{ gridTemplateColumns: `160px repeat(${PERMISSION_ACTIONS.length}, 1fr)` }}
                    >
                      <div className="text-sm font-medium text-foreground flex items-center">
                        {MODULE_LABELS[module] || module}
                      </div>
                      {PERMISSION_ACTIONS.map((action) => (
                        <div key={action} className="flex items-center justify-center">
                          <Checkbox
                            checked={editPermissions[module]?.[action] ?? false}
                            onCheckedChange={() => {
                              if (isEditing) togglePermission(module, action)
                            }}
                            disabled={!isEditing}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">Select a role to view and edit permissions</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
