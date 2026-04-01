'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Plus, X, Calendar, Play, CheckCircle2, Clock } from 'lucide-react'

interface Sprint {
  id: string
  sprint_name: string
  project_id: string
  project: { name: string } | null
  start_date: string | null
  end_date: string | null
  status: string
  review_notes: string | null
  created_at: string
}

interface Project {
  id: string
  name: string
}

const statusColors: Record<string, string> = {
  planned: 'bg-muted text-muted-foreground',
  active: 'bg-primary/10 text-primary',
  completed: 'bg-green-500/10 text-green-600',
}

const statusIcons: Record<string, React.ElementType> = {
  planned: Clock,
  active: Play,
  completed: CheckCircle2,
}

export default function SprintsPage() {
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    sprint_name: '',
    project_id: '',
    start_date: '',
    end_date: '',
    status: 'planned',
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

      const [sprintsRes, projectsRes] = await Promise.all([
        supabase
          .from('sprint_tracking')
          .select(`
            *,
            project:projects(name)
          `)
          .order('created_at', { ascending: false }),
        supabase.from('projects').select('id, name').order('name'),
      ])

      setSprints(sprintsRes.data || [])
      setProjects(projectsRes.data || [])
      setLoading(false)
    }

    fetchData()
  }, [router, supabase])

  const handleCreate = async () => {
    if (!formData.sprint_name.trim() || !formData.project_id) return

    const { data, error } = await supabase
      .from('sprint_tracking')
      .insert({
        sprint_name: formData.sprint_name,
        project_id: formData.project_id,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        status: formData.status,
      })
      .select(`
        *,
        project:projects(name)
      `)
      .single()

    if (!error && data) {
      setSprints([data, ...sprints])
      setShowModal(false)
      setFormData({
        sprint_name: '',
        project_id: '',
        start_date: '',
        end_date: '',
        status: 'planned',
      })
    }
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from('sprint_tracking')
      .update({ status: newStatus })
      .eq('id', id)

    if (!error) {
      setSprints(sprints.map(s => 
        s.id === id ? { ...s, status: newStatus } : s
      ))
    }
  }

  const getSprintProgress = (sprint: Sprint) => {
    if (!sprint.start_date || !sprint.end_date) return 0
    const start = new Date(sprint.start_date).getTime()
    const end = new Date(sprint.end_date).getTime()
    const now = Date.now()
    if (now < start) return 0
    if (now > end) return 100
    return Math.round(((now - start) / (end - start)) * 100)
  }

  if (loading) {
    return (
      <DashboardLayout title="Sprints">
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

  // Group sprints by status
  const groupedSprints = {
    active: sprints.filter(s => s.status === 'active'),
    planned: sprints.filter(s => s.status === 'planned'),
    completed: sprints.filter(s => s.status === 'completed'),
  }

  return (
    <DashboardLayout 
      title="Sprints"
      actions={
        <Button onClick={() => setShowModal(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
          <Plus className="w-4 h-4 mr-2" />
          Create Sprint
        </Button>
      }
    >
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        {Object.entries(groupedSprints).map(([status, items]) => {
          const Icon = statusIcons[status]
          return (
            <Card key={status}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground capitalize">{status}</p>
                    <p className="text-2xl font-bold text-foreground">{items.length}</p>
                  </div>
                  <Icon className={`w-8 h-8 ${status === 'completed' ? 'text-green-500' : status === 'active' ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Active Sprints */}
      {groupedSprints.active.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Play className="w-5 h-5 text-primary" />
            Active Sprints
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {groupedSprints.active.map((sprint) => {
              const progress = getSprintProgress(sprint)
              return (
                <Card key={sprint.id} className="border-primary/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{sprint.sprint_name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{sprint.project?.name}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{progress}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                      <Calendar className="w-3 h-3" />
                      {sprint.start_date && <span>{new Date(sprint.start_date).toLocaleDateString()}</span>}
                      {sprint.start_date && sprint.end_date && <span>-</span>}
                      {sprint.end_date && <span>{new Date(sprint.end_date).toLocaleDateString()}</span>}
                    </div>

                    <Button 
                      size="sm" 
                      className="w-full"
                      onClick={() => handleStatusChange(sprint.id, 'completed')}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Complete Sprint
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* All Sprints */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">All Sprints</h3>
        {sprints.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium text-foreground mb-2">No sprints yet</h3>
              <p className="text-muted-foreground mb-4">Create your first sprint to start tracking.</p>
              <Button onClick={() => setShowModal(true)} className="bg-primary">
                <Plus className="w-4 h-4 mr-2" />
                Create Sprint
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sprints.filter(s => s.status !== 'active').map((sprint) => {
              const Icon = statusIcons[sprint.status]
              return (
                <Card key={sprint.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{sprint.sprint_name}</CardTitle>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColors[sprint.status]}`}>
                        {sprint.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{sprint.project?.name}</p>
                  </CardHeader>
                  <CardContent>
                    {(sprint.start_date || sprint.end_date) && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                        <Calendar className="w-3 h-3" />
                        {sprint.start_date && <span>{new Date(sprint.start_date).toLocaleDateString()}</span>}
                        {sprint.start_date && sprint.end_date && <span>-</span>}
                        {sprint.end_date && <span>{new Date(sprint.end_date).toLocaleDateString()}</span>}
                      </div>
                    )}

                    {sprint.status === 'planned' && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="w-full"
                        onClick={() => handleStatusChange(sprint.id, 'active')}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Start Sprint
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-lg w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Create Sprint</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Sprint Name *</label>
                <Input
                  value={formData.sprint_name}
                  onChange={(e) => setFormData({ ...formData, sprint_name: e.target.value })}
                  placeholder="e.g., Sprint 1"
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
              <Button onClick={handleCreate} className="bg-primary">Create Sprint</Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
