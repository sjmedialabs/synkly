'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { MasterDataManager } from '@/components/settings/master-data-manager'

export default function MasterDataPage() {
  return (
    <DashboardLayout title="Master Data Settings">
      <MasterDataManager />
    </DashboardLayout>
  )
}
