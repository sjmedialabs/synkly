import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/rbac-server'

const FROM_TYPES = new Set(['task_draft', 'project_draft'])
const TO_TYPES = new Set(['task', 'project'])

/** Move rows staged under a `*_draft` entity to a real `task` or `project` after create. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const draftEntityId = String(body.draft_entity_id || '').trim()

    let fromEntityType = String(body.from_entity_type || '').trim()
    let toEntityType = String(body.to_entity_type || '').trim()
    let targetEntityId = String(body.target_entity_id || '').trim()

    // Legacy: task-only payload
    const taskId = String(body.task_id || '').trim()
    const projectId = String(body.project_id || '').trim()

    if (taskId && !targetEntityId) {
      fromEntityType = 'task_draft'
      toEntityType = 'task'
      targetEntityId = taskId
    } else if (projectId && !targetEntityId) {
      fromEntityType = 'project_draft'
      toEntityType = 'project'
      targetEntityId = projectId
    }

    if (!draftEntityId || !targetEntityId) {
      return NextResponse.json(
        { error: 'draft_entity_id and target id (target_entity_id, task_id, or project_id) are required' },
        { status: 400 },
      )
    }

    if (!FROM_TYPES.has(fromEntityType)) {
      return NextResponse.json(
        { error: 'from_entity_type must be task_draft or project_draft' },
        { status: 400 },
      )
    }
    if (!TO_TYPES.has(toEntityType)) {
      return NextResponse.json({ error: 'to_entity_type must be task or project' }, { status: 400 })
    }

    const { data, error } = await ctx.adminClient
      .from('attachments')
      .update({ entity_type: toEntityType, entity_id: targetEntityId })
      .eq('entity_type', fromEntityType)
      .eq('entity_id', draftEntityId)
      .eq('uploaded_by', ctx.userId)
      .select('id')

    if (error) {
      console.error('[attachments/reassign]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ reassigned: (data || []).length })
  } catch (e: any) {
    console.error('[attachments/reassign]', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
