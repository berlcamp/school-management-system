# School Coordinator Designations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four staff designations (ARAL Coordinator, Reading Coordinator, Department Head, Grade Level Coordinator) layered on a person's normal account, set on `/staff`. Each one unlocks scoped powers, and Department Heads get a Department MPS coverage dashboard.

**Architecture:** Migration 216 adds `sms_staff_designations` + `sms_department_head_subjects`, SECURITY DEFINER helper predicates, additive RLS branches on `sms_subjects` / `sms_subject_schedules` / two storage prefixes, and guard triggers that pin which columns a designee may change. The client reads the caller's designations through one cached hook (`useDesignations`, modelled on `hooks/useRegionAccess.ts`). Existing Subjects / Schedules / Sections / ARAL / Assessments pages widen their gates to "role OR designation" and scope their lists. A new `/department` page renders the coverage grid from a pure builder.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres RLS, plpgsql), Redux Toolkit, React Hook Form + Zod, vitest, psql scenario tests.

**Spec:** `docs/superpowers/specs/2026-10-21-school-coordinator-designations-design.md`

## Global Constraints

- **LOCAL DATABASE ONLY** (CLAUDE.md Rule 0). psql only against `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Start with `npx supabase start` (park `supabase/migrations/` first, per Rule 5). If `.env.development.local` is missing, STOP.
- Migration file: `supabase/migrations/216_staff_designations.sql`. Never edit an earlier migration. No DML on existing rows.
- Designation keys, exactly: `aral_coordinator`, `reading_coordinator`, `department_head`, `grade_level_coordinator`. Labels: "ARAL Coordinator", "Reading Coordinator", "Department Head", "Grade Level Coordinator".
- A designation takes effect only while its `school_id` equals the caller's `sms_users.school_id` (active school, invariant 13), regardless of the caller's active `type`.
- Department Head may change only `code`, `name`, `description` on an existing subject. They may create subjects (any fields) and may not delete them.
- GLC may change only `teacher_id` and `conflict_override` on schedules, and only `section_adviser_id` on sections, for sections whose `grade_level` is in their `grade_levels`.
- Designation managers: active `school_head`, `assistant_school_head`, `admin` at that school, plus `division_admin`, `super admin`. Login-disabled types (`isLoginDisabledUserType()`) cannot be designated.
- Re-create every replaced policy from its **live** `pg_policies` definition on the local clone, adding only the new `OR` branch.
- Helper functions: `SECURITY DEFINER`, `SET search_path = procurements, public`, `REVOKE ALL ... FROM PUBLIC, anon`, `GRANT EXECUTE ... TO authenticated` only for those used in policies.
- No `any` types. Use `Number()` for BIGINT ids passed to `.eq()`.

## Review Focus

1. **User holds a 115 roster role AND a designation** (e.g. a registrar who is also a Department Head). The column guards must not restrict them. A guard applies only when the designation is the caller's *only* authority. Test added in Task 2.
2. **Designee switches active school** (134). Their powers must stop at once, both in SQL and in the sidebar. SQL test in Task 1; the hook refetches on `school_id` change in Task 3.
3. **Subject deleted while a Department Head is linked.** The link cascades away and the dashboard does not show an orphan row. SQL test in Task 2.
4. **School year before `TERM_SYSTEM_START_SY`.** The grid must show Q1–Q4, not Term 1–3. vitest in Task 8.
5. **Department Head opens Edit on a subject they head.** The locked fields are disabled in the form and the save payload sends only `code`/`name`/`description`, so the guard trigger is never what the user sees. Covered in Task 6 Step 3.

---

### Task 1: Migration 216, part A — designation tables, helpers, designation RLS

**Files:**
- Create: `supabase/migrations/216_staff_designations.sql`
- Create: `supabase/tests/216_staff_designations.sql` (copy the `tst` harness from `supabase/tests/214_region_account.sql`: `tst.ids`, `tst.claims`, `tst.expect_error`, `tst.expect_rows`; one transaction, `ROLLBACK` at end)

**Interfaces:**
- Produces (SQL):
  - table `procurements.sms_staff_designations(id bigserial pk, user_id bigint not null, school_id bigint not null, designation text not null, grade_levels integer[], created_by bigint, created_at timestamptz default now(), updated_at timestamptz default now())`. CHECK `designation IN (four keys)`. CHECK `(designation = 'grade_level_coordinator') = (grade_levels IS NOT NULL AND cardinality(grade_levels) > 0)`. UNIQUE `(user_id, school_id, designation)`. FKs in a guarded `DO` block: user → `sms_users` CASCADE, school → `sms_schools` CASCADE.
  - table `procurements.sms_department_head_subjects(id bigserial pk, user_id bigint not null, subject_id bigint not null, school_id bigint not null, created_at timestamptz default now())`. UNIQUE `(user_id, subject_id)`. FKs user CASCADE, subject → `sms_subjects` CASCADE.
  - `sms_has_designation(p_designation text, p_school_id bigint) RETURNS boolean`
  - `sms_heads_subject(p_subject_id bigint) RETURNS boolean`
  - `sms_glc_covers(p_school_id bigint, p_grade_level int) RETURNS boolean`
  - `sms_may_manage_designations(p_school_id bigint) RETURNS boolean`
  - trigger `sms_staff_designations_guard` (BEFORE INSERT/UPDATE): refuses a login-disabled holder (`accounting`, `security_guard`, `utility_worker`) and a holder not in `sms_user_schools` for that school.
  - trigger `sms_dh_subjects_guard` (BEFORE INSERT): requires a `department_head` designation for `user_id` at the subject's school, and sets `school_id` from the subject.
  - trigger on `sms_staff_designations` AFTER DELETE (and AFTER UPDATE when `designation` changes away from `department_head`): deletes that user's links at that school.

- [ ] **Step 1: Write the failing SQL test.** Fixtures: a school S1 (and S2), head H (`school_head` @S1), teacher T (`teacher` @S1, assigned to S1 and S2), a guard G (`security_guard` @S1), and a subject X @S1. Assertions:
  - as H: insert `department_head` for T @S1 → 1 row; insert link (T, X) → 1 row; `sms_has_designation('department_head', S1)` as T → true; `sms_heads_subject(X)` as T → true
  - as T: inserting a designation → `expect_error(..., 'row-level security')`
  - as H: `grade_level_coordinator` with `grade_levels` NULL → `expect_error(..., 'check')`
  - as H: designation for G → `expect_error(..., 'cannot be designated')`
  - switch T's `sms_users.school_id` to S2 → `sms_has_designation('department_head', S1)` as T is false and `sms_heads_subject(X)` is false
  - as H: delete T's designation → `sms_department_head_subjects` count for T = 0
- [ ] **Step 2: Run it and confirm it fails.** Run `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/216_staff_designations.sql`. Expected: ERROR, relation `sms_staff_designations` does not exist.
- [ ] **Step 3: Write part A of the migration.** Header comment in the house style (what, why, "no DML on existing rows"). RLS on both tables: SELECT `auth.role() = 'authenticated'`; INSERT/UPDATE/DELETE `sms_may_manage_designations(school_id)`. Helpers resolve the caller as `sms_users WHERE user_id = auth.uid() AND is_active` (check the live column name for active status), with `u.school_id = p_school_id` as the active-school test.
- [ ] **Step 4: Apply locally and run the test.** `psql ... -f supabase/migrations/216_staff_designations.sql`, then the test file. Expected: only `NOTICE ok ...` lines, ending in ROLLBACK.
- [ ] **Step 5: Commit** `feat(designations): designation tables and helpers (migration 216, part A)`.

### Task 2: Migration 216, part B — subjects, schedules, storage

**Files:**
- Modify: `supabase/migrations/216_staff_designations.sql` (append)
- Modify: `supabase/tests/216_staff_designations.sql` (append)

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces (SQL):
  - `sms_is_subject_roster(p_school_id bigint) RETURNS boolean`: caller's active type is in 115's write roster for that school (`school_head`, `assistant_school_head`, `admin`, `registrar` at the school, or `division_admin`/`super admin`). Used by the guards to detect "designation is the only authority".
  - trigger `sms_subjects_dh_autolink` AFTER INSERT on `sms_subjects`: if `sms_has_designation('department_head', NEW.school_id)`, insert link (caller, NEW.id).
  - trigger `sms_subjects_dh_column_guard` BEFORE UPDATE on `sms_subjects`: when `NOT sms_is_subject_roster(OLD.school_id)`, raise `'A Department Head may change only the code, name and description of a subject.'` if any column other than `code`, `name`, `description`, `updated_at` differs (compare `to_jsonb(NEW) - those keys` with `to_jsonb(OLD) - those keys`).
  - trigger `sms_schedules_glc_column_guard` BEFORE UPDATE on `sms_subject_schedules`: when `NOT sms_is_subject_roster(OLD.school_id) AND NOT sms_heads_subject(OLD.subject_id)`, raise `'A Grade Level Coordinator may change only the teacher of a schedule.'` if anything other than `teacher_id`, `conflict_override`, `updated_at` differs.
  - Policy branches (each re-created from live `pg_policies`):
    - `sms_subjects` INSERT: `OR sms_has_designation('department_head', school_id)`. UPDATE USING and WITH CHECK: `OR sms_heads_subject(id)`.
    - `sms_subject_schedules` INSERT, DELETE: `OR sms_heads_subject(subject_id)`. UPDATE USING and WITH CHECK: `OR sms_heads_subject(subject_id) OR sms_glc_covers(school_id, (SELECT grade_level::int FROM sms_sections WHERE id = section_id))`.
    - storage `school_management crla|philiri insert|update|delete`: re-create 215's six with `OR EXISTS (SELECT 1 FROM sms_users u JOIN sms_staff_designations d ON d.user_id = u.id AND d.school_id = u.school_id WHERE u.user_id = auth.uid() AND d.designation = 'reading_coordinator')`.

- [ ] **Step 1: Dump live definitions first.** `psql ... -c "select tablename, policyname, cmd, qual, with_check from pg_policies where (schemaname='procurements' and tablename in ('sms_subjects','sms_subject_schedules')) or (schemaname='storage' and policyname like 'school_management %')"`. Save the output to the scratchpad and build the replacements from it.
- [ ] **Step 2: Append failing tests.** Fixtures: subject Y @S1 not headed by T; section 5-A (grade 5) and 6-A (grade 6) @S1; schedules for X in 5-A and for Y in 5-A and 6-A; teacher U (GLC @S1, grades {5}); registrar R @S1 who is also `department_head` of X. Assertions:
  - T inserts subject Z @S1 → link (T, Z) exists
  - T updates X `name` → 1 row; T updates X `is_madrasah = true` → error like `may change only the code`; T updates X `grade_level` → same error
  - T updates Y `name` → `expect_rows(..., 0)` (RLS hides it)
  - T deletes X → 0 rows
  - T inserts a schedule for X in 6-A → ok; for Y → error `row-level security`; T deletes own X schedule → 1 row
  - U updates the Y/5-A schedule `teacher_id` → 1 row; U updates its `start_time` → error `may change only the teacher`; U updates the Y/6-A schedule `teacher_id` → 0 rows
  - R updates X `is_madrasah` → 1 row (roster role is not restricted: Review Focus 1)
  - delete subject X as H → links for X = 0 (Review Focus 3)
  - Reading Coordinator V @S1 inserts into `storage.objects` (`bucket_id = 'school-management'`, `name = 'crla-materials/test.pdf'`) → 1 row; teacher T → `row-level security`
- [ ] **Step 3: Run and confirm the new assertions fail.**
- [ ] **Step 4: Append part B to the migration**, then re-apply it to the local DB. Part A must be idempotent: `CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`.
- [ ] **Step 5: Run the whole test file.** Expected: all `ok` lines, ROLLBACK.
- [ ] **Step 6: Commit** `feat(designations): department head and GLC write rules (migration 216, part B)`.

### Task 3: Constants + `useDesignations` hook

**Files:**
- Create: `lib/constants/designations.ts`
- Create: `lib/constants/__tests__/designations.test.ts`
- Create: `hooks/useDesignations.ts`

**Interfaces:**
- Produces:
  - `export const STAFF_DESIGNATIONS = ["aral_coordinator","reading_coordinator","department_head","grade_level_coordinator"] as const; export type StaffDesignation = (typeof STAFF_DESIGNATIONS)[number];`
  - `export const DESIGNATION_LABELS: Record<StaffDesignation, string>`
  - `export function designationNeeds(d: StaffDesignation): "subjects" | "grade_levels" | null`
  - `export function canBeDesignated(type?: string | null): boolean` (false for `isLoginDisabledUserType` and for empty)
  - `export function canManageDesignations(type?: string | null): boolean` (`school_head`, `assistant_school_head`, `admin`, `super admin`, `division_admin`)
  - `hooks/useDesignations.ts`: `export function useDesignations(): { loading: boolean; has: (d: StaffDesignation) => boolean; subjectIds: Set<string>; gradeLevels: Set<number> }` and `export function refreshDesignations(): void`. It reads `sms_staff_designations` (+ `sms_department_head_subjects`) for `user.system_user_id` at `user.school_id`. A module-level cached promise is keyed by `${system_user_id}:${school_id}`, so a school switch refetches (Review Focus 2). Everything is false while loading.

- [ ] **Step 1: Write the failing test** `designations.test.ts`:
  - `designationNeeds("department_head") === "subjects"`
  - `designationNeeds("grade_level_coordinator") === "grade_levels"`
  - `designationNeeds("aral_coordinator") === null`
  - `canBeDesignated("teacher")` true; `canBeDesignated("security_guard")` false; `canBeDesignated(null)` false
  - `canManageDesignations("admin")` true; `canManageDesignations("teacher")` false
  - every key has a label
- [ ] **Step 2: Run `npx vitest run lib/constants/__tests__/designations.test.ts` and confirm it fails.**
- [ ] **Step 3: Implement both files.** The hook follows `useRegionAccess.ts`: cached promise, `isMounted` flag.
- [ ] **Step 4: Run the test (PASS) and `npm run lint`.**
- [ ] **Step 5: Commit** `feat(designations): constants and useDesignations hook`.

### Task 4: Staff page — Designations section and badges

**Files:**
- Create: `app/(protected)/staff/components/DesignationsFields.tsx`
- Modify: `app/(protected)/staff/AddModal.tsx` (render below the "Also works as" block, around line 458; save after the `sms_user_roles` sync inside `onSubmit`, around line 145)
- Modify: `app/(protected)/staff/List.tsx` (badges)

**Interfaces:**
- Consumes: Task 3 constants; `refreshDesignations()`.
- Produces: `DesignationsFields({ schoolId: number; value: DesignationDraft; onChange: (v: DesignationDraft) => void; disabled?: boolean })`, where `type DesignationDraft = { designations: StaffDesignation[]; subjectIds: string[]; gradeLevels: number[] }`. Also `saveDesignations(userId: number, schoolId: number, draft: DesignationDraft): Promise<void>`, exported from the same file. It diffs against the current rows (insert new / delete removed / update GLC `grade_levels`), then replaces the link set.

- [ ] **Step 1: Build `DesignationsFields`.**
  - Four checkboxes with labels.
  - Department Head → a searchable checkbox list of the school's active subjects (`code — name`, grouped by grade level). Show "also headed by <name>" from existing links.
  - GLC → grade-level checkboxes. Use the grade levels present in the school's active sections; label 0 as "Kinder" via the existing grade label helper in `lib/utils` if present.
  - Hidden unless `canManageDesignations(user.type)`. Disabled with a note when `!canBeDesignated(selected staff type)`.
- [ ] **Step 2: Wire it into AddModal.**
  - Load the draft when editing.
  - Validate: GLC needs ≥1 grade level ("Pick at least one grade level"); Department Head with zero subjects is allowed.
  - Call `saveDesignations` after the main save. Surface errors with `toast.error(error.message)`.
- [ ] **Step 3: List badges.** Fetch designations for the page's user ids in one query and render small `Badge`s with the labels.
- [ ] **Step 4: Manual check on local** (`npm run dev`, confirm `.env.development.local` exists). Designate a teacher as Department Head with two subjects and as GLC for Grade 5; reopen the modal and confirm both persist; untick Department Head and confirm the links are gone (`psql ... -c "select * from procurements.sms_department_head_subjects"`).
- [ ] **Step 5: Commit** `feat(staff): designate coordinators on the Staff page`.

### Task 5: Sidebar, guards, ARAL and Assessments access

**Files:**
- Modify: `components/AppSidebar.tsx` (teacher-menu assembly near lines 313 and 418)
- Modify: `components/SchoolHeadGuard.tsx` (only used by `app/(protected)/school/layout.tsx`, so confirm with grep first)
- Modify: `app/(protected)/aral/page.tsx:34`, `app/(protected)/aral/tutors/page.tsx:27`, `app/(protected)/aral/[program]/page.tsx:52,71`

**Interfaces:**
- Consumes: `useDesignations()`.

- [ ] **Step 1: Sidebar.** Append to the Teacher Menu, only for designees and never for those who already see the Modules entry:
  - `reading_coordinator` → `{ title: "Assessments", url: "/school/assessments", moduleName: "school_assessments" }`
  - `department_head` → `Department` (`/department`, icon `BarChart3`), `Subjects` (`/subjects`), `Schedules` (`/schedules`)
  - `grade_level_coordinator` → `Sections` (`/sections`), `Schedules` (`/schedules`)
  - de-duplicate by `url`
- [ ] **Step 2: Guard.** `SchoolHeadGuard` also admits `has("reading_coordinator")`, waiting while `loading` (render null, no redirect, until loaded).
- [ ] **Step 3: ARAL.** `canManage = [...existing].includes(type) || has("aral_coordinator")`. Extend the "every section in their school" branch in `[program]/page.tsx` to the same predicate.
- [ ] **Step 4: Manual check.** Log in locally as the designated teacher: the new items appear, ARAL shows the manage controls, and `/school/assessments` opens. Undesignate them and reload: all of it is gone.
- [ ] **Step 5: Commit** `feat(designations): coordinator menu items and ARAL / Assessments access`.

### Task 6: Subjects page scoped for Department Heads

**Files:**
- Modify: `app/(protected)/subjects/page.tsx`, `List.tsx`, `AddModal.tsx`
- Create: `lib/utils/subjectEditScope.ts` + `lib/utils/__tests__/subjectEditScope.test.ts`

**Interfaces:**
- Produces: `export const DEPARTMENT_HEAD_EDITABLE_SUBJECT_FIELDS = ["code","name","description"] as const;` and `export function pickDepartmentHeadSubjectUpdate<T extends Record<string, unknown>>(payload: T): Partial<T>`.

- [ ] **Step 1: Failing test.** `pickDepartmentHeadSubjectUpdate({ code: "M7", name: "Math 7", description: "x", is_madrasah: true, grade_level: 7 })` deep-equals `{ code: "M7", name: "Math 7", description: "x" }`.
- [ ] **Step 2: Implement it and pass the test.**
- [ ] **Step 3: Scope the page.** Define `isDeptHeadOnly = has("department_head") && !hasSchoolManagementAccess(type)`, using the same roster the sidebar uses. When true:
  - the list query adds `.in("id", [...subjectIds])`; an empty set shows the empty state
  - the Delete action is hidden
  - Add stays visible; after insert, call `refreshDesignations()` so the auto-linked subject appears
  - in Edit mode, every field outside the three is `disabled`, and the update sends `pickDepartmentHeadSubjectUpdate(payload)` (Review Focus 5)
- [ ] **Step 4: Manual check.** As the Department Head, create a subject and confirm it appears in the list; edit its name; confirm grade level and program are disabled.
- [ ] **Step 5: Commit** `feat(subjects): department heads manage their own subjects`.

### Task 7: Schedules and Sections scoped for Department Heads and GLCs

**Files:**
- Modify: `app/(protected)/schedules/page.tsx`, `List.tsx`, `AddModal.tsx`, `DuplicateModal.tsx`
- Modify: `app/(protected)/sections/page.tsx`, `List.tsx`, `AddModal.tsx`, `ViewSubjectsModal.tsx` (Manage Schedules)

**Interfaces:**
- Consumes: `useDesignations()` (`subjectIds`, `gradeLevels`).

- [ ] **Step 1: Schedules list scope.** For a designee with no roster role, filter to rows where `subject_id ∈ subjectIds` OR the section's grade level is in `gradeLevels`. Per row: Edit/Delete/Duplicate are allowed when `subjectIds.has(subject_id)`; for a GLC-only row, Edit only.
- [ ] **Step 2: Schedule form in GLC mode.** When the row is editable only through GLC, every field except Teacher is disabled. The update sends `{ teacher_id, conflict_override }` only. The existing conflict warning and "Save anyway" checkbox still show. For a Department Head, the subject picker lists only `subjectIds`.
- [ ] **Step 3: Sections.** A designee without a roster role sees no Add / Delete / Duplicate. Edit is offered only to a GLC on covered grade levels and enables only the Adviser field (update sends `{ section_adviser_id }` only). The sections list is filtered to covered grade levels for a GLC-only user. Department Heads reach sections only through Schedules (no section list item; see Task 5).
- [ ] **Step 4: Manage Schedules modal.** Same rules as Steps 1–2 inside `ViewSubjectsModal.tsx`.
- [ ] **Step 5: Manual check.**
  - As the Department Head: add a schedule for their subject in an existing section; confirm other subjects' rows are read-only or absent.
  - As the GLC: change a Grade 5 teacher, including one clash saved with "Save anyway"; confirm Grade 6 is absent and no other field is editable.
- [ ] **Step 6: Commit** `feat(schedules,sections): scoped access for department heads and grade level coordinators`.

### Task 8: Shared MPS aggregation + coverage-grid builder

**Files:**
- Create: `lib/utils/mpsAggregate.ts` (moved out of `app/(protected)/mps/page.tsx` lines ~104–200)
- Modify: `app/(protected)/mps/page.tsx` (use it; behaviour unchanged)
- Create: `lib/utils/departmentMps.ts` + `lib/utils/__tests__/departmentMps.test.ts`

**Interfaces:**
- Produces:
  - `export type MpsGroup = { subjectName: string; subjectId: string | null; sectionId: string; gradeLevel: number; period: number; mps: number }`
  - `export function aggregateExamMps(rows: ExamResultRow[]): MpsGroup[]`. Same grouping and averaging as today, plus `subjectId` from `sms_tos.subject_id` (add it to the select).
  - `export function periodColumns(schoolYear: string): { period: number; label: string }[]`. Term 1–3 when the year is ≥ `TERM_SYSTEM_START_SY`, else Q1–Q4.
  - `export type CoverageRow = { subjectId: string; subjectName: string; gradeLevel: number; sectionId: string; sectionName: string; teachers: string[]; cells: Record<number, number | "missing" | "future"> }`
  - `export function buildCoverage(input: { schedules: { subject_id: string; subject_name: string; grade_level: number; section_id: string; section_name: string; teacher_name: string | null }[]; mps: MpsGroup[]; schoolYear: string; currentPeriod: number }): CoverageRow[]`. Match an MPS group by `subjectId` when present, else by `subjectName` + `gradeLevel`. A period above `currentPeriod` is `"future"`.
  - `export function coverageTotals(rows: CoverageRow[], period: number): { encoded: number; expected: number; missing: number; average: number | null }`

- [ ] **Step 1: Failing tests** in `departmentMps.test.ts`:
  - `periodColumns("2026-2027").map(c => c.label)` equals `["Term 1","Term 2","Term 3"]`; `periodColumns("2025-2026")` gives `["Q1","Q2","Q3","Q4"]` (Review Focus 4)
  - two schedule blocks for the same subject+section produce one row; two different teachers give `teachers.length === 2`
  - an MPS group with `subjectId` null matches by name + grade; one with a different grade does not match
  - with `currentPeriod = 2`: period 1 has a value, period 2 with no group is `"missing"`, period 3 is `"future"`
  - `coverageTotals` over 3 rows with 2 encoded in period 1 gives `{ encoded: 2, expected: 3, missing: 1 }` with the right average
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Move the aggregation from `mps/page.tsx` into `aggregateExamMps` without changing its output. The page's own row shape is derived from `MpsGroup` plus the sex split it already computes; keep that in the page if it doesn't fit the shared type.
- [ ] **Step 4: Run tests (PASS), then `npm test` (whole suite) and `npm run lint`.** Open `/mps` locally and confirm the figures match before and after.
- [ ] **Step 5: Commit** `feat(mps): shared exam-MPS aggregation and department coverage builder`.

### Task 9: `/department` dashboard

**Files:**
- Create: `app/(protected)/department/page.tsx`
- Create: `app/(protected)/department/components/CoverageGrid.tsx`, `CoverageTiles.tsx`

**Interfaces:**
- Consumes: `useDesignations()`, `aggregateExamMps`, `buildCoverage`, `coverageTotals`, `periodColumns`, `mps/components/MpsBarChart.tsx`.

- [ ] **Step 1: Page.**
  - Render `ModuleAccessDenied` unless `has("department_head")` (wait for `loading`).
  - Filters: School year (`getSchoolYearOptions()`, default `getCurrentSchoolYear()`), Subject (all of mine, or one), "Show missing only".
  - Fetch schedules (`sms_subject_schedules` with section and teacher names, `.in("subject_id", ids)`, `.eq("school_year", sy)`, `.eq("school_id", Number(school_id))`) and exam results (the same select as `/mps`), with an `isMounted` flag.
  - `currentPeriod`: the period containing today for the current SY (use the existing grading-period helper in `lib/utils/schoolYear.ts` if one exists; otherwise the last column), and the last column for past years.
- [ ] **Step 2: Tiles + grid** as in the chosen mockup A. Columns: Subject, Section, Teacher, then the period columns. A missing cell has a red background with the text "Missing"; a future cell shows "—". Tiles show encoded / expected, missing, and average for the selected period (a period picker sits beside the tiles, defaulting to `currentPeriod`).
- [ ] **Step 3: Bar chart** below the grid for the selected subject and period, via `MpsBarChart`. Hide it when "all subjects" is selected.
- [ ] **Step 4: Manual check on local.** Seed an exam result locally if none exists. Confirm one class shows a figure, another shows Missing, and the figure equals `/mps` for the same subject, section and period.
- [ ] **Step 5: Commit** `feat(department): department head MPS coverage dashboard`.

### Task 10: Docs + hand-off

**Files:**
- Modify: `CLAUDE.md` (Key Features row "Staff designations", Notable Migrations row 216, a new invariant: "a designation is not a role: never add a designation to `sms_users.type`; it applies only at the active school")
- Modify: `lib/constants/userTypes.ts` header comment: one line pointing to `designations.ts`

- [ ] **Step 1: Write the doc rows.** Include the honest limits: sections, ARAL and assessment material tables stay open to `authenticated` and are app-gated; tightening them is follow-up.
- [ ] **Step 2: Final verification.** `npm test`, `npm run lint`, `npx tsc --noEmit`, and the SQL test file. All green.
- [ ] **Step 3: Commit** `docs: staff designations (migration 216)`.
- [ ] **Step 4: Hand-off message to the user (do not apply to production).** Give the file path, the objects it creates or replaces (2 tables, 6 functions, 5 triggers, 6 table policies and 6 storage policies replaced), "touches no existing rows", and a reminder to click **Run without RLS** in the Supabase editor.
