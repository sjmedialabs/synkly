# Synkly — Database Schema Reference
**Generated:** 2026-04-09 | **Database:** Supabase (PostgreSQL) | **Extensions:** uuid-ossp, pgcrypto

---

## Entity Relationship Overview

```
tenants ──┐
           ├──> users ──┬──> project_users ──> projects ──> clients
           │            │                         │
master_data_types       │                    modules ──> tasks ──> subtasks
    │                   │                         │         │
master_data_values      │                    milestones     ├──> comments
    │                   │                                   ├──> documents
departments             ├──> employee_capacity              └──> activity_logs
designations            │
roles ─────────────────┘                    sprint_tracking ──> tasks
                                            notifications ──> users
```

---

## 1. Core Tables

### `roles` — Master role definitions
- **id** UUID PK
- **name** TEXT UNIQUE NOT NULL — (super_admin, project_manager, delivery_manager, team_lead, employee)
- **description** TEXT
- **permissions** JSONB DEFAULT '{}'
- **created_at / updated_at** TIMESTAMPTZ

### `users` — User profiles (FK → auth.users ON DELETE CASCADE)
- **id** UUID PK (= auth.users.id)
- **email** TEXT UNIQUE NOT NULL
- **full_name** TEXT
- **avatar_url** TEXT
- **role_id** UUID FK → roles
- **role** VARCHAR — canonical RBAC role
- **designation** TEXT
- **department** TEXT
- **phone** TEXT
- **experience_years** INTEGER
- **skillset** TEXT[]
- **is_active** BOOLEAN DEFAULT true
- **department_id** UUID FK → departments / master_data_values
- **designation_id** UUID FK → designations / master_data_values
- **division_id** UUID FK → master_data_values
- **tenant_id** UUID FK → tenants ON DELETE SET NULL
- **created_at / updated_at** TIMESTAMPTZ

### `clients` — Client organizations (multi-tenant root)
- **id** UUID PK
- **name** TEXT NOT NULL
- **email, phone, company, address** TEXT
- **logo_url** TEXT
- **is_active** BOOLEAN DEFAULT true
- **created_at / updated_at** TIMESTAMPTZ

### `projects` — Project lifecycle tracking
- **id** UUID PK
- **name** TEXT NOT NULL
- **description** TEXT
- **client_id** UUID FK → clients ON DELETE SET NULL
- **status** TEXT CHECK (planning | active | on_hold | completed | cancelled)
- **priority** TEXT CHECK (low | medium | high | critical)
- **phase** TEXT CHECK (discovery | planning | design | development | testing | deployment)
- **start_date / end_date** DATE
- **budget** DECIMAL(12,2)
- **created_by** UUID FK → users
- **project_lead_id** UUID FK → users
- **created_at / updated_at** TIMESTAMPTZ

### `project_users` — Team membership (M2M)
- **id** UUID PK
- **project_id** UUID FK → projects ON DELETE CASCADE
- **user_id** UUID FK → users ON DELETE CASCADE
- **role** TEXT CHECK (lead | manager | member | viewer)
- **joined_at** TIMESTAMPTZ
- UNIQUE(project_id, user_id)

### `modules` — Project feature groups
- **id** UUID PK
- **project_id** UUID FK → projects ON DELETE CASCADE
- **name** TEXT NOT NULL
- **description** TEXT
- **status** TEXT CHECK (not_started | in_progress | completed | on_hold)
- **order_index** INTEGER DEFAULT 0
- **is_active** BOOLEAN DEFAULT true
- **created_by** UUID FK → users
- **created_at / updated_at** TIMESTAMPTZ

### `tasks` — Work items
- **id** UUID PK
- **module_id** UUID FK → modules ON DELETE CASCADE
- **project_id** UUID FK → projects ON DELETE CASCADE
- **title** TEXT NOT NULL
- **description** TEXT
- **status** TEXT CHECK (todo | in_progress | in_review | done | blocked)
- **priority** TEXT CHECK (low | medium | high | critical)
- **task_type** TEXT CHECK (task | bug | feature | improvement | epic | story)
- **assignee_id** UUID FK → users
- **reporter_id** UUID FK → users
- **due_date** DATE
- **estimated_hours / actual_hours** DECIMAL(6,2)
- **order_index** INTEGER DEFAULT 0
- **labels** TEXT[]
- **sprint_id** UUID FK → sprint_tracking ON DELETE SET NULL
- **carried_from_sprint_id** UUID FK → sprint_tracking ON DELETE SET NULL
- **completed_at** TIMESTAMPTZ
- **assigned_month** TEXT
- **previous_assignee_id** UUID
- **created_at / updated_at** TIMESTAMPTZ

### `subtasks`
- **id** UUID PK
- **task_id** UUID FK → tasks ON DELETE CASCADE
- **title** TEXT NOT NULL
- **is_completed** BOOLEAN DEFAULT false
- **order_index** INTEGER DEFAULT 0
- **created_at / updated_at** TIMESTAMPTZ

### `documents` — File attachments
- **id** UUID PK
- **project_id** UUID FK → projects ON DELETE CASCADE
- **task_id** UUID FK → tasks ON DELETE CASCADE
- **name** TEXT NOT NULL
- **file_url** TEXT NOT NULL
- **file_type** TEXT, **file_size** INTEGER
- **uploaded_by** UUID FK → users
- **created_at** TIMESTAMPTZ

### `comments` — Threaded task comments (self-referencing)
- **id** UUID PK
- **task_id** UUID FK → tasks ON DELETE CASCADE
- **user_id** UUID FK → users ON DELETE CASCADE
- **content** TEXT NOT NULL
- **parent_id** UUID FK → comments (self-ref) ON DELETE CASCADE
- **created_at / updated_at** TIMESTAMPTZ

### `activity_logs`
- **id** UUID PK
- **user_id** UUID FK → users ON DELETE SET NULL
- **project_id** UUID FK → projects ON DELETE CASCADE
- **task_id** UUID FK → tasks ON DELETE CASCADE
- **action** TEXT NOT NULL
- **details** JSONB DEFAULT '{}'
- **created_at** TIMESTAMPTZ

### `notifications`
- **id** UUID PK
- **user_id** UUID FK → users ON DELETE CASCADE
- **title** TEXT NOT NULL, **message** TEXT
- **type** TEXT CHECK (info | success | warning | error)
- **is_read** BOOLEAN DEFAULT false
- **link** TEXT
- **created_at** TIMESTAMPTZ

### `milestones`
- **id** UUID PK
- **project_id** UUID NOT NULL FK → projects ON DELETE CASCADE
- **name** TEXT NOT NULL, **description** TEXT
- **status** TEXT DEFAULT 'not_started'
- **priority** TEXT DEFAULT 'medium'
- **start_date / end_date** DATE
- **created_by** UUID
- **created_at / updated_at** TIMESTAMPTZ

---

## 2. Master Data Tables

### `master_data_types`
- **id** UUID PK
- **name** TEXT UNIQUE NOT NULL — (department, designation, role, phase, task_status, priority, division)
- **created_at / updated_at** TIMESTAMPTZ

### `master_data_values` — Hierarchical, tenant-scoped
- **id** UUID PK
- **type_id** UUID FK → master_data_types ON DELETE CASCADE
- **name** TEXT NOT NULL
- **is_active** BOOLEAN DEFAULT true
- **parent_id** UUID FK → master_data_values (self-ref hierarchy) ON DELETE SET NULL
- **tenant_id** UUID FK → tenants ON DELETE CASCADE
- **created_at / updated_at** TIMESTAMPTZ
- UNIQUE(type_id, name) + case-insensitive unique per type+tenant+parent

### `departments` / `designations` — Legacy standalone lookup tables
- **id** UUID PK, **name** TEXT UNIQUE, **created_at / updated_at** TIMESTAMPTZ

---

## 3. Sprint & Capacity Tables

### `sprint_tracking`
- **id** UUID PK
- **sprint_name** TEXT NOT NULL
- **project_id** UUID FK → projects ON DELETE CASCADE
- **start_date / end_date** DATE
- **status** TEXT CHECK (planned | active | completed)
- **review_notes** TEXT
- **created_at / updated_at** TIMESTAMPTZ

### `employee_capacity`
- **id** UUID PK
- **employee_id** UUID FK → users ON DELETE CASCADE
- **month** TEXT CHECK (YYYY-MM format)
- **available_hours** DECIMAL(8,2) DEFAULT 160
- **allocated_hours** DECIMAL(8,2) DEFAULT 0
- **remaining_hours** DECIMAL(8,2) — GENERATED ALWAYS AS (available - allocated) STORED
- UNIQUE(employee_id, month)

---

## 4. Multi-Tenant Tables

### `tenants`
- **id** UUID PK
- **name** TEXT UNIQUE NOT NULL
- **created_at / updated_at** TIMESTAMPTZ

---

## 5. RPC Functions

| Function | Purpose |
|----------|---------|
| deduct_capacity(employee_id, month, hours) | Deducts hours from employee capacity |
| restore_capacity(employee_id, month, hours) | Restores hours on unassign/reassign |
| get_capacity(employee_id, month) | Returns capacity data for an employee+month |
| recalculate_capacity(employee_id) | Recalculates all capacity from active tasks |
| handle_sprint_carry_forward(task_id, old_sprint, new_sprint) | Marks incomplete tasks as carried forward |

---

## 6. Triggers

| Trigger | Table | Event | Purpose |
|---------|-------|-------|---------|
| on_auth_user_created | auth.users | AFTER INSERT | Auto-creates user profile with default 'employee' role |
| trigger_auto_create_capacity | tasks | AFTER UPDATE (assignee change) | Auto-creates capacity record for new assignee |

---

## 7. Views

- **tasks_by_sprint** — Joins tasks + sprint_tracking + users for sprint reporting

---

## 8. Row Level Security (RLS)

All tables have RLS enabled:
- **roles, users:** SELECT for all authenticated
- **users:** INSERT/UPDATE restricted to own record
- **clients, projects, modules, tasks, subtasks, documents:** Full CRUD for authenticated
- **comments:** Own-record INSERT/UPDATE/DELETE
- **activity_logs:** SELECT + INSERT for authenticated
- **notifications:** Restricted to own (user_id = auth.uid())
- **master_data_types/values:** SELECT for all; full CRUD via admin policy

---

## 9. Indexes

All foreign key columns indexed. Notable additional indexes:
- `idx_projects_status`, `idx_tasks_status`, `idx_tasks_sprint_id`
- `idx_tasks_estimated_hours`, `idx_tasks_completed_at`
- `idx_employee_capacity_month`
- `idx_milestones_created_at DESC`
- `uq_master_values_tenant_parent_lower_name` (case-insensitive dedup)
