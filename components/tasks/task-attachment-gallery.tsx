'use client'

import { useState } from 'react'
import { FileText, Download, ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type GalleryItem = {
  id?: string
  url: string | null
  file_name?: string | null
  file_type?: string | null
}

function isImageType(fileType: string | null | undefined, name?: string | null): boolean {
  const t = (fileType || '').toLowerCase()
  if (t.startsWith('image/')) return true
  const n = (name || '').toLowerCase()
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(n)
}

function isPdfType(fileType: string | null | undefined, name?: string | null): boolean {
  const t = (fileType || '').toLowerCase()
  if (t === 'link') return false
  if (t === 'application/pdf' || t.includes('pdf')) return true
  return (name || '').toLowerCase().endsWith('.pdf')
}

export function TaskAttachmentGallery({
  items,
  onRemove,
  className,
}: {
  items: GalleryItem[]
  onRemove?: (id: string) => void
  className?: string
}) {
  const [preview, setPreview] = useState<GalleryItem | null>(null)

  if (items.length === 0) return null

  return (
    <>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {items.map((item, idx) => {
          const key = item.id || `local-${idx}-${item.file_name || idx}`
          const url = item.url
          const isImg = isImageType(item.file_type, item.file_name)
          const isPdf = isPdfType(item.file_type, item.file_name)
          const label = item.file_name || (isImg ? 'Image' : isPdf ? 'PDF' : 'File')

          return (
            <div
              key={key}
              className="group relative w-20 h-20 shrink-0 rounded-md border border-border bg-muted/40 overflow-hidden"
            >
              {isImg && url ? (
                <button
                  type="button"
                  className="absolute inset-0 flex items-center justify-center"
                  onClick={() => setPreview(item)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={label} className="h-full w-full object-cover" />
                </button>
              ) : isPdf && url ? (
                <button
                  type="button"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-1 text-muted-foreground hover:bg-muted/80"
                  onClick={() => setPreview(item)}
                >
                  <FileText className="h-8 w-8 text-destructive" />
                  <span className="text-[9px] truncate max-w-full px-0.5">PDF</span>
                </button>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-1 text-[10px] text-center text-muted-foreground">
                  <FileText className="h-6 w-6 mb-0.5" />
                  <span className="line-clamp-2">{label}</span>
                  {url ? (
                    <button
                      type="button"
                      className="text-primary underline mt-1 text-[9px]"
                      onClick={() => setPreview(item)}
                    >
                      Open
                    </button>
                  ) : null}
                </div>
              )}
              {item.id && onRemove ? (
                <button
                  type="button"
                  className="absolute top-0.5 right-0.5 rounded bg-background/90 p-0.5 opacity-0 group-hover:opacity-100 border border-border"
                  aria-label="Remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(item.id!)
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">
              {preview?.file_name || 'Attachment'}
            </DialogTitle>
          </DialogHeader>
          {preview?.url ? (
            <div className="min-h-0 flex-1 overflow-auto flex flex-col gap-3">
              {isImageType(preview.file_type, preview.file_name) ? (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.url}
                    alt={preview.file_name || ''}
                    className="max-h-[70vh] w-auto max-w-full rounded-md object-contain"
                  />
                </div>
              ) : isPdfType(preview.file_type, preview.file_name) ? (
                <iframe
                  title={preview.file_name || 'PDF'}
                  src={preview.url}
                  className="w-full h-[min(70vh,600px)] rounded-md border border-border bg-muted"
                />
              ) : (
                <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>
              )}
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button type="button" variant="default" size="sm" asChild>
                  <a href={preview.url} download={preview.file_name || undefined} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </a>
                </Button>
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={preview.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Open in new tab
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No file URL available (storage may be unavailable).</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
