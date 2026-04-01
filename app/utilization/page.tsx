'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts'
import { AlertTriangle, TrendingUp, Clock, Users, Download } from 'lucide-react'

type UtilizationData = {
  employeeId: string
  employeeName: string
  totalHours: number
  billableHours: number
  nonBillableHours: number
  utilizationRate: number
  projects: string[]
}

type MonthlyTrend = {
  month: string
  billable: number
  nonBillable: number
  total: number
}

type ProjectBreakdown = {
  name: string
  hours: number
  billable: boolean
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

export default function UtilizationPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [utilizationData, setUtilizationData] = useState<UtilizationData[]>([])
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrend[]>([])
  const [projectBreakdown, setProjectBreakdown] = useState<ProjectBreakdown[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [alerts, setAlerts] = useState<any[]>([])

  // Summary stats
  const totalBillable = utilizationData.reduce((sum, d) => sum + d.billableHours, 0)
  const totalNonBillable = utilizationData.reduce((sum, d) => sum + d.nonBillableHours, 0)
  const totalHours = totalBillable + totalNonBillable
  const avgUtilization = utilizationData.length 
    ? Math.round(utilizationData.reduce((sum, d) => sum + d.utilizationRate, 0) / utilizationData.length) 
    : 0
  const underUtilized = utilizationData.filter(d => d.utilizationRate < 70).length
  const overUtilized = utilizationData.filter(d => d.utilizationRate > 100).length

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Fetch tasks with billable info
      const { data: tasks } = await supabase
        .from('tasks')
        .select(`
          id,
          estimated_hours,
          is_billable,
          status,
          assignee_id,
          project_id,
          assigned_month,
          assignee:users!tasks_assignee_id_fkey (id, full_name, email),
          projects (id, name)
        `)
        .not('assignee_id', 'is', null)

      // Fetch capacity data
      const { data: capacityData } = await supabase
        .from('employee_capacity')
        .select(`
          employee_id,
          month,
          available_hours,
          allocated_hours,
          users (id, full_name, email)
        `)
        .eq('month', selectedMonth)

      // Calculate utilization per employee
      const employeeMap = new Map<string, UtilizationData>()

      tasks?.forEach(task => {
        if (!task.assignee) return
        
        const empId = task.assignee_id
        const empName = task.assignee.full_name || task.assignee.email
        
        if (!employeeMap.has(empId)) {
          employeeMap.set(empId, {
            employeeId: empId,
            employeeName: empName,
            totalHours: 0,
            billableHours: 0,
            nonBillableHours: 0,
            utilizationRate: 0,
            projects: [],
          })
        }
        
        const emp = employeeMap.get(empId)!
        const hours = task.estimated_hours || 0
        emp.totalHours += hours
        
        if (task.is_billable) {
          emp.billableHours += hours
        } else {
          emp.nonBillableHours += hours
        }

        if (task.projects?.name && !emp.projects.includes(task.projects.name)) {
          emp.projects.push(task.projects.name)
        }
      })

      // Calculate utilization rates based on capacity
      capacityData?.forEach(cap => {
        const emp = employeeMap.get(cap.employee_id)
        if (emp && cap.available_hours > 0) {
          emp.utilizationRate = Math.round((emp.totalHours / cap.available_hours) * 100)
        }
      })

      // For employees without capacity data, assume 160 hours/month
      employeeMap.forEach(emp => {
        if (emp.utilizationRate === 0 && emp.totalHours > 0) {
          emp.utilizationRate = Math.round((emp.totalHours / 160) * 100)
        }
      })

      setUtilizationData(Array.from(employeeMap.values()))

      // Generate monthly trend (last 6 months)
      const months: MonthlyTrend[] = []
      for (let i = 5; i >= 0; i--) {
        const date = new Date()
        date.setMonth(date.getMonth() - i)
        const monthStr = date.toLocaleDateString('en-US', { month: 'short' })
        
        // Calculate hours for this month from tasks
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        let billable = 0
        let nonBillable = 0
        
        tasks?.forEach(task => {
          if (task.assigned_month === monthKey || (!task.assigned_month && i === 0)) {
            const hours = task.estimated_hours || 0
            if (task.is_billable) {
              billable += hours
            } else {
              nonBillable += hours
            }
          }
        })

        months.push({
          month: monthStr,
          billable: Math.round(billable),
          nonBillable: Math.round(nonBillable),
          total: Math.round(billable + nonBillable),
        })
      }
      setMonthlyTrend(months)

      // Project breakdown
      const projectMap = new Map<string, ProjectBreakdown>()
      tasks?.forEach(task => {
        const projName = task.projects?.name || 'Unassigned'
        if (!projectMap.has(projName)) {
          projectMap.set(projName, {
            name: projName,
            hours: 0,
            billable: task.is_billable ?? true,
          })
        }
        projectMap.get(projName)!.hours += task.estimated_hours || 0
      })
      setProjectBreakdown(Array.from(projectMap.values()).sort((a, b) => b.hours - a.hours).slice(0, 6))

      // Fetch alerts
      const { data: alertsData } = await supabase
        .from('alerts')
        .select('*')
        .eq('is_read', false)
        .eq('type', 'capacity_warning')
        .order('created_at', { ascending: false })
        .limit(5)

      setAlerts(alertsData || [])
      setLoading(false)
    }

    fetchData()
  }, [router, supabase, selectedMonth])

  const pieData = [
    { name: 'Billable', value: totalBillable },
    { name: 'Non-Billable', value: totalNonBillable },
  ]

  if (loading) {
    return (
      <DashboardLayout title="Utilization Dashboard">
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-lg"></div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-80 bg-muted rounded-lg"></div>
            <div className="h-80 bg-muted rounded-lg"></div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout 
      title="Utilization Dashboard"
      actions={
        <div className="flex items-center gap-4">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 border border-input rounded-lg bg-background text-foreground"
          >
            {Array.from({ length: 12 }, (_, i) => {
              const date = new Date()
              date.setMonth(date.getMonth() - i)
              const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
              const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              return <option key={value} value={value}>{label}</option>
            })}
          </select>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Alert Banner */}
        {alerts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-800">Capacity Alerts</h4>
              <ul className="text-sm text-amber-700 mt-1 space-y-1">
                {alerts.slice(0, 3).map((alert, i) => (
                  <li key={i}>{alert.message}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Utilization</p>
                  <p className="text-2xl font-bold text-foreground">{avgUtilization}%</p>
                </div>
                <TrendingUp className={`w-8 h-8 ${avgUtilization >= 80 ? 'text-green-500' : 'text-amber-500'}`} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Billable Hours</p>
                  <p className="text-2xl font-bold text-primary">{totalBillable}h</p>
                </div>
                <Clock className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Under-Utilized</p>
                  <p className="text-2xl font-bold text-amber-600">{underUtilized}</p>
                  <p className="text-xs text-muted-foreground">Below 70%</p>
                </div>
                <Users className="w-8 h-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Over-Allocated</p>
                  <p className="text-2xl font-bold text-destructive">{overUtilized}</p>
                  <p className="text-xs text-muted-foreground">Above 100%</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-2 gap-6">
          {/* Billable vs Non-Billable Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Billable vs Non-Billable Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      fill="#8884d8"
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      <Cell fill="#3B82F6" />
                      <Cell fill="#94A3B8" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-8 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary"></div>
                  <span className="text-sm text-muted-foreground">Billable ({totalBillable}h)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-slate-400"></div>
                  <span className="text-sm text-muted-foreground">Non-Billable ({totalNonBillable}h)</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Monthly Trend Line Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Hours Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="month" stroke="#6B7280" fontSize={12} />
                    <YAxis stroke="#6B7280" fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="billable" stroke="#3B82F6" strokeWidth={2} name="Billable" />
                    <Line type="monotone" dataKey="nonBillable" stroke="#94A3B8" strokeWidth={2} name="Non-Billable" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Employee Utilization Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Employee Utilization Rates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={utilizationData.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" domain={[0, 120]} stroke="#6B7280" fontSize={12} />
                  <YAxis dataKey="employeeName" type="category" width={120} stroke="#6B7280" fontSize={12} />
                  <Tooltip 
                    formatter={(value: number) => [`${value}%`, 'Utilization']}
                    labelFormatter={(label) => `Employee: ${label}`}
                  />
                  <Bar 
                    dataKey="utilizationRate" 
                    name="Utilization %"
                    radius={[0, 4, 4, 0]}
                  >
                    {utilizationData.slice(0, 10).map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.utilizationRate > 100 ? '#EF4444' : entry.utilizationRate < 70 ? '#F59E0B' : '#10B981'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm text-muted-foreground">Optimal (70-100%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <span className="text-sm text-muted-foreground">Under-Utilized (&lt;70%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-sm text-muted-foreground">Over-Allocated (&gt;100%)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project Hours Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Hours by Project</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" stroke="#6B7280" fontSize={12} />
                  <YAxis stroke="#6B7280" fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="hours" name="Hours" radius={[4, 4, 0, 0]}>
                    {projectBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Employee Details Table */}
        <Card>
          <CardHeader>
            <CardTitle>Detailed Utilization Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Employee</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Total Hours</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Billable</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Non-Billable</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Utilization</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Projects</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {utilizationData.map((emp) => (
                    <tr key={emp.employeeId} className="hover:bg-secondary/50 transition">
                      <td className="px-4 py-3 font-medium text-foreground">{emp.employeeName}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{emp.totalHours}h</td>
                      <td className="px-4 py-3 text-sm text-primary font-medium">{emp.billableHours}h</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{emp.nonBillableHours}h</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          emp.utilizationRate > 100 ? 'bg-red-100 text-red-800' :
                          emp.utilizationRate < 70 ? 'bg-amber-100 text-amber-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {emp.utilizationRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {emp.projects.slice(0, 2).map((proj, i) => (
                            <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded">
                              {proj}
                            </span>
                          ))}
                          {emp.projects.length > 2 && (
                            <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded">
                              +{emp.projects.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
