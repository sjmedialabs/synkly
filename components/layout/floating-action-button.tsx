'use client'

import { ReactNode } from 'react'

interface FloatingActionButtonProps {
  children: ReactNode
  className?: string
}

export function FloatingActionButton({ children, className = '' }: FloatingActionButtonProps) {
  return (
    <div className={`fixed bottom-6 right-6 flex flex-col gap-3 items-end ${className}`}>
      {children}
    </div>
  )
}
