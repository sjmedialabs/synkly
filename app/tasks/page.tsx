'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Upload } from 'lucide-react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { SmartAssignModal } from '@/components/tasks/smart-assign-modal'
import { hasPermission, isFullAccessRole } from '@/lib/rbac'
import { cn } from '@/lib/utils'

type Task = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  task_type: string
  assignee_id: string | null
  project_id: string | null
  module_id: string | null
  estimated_hours?: number | null
  sprint_id: string | null
  carried_from_sprint_id: string | null
  due_date: string | null
  end_date?: string | null
  completed_at?: string | null
  document_url?: string | null
  created_at: string
  assignee?: {
    full_name: string | null
    email: string
  } | null
  projects?: {
    name: string
  } | null
  modules?: {
    name: string
  } | null
}

type TeamMember = {
  id: string
  full_name: string | null
  email: string
}

const COLUMN_IDS = ['todo', 'in_progress', 'in_review', 'done'] as const
type ColumnId = (typeof COLUMN_IDS)[number]

function isColumnId(id: string): id is ColumnId {
  return (COLUMN_IDS as readonly string[]).includes(id)
}

const statusConfig: Record<
  ColumnId,
  { label: string; headerColor: string }
> = {
  todo: { label: 'To Do', headerColor: 'border-muted-foreground' },
  in_progress: { label: 'In Progress', headerColor: 'border-primary' },
  in_review: { label: 'In Review', headerColor: 'border-accent' },
  done: { label: 'Done', headerColor: 'border-green-500' },
}

const priorityColors: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-destructive',
  medium: 'bg-accent',
  low: 'bg-green-500',
}

const taskTypeIcons: Record<string, string> = {
  task: 'T',
  bug: 'B',
  feature: 'F',
  improvement: 'I',
  epic: 'E',
  story: 'S',
}

function TaskCardInner({
  task,
  canAssignTask,
  onStatusChange,
  onAssign,
  onOpenDetails,
  dragHandle,
  isOverlay,
}: {
  task: Task
  canAssignTask: boolean
  onStatusChange: (taskId: string, status: string) => void
  onAssign: (task: Task) => void
  onOpenDetails: (task: Task) => void
  dragHandle?: ReactNode
  isOverlay?: boolean
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenDetails(task)
        }
      }}
      className={cn(
        'bg-card border border-border rounded-md transition group text-left w-full cursor-pointer',
        isOverlay ? 'shadow-lg ring-2 ring-primary/20 w-52' : 'hover:shadow-sm',
      )}
    >
      <div className="p-1.5 pr-2 flex gap-1">
        {dragHandle ? (
          <div className="shrink-0 mt-0.5">{dragHandle}</div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <span
              className={`w-4 h-4 shrink-0 rounded text-[10px] font-bold flex items-center justify-center text-white ${
                task.task_type === 'bug'
                  ? 'bg-destructive'
                  : task.task_type === 'feature'
                    ? 'bg-green-500'
                    : task.task_type === 'epic'
                      ? 'bg-purple-500'
                      : 'bg-primary'
              }`}
            >
              {taskTypeIcons[task.task_type] || 'T'}
            </span>
            <h4 className="font-medium text-xs text-foreground flex-1 leading-tight line-clamp-2">
              {task.title}
            </h4>
          </div>
          {task.projects?.name ? (
            <p className="text-[10px] text-primary mt-1 line-clamp-1">{task.projects.name}</p>
          ) : null}
          {task.modules?.name ? (
            <p className="text-[10px] text-accent line-clamp-1">{task.modules.name}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1 mt-1">
            {task.sprint_id ? (
              <span className="text-[9px] bg-primary/10 text-primary px-1 py-0 rounded">Sprint</span>
            ) : null}
            {task.carried_from_sprint_id ? (
              <span className="text-[9px] bg-amber-500/10 text-amber-600 px-1 py-0 rounded">Carry</span>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-1 mt-1 text-[10px]">
            <div className="flex items-center gap-1 min-w-0">
              <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${priorityColors[task.priority]}`} />
              <span className="text-muted-foreground capitalize truncate">{task.priority}</span>
            </div>
            {task.assignee ? (
              <div className="w-4 h-4 shrink-0 bg-primary/20 rounded-full flex items-center justify-center">
                <span className="text-primary text-[9px] font-medium">
                  {(task.assignee.full_name || task.assignee.email)?.[0]?.toUpperCase()}
                </span>
              </div>
            ) : null}
          </div>
          {task.due_date ? (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Due {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </div>
          ) : null}
          {!isOverlay ? (
            <div className="mt-1.5 pt-1.5 border-t border-border opacity-0 group-hover:opacity-100 transition flex gap-1">
              <select
                value={task.status}
                onChange={(e) => onStatusChange(task.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 text-[10px] px-1 py-0.5 border border-input rounded bg-background text-foreground"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="in_review">In Review</option>
                <option value="done">Done</option>
              </select>
              {canAssignTask ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAssign(task)
                  }}
                  className="px-1.5 py-0.5 text-[10px] bg-primary text-primary-foreground rounded hover:bg-primary/90 shrink-0"
                >
                  Assign
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function DraggableTaskCard({
  task,
  canAssignTask,
  onStatusChange,
  onAssign,
  onOpenDetails,
}: {
  task: Task
  canAssignTask: boolean
  onStatusChange: (taskId: string, status: string) => void
  onAssign: (task: Task) => void
  onOpenDetails: (task: Task) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { type: 'task', task },
  })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  const handle = (
    <button
      type="button"
      className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted/80"
      aria-label="Drag to move column"
      {...listeners}
      {...attributes}
    >
      <GripVertical className="w-3.5 h-3.5" />
    </button>
  )

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && 'opacity-40')}>
      <TaskCardInner
        task={task}
        canAssignTask={canAssignTask}
        onStatusChange={onStatusChange}
        onAssign={onAssign}
        onOpenDetails={onOpenDetails}
        dragHandle={handle}
      />
    </div>
  )
}

function KanbanColumn({
  status,
  taskCount,
  children,
}: {
  status: ColumnId
  taskCount: number
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { type: 'column', status },
  })
  const cfg = statusConfig[status]

  return (
    <div
      className={cn(
        'flex flex-col w-[15rem] min-w-[15rem] bg-muted/30 rounded-lg border-t-4',
        cfg.headerColor,
      )}
    >
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          {cfg.label}
          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
            {taskCount}
          </span>
        </h3>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 overflow-y-auto p-2 space-y-2 min-h-[140px] max-h-[calc(100vh-280px)] rounded-b-lg transition-colors',
          isOver && 'bg-primary/5 outline outline-1 outline-primary/25 -outline-offset-1',
        )}
      >
        {children}
      </div>
    </div>
  )
}

export default function TasksPage() {
  const supabase = createClient()
  const router = useRouter()
  const [userRole, setUserRole] = useState<any>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [filterPriority, setFilterPriority] = useState<string | null>(null)
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null)
  const [filterProject, setFilterProject] = useState<string | null>(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedTaskForAssign, setSelectedTaskForAssign] = useState<Task | null>(null)
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<Task | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [activeDragTask, setActiveDragTask] = useState<Task | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  )

  const canAssignTask = !!userRole && (isFullAccessRole(userRole) || hasPermission(userRole, 'ASSIGN_TASK'))
  const canViewAll = !!userRole && isFullAccessRole(userRole)

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const tasksApiRes = await fetch('/api/tasks')
      const tasksApiJson = await tasksApiRes.json()
      if (!tasksApiRes.ok) throw new Error(tasksApiJson.error || 'Failed to load tasks')
      setUserRole(tasksApiJson.role || null)
      setTasks((tasksApiJson.tasks as Task[]) || [])
      setTeamMembers(tasksApiJson.assignees || [])
      setLoading(false)
    }

    init()
  }, [router, supabase])

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    const current = tasks.find((t) => t.id === taskId)
    if (!current || current.status === newStatus) return

    const previousStatus = current.status
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, status: newStatus } : task)))

    try {
      const statusRes = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, status: newStatus }),
      })
      const statusJson = await statusRes.json()
      if (!statusRes.ok) throw new Error(statusJson.error || 'Failed to update task')

      if (statusJson.task) {
        setTasks((prev) =>
          prev.map((task) => (task.id === taskId ? { ...task, ...(statusJson.task as Partial<Task>) } : task)),
        )
      }
    } catch (error: any) {
      console.error('Error updating task:', error)
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, status: previousStatus } : task)),
      )
      alert('Error updating task: ' + error.message)
    }
  }

  const resolveDropStatus = (overId: string): ColumnId | null => {
    if (isColumnId(overId)) return overId
    const hit = tasks.find((t) => t.id === overId)
    if (hit && isColumnId(hit.status)) return hit.status
    return null
  }

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    setActiveDragTask(tasks.find((t) => t.id === id) || null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragTask(null)
    const { active, over } = event
    if (!over) return

    const taskId = String(active.id)
    const targetStatus = resolveDropStatus(String(over.id))
    if (!targetStatus) return

    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.status === targetStatus) return

    void handleStatusChange(taskId, targetStatus)
  }

  const projectOptions = Array.from(
    new Map(
      tasks
        .filter((task) => task.project_id)
        .map((task) => [
          task.project_id as string,
          {
            id: task.project_id as string,
            name: task.projects?.name || 'Unnamed project',
          },
        ]),
    ).values(),
  )

  const filteredTasks = tasks.filter((task) => {
    if (filterStatus && task.status !== filterStatus) return false
    if (filterPriority && task.priority !== filterPriority) return false
    if (filterAssignee && task.assignee_id !== filterAssignee) return false
    if (filterProject && task.project_id !== filterProject) return false
    return true
  })

  const groupedByStatus: Record<ColumnId, Task[]> = {
    todo: filteredTasks.filter((t) => t.status === 'todo'),
    in_progress: filteredTasks.filter((t) => t.status === 'in_progress'),
    in_review: filteredTasks.filter((t) => t.status === 'in_review'),
    done: filteredTasks.filter((t) => t.status === 'done'),
  }

  if (loading) {
    return (
      <DashboardLayout title="Tasks">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-muted rounded w-40" />
          <div className="flex gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-[15rem] min-w-[15rem] h-72 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      title="Tasks"
      subtitle={canViewAll ? 'All tasks' : 'Your permitted task scope'}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/tasks/bulk-upload">
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 border border-input rounded-lg bg-background text-foreground text-xs hover:bg-muted transition">
              <Upload className="w-3.5 h-3.5" />
              Bulk Upload
            </button>
          </Link>
          <select
            value={filterStatus || ''}
            onChange={(e) => setFilterStatus(e.target.value || null)}
            className="px-2.5 py-1.5 border border-input rounded-lg bg-background text-foreground text-xs"
          >
            <option value="">All Statuses</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="done">Done</option>
          </select>
          <select
            value={filterPriority || ''}
            onChange={(e) => setFilterPriority(e.target.value || null)}
            className="px-2.5 py-1.5 border border-input rounded-lg bg-background text-foreground text-xs"
          >
            <option value="">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <select
            value={filterAssignee || ''}
            onChange={(e) => setFilterAssignee(e.target.value || null)}
            className="px-2.5 py-1.5 border border-input rounded-lg bg-background text-foreground text-xs"
          >
            <option value="">All Assignees</option>
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name || member.email}
              </option>
            ))}
          </select>
          <select
            value={filterProject || ''}
            onChange={(e) => setFilterProject(e.target.value || null)}
            className="px-2.5 py-1.5 border border-input rounded-lg bg-background text-foreground text-xs"
          >
            <option value="">All Projects</option>
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      }
    >
      <p className="text-xs text-muted-foreground mb-2">
        Drag the grip icon to move a task between columns. Status updates save automatically.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDragTask(null)}
      >
        <div className="flex gap-3 overflow-x-auto pb-3">
          {COLUMN_IDS.map((status) => {
            const statusTasks = groupedByStatus[status]
            return (
              <KanbanColumn key={status} status={status} taskCount={statusTasks.length}>
                {statusTasks.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center py-6 px-1">Drop tasks here</p>
                ) : (
                  statusTasks.map((task) => (
                    <DraggableTaskCard
                      key={task.id}
                      task={task}
                      canAssignTask={canAssignTask}
                      onStatusChange={handleStatusChange}
                      onOpenDetails={(t) => setSelectedTaskForDetails(t)}
                      onAssign={(t) => {
                        setSelectedTaskForAssign(t)
                        setShowAssignModal(true)
                      }}
                    />
                  ))
                )}
              </KanbanColumn>
            )
          })}
        </div>

        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
          {activeDragTask ? (
            <TaskCardInner
              task={activeDragTask}
              canAssignTask={false}
              onStatusChange={() => {}}
              onAssign={() => {}}
              onOpenDetails={() => {}}
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedTaskForDetails ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-lg">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Task Details</h3>
              <button
                type="button"
                className="px-2 py-1 text-xs rounded border border-input hover:bg-muted"
                onClick={() => setSelectedTaskForDetails(null)}
              >
                Close
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Title</p>
                <p className="text-foreground font-medium">{selectedTaskForDetails.title}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Description</p>
                <p className="text-foreground whitespace-pre-wrap">
                  {selectedTaskForDetails.description || 'No description'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground text-xs">Status</span><p className="capitalize">{selectedTaskForDetails.status.replace('_', ' ')}</p></div>
                <div><span className="text-muted-foreground text-xs">Priority</span><p className="capitalize">{selectedTaskForDetails.priority}</p></div>
                <div><span className="text-muted-foreground text-xs">Type</span><p className="capitalize">{selectedTaskForDetails.task_type}</p></div>
                <div><span className="text-muted-foreground text-xs">Assignee</span><p>{selectedTaskForDetails.assignee?.full_name || selectedTaskForDetails.assignee?.email || 'Unassigned'}</p></div>
                <div><span className="text-muted-foreground text-xs">Project</span><p>{selectedTaskForDetails.projects?.name || 'N/A'}</p></div>
                <div><span className="text-muted-foreground text-xs">Module</span><p>{selectedTaskForDetails.modules?.name || 'N/A'}</p></div>
                <div><span className="text-muted-foreground text-xs">Estimated Hours</span><p>{selectedTaskForDetails.estimated_hours ?? 'N/A'}</p></div>
                <div><span className="text-muted-foreground text-xs">Due Date</span><p>{selectedTaskForDetails.due_date ? new Date(selectedTaskForDetails.due_date).toLocaleDateString() : 'N/A'}</p></div>
                <div>
                  <span className="text-muted-foreground text-xs">Target end (assigner)</span>
                  <p>
                    {selectedTaskForDetails.end_date
                      ? new Date(selectedTaskForDetails.end_date).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Completed at (actual)</span>
                  <p>
                    {selectedTaskForDetails.completed_at
                      ? new Date(selectedTaskForDetails.completed_at).toLocaleString()
                      : '—'}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground text-xs">Document / reference URL</span>
                  <p>
                    {selectedTaskForDetails.document_url ? (
                      <a
                        href={selectedTaskForDetails.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline break-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {selectedTaskForDetails.document_url}
                      </a>
                    ) : (
                      'None'
                    )}
                  </p>
                </div>
                <div><span className="text-muted-foreground text-xs">Created</span><p>{new Date(selectedTaskForDetails.created_at).toLocaleString()}</p></div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showAssignModal && selectedTaskForAssign && (
        <SmartAssignModal
          task={{
            id: selectedTaskForAssign.id,
            title: selectedTaskForAssign.title,
            estimated_hours: selectedTaskForAssign.estimated_hours,
            project_id: selectedTaskForAssign.project_id,
            sprint_id: selectedTaskForAssign.sprint_id,
          }}
          onClose={() => {
            setShowAssignModal(false)
            setSelectedTaskForAssign(null)
          }}
          onAssign={async (employeeId, estimatedHours, sprintId, targetEndDate) => {
            try {
              const task_id = String(selectedTaskForAssign.id ?? '').trim()
              if (!task_id) {
                throw new Error('Task ID is missing — refresh the page and try again.')
              }
              const response = await fetch('/api/tasks/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  task_id,
                  assignee_id: employeeId,
                  estimated_hours: estimatedHours,
                  sprint_id: sprintId,
                  month: new Date().toISOString().slice(0, 7),
                  ...(targetEndDate ? { end_date: targetEndDate } : {}),
                }),
              })
              const result = await response.json()

              if (!response.ok) {
                throw new Error(result.error || 'Failed to assign task')
              }

              const updatedTask = result.task as Task

              const assignee = teamMembers.find((m) => m.id === employeeId)
              setTasks((prevTasks) =>
                prevTasks.map((task) =>
                  task.id === selectedTaskForAssign.id
                    ? {
                        ...task,
                        assignee_id: employeeId,
                        assignee: assignee ? { full_name: assignee.full_name, email: assignee.email } : null,
                        estimated_hours: updatedTask?.estimated_hours ?? estimatedHours,
                        sprint_id: updatedTask?.sprint_id ?? null,
                        end_date: updatedTask?.end_date ?? task.end_date ?? null,
                        carried_from_sprint_id:
                          updatedTask?.carried_from_sprint_id ?? task.carried_from_sprint_id,
                      }
                    : task,
                ),
              )

              if (result.sprintAssignmentSkipped) {
                alert(
                  'Task was assigned successfully, but sprint could not be updated. Please run the latest sprint migration to fully enable sprint assignments.',
                )
              }
              setShowAssignModal(false)
              setSelectedTaskForAssign(null)
            } catch (error: any) {
              console.error('Error assigning task:', error)
              throw error
            }
          }}
        />
      )}
    </DashboardLayout>
  )
}
