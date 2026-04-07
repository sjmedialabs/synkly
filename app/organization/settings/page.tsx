'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import Loading from '@/components/loading'

interface Designation {
  id: string
  name: string
  description?: string
  level: number
}

interface Department {
  id: string
  name: string
  description?: string
}

export default function OrganizationSettings() {
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()

  const [designations, setDesignations] = useState<Designation[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [newDesignation, setNewDesignation] = useState('')
  const [newDepartment, setNewDepartment] = useState('')

  useEffect(() => {
    if (!authLoading && user) {
      loadMasterData()
    }
  }, [authLoading, user])

  const loadMasterData = async () => {
    try {
      setLoading(true)

      // Fetch designations
      const { data: desigData, error: desigError } = await supabase
        .from('master_designations')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')

      // Fetch departments
      const { data: deptData, error: deptError } = await supabase
        .from('master_departments')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')

      if (desigError) throw desigError
      if (deptError) throw deptError

      setDesignations(desigData || [])
      setDepartments(deptData || [])
    } catch (error) {
      console.error('Error loading master data:', error)
      toast({
        title: 'Error',
        description: 'Failed to load master data',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const addDesignation = async () => {
    if (!newDesignation.trim()) {
      toast({
        title: 'Error',
        description: 'Designation name is required',
        variant: 'destructive',
      })
      return
    }

    try {
      const { error } = await supabase.from('master_designations').insert({
        name: newDesignation,
        is_active: true,
        sort_order: designations.length + 1,
      })

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Designation added successfully',
      })

      setNewDesignation('')
      loadMasterData()
    } catch (error) {
      console.error('Error adding designation:', error)
      toast({
        title: 'Error',
        description: 'Failed to add designation',
        variant: 'destructive',
      })
    }
  }

  const addDepartment = async () => {
    if (!newDepartment.trim()) {
      toast({
        title: 'Error',
        description: 'Department name is required',
        variant: 'destructive',
      })
      return
    }

    try {
      const { error } = await supabase.from('master_departments').insert({
        name: newDepartment,
        is_active: true,
        sort_order: departments.length + 1,
      })

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Department added successfully',
      })

      setNewDepartment('')
      loadMasterData()
    } catch (error) {
      console.error('Error adding department:', error)
      toast({
        title: 'Error',
        description: 'Failed to add department',
        variant: 'destructive',
      })
    }
  }

  if (authLoading || loading) {
    return <Loading />
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Organization Settings</h1>
        <p className="text-muted-foreground">Manage your organization&apos;s master data and configuration</p>
      </div>

      <Tabs defaultValue="designations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="designations">Designations</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
        </TabsList>

        <TabsContent value="designations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Manage Designations</CardTitle>
              <CardDescription>Add and manage job designations for your team members</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter designation name"
                  value={newDesignation}
                  onChange={(e) => setNewDesignation(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button onClick={addDesignation}>Add Designation</Button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {designations.map((designation) => (
                  <div
                    key={designation.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-md"
                  >
                    <div>
                      <p className="font-medium">{designation.name}</p>
                      {designation.description && (
                        <p className="text-sm text-muted-foreground">{designation.description}</p>
                      )}
                    </div>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Level {designation.level}</span>
                  </div>
                ))}
                {designations.length === 0 && (
                  <p className="text-center py-4 text-muted-foreground">No designations yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Manage Departments</CardTitle>
              <CardDescription>Add and manage departments in your organization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter department name"
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button onClick={addDepartment}>Add Department</Button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {departments.map((department) => (
                  <div
                    key={department.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-md"
                  >
                    <div>
                      <p className="font-medium">{department.name}</p>
                      {department.description && (
                        <p className="text-sm text-muted-foreground">{department.description}</p>
                      )}
                    </div>
                  </div>
                ))}
                {departments.length === 0 && (
                  <p className="text-center py-4 text-muted-foreground">No departments yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
