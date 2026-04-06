import { createClient } from '@/lib/supabase/client'

export async function checkAssignmentData() {
  const supabase = createClient()

  try {
    // Check projects
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, name')
      .limit(5)

    console.log('[DIAGNOSTIC] Projects:', projects?.map(p => `${p.name}(${p.id})`).join(', '))

    if (projects && projects.length > 0) {
      const projectId = projects[0].id

      // Check sprints for first project
      const { data: sprints, error: sprintsError } = await supabase
        .from('sprint_tracking')
        .select('id, sprint_name, project_id')
        .eq('project_id', projectId)

      console.log(`[DIAGNOSTIC] Sprints for ${projects[0].name}:`, sprints?.length || 0)
      if (sprints && sprints.length > 0) {
        console.log('[DIAGNOSTIC] Sprint names:', sprints.map(s => s.sprint_name).join(', '))
      }
    }

    // Check team members
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, full_name, email, is_active, designation')
      .eq('is_active', true)
      .limit(5)

    console.log('[DIAGNOSTIC] Active users:', users?.length || 0)
    if (users && users.length > 0) {
      console.log('[DIAGNOSTIC] User names:', users.map(u => `${u.full_name}(${u.designation})`).join(', '))
    }

    // Check project_users (team assignments)
    const { data: projectUsers, error: puError } = await supabase
      .from('project_users')
      .select('project_id, user_id')
      .limit(5)

    console.log('[DIAGNOSTIC] Project-user assignments:', projectUsers?.length || 0)

    // Check employee_capacity
    const { data: capacity, error: capError } = await supabase
      .from('employee_capacity')
      .select('employee_id, month, available_hours, allocated_hours')
      .limit(5)

    console.log('[DIAGNOSTIC] Employee capacity records:', capacity?.length || 0)
  } catch (err) {
    console.error('[DIAGNOSTIC] Error:', err)
  }
}
