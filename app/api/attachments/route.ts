import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/rbac-server'

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

    const { error: uploadError } = await ctx.adminClient.storage
      .from('attachments')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) {
      console.error('[attachments] Storage upload error:', uploadError)
      // If storage bucket doesn't exist, still save the record with file metadata
      if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket')) {
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
          return NextResponse.json({ error: insertError.message }, { status: 500 })
        }
        return NextResponse.json({ attachment: data, storage_warning: 'File saved to DB only — create "attachments" bucket in Supabase Storage.' }, { status: 201 })
      }
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = ctx.adminClient.storage
      .from('attachments')
      .getPublicUrl(storagePath)

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
      await ctx.adminClient.storage.from('attachments').remove([attachment.storage_path])
    }

    const { error } = await ctx.adminClient.from('attachments').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[attachments] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
