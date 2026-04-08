'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Plus, X, Calendar, Target, AlertCircle, CheckCircle2 } from 'lucide-react'

interface Milestone {
  id: string
  name: string
  description: string | null
  project_id: string
  project: { name: string } | null
  status: string
  priority: string
  start_date: string | null
  end_date: string | null
  created_at: string
}

interface Project {
  id: string
  name: string
}

const statusColors: Record<string, string> = {
  not_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary/10 text-primary',
  blocked: 'bg-destructive/10 text-destructive',
  completed: 'bg-green-500/10 text-green-600',
}

const statusIcons: Record<string, React.ElementType> = {
  not_started: Target,
  in_progress: Calendar,
  blocked: AlertCircle,
  completed: CheckCircle2,
}

const priorityColors: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-accent/10 text-accent',
  high: 'bg-destructive/10 text-destructive',
}

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    project_id: '',
    status: 'not_started',
    priority: 'medium',
    start_date: '',
    end_date: '',
  })
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/auth/login')
        return
      }

      const [milestonesRes, projectsRes] = await Promise.all([
        fetch('/api/milestones', { credentials: 'same-origin' }),
        fetch('/api/projects', { credentials: 'same-origin' }),
      ])

      if (milestonesRes.ok) {
        const m = await milestonesRes.json()
        setMilestones(m.milestones || [])
      } else {
        setMilestones([])
      }

      if (projectsRes.ok) {
        const p = await projectsRes.json()
        const list = p.projects || []
        setProjects(
          list.map((proj: { id: string; name: string }) => ({ id: proj.id, name: proj.name })),
        )
      } else {
        setProjects([])
      }
      setLoading(false)
    }

    fetchData()
  }, [router, supabase])

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.project_id) return

    const res = await fetch('/api/milestones', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.name,
        description: formData.description || null,
        project_id: formData.project_id,
        status: formData.status,
        priority: formData.priority,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
      }),
    })
    const payload = await res.json()
    if (!res.ok) {
      alert(payload.error || 'Could not create milestone')
      return
    }
    const data = payload.milestone as Milestone
    if (data) {
      setMilestones([data, ...milestones])
      setShowModal(false)
      setFormData({
        name: '',
        description: '',
        project_id: '',
        status: 'not_started',
        priority: 'medium',
        start_date: '',
        end_date: '',
      })
    }
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    const res = await fetch('/api/milestones', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus }),
    })
    if (res.ok) {
      setMilestones(milestones.map(m => 
        m.id === id ? { ...m, status: newStatus } : m
      ))
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Milestones">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-muted rounded w-40"></div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // Group milestones by status
  const groupedMilestones = {
    not_started: milestones.filter(m => m.status === 'not_started'),
    in_progress: milestones.filter(m => m.status === 'in_progress'),
    blocked: milestones.filter(m => m.status === 'blocked'),
    completed: milestones.filter(m => m.status === 'completed'),
  }

  return (
    <DashboardLayout 
      title="Milestones"
      actions={
        <Button onClick={() => setShowModal(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
          <Plus className="w-4 h-4 mr-2" />
          Create Milestone
        </Button>
      }
    >
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        {Object.entries(groupedMilestones).map(([status, items]) => {
          const Icon = statusIcons[status]
          return (
            <Card key={status}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground capitalize">{status.replace('_', ' ')}</p>
                    <p className="text-2xl font-bold text-foreground">{items.length}</p>
                  </div>
                  <Icon className={`w-8 h-8 ${status === 'completed' ? 'text-green-500' : status === 'blocked' ? 'text-destructive' : 'text-muted-foreground'}`} />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Milestone Cards */}
      {milestones.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium text-foreground mb-2">No milestones yet</h3>
            <p className="text-muted-foreground mb-4">Create your first milestone to track project progress.</p>
            <Button onClick={() => setShowModal(true)} className="bg-primary">
              <Plus className="w-4 h-4 mr-2" />
              Create Milestone
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {milestones.map((milestone) => {
            const Icon = statusIcons[milestone.status]
            return (
              <Card key={milestone.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{milestone.name}</CardTitle>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[milestone.priority]}`}>
                      {milestone.priority}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{milestone.project?.name}</p>
                </CardHeader>
                <CardContent>
                  {milestone.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {milestone.description}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-2 mb-4">
                    <Icon className="w-4 h-4" />
                    <select
                      value={milestone.status}
                      onChange={(e) => handleStatusChange(milestone.id, e.target.value)}
                      className={`text-sm px-2 py-1 rounded-lg border-0 ${statusColors[milestone.status]}`}
                    >
                      <option value="not_started">Not Started</option>
                      <option value="in_progress">In Progress</option>
                      <option value="blocked">Blocked</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>

                  {(milestone.start_date || milestone.end_date) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {milestone.start_date && <span>{new Date(milestone.start_date).toLocaleDateString()}</span>}
                      {milestone.start_date && milestone.end_date && <span>-</span>}
                      {milestone.end_date && <span>{new Date(milestone.end_date).toLocaleDateString()}</span>}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-lg w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Create Milestone</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Milestone name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Project *</label>
                <select
                  value={formData.project_id}
                  onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                >
                  <option value="">Select project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe this milestone..."
                  rows={3}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                  >
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Start Date</label>
                  <Input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">End Date</label>
                  <Input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-border">
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleCreate} className="bg-primary">Create Milestone</Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
