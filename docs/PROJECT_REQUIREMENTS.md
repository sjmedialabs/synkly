# Synkly — Project Requirements Document (PRD)
**Date:** 2026-04-09 | **Version:** 1.0

---

## 1. Purpose & Scope

Synkly is a SaaS project management platform for IT services organizations to manage client projects, tasks, teams, sprints, and resource capacity under a multi-tenant architecture with granular role-based access control.

---

## 2. Functional Requirements

### 2.1 Authentication & Onboarding

| ID | Requirement | Status |
|----|------------|--------|
| AUTH-01 | Email/password sign-up with role selection (per-role URL: /auth/sign-up/[role]) | ✅ Built |
| AUTH-02 | Email login with session management via Supabase Auth | ✅ Built |
| AUTH-03 | OTP verification flow (/auth/verify) | ✅ Built |
| AUTH-04 | Password set/reset flow (/auth/set-password) | ✅ Built |
| AUTH-05 | Post-signup onboarding completion API | ✅ Built |
| AUTH-06 | Auto-create user profile on Supabase auth.users insert (trigger) | ✅ Built |
| AUTH-07 | OAuth/SSO login (Google, GitHub, etc.) | ❌ Not built |
| AUTH-08 | Email verification before first login | ❌ Not built |
| AUTH-09 | Forgot password self-service flow | ❌ Not built |

### 2.2 Role-Based Access Control (RBAC)

| ID | Requirement | Status |
|----|------------|--------|
| RBAC-01 | 5-tier role hierarchy: Master Admin > Client Admin > Manager > Team Lead > Member | ✅ Built |
| RBAC-02 | Permission-based access checks at API and UI layer | ✅ Built |
| RBAC-03 | Master Admin: full cross-tenant access | ✅ Built |
| RBAC-04 | Client Admin: full access within own organization, including user CRUD | ✅ Built |
| RBAC-05 | Manager: project CRUD, task management, reports | ✅ Built |
| RBAC-06 | Team Lead: task assignment within team, view projects | ✅ Built |
| RBAC-07 | Member: view projects, update own tasks, add comments | ✅ Built |
| RBAC-08 | Task assignee restricted to Team Lead + Member roles only | ✅ Built |
| RBAC-09 | Legacy role normalization (super_admin→master_admin, employee→member, etc.) | ✅ Built |
| RBAC-10 | Fine-grained feature flags per permission (not just role level) | ⚠️ Partial — permissions defined but not consistently enforced |

### 2.3 Multi-Tenancy

| ID | Requirement | Status |
|----|------------|--------|
| MT-01 | Client-based data isolation (client_id on projects) | ✅ Built |
| MT-02 | Automatic client provisioning for new Client Admins | ✅ Built |
| MT-03 | Master Admin cross-client dashboard | ✅ Built |
| MT-04 | Tenant-scoped master data values | ✅ Built |
| MT-05 | RLS-enforced tenant isolation at database level | ⚠️ Partial — App-level filtering done, but RLS policies are broadly permissive |
| MT-06 | Tenant-specific branding/settings | ❌ Not built |

### 2.4 Project Management

| ID | Requirement | Status |
|----|------------|--------|
| PM-01 | Project CRUD (name, description, client, status, priority, phase, dates, budget) | ✅ Built |
| PM-02 | 5 project statuses: planning, active, on_hold, completed, cancelled | ✅ Built |
| PM-03 | 6 project phases: discovery → planning → design → development → testing → deployment | ✅ Built |
| PM-04 | Project lead assignment | ✅ Built |
| PM-05 | Project team membership with roles (lead, manager, member, viewer) | ✅ Built |
| PM-06 | Client association per project | ✅ Built |
| PM-07 | Project detail view with nested modules | ✅ Built |
| PM-08 | Project-level documents/attachments | ✅ Built (schema) |
| PM-09 | Project archiving/soft delete | ❌ Not built |
| PM-10 | Project templates/cloning | ❌ Not built |
| PM-11 | Budget tracking and burn-down | ❌ Not built |
| PM-12 | Gantt chart / timeline view | ❌ Not built |

### 2.5 Module Management

| ID | Requirement | Status |
|----|------------|--------|
| MOD-01 | Module CRUD within projects | ✅ Built |
| MOD-02 | Module status tracking (not_started, in_progress, completed, on_hold) | ✅ Built |
| MOD-03 | Module ordering (drag-and-drop via @dnd-kit) | ✅ Built |
| MOD-04 | Module enable/disable (is_active flag) | ✅ Built |
| MOD-05 | Module-level progress aggregation from tasks | ⚠️ Partial |

### 2.6 Task Management

| ID | Requirement | Status |
|----|------------|--------|
| TASK-01 | Task CRUD with full field set (title, description, status, priority, type, dates, hours) | ✅ Built |
| TASK-02 | 5 task statuses: todo, in_progress, in_review, done, blocked | ✅ Built |
| TASK-03 | 6 task types: task, bug, feature, improvement, epic, story | ✅ Built |
| TASK-04 | Task assignment to users | ✅ Built |
| TASK-05 | Estimated vs actual hours tracking | ✅ Built |
| TASK-06 | Subtask management with completion tracking | ✅ Built |
| TASK-07 | Labels/tags on tasks | ✅ Built (schema) |
| TASK-08 | Task ordering within modules | ✅ Built |
| TASK-09 | Smart assignee recommendation API | ✅ Built |
| TASK-10 | Task risk evaluation API | ✅ Built |
| TASK-11 | Threaded comments on tasks | ✅ Built |
| TASK-12 | Task-level document attachments | ✅ Built (schema) |
| TASK-13 | Kanban board view | ❌ Not built |
| TASK-14 | Task dependencies/blockers | ❌ Not built |
| TASK-15 | Time logging against tasks | ❌ Not built |
| TASK-16 | Task watchers/subscribers | ❌ Not built |

### 2.7 Sprint Management

| ID | Requirement | Status |
|----|------------|--------|
| SPR-01 | Sprint CRUD (name, project, dates, status) | ✅ Built |
| SPR-02 | Sprint statuses: planned, active, completed | ✅ Built |
| SPR-03 | Assign tasks to sprints | ✅ Built |
| SPR-04 | Sprint carry-forward for incomplete tasks | ✅ Built |
| SPR-05 | Sprint review notes | ✅ Built |
| SPR-06 | Sprint velocity tracking | ❌ Not built |
| SPR-07 | Sprint burndown chart | ❌ Not built |
| SPR-08 | Sprint retrospective capture | ❌ Not built |

### 2.8 Capacity & Utilization

| ID | Requirement | Status |
|----|------------|--------|
| CAP-01 | Employee capacity per month (default 160 hrs) | ✅ Built |
| CAP-02 | Auto-deduct capacity on task assignment | ✅ Built |
| CAP-03 | Auto-restore capacity on unassignment | ✅ Built |
| CAP-04 | Capacity recalculation RPC | ✅ Built |
| CAP-05 | Remaining hours = available - allocated (computed column) | ✅ Built |
| CAP-06 | Utilization reporting view | ✅ Built |
| CAP-07 | Capacity planning with forecasting | ❌ Not built |
| CAP-08 | Leave/holiday integration for available hours | ❌ Not built |
| CAP-09 | Over-allocation warnings | ⚠️ Partial — error thrown but no UI warning |

### 2.9 Milestones

| ID | Requirement | Status |
|----|------------|--------|
| MIL-01 | Milestone CRUD per project | ✅ Built |
| MIL-02 | Milestone status and priority | ✅ Built |
| MIL-03 | Milestone date range | ✅ Built |
| MIL-04 | Link milestones to tasks | ❌ Not built |
| MIL-05 | Milestone progress based on linked tasks | ❌ Not built |

### 2.10 Dashboard & Reporting

| ID | Requirement | Status |
|----|------------|--------|
| DASH-01 | Stats cards: total projects, tasks, team members, milestones | ✅ Built |
| DASH-02 | Active project count | ✅ Built |
| DASH-03 | Pending task count | ✅ Built |
| DASH-04 | Recent projects list (top 4) | ✅ Built |
| DASH-05 | Personal task list (my tasks, top 5) | ✅ Built |
| DASH-06 | Reports page | ✅ Built (page exists) |
| DASH-07 | Risk assessment page | ✅ Built (page exists) |
| DASH-08 | Project-level analytics (charts, burndown, etc.) | ❌ Not built |
| DASH-09 | Export to CSV/PDF | ❌ Not built |

### 2.11 Organization & User Management

| ID | Requirement | Status |
|----|------------|--------|
| ORG-01 | Organization settings page | ✅ Built |
| ORG-02 | User list management within organization | ✅ Built |
| ORG-03 | Invite user to organization | ✅ Built |
| ORG-04 | Admin: set user password | ✅ Built |
| ORG-05 | Admin: diagnose user role issues | ✅ Built |
| ORG-06 | Admin: client management (CRUD) | ✅ Built |
| ORG-07 | User profile editing | ⚠️ Partial |
| ORG-08 | User deactivation/suspension | ⚠️ Partial — is_active field exists |

### 2.12 Master Data Management

| ID | Requirement | Status |
|----|------------|--------|
| MD-01 | Configurable master data types (department, designation, division, etc.) | ✅ Built |
| MD-02 | CRUD for master data values per type | ✅ Built |
| MD-03 | Hierarchical values (parent_id self-reference) | ✅ Built |
| MD-04 | Tenant-scoped master data | ✅ Built |
| MD-05 | Case-insensitive deduplication | ✅ Built |
| MD-06 | Skills management | ✅ Built (API) |

---

## 3. Non-Functional Requirements

| ID | Requirement | Status |
|----|------------|--------|
| NFR-01 | Responsive UI (mobile-friendly) | ✅ Built — use-mobile hook, Sheet for mobile nav |
| NFR-02 | Dark/light theme | ✅ Built |
| NFR-03 | Client-side analytics | ✅ Built (Vercel Analytics) |
| NFR-04 | Database performance (indexes on all FKs) | ✅ Built |
| NFR-05 | Row-level security on all tables | ✅ Built |
| NFR-06 | Automated testing | ❌ Not built |
| NFR-07 | CI/CD pipeline | ❌ Not built |
| NFR-08 | Error monitoring/logging (Sentry, etc.) | ❌ Not built |
| NFR-09 | API rate limiting | ❌ Not built |
| NFR-10 | Audit trail | ⚠️ Partial — activity_logs schema exists, logging inconsistent |
| NFR-11 | Data backup strategy | ❌ Not documented |
| NFR-12 | Load testing / performance benchmarks | ❌ Not done |

---

## 4. Enhancement Priorities (Recommended)

### High Priority
1. **Tighten RLS policies** — Enforce client_id scoping at database level, not just app layer
2. **Consolidate role storage** — Migrate from dual role/role_id to single canonical `role` column
3. **Merge legacy lookup tables** — Migrate `departments`/`designations` tables into `master_data_values`
4. **Add automated tests** — Unit tests for RBAC, API integration tests
5. **Kanban board view** — Visual task management with drag-and-drop columns
6. **Real-time updates** — Leverage Supabase Realtime for live task/project updates

### Medium Priority
7. **Sprint burndown/velocity charts** — Recharts already available
8. **Task dependencies** — Blocked-by/blocking relationships
9. **Time logging** — Actual hours entry against tasks
10. **Notification system** — Wire up existing notifications table to real events
11. **Export functionality** — CSV/PDF reports
12. **OAuth/SSO** — Google, GitHub login

### Lower Priority
13. **Project templates** — Clone project structures
14. **Gantt chart** — Timeline view for project phases
15. **Leave/holiday calendar** — Accurate capacity planning
16. **Tenant branding** — Custom logos, colors per client
17. **Mobile app / PWA** — Native mobile experience
18. **AI-powered insights** — Extend smart-assignee and risk evaluation
