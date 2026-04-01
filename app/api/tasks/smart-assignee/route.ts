import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('taskId')
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7)

  if (!taskId) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
  }

  try {
    // Call the RPC function
    const { data: recommendations, error } = await supabase
      .rpc('get_smart_assignees', {
        p_task_id: taskId,
        p_month: month
      })

    if (error) {
      console.error('Smart assignee error:', error)
      // Fallback to basic query if RPC fails
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('users')
        .select(`
          id,
          full_name,
          email,
          role
        `)
        .in('role', ['developer', 'team_lead'])
        .eq('is_active', true)
        .limit(10)

      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 500 })
      }

      // Transform fallback data to match expected format
      const transformedData = fallbackData?.map(user => ({
        employee_id: user.id,
        full_name: user.full_name,
        email: user.email,
        skill_match_score: 0,
        available_hours: 160,
        allocated_hours: 0,
        remaining_hours: 160,
        total_score: 100
      }))

      return NextResponse.json({ recommendations: transformedData || [] })
    }

    return NextResponse.json({ recommendations: recommendations || [] })
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
