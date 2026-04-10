'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Plus, Trash2, ChevronRight, ChevronDown, Building2, Layers, Briefcase, Link2, Check } from 'lucide-react'

type MasterDataValue = {
  id: string
  name: string
  parent_id: string | null
  is_active: boolean
}

type Role = {
  id: string
  name: string
}

type DesignationRoleMapping = {
  id: string
  designation_id: string
  role_id: string
  roles?: { id: string; name: string } | null
}

const formatName = (name: string) =>
  name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export function OrgHierarchyManager() {
  const [departments, setDepartments] = useState<MasterDataValue[]>([])
  const [divisions, setDivisions] = useState<MasterDataValue[]>([])
  const [divisionMappings, setDivisionMappings] = useState<MasterDataValue[]>([])
  const [designations, setDesignations] = useState<MasterDataValue[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [designationRoleMappings, setDesignationRoleMappings] = useState<DesignationRoleMapping[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const [addingTo, setAddingTo] = useState<{ type: 'department' } | null>(null)
  const [saving, setSaving] = useState(false)
  const [assigningDept, setAssigningDept] = useState<string | null>(null)
  const [assigningDivision, setAssigningDivision] = useState<string | null>(null)
  const uniqueById = <T extends { id: string }>(arr: T[]): T[] => {
    const m = new Map<string, T>()
    for (const a of arr) m.set(a.id, a)
    return [...m.values()]
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    try {
      const [deptRes, divRes, divMapRes, desigRes, rolesRes, mappingsRes] = await Promise.all([
        fetch('/api/master-data/values?type=department'),
        fetch('/api/master-data/values?type=division'),
        fetch('/api/master-data/values?type=department_division_map'),
        fetch('/api/master-data/values?type=designation'),
        fetch('/api/roles'),
        fetch('/api/designation-roles'),
      ])

      if (deptRes.ok) {
        const d = await deptRes.json()
        setDepartments(uniqueById((d.values || []).filter((v: any) => v?.id && v?.name)))
      }
      if (divRes.ok) {
        const d = await divRes.json()
        setDivisions(uniqueById((d.values || []).filter((v: any) => v?.id && v?.name)))
      }
      if (divMapRes.ok) {
        const d = await divMapRes.json()
        setDivisionMappings(uniqueById((d.values || []).filter((v: any) => v?.id && v?.name)))
      }
      if (desigRes.ok) {
        const d = await desigRes.json()
        setDesignations(uniqueById((d.values || []).filter((v: any) => v?.id && v?.name)))
      }
      if (rolesRes.ok) {
        const d = await rolesRes.json()
        setRoles(d.roles || [])
      }
      if (mappingsRes.ok) {
        const d = await mappingsRes.json()
        setDesignationRoleMappings(d.mappings || [])
      }
    } catch (err) {
      setError('Failed to load organization data')
    } finally {
      setLoading(false)
    }
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function getDivisionsFor(departmentId: string) {
    const mappedIds = new Set(
      divisionMappings
        .map((m) => String(m.name || '').split(':'))
        .filter(([deptId, divisionId]) => deptId === departmentId && !!divisionId)
        .map(([, divisionId]) => divisionId),
    )
    return divisions.filter((d) => mappedIds.has(d.id))
  }

  function getDesignationsFor(divisionId: string) {
    return designations.filter((d) => d.parent_id === divisionId)
  }

  function getRoleForDesignation(designationId: string): DesignationRoleMapping | undefined {
    return designationRoleMappings.find((m) => m.designation_id === designationId)
  }

  function getMappingId(departmentId: string, divisionId: string): string | null {
    const hit = divisionMappings.find((m) => m.name === `${departmentId}:${divisionId}`)
    return hit?.id || null
  }

  async function handleToggleDivision(divisionId: string, departmentId: string, checked: boolean) {
    setError(null)
    try {
      const mapName = `${departmentId}:${divisionId}`
      const existingMapId = getMappingId(departmentId, divisionId)

      if (checked) {
        if (existingMapId) return
        const createRes = await fetch('/api/master-data/values', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'department_division_map',
            name: mapName,
            parent_id: null,
          }),
        })
        if (!createRes.ok) throw new Error((await createRes.json()).error || 'Failed to assign division')
        const createData = await createRes.json()
        if (createData.value) {
          setDivisionMappings((prev) => uniqueById([...prev, createData.value]))
        }
        return
      }

      if (!existingMapId) return
      const res = await fetch(`/api/master-data/values?id=${existingMapId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to unassign division')
      setDivisionMappings((prev) => prev.filter((m) => m.id !== existingMapId))
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleAdd() {
    if (!addingTo || !newItemName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/master-data/values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: addingTo.type,
          name: newItemName.trim(),
          parent_id: null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to add')
      const data = await res.json()
      const newVal = data.value || { id: data.id, name: newItemName.trim(), parent_id: null, is_active: true }

      if (addingTo.type === 'department') setDepartments((prev) => [...prev, newVal])

      setNewItemName('')
      setAddingTo(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(type: string, id: string) {
    if (!confirm('Delete this item?')) return
    try {
      const res = await fetch(`/api/master-data/values?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      if (type === 'department') setDepartments((prev) => prev.filter((d) => d.id !== id))
      else if (type === 'division') setDivisions((prev) => prev.filter((d) => d.id !== id))
      else setDesignations((prev) => prev.filter((d) => d.id !== id))
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleRoleMapping(designationId: string, roleId: string) {
    if (!roleId) return
    try {
      const res = await fetch('/api/designation-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designation_id: designationId, role_id: roleId }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to map role')
      const data = await res.json()
      setDesignationRoleMappings((prev) => {
        const filtered = prev.filter((m) => m.designation_id !== designationId)
        return uniqueById([...filtered, data.mapping])
      })
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleAssignDesignation(divisionId: string, designationId: string) {
    if (!designationId) return
    setError(null)
    setSaving(true)
    try {
      const setRes = await fetch('/api/master-data/values', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: designationId, parent_id: divisionId }),
      })
      if (!setRes.ok) throw new Error((await setRes.json()).error || 'Failed to assign designation')

      setDesignations((prev) =>
        prev.map((d) => {
          if (d.id === designationId) return { ...d, parent_id: divisionId }
          return d
        }),
      )
      setAssigningDivision(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUnassignDesignation(designationId: string) {
    setError(null)
    try {
      const res = await fetch('/api/master-data/values', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: designationId, parent_id: null }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to unassign designation')
      setDesignations((prev) => prev.map((d) => (d.id === designationId ? { ...d, parent_id: null } : d)))
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Loading organization structure...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Organization Hierarchy</CardTitle>
              <CardDescription>
                Manage Departments {'->'} Divisions {'->'} Assign multiple designations per division {'->'} map to role
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => setAddingTo({ type: 'department' })}
            >
              <Plus className="w-4 h-4 mr-1" />
              Department
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Inline add form */}
          {addingTo && (
            <div className="flex gap-2 mb-4 p-3 rounded-lg bg-muted/50 border border-border">
              <Input
                placeholder={`New ${addingTo.type} name...`}
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                autoFocus
              />
              <Button size="sm" onClick={handleAdd} disabled={saving || !newItemName.trim()}>
                {saving ? 'Adding...' : 'Add'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAddingTo(null); setNewItemName('') }}>
                Cancel
              </Button>
            </div>
          )}

          {departments.length === 0 ? (
            <div className="p-8 text-center rounded-lg bg-muted">
              <Building2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No departments yet. Create one to build your org hierarchy.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {departments.map((dept) => {
                const deptDivisions = getDivisionsFor(dept.id)
                const isExpanded = expanded.has(dept.id)

                return (
                  <div key={dept.id} className="border border-border rounded-lg">
                    {/* Department row */}
                    <div className="flex items-center gap-2 px-4 py-3 hover:bg-muted/30">
                      <button type="button" onClick={() => toggle(dept.id)} className="text-muted-foreground">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <Building2 className="w-4 h-4 text-blue-500" />
                      <span className="font-medium text-sm text-foreground flex-1">{dept.name}</span>
                      <span className="text-xs text-muted-foreground mr-2">
                        {deptDivisions.length} division{deptDivisions.length !== 1 ? 's' : ''}
                      </span>

                      {/* Multi-select divisions popover */}
                      <Popover open={assigningDept === dept.id} onOpenChange={(open) => setAssigningDept(open ? dept.id : null)}>
                        <PopoverTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 text-xs">
                            <Layers className="w-3 h-3 mr-1" />
                            Assign Divisions
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-0" align="end">
                          <div className="px-3 py-2 border-b border-border">
                            <p className="text-sm font-medium text-foreground">Assign Divisions</p>
                            <p className="text-xs text-muted-foreground">Select divisions for {dept.name}</p>
                          </div>
                          <div className="max-h-56 overflow-y-auto p-1">
                            {divisions.length === 0 ? (
                              <div className="px-3 py-4 text-center">
                                <p className="text-xs text-muted-foreground">
                                  No divisions created yet. Add divisions in the Data Types tab first.
                                </p>
                              </div>
                            ) : (
                              divisions.map((div) => {
                                const isAssigned = !!getMappingId(dept.id, div.id)

                                return (
                                  <label
                                    key={div.id}
                                    className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer"
                                  >
                                    <Checkbox
                                      checked={isAssigned}
                                      onCheckedChange={(checked) =>
                                        handleToggleDivision(div.id, dept.id, !!checked)
                                      }
                                    />
                                    <span className="text-sm text-foreground flex-1">{div.name}</span>
                                    {isAssigned && (
                                      <Check className="w-3 h-3 text-emerald-500" />
                                    )}
                                  </label>
                                )
                              })
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>

                      <button
                        type="button"
                        onClick={() => handleDelete('department', dept.id)}
                        className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Divisions */}
                    {isExpanded && (
                      <div className="ml-6 border-l border-border">
                        {deptDivisions.length === 0 ? (
                          <div className="px-4 py-2 text-xs text-muted-foreground">
                            No divisions assigned. Click "Assign Divisions" to add existing divisions.
                          </div>
                        ) : (
                          deptDivisions.map((div) => {
                            const divDesignations = getDesignationsFor(div.id)
                            const isDivExpanded = expanded.has(div.id)

                            return (
                              <div key={div.id}>
                                <div className="flex items-center gap-2 px-4 py-2 hover:bg-muted/20">
                                  <button type="button" onClick={() => toggle(div.id)} className="text-muted-foreground">
                                    {isDivExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                  </button>
                                  <Layers className="w-3.5 h-3.5 text-emerald-500" />
                                  <span className="text-sm text-foreground flex-1">{div.name}</span>
                                  <span className="text-xs text-muted-foreground mr-2">
                                    {divDesignations.length} designation{divDesignations.length !== 1 ? 's' : ''}
                                  </span>
                                  <Popover
                                    open={assigningDivision === div.id}
                                    onOpenChange={(open) => setAssigningDivision(open ? div.id : null)}
                                  >
                                    <PopoverTrigger asChild>
                                      <Button size="sm" variant="ghost" className="h-6 text-xs" disabled={saving}>
                                        <Plus className="w-3 h-3 mr-1" />
                                        Assign Designation
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-72 p-2" align="end">
                                      <p className="text-xs text-muted-foreground mb-2">
                                        Select a designation to assign to {div.name}
                                      </p>
                                      <select
                                        defaultValue=""
                                        onChange={(e) => handleAssignDesignation(div.id, e.target.value)}
                                        className="w-full text-xs px-2 py-1 border border-input rounded bg-background text-foreground"
                                      >
                                        <option value="">Select designation...</option>
                                        {designations.map((desig) => (
                                          <option key={desig.id} value={desig.id}>
                                            {desig.name}
                                          </option>
                                        ))}
                                      </select>
                                    </PopoverContent>
                                  </Popover>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleDivision(div.id, dept.id, false)}
                                    title="Unassign division"
                                    className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>

                                {/* Designations */}
                                {isDivExpanded && (
                                  <div className="ml-6 border-l border-border">
                                    {divDesignations.length === 0 ? (
                                      <div className="px-4 py-2 text-xs text-muted-foreground">
                                        No designation assigned. Use "Assign Designation".
                                      </div>
                                    ) : (
                                      divDesignations.map((desig) => {
                                        const mapping = getRoleForDesignation(desig.id)
                                        return (
                                          <div key={desig.id} className="flex items-center gap-2 px-4 py-2 hover:bg-muted/10">
                                            <Briefcase className="w-3.5 h-3.5 text-amber-500" />
                                            <span className="text-sm text-foreground flex-1">{desig.name}</span>
                                            <div className="flex items-center gap-1">
                                              <Link2 className="w-3 h-3 text-muted-foreground" />
                                              <select
                                                value={mapping?.role_id || ''}
                                                onChange={(e) => handleRoleMapping(desig.id, e.target.value)}
                                                className="text-xs px-2 py-1 border border-input rounded bg-background text-foreground"
                                              >
                                                <option value="">Map to role...</option>
                                                {uniqueById(roles).map((r) => (
                                                  <option key={`${r.id}:${r.name}`} value={r.id}>
                                                    {formatName(r.name)}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => handleUnassignDesignation(desig.id)}
                                              className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
                                              title="Unassign designation from division"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        )
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
