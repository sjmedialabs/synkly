'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { X, User, Clock, Zap, AlertTriangle, CheckCircle } from 'lucide-react'

type Recommendation = {
  employee_id: string
  full_name: string
  email: string
  skill_match_score: number
  available_hours: number
  allocated_hours: number
  remaining_hours: number
  total_score: number
}

type Task = {
  id: string
  title: string
  estimated_hours?: number
}

type SmartAssignModalProps = {
  task: Task
  onClose: () => void
  onAssign: (employeeId: string, estimatedHours: number) => void
}

export function SmartAssignModal({ task, onClose, onAssign }: SmartAssignModalProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null)
  const [estimatedHours, setEstimatedHours] = useState(task.estimated_hours || 8)
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    fetchRecommendations()
  }, [task.id])

  const fetchRecommendations = async () => {
    setLoading(true)
    try {
      const month = new Date().toISOString().slice(0, 7)
      const response = await fetch(`/api/tasks/smart-assignee?taskId=${task.id}&month=${month}`)
      const data = await response.json()
      setRecommendations(data.recommendations || [])
    } catch (error) {
      console.error('Error fetching recommendations:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAssign = async () => {
    if (!selectedEmployee) return
    setAssigning(true)
    try {
      await onAssign(selectedEmployee, estimatedHours)
    } finally {
      setAssigning(false)
    }
  }

  const getUtilizationColor = (remaining: number, available: number) => {
    const utilization = ((available - remaining) / available) * 100
    if (utilization > 100) return 'text-red-600 bg-red-50'
    if (utilization > 80) return 'text-amber-600 bg-amber-50'
    return 'text-green-600 bg-green-50'
  }

  const getScoreBadge = (score: number) => {
    if (score >= 150) return { label: 'Best Match', color: 'bg-green-100 text-green-700' }
    if (score >= 100) return { label: 'Good Match', color: 'bg-blue-100 text-blue-700' }
    if (score >= 50) return { label: 'Possible', color: 'bg-amber-100 text-amber-700' }
    return { label: 'Low Match', color: 'bg-muted text-muted-foreground' }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Smart Assign
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              AI-powered recommendations for: {task.title}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 border-b border-border">
          <label className="block text-sm font-medium text-foreground mb-2">
            Estimated Hours
          </label>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={estimatedHours}
            onChange={(e) => setEstimatedHours(parseFloat(e.target.value) || 0)}
            className="w-32 px-3 py-2 border border-input rounded-lg bg-background text-foreground"
          />
          <p className="text-xs text-muted-foreground mt-1">
            This will be deducted from the assignee&apos;s available capacity
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : recommendations.length === 0 ? (
            <div className="text-center py-12">
              <User className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No available team members found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec) => {
                const badge = getScoreBadge(rec.total_score)
                const isSelected = selectedEmployee === rec.employee_id
                const wouldOverallocate = rec.remaining_hours < estimatedHours

                return (
                  <button
                    key={rec.employee_id}
                    onClick={() => setSelectedEmployee(rec.employee_id)}
                    className={`w-full p-4 rounded-lg border text-left transition-all ${
                      isSelected 
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                        }`}>
                          {isSelected ? (
                            <CheckCircle className="w-5 h-5" />
                          ) : (
                            <User className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {rec.full_name || rec.email}
                          </p>
                          <p className="text-sm text-muted-foreground">{rec.email}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Skill Match</p>
                        <p className="font-medium">{rec.skill_match_score} pts</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Available</p>
                        <p className={`font-medium ${getUtilizationColor(rec.remaining_hours, rec.available_hours)}`}>
                          {rec.remaining_hours}h / {rec.available_hours}h
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Score</p>
                        <p className="font-medium">{rec.total_score}</p>
                      </div>
                    </div>

                    {wouldOverallocate && (
                      <div className="mt-3 flex items-center gap-2 text-amber-600 text-sm bg-amber-50 p-2 rounded">
                        <AlertTriangle className="w-4 h-4" />
                        <span>This assignment would over-allocate by {(estimatedHours - rec.remaining_hours).toFixed(1)}h</span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border flex items-center gap-4">
          <Button
            onClick={handleAssign}
            disabled={!selectedEmployee || assigning}
            className="flex-1"
          >
            {assigning ? 'Assigning...' : 'Assign Task'}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
