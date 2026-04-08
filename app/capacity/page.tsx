'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeft, ChevronRight, Plus, X, Clock, Users, AlertTriangle } from 'lucide-react'

type Employee = {
  id: string
  full_name: string | null
  email: string
  division: { name: string } | null
}

type CapacityRecord = {
  id: string
  employee_id: string
  month: string
  available_hours: number
  allocated_hours: number
  remaining_hours: number
}

type CapacityWithEmployee = CapacityRecord & {
  employee: Employee
}

export default function CapacityPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [canManageCapacity, setCanManageCapacity] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [capacityRecords, setCapacityRecords] = useState<CapacityWithEmployee[]>([])
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newCapacity, setNewCapacity] = useState({
    employee_id: '',
    available_hours: '160',
  })

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (!authUser) {
        router.push('/auth/login')
        return
      }
      setLoading(false)
    }

    fetchData()
  }, [router, supabase])

  useEffect(() => {
    if (loading) return

    const fetchCapacityForMonth = async () => {
      const res = await fetch(`/api/capacity?month=${encodeURIComponent(currentMonth)}`, {
        credentials: 'same-origin',
      })
      if (!res.ok) return
      const data = await res.json()
      setCapacityRecords((data.records as CapacityWithEmployee[]) || [])
      setEmployees((data.employees as Employee[]) || [])
      setCanManageCapacity(!!data.canManage)
    }

    fetchCapacityForMonth()
  }, [currentMonth, loading])

  useEffect(() => {
    if (!showAddModal || loading) return
    const refreshEmployees = async () => {
      const res = await fetch(`/api/capacity?month=${encodeURIComponent(currentMonth)}`, {
        credentials: 'same-origin',
      })
      if (!res.ok) return
      const data = await res.json()
      setEmployees((data.employees as Employee[]) || [])
    }
    refreshEmployees()
  }, [showAddModal, currentMonth, loading])

  const navigateMonth = (direction: 'prev' | 'next') => {
    const [year, month] = currentMonth.split('-').map(Number)
    const date = new Date(year, month - 1 + (direction === 'next' ? 1 : -1), 1)
    setCurrentMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1, 1)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const handleAddCapacity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCapacity.employee_id || !newCapacity.available_hours) return

    setSaving(true)
    try {
      const res = await fetch('/api/capacity', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: newCapacity.employee_id,
          month: currentMonth,
          available_hours: parseFloat(newCapacity.available_hours),
          allocated_hours: 0,
        }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Save failed')

      const data = payload.record as CapacityWithEmployee

      const existingIndex = capacityRecords.findIndex((r) => r.employee_id === newCapacity.employee_id)
      if (existingIndex >= 0) {
        setCapacityRecords((prev) => prev.map((r, i) => (i === existingIndex ? data : r)))
      } else {
        setCapacityRecords((prev) => [...prev, data])
      }

      setShowAddModal(false)
      setNewCapacity({ employee_id: '', available_hours: '160' })
    } catch (error: any) {
      console.error('Error saving capacity:', error)
      alert('Error saving capacity: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const updateCapacity = async (recordId: string, field: 'available_hours' | 'allocated_hours', value: number) => {
    try {
      const res = await fetch('/api/capacity', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, [field]: value }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Update failed')

      const record = payload.record as CapacityWithEmployee
      setCapacityRecords((prev) => prev.map((r) => (r.id === recordId ? record : r)))
    } catch (error: any) {
      console.error('Error updating capacity:', error)
      alert('Error updating capacity: ' + error.message)
    }
  }

  // Calculate totals
  const totalAvailable = capacityRecords.reduce((sum, r) => sum + r.available_hours, 0)
  const totalAllocated = capacityRecords.reduce((sum, r) => sum + r.allocated_hours, 0)
  const totalRemaining = capacityRecords.reduce((sum, r) => sum + r.remaining_hours, 0)
  const overallocatedCount = capacityRecords.filter(r => r.remaining_hours < 0).length

  if (loading) {
    return (
      <DashboardLayout title="Capacity Management">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout 
      title="Capacity Management"
      subtitle="Track and manage employee availability"
      actions={
        canManageCapacity && (
          <Button 
            onClick={() => setShowAddModal(true)}
            className="bg-primary hover:bg-primary/90 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Set Capacity
          </Button>
        )
      }
    >
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="outline" onClick={() => navigateMonth('prev')}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Previous
        </Button>
        <h2 className="text-xl font-semibold text-foreground">{formatMonth(currentMonth)}</h2>
        <Button variant="outline" onClick={() => navigateMonth('next')}>
          Next
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Capacity Table */}
      {capacityRecords.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No capacity set for {formatMonth(currentMonth)}</h3>
              <p className="text-muted-foreground mb-4">
                Set employee availability to start tracking capacity.
              </p>
              {canManageCapacity && (
                <Button onClick={() => setShowAddModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Set Employee Capacity
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Employee Capacity for {formatMonth(currentMonth)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Employee</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Division</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Available Hours</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Allocated Hours</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Remaining</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Utilization</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {capacityRecords.map((record) => {
                    const utilization = record.available_hours > 0 
                      ? Math.round((record.allocated_hours / record.available_hours) * 100)
                      : 0
                    const isOverallocated = record.remaining_hours < 0

                    return (
                      <tr key={record.id} className={`hover:bg-muted/50 transition ${isOverallocated ? 'bg-destructive/5' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">
                            {record.employee?.full_name?.trim() || record.employee?.email?.trim() || 'Unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground">{record.employee?.email || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {record.employee?.division?.name || '—'}
                        </td>
                        <td className="px-4 py-3">
                          {canManageCapacity ? (
                            <input
                              type="number"
                              value={record.available_hours}
                              onChange={(e) => updateCapacity(record.id, 'available_hours', parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1 border border-input rounded bg-background text-foreground text-sm"
                            />
                          ) : (
                            <span className="text-foreground">{record.available_hours}h</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {canManageCapacity ? (
                            <input
                              type="number"
                              value={record.allocated_hours}
                              onChange={(e) => updateCapacity(record.id, 'allocated_hours', parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1 border border-input rounded bg-background text-foreground text-sm"
                            />
                          ) : (
                            <span className="text-foreground">{record.allocated_hours}h</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-medium ${isOverallocated ? 'text-destructive' : 'text-green-600'}`}>
                            {record.remaining_hours}h
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${
                                  utilization > 100 ? 'bg-destructive' :
                                  utilization > 80 ? 'bg-accent' :
                                  'bg-primary'
                                }`}
                                style={{ width: `${Math.min(utilization, 100)}%` }}
                              />
                            </div>
                            <span className={`text-sm font-medium ${utilization > 100 ? 'text-destructive' : 'text-foreground'}`}>
                              {utilization}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Capacity Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Set Employee Capacity</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddCapacity} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Month
                </label>
                <input
                  type="text"
                  value={formatMonth(currentMonth)}
                  disabled
                  className="w-full px-4 py-2 border border-input rounded-lg bg-muted text-muted-foreground"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Employee *
                </label>
                <select
                  required
                  value={newCapacity.employee_id}
                  onChange={(e) => setNewCapacity({ ...newCapacity, employee_id: e.target.value })}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                >
                  <option value="">Select employee</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name || emp.email} {emp.division ? `(${emp.division.name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Available Hours *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.5"
                  value={newCapacity.available_hours}
                  onChange={(e) => setNewCapacity({ ...newCapacity, available_hours: e.target.value })}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="160"
                />
                <p className="text-xs text-muted-foreground mt-1">Default is 160 hours (40 hrs/week x 4 weeks)</p>
              </div>
              <div className="flex items-center gap-4 pt-4 border-t border-border">
                <Button
                  type="submit"
                  disabled={saving || !newCapacity.employee_id}
                  className="flex-1 bg-primary"
                >
                  {saving ? 'Saving...' : 'Save Capacity'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
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
