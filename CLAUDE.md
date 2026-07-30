# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## System Overview

A **School Management System (SMS)** for the Schools Division of Bayugan City (DepEd). Manages schools, students, enrollment, sections, subjects, grades, attendance, learner health, books (allocations/issuances), staff, rooms, schedules, Form 137 requests, and DepEd School Forms (SF1–SF10).

**Main modules:** Enrollment, Subjects, Sections, Students, Schedules, Attendance, Learner Health, Books, Staff, Rooms, Form Requests, Manage Requests (transfers), DepEd Reports, Report Cards, Evaluations, ECCD Assessments, Settings, Teacher Dashboard, Student Portal, Division Admin.

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
| PDF | jsPDF (DepEd forms, report cards) |
| Excel | xlsx (list/report exports) |
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
│   ├── evaluations/       # Evaluation questionnaire management (student→teacher, teacher→principal)
│   ├── manage-requests/   # Document requests, incoming/outgoing record requests, transfer record viewer
│   ├── settings/          # Record edit locks, promotion deadline, principal config
│   ├── teacher/           # Teacher-specific: dashboard, sections, subjects, grades, books, evaluations, eccd
│   ├── formrequests/
│   ├── reports/           # DepEd SF1–SF10, SF10 historical grades encoding
│   └── division/          # Schools, users, reports, dashboard (division_admin only)
├── (public)/              # Auth, login, requests
├── (landing)/             # Public schools/learners pages
├── student-portal/        # Student app - LRN + DOB JWT auth (dashboard, grades, evaluations)
hooks/                     # Custom React hooks (useSchoolSettings, useBooks, useGpaThresholds, use-mobile)
lib/
├── supabase/              # client, server, admin, middleware
├── redux/                 # store, userSlice, listSlice, providers
├── utils/, pdf/, constants/, student-portal/, notifications/, requests/
components/                # Shared UI, AuthGuard, AppSidebar, etc.
├── dashboards/            # Role-specific: DefaultDashboard, SchoolDashboard, TeacherDashboard, DivisionDashboard
├── notifications/         # NotificationBell, NotificationDropdown
├── system-guide/          # SystemGuideDialog (help system)
├── ui/                    # shadcn/Radix UI primitives
types/                     # database.ts, index.ts
supabase/migrations/       # 66+ migrations, tables in procurements schema
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
| **Transfer enrollment** | `manage-requests/`, `enrollment/components/EnrollmentWizard.tsx` | Immediate enrollment + record request; see Transfer Workflow below |
| **DepEd reports** | `reports/`, `lib/pdf/` | SF1–SF10; school year, section, student filters |
| **Grade monitoring** | `grade-monitoring/`, migration 107 | School head / admin view of which teachers encoded grades per subject/section/period; denominator is `sms_subject_schedules`, encoded means `grade > 0` |
| **Learner health** | `health/` | SF8; height, weight, nutritional status (DepEd wasting bands; migration 111) |
| **School Report Card** | `reports/school-report-card/`, `lib/pdf/generateSchoolReportCard.ts`, migration 112 | Annual school-level accountability doc (16 sections) — NOT the learner SF9 report card. Every section is user-entered; `src_autofill` only prefills the 6 derivable ones. Snapshot, never re-derived: it is signed and published. |
| **Evaluations** | `evaluations/`, `teacher/evaluations/`, `student-portal/(portal)/evaluations/` | Student→teacher and teacher→principal; Likert-scale (1–5); migration 054 |
| **Report cards** | `lib/pdf/generateReportCard.ts`, migration 055 | PrintCardModal, core value ratings per student per school year |
| **ECCD assessments** | `teacher/eccd/` | Early childhood development checklist/assessment entry |
| **Settings** | `(protected)/settings/` | Record edit locks (prev school year), promotion deadline, school principal name/title |
| **Student portal** | `student-portal/(portal)/dashboard`, `grades`, `evaluations` | Read-only grades + teacher evaluations via server actions |

---

## Transfer Enrollment Workflow (Immediate Enrollment)

All inter-school transfers go through a **record request** for data access — but the student is **immediately enrolled and active** at the new school. The `StudentEntryMode` type has only `"new" | "existing" | "transferee"`.

**Step 1 — Destination school enrolls transferee:**
- LRN lookup finds student at different school → `transferee` mode (regardless of origin status)
- `enroll_student_with_record_request` RPC creates record request (`pending`) + enrollment (`approved`/`active`)
- Student is immediately active at the new school; grade level auto-suggested from previous record
- If an old enrollment exists at the same school/year (e.g., student returning), it is reactivated instead of inserting a duplicate

**Step 2 — Origin school approves/rejects record access:**
- Manage Requests → Incoming Requests tab at origin school
- `respond_to_record_request` RPC: approve → `record_access_granted = true`, origin enrollment → `transferred_out`; reject → denies access only, student stays enrolled at destination
- RLS policies on `sms_grades`, `sms_attendance`, `sms_enrollments`, `sms_eccd_assessments`, `sms_learner_health` grant read access via `has_record_access()` function

**Step 3 — Destination school views records (optional):**
- Manage Requests → Outgoing Requests tab shows "View Records" button for approved requests
- `TransferRecordViewer` displays grades + enrollment history from origin school (read-only)
- If student is disqualified based on records, "Remove Student" action drops enrollment and reverts student to origin school (`remove_transfer_student` RPC)

**Enrollment lifecycle statuses:** `active`, `completed`, `transferred_out`, `dropped`, `pending_transfer`, `retained`, `promoted`, `graduated`

**Key locations:**
- Enrollment wizard: `enrollment/components/EnrollmentWizard.tsx`
- Outgoing requests (view records, remove student): `manage-requests/components/record-requests/OutgoingRequestsTab.tsx`
- Incoming requests (approve/reject): `manage-requests/components/record-requests/IncomingRequestsTab.tsx`
- Record viewer: `manage-requests/components/record-requests/TransferRecordViewer.tsx`
- Transfer out (teacher): `teacher/components/TransferOutModal.tsx`
- Change enrollment status: `enrollment/components/ChangeStatusModal.tsx`
- RPCs: `supabase/migrations/066_simplify_transfer_enrollment.sql` (current), `038_multi_school_transfers.sql` (base)

---

## Evaluations System

Two evaluation types managed through `sms_evaluations`, `sms_evaluation_questions`, and `sms_evaluation_responses`:

- **Student → Teacher:** Students rate teachers via student portal (`student-portal/(portal)/evaluations/`). Staff create questionnaires in `(protected)/evaluations/`.
- **Teacher → Principal:** Teachers submit evaluations from `teacher/evaluations/`.

Ratings use a Likert scale (1–5) with `StarRating` component. Duplicate submissions are prevented by unique constraint. Types: `EvaluationType`, `EvaluationRespondentType` in `types/index.ts`.

**Key locations:**
- Questionnaire management: `evaluations/`
- Teacher submission: `teacher/evaluations/`
- Student submission: `student-portal/(portal)/evaluations/`
- Server actions: `lib/student-portal/actions.ts` (`getActiveStudentEvaluations`, `submitStudentEvaluation`)
- Migration: `supabase/migrations/054_evaluations.sql`

---

## Report Cards & Core Values

Report card PDF generation with core value ratings stored per student per school year in `sms_report_card_core_values` (migration 055). School principal name/title configured in Settings (migration 053) and used as signatories.

**Key locations:**
- PDF generator: `lib/pdf/generateReportCard.ts`
- Principal config: `(protected)/settings/`, `hooks/useSchoolSettings.ts`
- Migration: `supabase/migrations/055_report_card_core_values.sql`

---

## Notable Recent Migrations

| Migration | Feature |
|-----------|---------|
| 050 | Added `promoted` and `graduated` enrollment statuses |
| 051 | Dropped deprecated `sms_section_students` (use `sms_enrollments`) |
| 052 | Transfer out metadata (reason, destination school) |
| 053 | School principal settings (name, title for signatories) |
| 054 | Evaluations system (questions, responses, types) |
| 055 | Report card core values table |
| 056 | Sync student enrollment status trigger |
| 057 | Transfer two-stage approval workflow (superseded by 066) |
| 058 | Allow edit promoted student grades setting |
| 059 | ECCD refactor |
| 060 | Principal to teacher evaluation |
| 061 | Atomic enroll for promoted/retained students |
| 062 | Promotion deadline + graduation lock triggers |
| 063 | Historical grades attachment |
| 064 | Fix transfer for promoted/graduated/retained students |
| 065 | Fix promotion deadline trigger type mismatch (TEXT vs BIGINT) |
| 066 | Simplified transfer: immediate enrollment + record request for data access + `remove_transfer_student` RPC |
| 070 | MPS (Mean Percentage Score) — teacher-entered per subject/section/quarter/school-year with mastery-level reporting |
| 106 | School-authored assessment materials — nullable `school_id` on CRLA / Phil-IRI / RMA materials (NULL = division-wide, set = that school only) |
| 107 | Grade encoding status — `get_grade_encoding_status` RPC backing the school head Grade Monitoring page (read-only aggregate; no new tables) |
| 108 | CRLA Grade 3 English — collapses that grade+language to the DepEd 2-task / 20-point flat form (no Task 2L/2H branch); re-bands existing records |
| 109 | Fix `division_classroom_needs` — filtered on `sms_enrollments.status` (approval) instead of `enrollment_status` (lifecycle), so enrolled was always 0; also counts by `e.school_id` not `students.school_id` |
| 110 | Storage policies for `crla-materials/` and `philiri-materials/` now admit `school_head` / `assistant_school_head` (were division-only), so school-authored materials from 106 can carry file attachments |
| 111 | Learner health BMI bands — `nutritional_status` widened from `underweight/normal/overweight/obese` to the DepEd wasting scale (`severely_wasted, wasted, normal, overweight, obese`); existing `underweight` rows re-banded to `wasted` (see caveat in the migration header) |
| 112 | School Report Card — `sms_src_submissions` (typed header) + `sms_src_sections` (JSONB bodies) + `src_autofill` RPC; mirrors the 072 submission pattern |
| 113 | Fix SRC 403 for `super admin` — 112's write policies omitted the role, so the page's draft INSERT was denied. Super admin joins the full-access branch (not school-matched: `AuthGuard` swaps their `school_id` for the active-school override), per the 094 precedent |
| 115 | Fix `sms_subjects` / `sms_subject_schedules` RLS — adds `super admin` to the full-access branch (per 113), **and** repairs school isolation: 037/095 wrote the match as an unqualified `u.school_id = school_id` inside a subquery over `sms_users`, which bound to the inner table (`u.school_id = u.school_id`, always true and type-valid, so the bug was silent), leaving cross-school writes unblocked since 037. Outer table now qualified. No casts: `sms_users.school_id` is BIGINT (013 converted it from TEXT), as are both `school_id` columns being compared |

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
8. **Transfer immediate enrollment** — Transferees are immediately `active` at the new school. Record requests only control data access to previous school records. Origin school approval grants read access; rejection only denies data visibility (enrollment stays active). Use `remove_transfer_student` RPC if student must be removed after record review.
9. **No pre-released bypass** — All transferees use record request flow, even if already marked `transferred_out` at origin
10. **Enrollment reactivation** — When a student returns to a school where they had a stale enrollment (transferred_out, dropped, etc.) for the same school year, the existing row is reactivated instead of inserting a duplicate (unique constraint: `student_id, school_id, school_year, semester`)
11. **Type safety for BIGINT columns** — `sms_school_settings.school_id` is `TEXT` while most other `school_id` columns are `BIGINT`. Use `::TEXT` cast in SQL when comparing across these tables. In frontend, use `Number()` when passing string IDs to `.eq()` on BIGINT columns.
