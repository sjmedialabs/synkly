'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Save } from 'lucide-react'
import { projectHref } from '@/lib/slug'

export default function EditProjectPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const projectRef = params.id as string
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(null)
  const [projectSummaries, setProjectSummaries] = useState<{ id: string; name: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    priority: 'medium',
    status: 'planning',
    phase: 'discovery',
    start_date: '',
    end_date: '',
    budget: '',
  })

  useEffect(() => {
    async function load() {
      const { data: sumRows } = await supabase.from('projects').select('id, name')
      setProjectSummaries(sumRows || [])

      const response = await fetch(`/api/projects/${encodeURIComponent(projectRef)}`)
      const result = await response.json()
      if (!response.ok || !result?.project) {
        alert(result?.error || 'Failed to load project')
        router.push('/projects')
        return
      }
      const p = result.project
      setResolvedProjectId(p.id)
      setFormData({
        name: p.name || '',
        description: p.description || '',
        priority: p.priority || 'medium',
        status: p.status || 'planning',
        phase: p.phase || 'discovery',
        start_date: p.start_date || '',
        end_date: p.end_date || '',
        budget: p.budget != null ? String(p.budget) : '',
      })
      setLoading(false)
    }
    if (projectRef) load()
  }, [projectRef, router, supabase])

  const handleSave = async () => {
    if (!formData.name.trim() || !resolvedProjectId) return
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectRef)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || 'Failed to update project')
      const { data: sumRows } = await supabase.from('projects').select('id, name')
      const summaries = sumRows || []
      router.push(projectHref({ id: resolvedProjectId, name: formData.name.trim() }, summaries))
    } catch (error: any) {
      alert(error.message || 'Failed to update project')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Edit Project">
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      title="Edit Project"
      subtitle="Update project details"
      actions={
        <Link
          href={
            resolvedProjectId
              ? projectHref({ id: resolvedProjectId, name: formData.name || 'Project' }, projectSummaries)
              : '/projects'
          }
        >
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Project
          </Button>
        </Link>
      }
    >
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-6 max-w-3xl">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Project Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
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
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                >
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Start Date</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">End Date</label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Phase</label>
                <input
                  type="text"
                  value={formData.phase}
                  onChange={(e) => setFormData({ ...formData, phase: e.target.value })}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Budget</label>
                <input
                  type="number"
                  min="0"
                  value={formData.budget}
                  onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background text-foreground"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end mt-6">
        <Button onClick={handleSave} disabled={saving || !formData.name.trim()} className="bg-primary">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </DashboardLayout>
  )
}
