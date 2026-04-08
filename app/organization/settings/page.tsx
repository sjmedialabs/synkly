'use client'

import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { MasterDataManager } from '@/components/settings/master-data-manager'
import { Button } from '@/components/ui/button'
import { UserCog } from 'lucide-react'

export default function OrganizationSettingsPage() {
  return (
    <DashboardLayout
      title="Organization Settings"
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href="/organization/users" className="gap-2 inline-flex items-center">
            <UserCog className="w-4 h-4" />
            Organization users
          </Link>
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground mb-6 max-w-3xl">
        Manage the same master data lists used across team, projects, and forms. Types and values mirror platform
        master data; changes here apply to your organization&apos;s workflows.
      </p>
      <MasterDataManager />
    </DashboardLayout>
  )
}
