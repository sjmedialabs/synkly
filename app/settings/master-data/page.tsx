'use client'

import { useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { MasterDataManager } from '@/components/settings/master-data-manager'
import { RolesPermissionsManager } from '@/components/settings/roles-permissions-manager'
import { OrgHierarchyManager } from '@/components/settings/org-hierarchy-manager'

const TABS = [
  { key: 'data-types', label: 'Data Types' },
  { key: 'roles', label: 'Roles & Permissions' },
  { key: 'org-hierarchy', label: 'Org Hierarchy' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function MasterDataPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('data-types')

  return (
    <DashboardLayout title="Master Data Settings">
      {/* Tabs */}
      <div className="border-b border-border mb-6">
        <nav className="flex gap-4" aria-label="Tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'data-types' && <MasterDataManager />}
      {activeTab === 'roles' && <RolesPermissionsManager />}
      {activeTab === 'org-hierarchy' && <OrgHierarchyManager />}
    </DashboardLayout>
  )
}
