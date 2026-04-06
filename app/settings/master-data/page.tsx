'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Plus, Trash2 } from 'lucide-react'

type MasterDataType = {
  id: string
  name: string
}

type MasterDataValue = {
  id: string
  name: string
  is_active: boolean
}

export default function MasterDataPage() {
  const [types, setTypes] = useState<MasterDataType[]>([])
  const [selectedType, setSelectedType] = useState<MasterDataType | null>(null)
  const [values, setValues] = useState<MasterDataValue[]>([])
  const [newValue, setNewValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Fetch types on mount
  useEffect(() => {
    async function loadTypes() {
      try {
        const response = await fetch('/api/master-data/types')
        if (!response.ok) throw new Error('Failed to load types')
        const data = await response.json()
        setTypes(data.types || [])
        if (data.types && data.types.length > 0) {
          setSelectedType(data.types[0])
        }
      } catch (err) {
        console.error('[v0] Failed to load master data types:', err)
        setError('Failed to load master data types')
      } finally {
        setLoading(false)
      }
    }

    loadTypes()
  }, [])

  // Fetch values when selected type changes
  useEffect(() => {
    if (!selectedType) return

    async function loadValues() {
      try {
        const response = await fetch(`/api/master-data/values?type=${selectedType.name}`)
        if (!response.ok) throw new Error('Failed to load values')
        const data = await response.json()
        setValues(data.values || [])
        setError(null)
      } catch (err) {
        console.error('[v0] Failed to load values:', err)
        setError('Failed to load values for this type')
        setValues([])
      }
    }

    loadValues()
  }, [selectedType])

  const handleAddValue = async () => {
    if (!newValue.trim() || !selectedType) {
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
          name: newValue.trim()
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add value')
      }

      const data = await response.json()
      setValues([...values, data.value])
      setNewValue('')
      setError(null)
    } catch (err) {
      console.error('[v0] Failed to add value:', err)
      setError(err instanceof Error ? err.message : 'Failed to add value')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Master Data Settings">
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Loading master data...</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="Master Data Settings">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Types List */}
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
                      onClick={() => setSelectedType(type)}
                      className={`w-full px-4 py-2 rounded-lg text-left transition-colors ${
                        selectedType?.id === type.id
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'bg-muted hover:bg-muted/80 text-foreground'
                      }`}
                    >
                      {type.name.replace(/_/g, ' ').charAt(0).toUpperCase() + type.name.replace(/_/g, ' ').slice(1)}
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Values Management */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {selectedType
                  ? `${selectedType.name.replace(/_/g, ' ').charAt(0).toUpperCase() + selectedType.name.replace(/_/g, ' ').slice(1)} Values`
                  : 'Select a Type'}
              </CardTitle>
              <CardDescription>Add or manage values for the selected type</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Error Message */}
              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}

              {/* Add New Value */}
              {selectedType && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter new value..."
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddValue()}
                    disabled={saving}
                  />
                  <Button
                    onClick={handleAddValue}
                    disabled={saving || !newValue.trim()}
                    size="sm"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                  </Button>
                </div>
              )}

              {/* Values List */}
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
                        <span className="text-sm font-medium text-foreground">{value.name}</span>
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/master-data/values?id=${value.id}`, { method: 'DELETE' })
                              if (res.ok) setValues(values.filter(v => v.id !== value.id))
                            } catch (err) {
                              console.error('[v0] Failed to delete value:', err)
                            }
                          }}
                          className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
