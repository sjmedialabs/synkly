'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Plus, Pencil, Trash2, X, Check, Briefcase, Users, Layers, GripVertical } from 'lucide-react'

interface Role {
  id: string
  name: string
  description: string
}

interface Responsibility {
  id: string
  name: string
  description: string
  is_active: boolean
}

interface Phase {
  id: string
  name: string
  description: string
  order_index: number
}

export default function SettingsPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([])
  const [phases, setPhases] = useState<Phase[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'roles' | 'responsibilities' | 'phases'>('roles')
  
  // Form states
  const [showAddForm, setShowAddForm] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', description: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', description: '' })
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function checkAccessAndFetch() {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Check if user is super admin
      const { data: userData } = await supabase
        .from('users')
        .select('role:roles(name)')
        .eq('id', user.id)
        .single()

      if (userData?.role?.name !== 'super_admin') {
        router.push('/dashboard')
        return
      }

      // Fetch data
      const [rolesRes, responsibilitiesRes, phasesRes] = await Promise.all([
        supabase.from('roles').select('*').order('name'),
        supabase.from('responsibilities').select('*').order('name'),
        supabase.from('phases').select('*').order('order_index'),
      ])

      setRoles(rolesRes.data || [])
      setResponsibilities(responsibilitiesRes.data || [])
      setPhases(phasesRes.data || [])
      setLoading(false)
    }

    checkAccessAndFetch()
  }, [router, supabase])

  // Reset form when changing tabs
  useEffect(() => {
    setShowAddForm(false)
    setEditingId(null)
    setNewItem({ name: '', description: '' })
  }, [activeTab])

  // CRUD for Roles
  const handleAddRole = async () => {
    if (!newItem.name.trim()) return

    const { data, error } = await supabase
      .from('roles')
      .insert({
        name: newItem.name.toLowerCase().replace(/\s+/g, '_'),
        description: newItem.description,
      })
      .select()
      .single()

    if (!error && data) {
      setRoles([...roles, data])
      setNewItem({ name: '', description: '' })
      setShowAddForm(false)
    }
  }

  const handleUpdateRole = async (id: string) => {
    const { error } = await supabase
      .from('roles')
      .update({
        description: editForm.description,
      })
      .eq('id', id)

    if (!error) {
      setRoles(roles.map(r => 
        r.id === id ? { ...r, description: editForm.description } : r
      ))
      setEditingId(null)
    }
  }

  // CRUD for Responsibilities
  const handleAddResponsibility = async () => {
    if (!newItem.name.trim()) return

    const { data, error } = await supabase
      .from('responsibilities')
      .insert({
        name: newItem.name,
        description: newItem.description,
      })
      .select()
      .single()

    if (!error && data) {
      setResponsibilities([...responsibilities, data])
      setNewItem({ name: '', description: '' })
      setShowAddForm(false)
    }
  }

  const handleUpdateResponsibility = async (id: string) => {
    const { error } = await supabase
      .from('responsibilities')
      .update({
        name: editForm.name,
        description: editForm.description,
      })
      .eq('id', id)

    if (!error) {
      setResponsibilities(responsibilities.map(r => 
        r.id === id ? { ...r, name: editForm.name, description: editForm.description } : r
      ))
      setEditingId(null)
    }
  }

  const handleDeleteResponsibility = async (id: string) => {
    const { error } = await supabase
      .from('responsibilities')
      .delete()
      .eq('id', id)

    if (!error) {
      setResponsibilities(responsibilities.filter(r => r.id !== id))
    }
  }

  // CRUD for Phases
  const handleAddPhase = async () => {
    if (!newItem.name.trim()) return

    const maxOrder = phases.length > 0 ? Math.max(...phases.map(p => p.order_index)) : 0

    const { data, error } = await supabase
      .from('phases')
      .insert({
        name: newItem.name,
        description: newItem.description,
        order_index: maxOrder + 1,
      })
      .select()
      .single()

    if (!error && data) {
      setPhases([...phases, data])
      setNewItem({ name: '', description: '' })
      setShowAddForm(false)
    }
  }

  const handleUpdatePhase = async (id: string) => {
    const { error } = await supabase
      .from('phases')
      .update({
        name: editForm.name,
        description: editForm.description,
      })
      .eq('id', id)

    if (!error) {
      setPhases(phases.map(p => 
        p.id === id ? { ...p, name: editForm.name, description: editForm.description } : p
      ))
      setEditingId(null)
    }
  }

  const handleDeletePhase = async (id: string) => {
    const { error } = await supabase
      .from('phases')
      .delete()
      .eq('id', id)

    if (!error) {
      setPhases(phases.filter(p => p.id !== id))
    }
  }

  const startEdit = (item: { id: string; name: string; description: string }) => {
    setEditingId(item.id)
    setEditForm({ name: item.name, description: item.description || '' })
  }

  // Generic handlers based on active tab
  const handleAdd = () => {
    if (activeTab === 'roles') handleAddRole()
    else if (activeTab === 'responsibilities') handleAddResponsibility()
    else handleAddPhase()
  }

  const handleUpdate = (id: string) => {
    if (activeTab === 'roles') handleUpdateRole(id)
    else if (activeTab === 'responsibilities') handleUpdateResponsibility(id)
    else handleUpdatePhase(id)
  }

  const handleDelete = (id: string) => {
    if (activeTab === 'responsibilities') handleDeleteResponsibility(id)
    else if (activeTab === 'phases') handleDeletePhase(id)
  }

  if (loading) {
    return (
      <DashboardLayout title="Settings">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-muted rounded w-64"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </DashboardLayout>
    )
  }

  const tabs = [
    { id: 'roles', label: 'Roles', icon: Users },
    { id: 'responsibilities', label: 'Responsibilities', icon: Briefcase },
    { id: 'phases', label: 'Project Phases', icon: Layers },
  ] as const

  const systemRoles = ['super_admin', 'delivery_manager', 'project_manager', 'team_lead', 'employee', 'client']

  return (
    <DashboardLayout title="Settings">
      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-border pb-4">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Roles Tab */}
        {activeTab === 'roles' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>System Roles</CardTitle>
                <CardDescription>
                  Manage roles and their descriptions. Core system roles cannot be deleted.
                </CardDescription>
              </div>
              <Button onClick={() => setShowAddForm(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Plus className="w-4 h-4 mr-2" />
                Add Role
              </Button>
            </CardHeader>
            <CardContent>
              {/* Add Form */}
              {showAddForm && (
                <div className="mb-4 p-4 border border-border rounded-lg bg-muted/50">
                  <div className="grid gap-4">
                    <Input
                      placeholder="Role name (e.g., qa_engineer)"
                      value={newItem.name}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    />
                    <Input
                      placeholder="Description"
                      value={newItem.description}
                      onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleAdd} className="bg-primary">
                        <Check className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setShowAddForm(false)}>
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="divide-y divide-border">
                {roles.map((role) => {
                  const isSystemRole = systemRoles.includes(role.name)
                  return (
                    <div key={role.id} className="py-4 flex items-center justify-between">
                      {editingId === role.id ? (
                        <div className="flex-1 grid gap-2 mr-4">
                          <Input
                            value={role.name.replace('_', ' ')}
                            disabled
                            className="bg-muted"
                          />
                          <Input
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            placeholder="Description"
                          />
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium text-foreground capitalize">
                            {role.name.replace(/_/g, ' ')}
                          </p>
                          <p className="text-sm text-muted-foreground">{role.description || 'No description'}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        {isSystemRole && (
                          <span className="text-xs bg-muted px-2 py-1 rounded mr-2">System</span>
                        )}
                        {editingId === role.id ? (
                          <>
                            <Button size="sm" onClick={() => handleUpdate(role.id)}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => startEdit(role)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Responsibilities Tab */}
        {activeTab === 'responsibilities' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Responsibilities</CardTitle>
                <CardDescription>
                  Define responsibilities that can be assigned to milestones.
                </CardDescription>
              </div>
              <Button onClick={() => setShowAddForm(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Plus className="w-4 h-4 mr-2" />
                Add Responsibility
              </Button>
            </CardHeader>
            <CardContent>
              {/* Add Form */}
              {showAddForm && (
                <div className="mb-4 p-4 border border-border rounded-lg bg-muted/50">
                  <div className="grid gap-4">
                    <Input
                      placeholder="Responsibility name"
                      value={newItem.name}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    />
                    <Input
                      placeholder="Description (optional)"
                      value={newItem.description}
                      onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleAdd} className="bg-primary">
                        <Check className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setShowAddForm(false)}>
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* List */}
              <div className="divide-y divide-border">
                {responsibilities.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">
                    No responsibilities defined yet. Add one to get started.
                  </p>
                ) : (
                  responsibilities.map((resp) => (
                    <div key={resp.id} className="py-4 flex items-center justify-between">
                      {editingId === resp.id ? (
                        <div className="flex-1 grid gap-2 mr-4">
                          <Input
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          />
                          <Input
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            placeholder="Description"
                          />
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium text-foreground">{resp.name}</p>
                          <p className="text-sm text-muted-foreground">{resp.description || 'No description'}</p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        {editingId === resp.id ? (
                          <>
                            <Button size="sm" onClick={() => handleUpdate(resp.id)}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => startEdit(resp)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleDelete(resp.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Phases Tab */}
        {activeTab === 'phases' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Project Phases</CardTitle>
                <CardDescription>
                  Manage the phases that projects go through. Order determines the sequence.
                </CardDescription>
              </div>
              <Button onClick={() => setShowAddForm(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Plus className="w-4 h-4 mr-2" />
                Add Phase
              </Button>
            </CardHeader>
            <CardContent>
              {/* Add Form */}
              {showAddForm && (
                <div className="mb-4 p-4 border border-border rounded-lg bg-muted/50">
                  <div className="grid gap-4">
                    <Input
                      placeholder="Phase name"
                      value={newItem.name}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    />
                    <Input
                      placeholder="Description"
                      value={newItem.description}
                      onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleAdd} className="bg-primary">
                        <Check className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setShowAddForm(false)}>
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="divide-y divide-border">
                {phases.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">
                    No phases defined yet. Add one to get started.
                  </p>
                ) : (
                  phases.map((phase, index) => (
                    <div key={phase.id} className="py-4 flex items-center gap-4">
                      <div className="text-muted-foreground cursor-move">
                        <GripVertical className="w-5 h-5" />
                      </div>
                      <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </span>
                      {editingId === phase.id ? (
                        <div className="flex-1 grid gap-2 mr-4">
                          <Input
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          />
                          <Input
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            placeholder="Description"
                          />
                        </div>
                      ) : (
                        <div className="flex-1">
                          <p className="font-medium text-foreground">{phase.name}</p>
                          <p className="text-sm text-muted-foreground">{phase.description || 'No description'}</p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        {editingId === phase.id ? (
                          <>
                            <Button size="sm" onClick={() => handleUpdate(phase.id)}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => startEdit(phase)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleDelete(phase.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
