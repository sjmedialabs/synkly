'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'

type MasterDataType = {
  id: string
  name: string | null
}

type MasterDataValue = {
  id: string
  name: string | null
  is_active: boolean
}

const formatTypeName = (name: string | null | undefined): string => {
  if (!name) return 'Unknown'
  const normalized = name.replace(/_/g, ' ')
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function MasterDataManager() {
  const [types, setTypes] = useState<MasterDataType[]>([])
  const [selectedType, setSelectedType] = useState<MasterDataType | null>(null)
  const [values, setValues] = useState<MasterDataValue[]>([])
  const [newValue, setNewValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingValueId, setEditingValueId] = useState<string | null>(null)
  const [editingValueName, setEditingValueName] = useState('')

  useEffect(() => {
    async function loadTypes() {
      try {
        const response = await fetch('/api/master-data/types')
        if (!response.ok) throw new Error('Failed to load types')
        const data = await response.json()
        const safeTypes = (data.types || []).filter(
          (type: MasterDataType | null) => type && typeof type.id === 'string' && type.id.length > 0,
        ) as MasterDataType[]
        setTypes(safeTypes)
        if (safeTypes.length > 0) {
          setSelectedType(safeTypes[0])
        }
      } catch (err) {
        console.error('[master-data] Failed to load types:', err)
        setError('Failed to load master data types')
      } finally {
        setLoading(false)
      }
    }

    loadTypes()
  }, [])

  useEffect(() => {
    if (!selectedType || !selectedType.name) return

    async function loadValues() {
      try {
        const response = await fetch(`/api/master-data/values?type=${selectedType.name}`)
        if (!response.ok) throw new Error('Failed to load values')
        const data = await response.json()
        const safeValues = (data.values || []).filter(
          (value: MasterDataValue | null) => value && typeof value.id === 'string' && value.id.length > 0,
        ) as MasterDataValue[]
        setValues(safeValues)
        setError(null)
      } catch (err) {
        console.error('[master-data] Failed to load values:', err)
        setError('Failed to load values for this type')
        setValues([])
      }
    }

    loadValues()
  }, [selectedType])

  const handleAddValue = async () => {
    if (!newValue.trim() || !selectedType || !selectedType.name) {
      setError('Please enter a value')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/master-data/values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedType.name,
          name: newValue.trim(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add value')
      }

      const data = await response.json()
      if (data?.value?.id) {
        setValues((prev) => [...prev, data.value])
      }
      setNewValue('')
      setError(null)
    } catch (err) {
      console.error('[master-data] Failed to add value:', err)
      setError(err instanceof Error ? err.message : 'Failed to add value')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (value: MasterDataValue) => {
    setEditingValueId(value.id)
    setEditingValueName(value.name || '')
    setError(null)
  }

  const cancelEdit = () => {
    setEditingValueId(null)
    setEditingValueName('')
  }

  const handleSaveEdit = async () => {
    if (!editingValueId) return
    const trimmed = editingValueName.trim()
    if (!trimmed) {
      setError('Value name cannot be empty')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/master-data/values', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingValueId, name: trimmed }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData?.error || 'Failed to update value')
      }
      const data = await res.json()
      const updated = data?.value
      if (updated?.id) {
        setValues((prev) =>
          prev.map((v) => (v.id === updated.id ? { ...v, name: updated.name ?? v.name } : v)),
        )
      }
      cancelEdit()
      setError(null)
    } catch (err) {
      console.error('[master-data] Failed to edit value:', err)
      setError(err instanceof Error ? err.message : 'Failed to update value')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Loading master data...</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Data Types</CardTitle>
            <CardDescription>Select a type to manage values</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {types.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data types found</p>
              ) : (
                types.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    className={`w-full px-4 py-2 rounded-lg text-left transition-colors ${
                      selectedType?.id === type.id
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-muted hover:bg-muted/80 text-foreground'
                    }`}
                  >
                    {formatTypeName(type.name)}
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedType ? `${formatTypeName(selectedType.name)} Values` : 'Select a Type'}
            </CardTitle>
            <CardDescription>Add or manage values for the selected type</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}

            {selectedType && (
              <div className="flex gap-2">
                <Input
                  placeholder="Enter new value..."
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddValue()}
                  disabled={saving}
                />
                <Button onClick={handleAddValue} disabled={saving || !newValue.trim()} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </Button>
              </div>
            )}

            <div className="space-y-2">
              {values.length === 0 ? (
                <div className="p-4 text-center rounded-lg bg-muted">
                  <p className="text-sm text-muted-foreground">
                    {selectedType ? 'No values found. Add one to get started.' : 'Select a type first'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Active Values ({values.length})</p>
                  {values.map((value) => (
                    <div
                      key={value.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border"
                    >
                      {editingValueId === value.id ? (
                        <Input
                          value={editingValueName}
                          onChange={(e) => setEditingValueName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit()
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          disabled={saving}
                          className="h-8 mr-2"
                          autoFocus
                        />
                      ) : (
                        <span className="text-sm font-medium text-foreground">{value.name || 'Unnamed'}</span>
                      )}
                      <div className="flex items-center gap-1">
                        {editingValueId === value.id ? (
                          <>
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              disabled={saving || !editingValueName.trim()}
                              className="p-1 hover:bg-emerald-100 rounded text-muted-foreground hover:text-emerald-700 transition-colors disabled:opacity-50"
                              title="Save"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={saving}
                              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(value)}
                            className="p-1 hover:bg-primary/10 rounded text-muted-foreground hover:text-primary transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              setError(null)
                              const res = await fetch(`/api/master-data/values?id=${encodeURIComponent(value.id)}`, {
                                method: 'DELETE',
                              })
                              if (!res.ok) {
                                let msg = 'Failed to delete value'
                                try {
                                  const errData = await res.json()
                                  if (errData?.error) msg = String(errData.error)
                                } catch {
                                  /* ignore */
                                }
                                setError(msg)
                                return
                              }
                              setValues((prev) => prev.filter((v) => v.id !== value.id))
                              if (editingValueId === value.id) cancelEdit()
                            } catch (err) {
                              console.error('[master-data] Failed to delete value:', err)
                              setError(err instanceof Error ? err.message : 'Failed to delete value')
                            }
                          }}
                          className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
