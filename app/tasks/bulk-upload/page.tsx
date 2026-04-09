'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, ArrowLeft, Loader2 } from 'lucide-react'

type ImportResult = {
  row: number
  task_name: string
  project_name: string
  module_name: string
  status: 'created' | 'error'
  error?: string
}

type Summary = {
  total: number
  created: number
  errors: number
}

export default function BulkUploadPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null
    setFile(selected)
    setResults(null)
    setSummary(null)
    setError(null)
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    setResults(null)
    setSummary(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/tasks/bulk-upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      setSummary(data.summary)
      setResults(data.results)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDownloadTemplate = () => {
    window.location.href = '/api/tasks/bulk-upload'
  }

  return (
    <DashboardLayout
      title="Bulk Upload Tasks"
      actions={
        <Button variant="outline" onClick={() => router.push('/tasks')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Tasks
        </Button>
      }
    >
      <div className="max-w-4xl space-y-6">
        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              Import Tasks from Excel
            </CardTitle>
            <CardDescription>
              Upload an Excel file (.xlsx) to create tasks in bulk. Each task must have a Project Name, Module Name, and Task Name.
              Modules that don't exist will be auto-created under the matched project.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <p className="text-sm font-medium text-foreground mb-2">Required columns:</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <span className="px-2 py-1 bg-primary/10 text-primary rounded font-medium">Project Name *</span>
                  <span className="px-2 py-1 bg-primary/10 text-primary rounded font-medium">Module Name *</span>
                  <span className="px-2 py-1 bg-primary/10 text-primary rounded font-medium">Task Name *</span>
                  <span className="px-2 py-1 bg-muted text-muted-foreground rounded">Description</span>
                  <span className="px-2 py-1 bg-muted text-muted-foreground rounded">Estimation</span>
                  <span className="px-2 py-1 bg-muted text-muted-foreground rounded">Start Date</span>
                  <span className="px-2 py-1 bg-muted text-muted-foreground rounded">End Date</span>
                </div>
              </div>

              <Button variant="outline" onClick={handleDownloadTemplate}>
                <Download className="w-4 h-4 mr-2" />
                Download Template (.xlsx)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload File</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-input rounded-lg cursor-pointer hover:bg-muted/30 transition">
                <Upload className="w-10 h-10 text-muted-foreground mb-3" />
                {file ? (
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(file.size / 1024).toFixed(1)} KB — Click to change
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Click to select Excel file</p>
                    <p className="text-xs text-muted-foreground mt-1">.xlsx files only</p>
                  </div>
                )}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}

              <Button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="w-full"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing tasks...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Import Tasks
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {summary && results && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Import Results</CardTitle>
              <CardDescription>
                {summary.created} of {summary.total} tasks created successfully
                {summary.errors > 0 && ` — ${summary.errors} errors`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Summary bar */}
              <div className="flex gap-4 mb-4">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-medium">{summary.created} Created</span>
                </div>
                {summary.errors > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive">
                    <XCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">{summary.errors} Errors</span>
                  </div>
                )}
              </div>

              {/* Results table */}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left px-3 py-2 font-medium">Row</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                        <th className="text-left px-3 py-2 font-medium">Project</th>
                        <th className="text-left px-3 py-2 font-medium">Module</th>
                        <th className="text-left px-3 py-2 font-medium">Task</th>
                        <th className="text-left px-3 py-2 font-medium">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i} className={`border-b border-border ${r.status === 'error' ? 'bg-destructive/5' : ''}`}>
                          <td className="px-3 py-2 text-muted-foreground">{r.row}</td>
                          <td className="px-3 py-2">
                            {r.status === 'created' ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-destructive" />
                            )}
                          </td>
                          <td className="px-3 py-2">{r.project_name}</td>
                          <td className="px-3 py-2">{r.module_name}</td>
                          <td className="px-3 py-2 font-medium">{r.task_name}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {r.error || (r.status === 'created' ? 'OK' : '')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {summary.created > 0 && (
                <div className="mt-4">
                  <Button onClick={() => router.push('/tasks')}>
                    View Tasks
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
