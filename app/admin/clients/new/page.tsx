'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Building2, Loader2, UserPlus } from 'lucide-react'
import Link from 'next/link'

export default function NewClientPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Client fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  
  // Client admin fields
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email: email || null,
          company: company || null,
          phone: phone || null,
          address: address || null,
          client_admin_name: adminName,
          client_admin_email: adminEmail,
          client_admin_password: adminPassword || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create client')
      }

      router.push('/admin/clients')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DashboardLayout 
      title="Add New Client"
      actions={
        <Link href="/admin/clients">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Clients
          </Button>
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="max-w-2xl">
        {/* Client Details */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <CardTitle>Client Details</CardTitle>
                <CardDescription>Basic information about the client organization</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Client Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Corporation"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Inc."
                />
              </div>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@acme.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Business Street, City, State 12345"
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Client Admin */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <CardTitle>Client Administrator</CardTitle>
                <CardDescription>
                  The primary admin who will manage this client organization
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="adminName">Full Name *</Label>
                <Input
                  id="adminName"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="John Doe"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminEmail">Email *</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="john@acme.com"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="adminPassword">Password</Label>
              <Input
                id="adminPassword"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Leave empty to send invitation email"
              />
              <p className="text-xs text-muted-foreground">
                If left empty, an invitation email will be sent to the admin
              </p>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-4">
          <Button type="submit" className="bg-primary" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Building2 className="w-4 h-4 mr-2" />
                Create Client
              </>
            )}
          </Button>
          <Link href="/admin/clients">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </DashboardLayout>
  )
}
