import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const RESTRICTED_DESIGNATIONS = ['Super Admin', 'Delivery Manager']

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId')
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7)

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 })
    }

    // Fetch all active users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, full_name, designation, department, experience_years')
      .eq('is_active', true)

    if (usersError) {
      console.error('[recommend-assignee] Users fetch error:', usersError)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    // Filter out restricted designations
    const eligible = (users || []).filter(u => 
      !u.designation || !RESTRICTED_DESIGNATIONS.includes(u.designation)
    )

    // Fetch capacity data
    const { data: capacity } = await supabase
      .from('employee_capacity')
      .select('employee_id, available_hours, allocated_hours')
      .eq('month', month)

    const capacityMap = new Map((capacity || []).map(c => [c.employee_id, c]))

    // Build recommendations
    const recommendations = eligible.map(user => {
      const cap = capacityMap.get(user.id)
      const availableHours = cap?.available_hours || 160
      const allocatedHours = cap?.allocated_hours || 0
      const remainingHours = Math.max(0, availableHours - allocatedHours)
      const skillScore = (user.experience_years || 0) * 10
      const capacityScore = remainingHours > 0 ? Math.min(100, remainingHours * 2) : 0

      return {
        employee_id: user.id,
        full_name: user.full_name || user.email,
        email: user.email,
        skill_match_score: skillScore,
        available_hours: availableHours,
        allocated_hours: allocatedHours,
        remaining_hours: remainingHours,
        total_score: skillScore + capacityScore
      }
    }).sort((a, b) => b.total_score - a.total_score)

    return NextResponse.json({ recommendations })
  } catch (err) {
    console.error('[recommend-assignee] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
