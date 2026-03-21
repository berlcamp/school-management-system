# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## System Overview

A **School Management System (SMS)** for the Schools Division of Bayugan City (DepEd). Manages schools, students, enrollment, sections, subjects, grades, attendance, learner health, books (allocations/issuances), staff, rooms, schedules, Form 137 requests, and DepEd School Forms (SF1–SF10).

**Main modules:** Enrollment, Subjects, Sections, Students, Schedules, Attendance, Learner Health, Books, Staff, Rooms, Form Requests, DepEd Reports, Teacher Dashboard, Student Portal, Division Admin.

**User roles and access:**
- **Staff** (`school_head`, `admin`, `registrar`, `librarian`) — full school data via sidebar modules
- **Teachers** — restricted view: their sections, subjects, grade entry, books issue/return
- **Division admins** — manage schools and users across the division (no `school_id` required)
- **Students** — separate portal (LRN + DOB auth), read-only grades/dashboard
- **Public** — browse schools/learners, submit Form 137/document requests

All valid user types: `school_head`, `teacher`, `registrar`, `admin`, `super admin`, `division_admin`, `librarian`

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Frontend | React 19, Tailwind CSS 4, shadcn/ui (Radix UI) |
| Backend/DB | Supabase (PostgreSQL + Auth) |
| State | Redux Toolkit (`userSlice`, `listSlice`) |
| Forms | React Hook Form + Zod + `@hookform/resolvers` |
| Auth | Supabase Auth (staff) + JWT cookie via `jose` (student portal) |
| PDF | jsPDF (DepEd forms) |
| Other | date-fns, lucide-react, nprogress, react-hot-toast |

---

## Development Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm run start    # Run production server
npm run lint     # ESLint
```

**Required env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SERVICE_ROLE_KEY`, `STUDENT_PORTAL_JWT_SECRET`

---

## Architecture

**Project structure:**
```
app/
├── (protected)/          # Staff app - requires Supabase auth
│   ├── home, enrollment, subjects, sections, students, schedules, attendance, health
│   ├── books/             # Allocations, issuances
│   ├── staff, rooms
│   ├── teacher/           # Teacher-specific: dashboard, sections, subjects, grades, books
│   ├── formrequests/
│   ├── reports/           # DepEd SF1–SF10
│   └── division/          # Schools, users, reports (division_admin only)
├── (public)/              # Auth, login, requests
├── (landing)/             # Public schools/learners pages
├── student-portal/        # Student app - LRN + DOB JWT auth
lib/
├── supabase/              # client, server, admin, middleware
├── redux/                 # store, userSlice, listSlice, providers
├── utils/, pdf/, constants/, student-portal/, notifications/
components/                # Shared UI, AuthGuard, AppSidebar, etc.
types/                     # database.ts, index.ts
supabase/migrations/       # 30+ migrations, tables in procurements schema
```

**Auth flows:**
- **Staff:** `AuthGuard` → Supabase session → `sms_users` lookup → Redux `userSlice` (user, type, school_id)
- **Student:** LRN + DOB → `verifyStudent` server action (`lib/student-portal/actions.ts`) → JWT cookie → `StudentAuthGuard`
- **CRUD:** Client-side `supabase.from("sms_*")` with `school_id` filter where applicable

**Supabase schema:** All SMS tables live in the `procurements` schema. **Critical:** `lib/supabase/server.ts` defaults to the `public` schema — when adding server-side queries for SMS tables, you must specify `procurements` explicitly. The client and admin clients already target `procurements`.

**Redux `listSlice`:** Generic cache for list pages. Reset with `addList([])` on filter change. All list fetchers use an `isMounted` flag to avoid setState after unmount.

---

## Key Features & Locations

| Feature | Location | Notes |
|---------|----------|-------|
| **Auth (staff)** | `AuthGuard`, `auth/callback`, `auth/unverified` | Session → `sms_users` → Redux |
| **Auth (student)** | `lib/student-portal/actions.ts`, `StudentAuthGuard` | LRN + DOB, JWT cookie |
| **School guard** | `SchoolIdGuard` | Blocks non–division_admin users without `school_id` |
| **Sidebar** | `AppSidebar` | Role-based: allModuleItems, teacherItems, divisionItems |
| **Grade entry** | `teacher/grades`, `TeacherGradeEntryTable` | Validates schedule/adviser before edit; 4 grading periods |
| **Books** | `books/allocations`, `books/issuances`; teacher `books/issue`, `return-to-manager` | Allocation: manager→teacher; Issuance: teacher→student |
| **School Form 10** | `formrequests/requests`, `(public)/requests` | Status: pending → approved → completed |
| **DepEd reports** | `reports/`, `lib/pdf/` | SF1–SF10; school year, section, student filters |
| **Learner health** | `health/` | SF8; height, weight, nutritional status |
| **Student portal** | `student-portal/(portal)/dashboard`, `grades` | Read-only grades via server actions |

---

## Coding Conventions

- **TypeScript:** No `any` types
- **School scoping:** Always filter by `school_id` when `user.school_id` is present
- **Search input:** Use `escapeIlikePattern()` from `@/lib/utils` for all user-supplied `ilike` strings (SQL injection prevention)
- **School year:** Use `getCurrentSchoolYear()` / `getSchoolYearOptions()` from `@/lib/utils/schoolYear`
- **Redux hooks:** `useAppSelector`, `useAppDispatch` from `@/lib/redux/hook`
- **Page-specific components:** Co-locate in a `components/` subfolder alongside the page (e.g. `teacher/components/`)
- **UI primitives:** `components/ui/` holds all shadcn/Radix components

---

## Critical Invariants

1. **School scoping** — All data filtered by `school_id` for school-level roles; never omit this filter
2. **Grade validation** — Teacher must appear in `sms_subject_schedules` or be section adviser before grade edits are permitted
3. **Student portal auth** — JWT cookie only; students never touch Supabase Auth
4. **`SchoolIdGuard`** — `division_admin` is the only role that can have a null `school_id`
5. **Book return codes** — Valid values: `FM`, `TDO`, `NEG` (type `BookReturnCode`)
6. **Grading periods** — 1–4; grades keyed by `(student_id, subject_id, section_id, grading_period, school_year)`
7. **Schema mismatch** — `lib/supabase/server.ts` uses `public` schema; client/admin use `procurements` — always check which client you're using for server-side SMS queries
