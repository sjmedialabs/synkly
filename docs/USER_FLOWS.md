# Synkly — User Flow Document
**Date:** 2026-04-09 | **Version:** 1.0

---

## 1. Authentication Flows

### 1.1 New User Sign-Up
```
Landing Page (/)
  → /auth/sign-up
    → Select Role → /auth/sign-up/[role]  (role = client_admin | manager | team_lead | member)
      → Enter: email, full_name, password
      → Submit → Supabase auth.signUp()
        → DB Trigger: handle_new_user() auto-creates user profile
        → Redirect → /auth/sign-up-success
          → User checks email for OTP
          → /auth/verify → Enter OTP code
            → Success → /auth/callback
              → POST /api/auth/onboarding-complete
              → Redirect → /dashboard
```

### 1.2 Existing User Login
```
/auth/login
  → Enter: email, password
  → Submit → Supabase auth.signInWithPassword()
    → Success → /auth/callback → /dashboard
    → Error → Show error on /auth/login
```

### 1.3 Set/Reset Password
```
/auth/set-password (or /set-password)
  → Enter new password
  → Submit → Supabase auth.updateUser()
  → Redirect → /dashboard
```

### 1.4 Admin Invites a User
```
/organization/users (Client Admin / Master Admin)
  → Click "Invite User"
  → POST /api/organization/invite-user (email, role)
    → Supabase creates auth user with email
    → User receives email → /auth/set-password
    → Sets password → /dashboard
```

---

## 2. Role-Based Navigation

### Sidebar Navigation (by role)

**Master Admin** — Full access:
- Dashboard, Projects, Tasks, Modules, Sprints, Milestones
- Capacity, Utilization, Reports, Risks
- Team, My Team, Organization (settings + users)
- Admin (setup, clients), Settings (master data)
- Divisions

**Client Admin** — Same as Master Admin, scoped to own organization:
- Dashboard, Projects, Tasks, Modules, Sprints, Milestones
- Capacity, Utilization, Reports, Risks
- Team, My Team, Organization (settings + users)
- Settings (master data)

**Manager**:
- Dashboard, Projects (CRUD), Tasks (CRUD), Modules, Sprints
- Milestones, Capacity, Utilization, Reports
- Team (view), My Team

**Team Lead**:
- Dashboard, Projects (view), Tasks (create/assign), Modules
- Sprints, My Team
- Capacity (own team)

**Member**:
- Dashboard, Projects (view), Tasks (own), My Team

---

## 3. Dashboard Flow

```
User logs in → /dashboard
  ├── Welcome banner: "{Name} — {Role} Dashboard"
  ├── Stats Grid (4 cards):
  │   ├── Total Projects (active count)
  │   ├── Total Tasks (pending count)
  │   ├── Team Members (active count)
  │   └── Milestones (tracked count)
  ├── Recent Projects (top 4, clickable → /projects/[id])
  └── My Tasks (top 5 pending, sorted by due_date)
      └── Each task shows: title, project name, status badge, priority icon, due date
```

---

## 4. Project Management Flows

### 4.1 Create Project
```
/projects → Click "New Project" (visible to: master_admin, client_admin, manager)
  → /projects/new
    → Form: name*, description, client (dropdown), status, priority, phase,
            start_date, end_date, budget, project_lead (user dropdown)
    → Submit → POST /api/projects
      → auto-assigns client_id based on user's organization
    → Redirect → /projects/[id]
```

### 4.2 View Project Detail
```
/projects/[id]
  ├── Project header: name, status badge, priority, phase
  ├── Project info: client, dates, budget, project lead
  ├── Modules list (ordered, draggable)
  │   ├── Each module: name, status, task count
  │   ├── Click module → /modules/[id]
  │   └── Add Module button (master_admin, client_admin, manager, team_lead)
  └── Team Members section
```

### 4.3 Edit Project
```
/projects/[id] → Click "Edit" (master_admin, client_admin, manager)
  → /projects/[id]/edit
    → Pre-filled form → Submit → PUT /api/projects/[id]
    → Redirect → /projects/[id]
```

---

## 5. Module Flow

```
/projects/[id] → Click module → /modules/[id]
  ├── Module header: name, status, project link
  ├── Task list (within module)
  │   ├── Each task: title, status, priority, assignee, due_date
  │   ├── Click task → task detail (inline or modal)
  │   └── Drag to reorder
  ├── Add Task button
  └── Module status update → PATCH /api/modules/update-status
```

---

## 6. Task Management Flows

### 6.1 Task List View
```
/tasks
  ├── Filters: project, module, status, priority, assignee
  ├── Task cards/rows: title, status badge, priority, assignee avatar, due_date
  ├── Click task → /tasks/[id] or inline detail
  └── "New Task" button (master_admin, client_admin, manager, team_lead)
```

### 6.2 Create Task
```
"New Task" → Task form (dialog or page):
  → Fields: title*, description, module (dropdown), project (dropdown),
            status, priority, task_type, assignee, due_date,
            estimated_hours, labels
  → Smart Assign: GET /api/tasks/smart-assignee → suggests best assignee
  → Risk Check: POST /api/tasks/evaluate-risk → shows risk assessment
  → Submit → POST /api/tasks
    → If assignee set: auto-deduct capacity via deduct_capacity()
  → Redirect/close
```

### 6.3 Task Assignment
```
Task form → Select assignee dropdown
  → GET /api/team/assignable-users → returns users with role ≤ team_lead
  → Or: GET /api/tasks/recommend-assignee → AI-recommended assignee
  → Select user → POST /api/tasks/assign
    → Capacity deducted from assignee for the task month
    → If reassignment: restore_capacity() for previous assignee
```

### 6.4 Update Task Status
```
Task detail → Click status dropdown
  → Select new status: todo → in_progress → in_review → done → blocked
  → PATCH /api/tasks/[id]
    → If status = 'done': set completed_at timestamp
```

### 6.5 Subtasks
```
Task detail → Subtasks section
  → Add subtask: title → POST
  → Toggle completion: checkbox → PATCH
  → Reorder: drag → PATCH order_index
```

### 6.6 Comments
```
Task detail → Comments section
  → Type comment → Submit → POST (user_id = current user)
  → Reply to comment → set parent_id → POST
  → Edit own comment → PATCH
  → Delete own comment → DELETE
```

---

## 7. Sprint Management Flow

```
/sprints
  ├── Sprint list: name, project, dates, status (planned/active/completed)
  ├── Create Sprint:
  │   → sprint_name*, project (dropdown), start_date, end_date
  │   → POST /api/sprints
  ├── Sprint Detail:
  │   ├── Tasks in sprint (linked via tasks.sprint_id)
  │   ├── Add existing tasks to sprint
  │   ├── Carried-forward indicators (tasks from previous sprint)
  │   └── Sprint review notes (on completion)
  └── Complete Sprint:
      → Marks sprint as 'completed'
      → Incomplete tasks: option to carry forward to next sprint
        → Sets carried_from_sprint_id on those tasks
```

---

## 8. Capacity & Utilization Flow

### 8.1 Capacity View
```
/capacity
  ├── Employee list with monthly capacity:
  │   ├── Available hours (default 160)
  │   ├── Allocated hours (sum of assigned task hours)
  │   ├── Remaining hours (computed)
  │   └── Progress bar visualization
  ├── Month selector (YYYY-MM)
  └── GET /api/capacity?month=YYYY-MM
```

### 8.2 Utilization View
```
/utilization
  ├── Team utilization percentages
  ├── Per-employee breakdown
  └── GET /api/utilization
```

---

## 9. Milestone Flow

```
/milestones
  ├── Milestone list: name, project, status, dates
  ├── Create: name*, project, description, status, priority, start_date, end_date
  │   → POST /api/milestones
  ├── Edit: inline or detail view → PATCH /api/milestones
  └── Delete: confirm dialog → DELETE /api/milestones
```

---

## 10. Organization & Admin Flows

### 10.1 Organization Settings
```
/organization/settings (client_admin, master_admin)
  → Manage organization profile/settings
```

### 10.2 User Management
```
/organization/users (client_admin, master_admin)
  ├── User list: name, email, role, status
  ├── Invite user → POST /api/organization/invite-user
  ├── Edit user role → PATCH /api/users
  ├── Deactivate user → PATCH is_active=false
  └── Admin: set user password → POST /api/admin/set-user-password
```

### 10.3 Client Management (Master Admin)
```
/admin/clients (master_admin only)
  ├── Client list: name, email, company, active status
  ├── Create client → /admin/clients/new → POST /api/clients
  └── Edit/deactivate client
```

### 10.4 Master Data Management
```
/settings/master-data (client_admin, master_admin)
  ├── Type selector: department, designation, division, phase, task_status, priority
  ├── Values list per type (with is_active toggle)
  ├── Add value → POST /api/master-data/values
  ├── Edit value → PATCH /api/master-data/values
  ├── Hierarchical parent selection (for nested values)
  └── Departments/Designations tabs:
      ├── GET /api/master-data/departments
      └── GET /api/master-data/designations
```

---

## 11. Reports & Risk Flows

### 11.1 Reports
```
/reports (master_admin, client_admin, manager)
  → Aggregated views of project/task metrics
  → (Page exists, data visualization TBD)
```

### 11.2 Risk Assessment
```
/risks
  → Task risk evaluation views
  → POST /api/tasks/evaluate-risk → returns risk score/assessment
```

---

## 12. Navigation Architecture

```
Sidebar (persistent, collapsible on mobile)
├── Dashboard          → /dashboard
├── Projects           → /projects
├── Tasks              → /tasks
├── Sprints            → /sprints
├── Milestones         → /milestones
├── Capacity           → /capacity
├── Utilization        → /utilization
├── Reports            → /reports
├── Risks              → /risks
├── My Team            → /my-team
├── Team               → /team
├── Divisions          → /divisions
├── Organization       → /organization
│   ├── Settings       → /organization/settings
│   └── Users          → /organization/users
├── Admin              → /admin
│   ├── Setup          → /admin/setup
│   └── Clients        → /admin/clients
└── Settings           → /settings
    └── Master Data    → /settings/master-data
```

---

## 13. Data Flow Summary

```
User Action → React Client Component
  → fetch('/api/...') (Next.js API Route)
    → getAuthContext() — resolves user, role, client_id
    → Permission check (RBAC functions)
    → Supabase Admin Client query (with client_id scoping)
    → JSON Response
  → Update React state → Re-render UI
```
