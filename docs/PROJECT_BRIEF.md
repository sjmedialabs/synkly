# Synkly — Project Brief
**Date:** 2026-04-09 | **Version:** 1.0

---

## 1. Product Overview

**Synkly** is a multi-tenant project management and resource planning platform designed for IT services / software development organizations. It enables companies to manage projects, tasks, sprints, team capacity, and milestones with role-based access control across multiple client organizations.

**Target Users:** IT service companies, software agencies, and development teams managing multiple client projects simultaneously.

**Live Deployment:** Running as `synkly-app` (PM2 process #13) on production server.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16.2.0 (App Router) |
| **Language** | TypeScript 5.7.3 |
| **Runtime** | React 19.2.4 |
| **Database** | Supabase (PostgreSQL) with RLS |
| **Auth** | Supabase Auth (email/password, OTP) |
| **UI Library** | Radix UI + Tailwind CSS 4.2 |
| **Charts** | Recharts 2.15 |
| **Forms** | React Hook Form + Zod validation |
| **Drag & Drop** | @dnd-kit |
| **Theme** | next-themes (dark/light) |
| **Process Manager** | PM2 |
| **Analytics** | Vercel Analytics |

---

## 3. Architecture Overview

### Multi-Tenant Model
- **Tenant isolation** via `client_id` on projects and `tenant_id` on users
- **Master Admin** sees all data across clients
- **Client Admin** scoped to their organization's data only
- Auto-provisioning of client records for new Client Admins

### RBAC System (5-Tier Hierarchy)
1. **Master Admin** (Level 100) — Full platform access, all clients
2. **Client Admin** (Level 80) — Full access within their organization (create users, manage projects, settings)
3. **Manager** (Level 60) — Create/manage projects, assign tasks
4. **Team Lead** (Level 40) — Lead teams, assign tasks to members
5. **Member** (Level 20) — View projects, update own tasks, comment

### Application Structure
```
app/
├── auth/          — Login, Sign-up (role-based), Password set, OTP verify
├── dashboard/     — Stats overview, recent projects, my tasks
├── projects/      — CRUD, detail view, modules within projects
├── tasks/         — Task list, create/edit, smart assignee, risk evaluation
├── modules/       — Module detail with task management
├── sprints/       — Sprint tracking and management
├── capacity/      — Employee capacity (hours/month)
├── utilization/   — Team utilization reports
├── milestones/    — Project milestone tracking
├── my-team/       — Team view
├── team/          — Team management
├── organization/  — Org settings, user management, invite
├── admin/         — Admin setup, client management
├── settings/      — Master data configuration
├── reports/       — Reporting dashboard
├── risks/         — Risk assessment
└── divisions/     — Division management
```

### API Endpoints (33 routes)
- Auth: onboarding-complete
- CRUD: projects, tasks, modules, milestones, sprints, clients, users
- Intelligence: smart-assignee, recommend-assignee, evaluate-risk
- Management: capacity, utilization, divisions, skills, team-members
- Master Data: types, values, departments, designations
- Admin: set-user-password, bootstrap-mock-accounts, diagnose-role
- Organization: invite-user

---

## 4. Current State Summary

### What's Built & Working
- Full authentication flow (email sign-up with role selection, login, OTP verify, password set)
- Multi-tenant data isolation with client_id scoping
- 5-tier RBAC with permission checks at API and UI level
- Project CRUD with status, priority, phase, budget, date tracking
- Module management within projects (enable/disable, ordering)
- Task management with 6 task types, 5 status levels, drag-and-drop ordering
- Subtasks, threaded comments, document attachments
- Sprint tracking with carry-forward logic for incomplete tasks
- Employee capacity management (160 hrs/month default, auto-deduct on assign)
- Dashboard with stats cards, recent projects, personal task list
- Master data management (departments, designations, divisions, configurable types)
- Smart/recommended assignee API endpoints
- Task risk evaluation endpoint
- Utilization and capacity reporting views
- Milestone tracking per project
- Organization user management and invite flow
- Dark/light theme support
- Responsive UI with Radix + Tailwind

### Known Technical Debt / Areas for Improvement
- Legacy `departments` and `designations` tables co-exist alongside `master_data_values` — migration incomplete
- `users.role` (VARCHAR) and `users.role_id` (FK to roles) are dual role storage mechanisms
- RLS policies are broad (most allow full CRUD for any authenticated user) — need tighter scoping
- The `team` vs `users` table detection at runtime suggests schema variants across environments
- 21+ migration scripts with some overlapping numbering (e.g., multiple 004_*, 005_*, 010_*)
- No automated test suite detected
- No CI/CD pipeline configuration found in repo

---

## 5. Key Integrations
- **Supabase Auth** — User authentication, session management, auto-profile creation trigger
- **Supabase Database** — PostgreSQL with RLS, RPC functions, real-time capability (not yet utilized)
- **Vercel Analytics** — Client-side analytics tracking

---

## 6. Deployment
- **Server:** Ubuntu Linux
- **Process:** PM2 (process ID 13, name: synkly-app)
- **Build:** `next build` → `next start`
- **Port:** Configured via Next.js defaults (likely behind reverse proxy)
