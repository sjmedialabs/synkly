import { getAdminClient, getAuthContext } from '@/lib/rbac-server'
import { NextRequest, NextResponse } from 'next/server'
import { masterDataCache } from '@/lib/cache'

export async function GET() {
  try {
    const authContext = await getAuthContext()

    if (!authContext.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only client_admin or master_admin can manage departments
    if (!authContext.isClientAdmin && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check cache first
    const cached = masterDataCache.get<any>('departments')
    if (cached) return NextResponse.json(cached)

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('master_departments')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (error) throw error

    masterDataCache.set('departments', data)
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching departments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()

    if (!authContext.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only client_admin or master_admin can create departments
    if (!authContext.isClientAdmin && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { name, description } = body

    if (!name) {
      return NextResponse.json({ error: 'Department name is required' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('master_departments')
      .insert({
        name,
        description,
        is_active: true,
        sort_order: new Date().getTime(),
      })
      .select()

    if (error) throw error

    masterDataCache.invalidatePrefix('departments')
    return NextResponse.json(data[0], { status: 201 })
  } catch (error) {
    console.error('Error creating department:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
