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
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-8 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          {actions && <div className="flex items-center gap-4">{actions}</div>}
        </header>

        {/* Content */}
        <div className="flex-1 p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
