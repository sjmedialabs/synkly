import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/rbac-server'
import {
  canManageCapacityRole,
  fetchCapacityForMonth,
  fetchUsersByIds,
  filterCapacityEmployeesToLeadAndBelow,
  isMissingCapacityTable,
  listEmployeesForCapacity,
  type CapacityRecordDTO,
} from '@/lib/capacity-server'

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month =
    req.nextUrl.searchParams.get('month') ||
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  const [records, rawEmployees] = await Promise.all([
    fetchCapacityForMonth(ctx.adminClient, month),
    listEmployeesForCapacity(ctx.adminClient),
  ])
  const employees = await filterCapacityEmployeesToLeadAndBelow(ctx.adminClient, rawEmployees)

  return NextResponse.json({
    month,
    records,
    employees,
    canManage: canManageCapacityRole(ctx.role),
    role: ctx.role,
  })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageCapacityRole(ctx.role)) {
    return NextResponse.json({ error: 'Not allowed to set capacity' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const employee_id = String(body.employee_id || '').trim()
    const month = String(body.month || '').trim()
    const available_hours = Number(body.available_hours ?? 160)
    const allocated_hours = Number(body.allocated_hours ?? 0)

    if (!employee_id || !month) {
      return NextResponse.json({ error: 'employee_id and month are required' }, { status: 400 })
    }

    const admin = ctx.adminClient
    const upsert = await admin
      .from('employee_capacity')
      .upsert(
        {
          employee_id,
          month,
          available_hours,
          allocated_hours,
          updated_at: new Date().toISOString(),
        } as Record<string, unknown>,
        { onConflict: 'employee_id,month' },
      )
      .select('*')
      .maybeSingle()

    if (upsert.error) {
      const code = upsert.error.code
      const msg = String(upsert.error.message || '')
      if (code === '23503' || msg.toLowerCase().includes('foreign key')) {
        return NextResponse.json(
          {
            error:
              'This user id is not allowed for capacity (foreign key to public.users). Add the row to public.users with the same id as Auth, or run scripts/020_ensure_employee_capacity.sql without the users FK block.',
            details: msg,
          },
          { status: 400 },
        )
      }
      if (isMissingCapacityTable(upsert.error, 'employee_capacity')) {
        return NextResponse.json(
          {
            error:
              'The employee_capacity table is not in your database (or PostgREST schema). Open Supabase → SQL Editor → paste and run scripts/020_ensure_employee_capacity.sql, then Dashboard → Settings → API → reload schema if needed.',
            code,
            details: msg,
          },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: msg || 'Save failed', code }, { status: 400 })
    }

    const row = upsert.data as Record<string, unknown> | null
    if (!row) {
      return NextResponse.json({ error: 'Failed to save capacity' }, { status: 500 })
    }

    const userMap = await fetchUsersByIds(admin, [String(row.employee_id)])
    const employee = userMap.get(String(row.employee_id)) || {
      id: String(row.employee_id),
      full_name: null,
      email: '',
      division: null,
    }
    const avail = Number(row.available_hours ?? 0)
    const alloc = Number(row.allocated_hours ?? 0)
    const record: CapacityRecordDTO = {
      id: String(row.id),
      employee_id: String(row.employee_id),
      month: String(row.month),
      available_hours: avail,
      allocated_hours: alloc,
      remaining_hours: row.remaining_hours != null ? Number(row.remaining_hours) : avail - alloc,
      employee,
    }

    return NextResponse.json({ record })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageCapacityRole(ctx.role)) {
    return NextResponse.json({ error: 'Not allowed to update capacity' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const id = String(body.id || '').trim()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.available_hours != null) patch.available_hours = Number(body.available_hours)
    if (body.allocated_hours != null) patch.allocated_hours = Number(body.allocated_hours)

    const admin = ctx.adminClient
    const updated = await admin.from('employee_capacity').update(patch).eq('id', id).select('*').maybeSingle()

    if (updated.error) {
      if (isMissingCapacityTable(updated.error, 'employee_capacity')) {
        return NextResponse.json({ error: 'Capacity table is not available.' }, { status: 503 })
      }
      return NextResponse.json({ error: updated.error.message }, { status: 400 })
    }

    const row = updated.data as Record<string, unknown> | null
    if (!row) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

    const userMap = await fetchUsersByIds(admin, [String(row.employee_id)])
    const employee = userMap.get(String(row.employee_id)) || {
      id: String(row.employee_id),
      full_name: null,
      email: '',
      division: null,
    }
    const avail = Number(row.available_hours ?? 0)
    const alloc = Number(row.allocated_hours ?? 0)
    const record: CapacityRecordDTO = {
      id: String(row.id),
      employee_id: String(row.employee_id),
      month: String(row.month),
      available_hours: avail,
      allocated_hours: alloc,
      remaining_hours: row.remaining_hours != null ? Number(row.remaining_hours) : avail - alloc,
      employee,
    }

    return NextResponse.json({ record })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
