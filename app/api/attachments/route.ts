import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthContext } from '@/lib/rbac-server'

const ATTACHMENTS_BUCKET = 'attachments'

function isAttachmentsTableMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === 'PGRST205') return true
  return /could not find the table.*attachments/i.test(String(err.message || ''))
}

/** Supabase Storage errors vary by version; treat missing bucket / 404 as recoverable. */
function isStorageBucketMissing(uploadError: unknown): boolean {
  if (!uploadError) return false
  const e = uploadError as Record<string, unknown>
  const parts = [e.message, e.error, e.statusCode, e.status, String(uploadError)].filter(Boolean)
  const text = parts.join(' ').toLowerCase()
  if (text.includes('bucket not found') || text.includes('not found')) return true
  const code = e.statusCode ?? e.status
  return code === '404' || code === 404
}

function attachmentsSetupHint() {
  return 'Database table public.attachments is missing. Run the SQL in scripts/023_attachments.sql (and 027/028 if you use drafts), then reload the schema in Supabase.'
}

/** Creates bucket if this project never set up Storage (service role). Ignores "already exists". */
async function ensureAttachmentsBucket(adminClient: SupabaseClient) {
  const { error } = await adminClient.storage.createBucket(ATTACHMENTS_BUCKET, {
    public: true,
    fileSizeLimit: 10485760, // 10MB, matches upload limit in this route
  })
  if (!error) return
  const m = (error.message || '').toLowerCase()
  if (m.includes('already') || m.includes('exists') || m.includes('duplicate')) return
  console.warn('[attachments] createBucket:', error.message)
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const contentType = request.headers.get('content-type') || ''

    // Handle link attachments (JSON)
    if (contentType.includes('application/json')) {
      const body = await request.json()
      const { entity_type, entity_id, url } = body
      if (!entity_type || !entity_id || !url) {
        return NextResponse.json({ error: 'entity_type, entity_id, and url are required' }, { status: 400 })
      }

      const { data, error } = await ctx.adminClient
        .from('attachments')
        .insert({
          entity_type,
          entity_id,
          url,
          file_name: url,
          file_type: 'link',
          uploaded_by: ctx.userId,
        })
        .select()
        .single()

      if (error) {
        console.error('[attachments] Link insert error:', error)
        if (isAttachmentsTableMissing(error)) {
          return NextResponse.json({ error: attachmentsSetupHint() }, { status: 503 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ attachment: data }, { status: 201 })
    }

    // Handle file uploads (multipart form data)
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const entityType = formData.get('entity_type') as string
    const entityId = formData.get('entity_id') as string

    if (!file || !entityType || !entityId) {
      return NextResponse.json({ error: 'file, entity_type, and entity_id are required' }, { status: 400 })
    }

    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size must be under 10MB' }, { status: 400 })
    }

    // Generate storage path
    const ext = file.name.split('.').pop() || 'bin'
    const storagePath = `${entityType}/${entityId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    // Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    let uploadError = (
      await ctx.adminClient.storage.from(ATTACHMENTS_BUCKET).upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
    ).error

    if (uploadError && isStorageBucketMissing(uploadError)) {
      await ensureAttachmentsBucket(ctx.adminClient)
      uploadError = (
        await ctx.adminClient.storage.from(ATTACHMENTS_BUCKET).upload(storagePath, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })
      ).error
    }

    if (uploadError) {
      console.error('[attachments] Storage upload error:', uploadError)
      // Bucket still missing or other storage failure: save DB row only when bucket truly unavailable.
      if (isStorageBucketMissing(uploadError)) {
        const { data, error: insertError } = await ctx.adminClient
          .from('attachments')
          .insert({
            entity_type: entityType,
            entity_id: entityId,
            file_name: file.name,
            file_type: file.type || ext,
            file_size: file.size,
            storage_path: storagePath,
            uploaded_by: ctx.userId,
          })
          .select()
          .single()

        if (insertError) {
          if (isAttachmentsTableMissing(insertError)) {
            return NextResponse.json(
              {
                error: attachmentsSetupHint(),
                hint_storage:
                  'Also create Storage bucket "attachments" (or retry upload after running SQL) — the app auto-creates the bucket when possible.',
              },
              { status: 503 },
            )
          }
          return NextResponse.json({ error: insertError.message }, { status: 500 })
        }
        return NextResponse.json(
          {
            attachment: data,
            storage_warning:
              'Storage bucket "attachments" is missing — row saved without a file URL. Create the bucket in Supabase Storage or retry after the first successful auto-create.',
          },
          { status: 201 },
        )
      }
      const msg =
        typeof (uploadError as { message?: string }).message === 'string'
          ? (uploadError as { message: string }).message
          : String(uploadError)
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = ctx.adminClient.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(storagePath)

    // Save record to attachments table
    const { data, error: insertError } = await ctx.adminClient
      .from('attachments')
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        file_name: file.name,
        file_type: file.type || ext,
        file_size: file.size,
        storage_path: storagePath,
        url: urlData?.publicUrl || null,
        uploaded_by: ctx.userId,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[attachments] DB insert error:', insertError)
      if (isAttachmentsTableMissing(insertError)) {
        return NextResponse.json({ error: attachmentsSetupHint() }, { status: 503 })
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ attachment: data }, { status: 201 })
  } catch (err: any) {
    console.error('[attachments] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entity_type')
    const entityId = searchParams.get('entity_id')

    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entity_type and entity_id are required' }, { status: 400 })
    }

    const { data, error } = await ctx.adminClient
      .from('attachments')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[attachments] GET error:', error)
      return NextResponse.json({ attachments: [] })
    }

    return NextResponse.json({ attachments: data || [] })
  } catch (err) {
    console.error('[attachments] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    // Get attachment to find storage path
    const { data: attachment } = await ctx.adminClient
      .from('attachments')
      .select('storage_path')
      .eq('id', id)
      .single()

    if (attachment?.storage_path) {
      await ctx.adminClient.storage.from(ATTACHMENTS_BUCKET).remove([attachment.storage_path])
    }

    const { error } = await ctx.adminClient.from('attachments').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[attachments] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
