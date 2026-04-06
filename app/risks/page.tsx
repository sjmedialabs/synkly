'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  AlertTriangle, 
  AlertCircle, 
  Clock, 
  CheckCircle,
  RefreshCw,
  User,
  Calendar,
  TrendingUp
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts'

type RiskyTask = {
  id: string
  title: string
  status: string
  risk_score: number
  risk_level: string
  predicted_delay_days: number
  end_date: string | null
  estimated_hours: number | null
  assignee: { id: string; full_name: string; email: string } | null
  modules: { name: string; projects: { name: string } } | null
}

type RiskSummary = {
  critical: number
  high: number
  medium: number
  low: number
}

const riskColors = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e'
}

const riskIcons = {
  critical: AlertCircle,
  high: AlertTriangle,
  medium: Clock,
  low: CheckCircle
}

export default function RisksPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [tasks, setTasks] = useState<RiskyTask[]>([])
  const [summary, setSummary] = useState<RiskSummary>({ critical: 0, high: 0, medium: 0, low: 0 })
  const [loading, setLoading] = useState(true)
  const [evaluating, setEvaluating] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }
      setUser(user)
      await fetchRiskData()
    }
    init()
  }, [])

  const fetchRiskData = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/tasks/evaluate-risk')
      const data = await response.json()
      setTasks(data.tasks || [])
      setSummary(data.summary || { critical: 0, high: 0, medium: 0, low: 0 })
    } catch (error) {
      console.error('Error fetching risk data:', error)
    } finally {
      setLoading(false)
    }
  }

  const evaluateAllRisks = async () => {
    setEvaluating(true)
    try {
      await fetch('/api/tasks/evaluate-risk', { method: 'POST', body: JSON.stringify({}) })
      await fetchRiskData()
    } catch (error) {
      console.error('Error evaluating risks:', error)
    } finally {
      setEvaluating(false)
    }
  }

  const pieData = [
    { name: 'Critical', value: summary.critical, color: riskColors.critical },
    { name: 'High', value: summary.high, color: riskColors.high },
    { name: 'Medium', value: summary.medium, color: riskColors.medium },
    { name: 'Low', value: summary.low, color: riskColors.low },
  ].filter(d => d.value > 0)

  const barData = tasks.slice(0, 10).map(task => ({
    name: task.title.slice(0, 20) + (task.title.length > 20 ? '...' : ''),
    score: task.risk_score,
    fill: riskColors[task.risk_level as keyof typeof riskColors]
  }))

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Risk Dashboard</h1>
            <p className="text-muted-foreground">
              Predictive risk analysis and delay forecasting
            </p>
          </div>
          <Button onClick={evaluateAllRisks} disabled={evaluating}>
            <RefreshCw className={`w-4 h-4 mr-2 ${evaluating ? 'animate-spin' : ''}`} />
            {evaluating ? 'Evaluating...' : 'Re-evaluate All'}
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {(['critical', 'high', 'medium', 'low'] as const).map((level) => {
            const Icon = riskIcons[level]
            return (
              <Card key={level} className="border-l-4" style={{ borderLeftColor: riskColors[level] }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground capitalize">{level} Risk</p>
                      <p className="text-3xl font-bold">{summary[level]}</p>
                    </div>
                    <Icon className="w-8 h-8" style={{ color: riskColors[level] }} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Risk Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  No risk data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top 10 Risky Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="score" name="Risk Score" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  No risky tasks found
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Risk Task List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">At-Risk Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <p>All tasks are on track. No risks detected.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Task</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Project</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Assignee</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Due Date</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Risk Level</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => {
                      const Icon = riskIcons[task.risk_level as keyof typeof riskIcons] || AlertTriangle
                      return (
                        <tr key={task.id} className="border-b border-border hover:bg-muted/50">
                          <td className="py-3 px-4">
                            <p className="font-medium text-foreground">{task.title}</p>
                            <p className="text-sm text-muted-foreground">{task.status}</p>
                          </td>
                          <td className="py-3 px-4 text-sm">
                            {task.modules?.projects?.name || '-'}
                          </td>
                          <td className="py-3 px-4">
                            {task.assignee ? (
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                                  <User className="w-3 h-3 text-primary" />
                                </div>
                                <span className="text-sm">{task.assignee.full_name || task.assignee.email}</span>
                              </div>
                            ) : (
                              <span className="text-amber-600 text-sm">Unassigned</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {task.end_date ? (
                              <div className="flex items-center gap-1 text-sm">
                                <Calendar className="w-3 h-3" />
                                {new Date(task.end_date).toLocaleDateString()}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">No due date</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium capitalize"
                              style={{ 
                                backgroundColor: `${riskColors[task.risk_level as keyof typeof riskColors]}20`,
                                color: riskColors[task.risk_level as keyof typeof riskColors]
                              }}
                            >
                              <Icon className="w-3 h-3" />
                              {task.risk_level}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full"
                                  style={{ 
                                    width: `${Math.min(task.risk_score, 100)}%`,
                                    backgroundColor: riskColors[task.risk_level as keyof typeof riskColors]
                                  }}
                                />
                              </div>
                              <span className="text-sm font-medium">{task.risk_score}</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
