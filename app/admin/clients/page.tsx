'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Building2, 
  Users, 
  FolderKanban, 
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  Mail,
  Phone,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Client {
  id: string
  name: string
  email: string | null
  company: string | null
  phone: string | null
  address: string | null
  is_active: boolean
  created_at: string
  _count?: {
    users: number
    projects: number
  }
}

export default function AdminClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function fetchData() {
      try {
        // Server API enforces role + access using robust auth context.
        const clientsRes = await fetch('/api/clients')
        const clientsJson = await clientsRes.json()

        if (!clientsRes.ok) {
          if (clientsRes.status === 401) {
            router.push('/auth/login')
            return
          }
          if (clientsRes.status === 403) {
            router.push('/dashboard')
            return
          }
          throw new Error(clientsJson?.error || 'Failed to load clients')
        }

        const clientsData = (clientsJson.clients || []) as Client[]
        if (clientsData.length === 0) {
          setClients([])
          return
        }

        const supabase = createClient()
        const clientsWithCounts = await Promise.all(
          clientsData.map(async (client) => {
            const [usersCount, projectsCount] = await Promise.all([
              supabase.from('team').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
              supabase.from('projects').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
            ])
            return {
              ...client,
              _count: {
                users: usersCount.count || 0,
                projects: projectsCount.count || 0,
              },
            }
          }),
        )
        setClients(clientsWithCounts)
      } catch (error) {
        console.error('[admin/clients] Failed to load clients:', error)
        setClients([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router])

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (client.company?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (client.email?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <DashboardLayout title="Clients">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-muted rounded w-64"></div>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout 
      title="Clients"
      actions={
        <Link href="/admin/clients/new">
          <Button className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" />
            Add Client
          </Button>
        </Link>
      }
    >
      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Clients</p>
                <p className="text-2xl font-bold">{clients.length}</p>
              </div>
              <Building2 className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Clients</p>
                <p className="text-2xl font-bold">{clients.filter(c => c.is_active).length}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold">
                  {clients.reduce((sum, c) => sum + (c._count?.users || 0), 0)}
                </p>
              </div>
              <Users className="w-8 h-8 text-violet-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clients List */}
      {filteredClients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">
              {searchQuery ? 'No clients found matching your search' : 'No clients yet'}
            </p>
            {!searchQuery && (
              <Link href="/admin/clients/new">
                <Button className="bg-primary hover:bg-primary/90">
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Client
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredClients.map((client) => (
            <Card key={client.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                      <Link href={`/admin/clients/${client.id}`}>
                        <h3 className="font-semibold text-lg text-foreground hover:text-primary transition-colors">
                          {client.name}
                        </h3>
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {client.company || 'No company'}
                      </p>
                      <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                        {client.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            {client.email}
                          </span>
                        )}
                        {client.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-4 h-4" />
                            {client.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-4 h-4" />
                        <span>{client._count?.users || 0} users</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FolderKanban className="w-4 h-4" />
                        <span>{client._count?.projects || 0} projects</span>
                      </div>
                    </div>
                    
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      client.is_active 
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' 
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {client.is_active ? 'Active' : 'Inactive'}
                    </span>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/clients/${client.id}`}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  )
}
