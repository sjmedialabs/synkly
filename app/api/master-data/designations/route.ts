import { getAdminClient, getAuthContext } from '@/lib/rbac-server'
import { NextRequest, NextResponse } from 'next/server'
import { masterDataCache } from '@/lib/cache'

export async function GET() {
  try {
    const authContext = await getAuthContext()

    if (!authContext.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only client_admin or master_admin can manage designations
    if (!authContext.isClientAdmin && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const cached = masterDataCache.get<any>('designations')
    if (cached) return NextResponse.json(cached)

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('master_designations')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (error) throw error

    masterDataCache.set('designations', data)
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching designations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()

    if (!authContext.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only client_admin or master_admin can create designations
    if (!authContext.isClientAdmin && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { name, description, level } = body

    if (!name) {
      return NextResponse.json({ error: 'Designation name is required' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('master_designations')
      .insert({
        name,
        description,
        level: level || 0,
        is_active: true,
        sort_order: new Date().getTime(),
      })
      .select()

    if (error) throw error

    masterDataCache.invalidatePrefix('designations')
    return NextResponse.json(data[0], { status: 201 })
  } catch (error) {
    console.error('Error creating designation:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
