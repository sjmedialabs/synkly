'use client'

import { ReactNode } from 'react'
import { Sidebar } from './sidebar'

interface DashboardLayoutProps {
  children: ReactNode
  title: string
  actions?: ReactNode
}

export function DashboardLayout({ children, title, actions }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Fixed Sidebar */}
      <div className="fixed left-0 top-0 h-screen w-64 border-r border-border bg-card overflow-y-auto">
        <Sidebar />
      </div>
      
      {/* Main content area with sidebar offset */}
      <main className="flex-1 ml-64 flex flex-col">
        {/* Sticky Header */}
        <header className="sticky top-0 z-40 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {actions && <div className="flex items-center gap-4">{actions}</div>}
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
