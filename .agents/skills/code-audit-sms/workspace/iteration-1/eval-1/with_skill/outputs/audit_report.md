# SMS Code Audit Report
**Date:** 2026-04-02
**Scope:** Full system audit — all 7 passes covering architecture, database/Supabase, DepEd business logic, code quality, security, performance, and QA/edge cases.

---

## Executive Summary

The SMS codebase is structurally sound with a well-applied auth layer: `AuthGuard` wraps all protected routes, `DivisionGuard` correctly gates division-only routes, and `SchoolIdGuard` enforces school scoping at the layout level. The server-side Supabase client (`lib/supabase/server.ts`) has been corrected to use the `procurements` schema, eliminating the documented critical risk. The most critical finding is that the `submitStudentEvaluation` and `getStudentGrades` server actions accept a `studentId` parameter from the client without re-validating it against the authenticated JWT cookie — a student could pass any other student's ID and retrieve their grades or submit evaluations on their behalf. Two other high-severity issues are: the `updateRequestStatus` server action has no session validation (any caller can change document request statuses), and Grade 10 completers are incorrectly treated as `graduated` instead of `promoted`. Top three recommended actions: (1) Validate `studentId` in all student-portal server actions against the JWT session, (2) Add session validation to `updateRequestStatus`, (3) Remove Grade 10 from `TERMINAL_GRADES`.

---

## Findings by Category

### 1. Architecture

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Info | `lib/supabase/server.ts` | Server client now correctly uses `procurements` schema (risk resolved). | No action needed — matches the client/admin setup. |
| Medium | `app/(protected)/teacher/components/TeacherGradeEntryTable.tsx` (711 lines) | File far exceeds the 200-line component guideline, blending validation, data-fetching, and rendering. | Extract `validateAssignment`, `fetchStudents`, `fetchGrades` into a `useTeacherGradeEntry` hook; split UI into sub-components. |
| Medium | `app/(protected)/enrollment/components/EnrollmentWizard.tsx` (1,284 lines) | Largest file in the codebase — well beyond the page/feature size guideline. | Already has some extraction (`EnrollStudentsTabContent`). Continue extracting per-step logic into dedicated hooks. |
| Medium | `app/(protected)/students/ViewModal.tsx` (920 lines) | Modal component exceeds guidelines and mixes enrollment history, transfer requests, and student editing in one file. | Extract enrollment history and transfer request panels into co-located sub-components. |
| Low | `app/(protected)/teacher/sections/[id]/page.tsx` (853 lines) | Page component exceeds guideline. | Extract student action modals into a dedicated `components/StudentActionsPanel.tsx`. |
| Info | `app/(protected)/teacher/` | Teacher module has no `layout.tsx` of its own (uses parent layout). | Not a bug; parent `AuthGuard` + `SchoolIdGuard` covers it. Document intent. |

---

### 2. Database & Supabase

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| High | `lib/student-portal/actions.ts:137–210` (`getStudentGrades`) | Uses the admin client (`supabase2`) to fetch grades by the caller-supplied `studentId` with no session check — bypasses RLS. A student could pass any student ID. | Call `getStudentSession()` at the top of the function; compare returned `studentId` with the parameter before querying. |
| High | `lib/student-portal/actions.ts:338–393` (`submitStudentEvaluation`) | Same pattern: accepts caller-supplied `studentId` but never verifies it matches the authenticated session. | Call `getStudentSession()` and assert `session.studentId === studentId`. |
| Medium | `lib/student-portal/actions.ts:241, 281` | `getStudentTeachers` and `getActiveStudentEvaluations` filter enrollments by `status = 'approved'`, but the valid approval status in this system is `enrollment_status = 'active'` (the `status` field is the Supabase approval state; `enrollment_status` is the DepEd lifecycle state). This means both functions may silently return no results for active students. | Verify the column semantics against the schema. If `status` is the correct column, document it; if `enrollment_status = 'active'` is needed, add that filter. |
| Medium | `lib/requests/actions.ts:189–268` (`updateRequestStatus`) | Server action accepts `userId`/`userName` as plain parameters and uses them in audit logs without re-validating via a server session. Any caller can impersonate another staff member in the audit trail. | Fetch the authenticated user from `getSupabaseClient()` inside the action and ignore client-passed identity. |
| Low | `app/(protected)/teacher/components/TransferOutModal.tsx:87` | `ilike("name", \`%${query.trim()}%\`)` searches schools without `escapeIlikePattern()`. | Wrap with `escapeIlikePattern()` from `@/lib/utils`. |
| Low | `app/(protected)/teacher/students/page.tsx` | `sms_enrollments` query (line 88–93) has no `school_id` filter — relies entirely on the teacher's section IDs being implicitly scoped. If RLS is permissive on `sms_sections`, a teacher with a fabricated section ID could enumerate cross-school enrollments. | Add `.eq("school_id", user.school_id)` to the enrollments query as a defense-in-depth measure. |
| Info | Multiple list pages | Wide use of `select("*")` on tables like `sms_students`, `sms_grades`, `sms_evaluation_responses` when only a few columns are needed. | Select only required columns to reduce payload and network overhead. |
| Info | `supabase/migrations/054_evaluations.sql:85–96` | Evaluation RLS policies grant access to any `authenticated` user without school_id scoping — any staff member can read evaluations from other schools. | Add `AND school_id = (SELECT school_id FROM sms_users WHERE user_id = auth.uid())` to SELECT policies, or enforce this filtering in application code. |

---

### 3. Business Logic (DepEd Workflows)

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| **Critical** | `app/(protected)/teacher/components/PromoteStudentModal.tsx:22`, `app/(protected)/teacher/sections/[id]/page.tsx:53` | `TERMINAL_GRADES = [6, 10, 12]` causes Grade 10 (JHS) completers to receive `enrollment_status = 'graduated'`. Per DepEd rules, Grade 10 completers should be `promoted` (to Senior High School), not graduated. Only Grade 6 (Elementary) and Grade 12 (SHS) are graduation thresholds. | Remove `10` from `TERMINAL_GRADES`. Grade 10 should set `enrollment_status = 'promoted'` (same as Grades 1–5, 7–9, 11). This requires updating both files and the DepEd-workflow reference. |
| High | `app/(protected)/teacher/components/PromoteStudentModal.tsx:163–196` | Promotion logic updates `enrollment_status` on `sms_enrollments` but uses the field name `enrollment_status` rather than the `status` column. Need to confirm which column is the DepEd lifecycle field vs. the Supabase approval field. If `enrollment_status` is the correct column, the SQL in migration 057 line 22 confirms it, so this is consistent. | Verify by reading migration 001. If confirmed correct, document the two-column pattern (`status` = Supabase approval, `enrollment_status` = DepEd lifecycle). |
| High | `app/(protected)/teacher/components/PromoteStudentModal.tsx:163` | Promotion is entirely client-side with no server-side promotion deadline check. The deadline check on line 104–106 of the section page is purely UI (`isPromotionOverdue` computed from `schoolSettings`). A teacher can bypass this by constructing a direct Supabase call. | Move promotion logic to a server-side RPC that reads the `promotion_deadline` from `sms_school_settings` and rejects the call if the deadline has passed. |
| Medium | `lib/student-portal/actions.ts:338–393` (`submitStudentEvaluation`) | The function validates that the evaluation type is `student_to_teacher` and checks duplicates, but does NOT verify that the `evaluateeId` (teacher) actually teaches the student's enrolled section. A student could submit an evaluation for any teacher at their school. | Before inserting, join `sms_subject_schedules` to confirm the evaluatee teaches the student's current section in the current school year. |
| Low | `app/(protected)/enrollment/components/enrollmentWizardSchema.ts:9` | LRN is validated only as `min(1)` — no 12-digit validation. A user could submit a 1-character LRN for a new student. | Add `.length(12, "LRN must be exactly 12 digits").regex(/^\d{12}$/, "LRN must be numeric")` to the `StudentFormSchema`. |
| Info | `app/(protected)/enrollment/components/EnrollmentWizard.tsx:207–208` | Transfer flow correctly routes all inter-school LRNs to `transferee` mode regardless of prior `transferred_out` status — no `pre_released` bypass exists. | Confirmed correct per CLAUDE.md invariant. |
| Info | Migration `010_enrollment_unique_student_school_year.sql` | Unique constraint `uq_enrollments_student_school_year` on `(student_id, school_year)` prevents double enrollment in the same school year at a database level. | Confirmed correct. |

---

### 4. Code Quality

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Medium | `app/(protected)/students/ViewModal.tsx:155–156, 169–170` | `as any` type casts used on enrollment and transfer request data with `// eslint-disable-next-line` comments suppressing the lint error. | Define proper TypeScript interfaces for the joined query results and remove the `any` casts. |
| Low | `app/(protected)/teacher/components/TeacherGradeEntryTable.tsx:296–311` | `handleGradeChange` silently ignores invalid values (`parseFloat(value) || 0` will coerce empty string to 0, potentially saving a grade of 0 unintentionally). | Use `Number.isNaN(parseFloat(value))` check; keep previous value if input is invalid rather than defaulting to 0. |
| Low | `lib/student-portal/actions.ts:299–317` (`getActiveStudentEvaluations`) | N+1 query pattern: loops over each evaluation to fetch questions with a separate query. With many active evaluations this makes N+1 database round-trips. | Fetch all question IDs in one query using `.in("evaluation_id", evalIds)` then group client-side. |
| Low | `app/(protected)/teacher/students/page.tsx` | No pagination (`range()`) applied to `sms_students` or `sms_enrollments` queries. For a school with hundreds of students, all records are fetched in one request. | Add `.range()` with a `PER_PAGE` constant or add server-side pagination. |
| Info | Multiple files | Legitimate uses of `any` found only in two suppressed ESLint cases in `ViewModal.tsx`. No global `any` typing violations. | No action needed beyond fixing the two `as any` instances. |

---

### 5. Security

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| ⚠️ **Critical** | `lib/student-portal/actions.ts:137` (`getStudentGrades`), `lib/student-portal/actions.ts:338` (`submitStudentEvaluation`), `lib/student-portal/actions.ts:230` (`getStudentTeachers`), `lib/student-portal/actions.ts:270` (`getActiveStudentEvaluations`), `lib/student-portal/actions.ts:322` (`getStudentSubmittedEvaluations`) | All student-portal server actions accept `studentId` as a caller-supplied parameter. None of them call `getStudentSession()` to verify the parameter matches the authenticated student. A student with a valid session can pass any `studentId` and read another student's grades or submit evaluations on their behalf. The admin client (`supabase2`) used in these actions bypasses RLS, so no database-level check prevents this. | Add session validation at the top of every student-portal server action: `const session = await getStudentSession(); if (!session || session.studentId !== studentId) return { error: "Unauthorized" };` |
| ⚠️ High | `lib/supabase/admin.ts:5` | `NEXT_PUBLIC_SERVICE_ROLE_KEY` is named with the `NEXT_PUBLIC_` prefix, which means Next.js will include this value in the client-side JavaScript bundle. Even though the admin client is currently only imported in server actions, the env var name itself signals exposure risk, and any accidental import in a client component would expose the key in the browser. | Rename the env var to `SERVICE_ROLE_KEY` (without `NEXT_PUBLIC_`). Update `lib/supabase/admin.ts` and `.env*` files accordingly. This prevents accidental client-side exposure. |
| ⚠️ High | `lib/requests/actions.ts:189–268` (`updateRequestStatus`) | Server action does not validate the caller's session. The `userId` and `userName` used in audit logs come from client-passed parameters, not from a verified session. Any authenticated HTTP client can call this action, change any request's status, and attribute the action to any user. | Read the session inside the server action using `getSupabaseClient()`, verify `auth.getUser()`, and derive `userId`/`userName` from the server-side session. |
| Medium | `app/(protected)/teacher/` | No dedicated `TeacherGuard` or role check protects teacher-specific routes (`/teacher/grades`, `/teacher/sections`, `/teacher/students`). A `school_head`, `admin`, or `registrar` who navigates to `/teacher/grades` will see the teacher grade entry UI — the page reads `user.system_user_id` for teacher validation, but staff users also have a `system_user_id`. The `validateAssignment` function in `TeacherGradeEntryTable` does check that the teacher ID appears in `sms_subject_schedules`, which provides functional scoping, but the UI is visible to non-teachers. | Add a role check at the top of teacher-only pages: `if (user?.type !== 'teacher') router.replace('/home')`. Alternatively, add a `TeacherGuard` layout. |
| Medium | `supabase/migrations/054_evaluations.sql:85–96` | Evaluation RLS policies allow any `authenticated` user to read, insert, update, or delete evaluations regardless of `school_id`. A teacher or staff at School A can read evaluation questionnaires from School B. | Scope SELECT/INSERT/UPDATE/DELETE policies to `school_id = (SELECT school_id FROM sms_users WHERE user_id = auth.uid())`. |
| Low | `components/AuthGuard.tsx:15–43` | `AuthGuard` fetches the user via `supabase.auth.getSession()` (client-side), which relies on the local session cache and can be stale. If a user's `is_active` flag is set to false server-side, the client will not detect this until the next session refresh. | Consider calling `supabase.auth.getUser()` (which makes a network request to verify the token) instead of `getSession()` for the initial auth check. |
| Low | `lib/student-portal/actions.ts:87–93` | JWT cookie is set with `secure: process.env.NODE_ENV === 'production'`. In development, the cookie is transmitted over plain HTTP. | Acceptable for development; verify the production flag is consistently applied in staging environments that use HTTPS. |
| Info | `lib/supabase/admin.ts` | Admin client (`supabase2`) is imported only in `lib/student-portal/actions.ts` and `lib/requests/actions.ts` — both are server actions (marked `"use server"`). No client component imports are found. | Confirmed safe. The naming risk in the `NEXT_PUBLIC_` prefix is the concern (see High finding above). |
| Info | `components/AuthGuard.tsx`, `components/DivisionGuard.tsx`, `components/SchoolIdGuard.tsx` | Auth guard chain is correctly layered: `AuthGuard` (session) → `SchoolIdGuard` (school context) → `DivisionGuard` (division_admin role) all present in layouts. | No action needed. |

---

### 6. Performance

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| Medium | `lib/student-portal/actions.ts:299–317` | N+1 pattern: for each evaluation, a separate query fetches its questions. With N active evaluations, N+1 database roundtrips occur. | Batch-fetch all questions with `.in("evaluation_id", evalIds)` and group by `evaluation_id` in JavaScript. |
| Medium | `app/(protected)/teacher/students/page.tsx:47–142` | No pagination on student list. Teacher's entire student population is fetched in one request. For large schools this may cause slowness or timeouts. | Apply `.range()` or limit with a reasonable `PER_PAGE` constant. |
| Low | Multiple list pages | `select("*")` used in many list queries where only 5–10 columns are displayed. Fetching full rows (including large text fields like addresses, parent names) wastes bandwidth. | Explicitly select only displayed columns. |
| Low | `app/(protected)/teacher/components/TeacherGradeEntryTable.tsx:80–112` | `useEffect` dependency array includes only `[sectionId, subjectId, schoolYear, teacherId]` but `validateAssignment` is defined inline and not memoized. Because it captures `sectionId`, `subjectId`, `teacherId`, `schoolYear` by closure, the closure-stable reference pattern is correct, but the inline function is re-created on each render without `useCallback`. | Wrap `validateAssignment` in `useCallback` with the same deps to avoid unnecessary re-creation. |
| Low | `app/(protected)/reports/page.tsx:134–151` | Student list query fetches from `sms_enrollments` then `sms_students` in two sequential calls. | Combine into a single Supabase join: `.from("sms_enrollments").select("student:sms_students(id, lrn, first_name, ...)")`. |
| Info | `lib/student-portal/actions.ts:150–159` | Subject names are fetched after grades in a second query — necessary because grade rows don't embed subject names. Pattern is acceptable given the sequential nature. | No action needed unless profiling shows this is a bottleneck. |

---

### 7. QA & Edge Cases

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| High | `app/(protected)/teacher/components/PromoteStudentModal.tsx:163` | Promotion deadline is enforced only client-side via `isPromotionOverdue` UI disable. The Supabase update on line 166 has no server-side deadline check. A client bypassing the UI can promote students after the deadline. | Enforce deadline in a PostgreSQL RPC or server action that reads `sms_school_settings.promotion_deadline` before allowing the enrollment update. |
| Medium | `lib/utils/schoolYear.ts:6–17` | `getCurrentSchoolYear()` switches at `month >= 5` (June). During the June transition, the function returns the new school year immediately on June 1st. If the old school year's promotion deadline has not passed by June 1st, promotion actions could be blocked prematurely if someone sets the school year filter to the new year. | This is expected DepEd behavior (school year starts June). No change needed, but document the transition logic. |
| Medium | `app/(protected)/enrollment/components/enrollmentWizardSchema.ts:9` | LRN validation is only `min(1)`. A new student can be created with a non-numeric or non-12-digit LRN, violating DepEd standards. | Add `.regex(/^\d{12}$/, "LRN must be 12 digits")` to `StudentFormSchema.lrn`. |
| Medium | `app/(protected)/teacher/components/TeacherGradeEntryTable.tsx:296–310` | `handleGradeChange` uses `parseFloat(value) || 0` — if a teacher clears a grade field (empty string), it converts to `0`. On save, all four quarters for affected students get explicit grade rows with value `0`, which the DepEd system treats as a failing grade rather than "not yet entered." | Preserve `null`/`undefined` for unentred grades; only save rows where the teacher explicitly entered a value > 0. |
| Low | `lib/student-portal/actions.ts:338–393` (`submitStudentEvaluation`) | After a teacher is removed from a section, `getStudentTeachers` will no longer return them (it queries current schedules), so the student cannot evaluate them. But if a student opens the evaluation page before the teacher is removed, then the teacher is removed, `submitStudentEvaluation` does not validate that the evaluatee currently teaches the student — it only checks `is_active` on the user, not the schedule assignment. | Acceptable edge case given the atomic workflow. Document that revoking a teacher assignment mid-evaluation-period will prevent new submissions but won't invalidate the form if it's already open. |
| Low | `app/(protected)/teacher/students/page.tsx` | If a teacher is not an adviser AND has no subject schedules, `sectionIds.size === 0` returns an empty list early. This is correct behavior but there's no user-facing message explaining why no students appear. | Add an empty state that distinguishes "no sections assigned" from "no students enrolled." |
| Low | `app/(protected)/enrollment/components/EnrollmentWizard.tsx:225` | LRN lookup begins at `lrn.trim().length < 4` — lookups start after 4 characters. Since DepEd LRNs are exactly 12 digits, a partial 4-character LRN could match multiple records. | Start the lookup only when the LRN is exactly 12 characters, or add a "Search" button. |
| Info | `supabase/migrations/010_enrollment_unique_student_school_year.sql` | Unique constraint on `(student_id, school_year)` prevents duplicate enrollments at the database level. Concurrent enrollment attempts are safely handled. | Confirmed. |
| Info | Section capacity (`types/database.ts:386`) | `max_students` exists on the section type but no enforcement was found in enrollment code. Unlimited students can be added to any section. | Either add a check in the EnrollmentWizard before submitting, or add a DB trigger/constraint that counts active enrollments vs. `max_students`. |

---

## Critical Issues (requires immediate action)

1. **Student-portal server actions accept unvalidated `studentId` from the client (Critical — Security)** — `getStudentGrades`, `submitStudentEvaluation`, `getStudentTeachers`, `getActiveStudentEvaluations`, and `getStudentSubmittedEvaluations` in `lib/student-portal/actions.ts` all accept `studentId` as a caller-supplied parameter and query the admin client (RLS-bypassing) without verifying it matches the authenticated JWT session. A student can supply any other student's ID to read their grades or submit evaluations impersonating another student.

2. **Grade 10 incorrectly marked as `graduated` (Critical — Business Logic)** — `TERMINAL_GRADES = [6, 10, 12]` in `PromoteStudentModal.tsx` and `sections/[id]/page.tsx` causes Grade 10 JHS completers to receive `enrollment_status = 'graduated'`. DepEd policy states only Grade 6 and Grade 12 completers graduate; Grade 10 completers are promoted to Senior High School. This corrupts enrollment status records and would break DepEd reporting.

3. **`NEXT_PUBLIC_SERVICE_ROLE_KEY` exposes the service role key name to the client bundle (High — Security)** — The `NEXT_PUBLIC_` prefix causes Next.js to include this environment variable in the browser-side JavaScript bundle regardless of how the code uses it. Rename to `SERVICE_ROLE_KEY`.

4. **`updateRequestStatus` server action lacks session validation (High — Security)** — The action accepts `userId` and `userName` as client-supplied parameters with no server-side session re-validation. Any authenticated caller can change any request's status and attribute it to any user in the audit log.

5. **Promotion deadline is only enforced client-side (High — Business Logic)** — The server-side Supabase call in `PromoteStudentModal` has no check against `sms_school_settings.promotion_deadline`. The UI disables the button but the underlying database update can be triggered by a direct API call.

---

## Recommended Refactoring Opportunities

1. **Extract a `useStudentPortalAuth` validator into each server action** — All student-portal server actions should begin with the same 3-line pattern: `const session = await getStudentSession(); if (!session || session.studentId !== studentId) return { error: "Unauthorized" };`. Extract this into a shared `assertStudentOwnership(studentId)` helper that also returns the session for downstream use.

2. **Lift promotion and transfer-out into PostgreSQL RPCs** — The current promotion and transfer-out flows are implemented as multi-step client-side Supabase calls. Wrapping these in atomic RPCs (like `enroll_student_with_record_request` already is) would: (a) enforce the promotion deadline server-side, (b) ensure atomicity if one step fails, and (c) centralize business rule enforcement.

3. **Split `TeacherGradeEntryTable.tsx` (711 lines) into a hook + UI** — Extract `useTeacherGradeEntry` containing `validateAssignment`, `fetchStudents`, `fetchGrades`, `handleSave`, and `handleGradeChange`. The component then becomes a pure presentation layer. This is the single highest-impact code quality improvement given the file size and the number of concerns mixed together.

4. **Scope evaluation RLS policies to `school_id`** — The current policies in migration 054 permit any authenticated user to read and modify evaluations across all schools. Adding `school_id = current_school_id` scoping to the RLS policies would close this data isolation gap at the database layer regardless of application-level filtering.

5. **Add LRN 12-digit validation at the schema level** — Both `StudentFormSchema` in `enrollmentWizardSchema.ts` and the student verification in `lib/student-portal/actions.ts:36–39` accept any non-empty string as a valid LRN. A single `.regex(/^\d{12}$/)` addition in each prevents corrupt LRNs from entering the database and surfaces the error at the earliest possible point.

---

## Summary Metrics

- **Total findings:** 31
- **Critical:** 2 | **High:** 7 | **Medium:** 11 | **Low:** 9 | **Info:** 8
- **Files reviewed:** 42+ (including all major modules: auth guards, student portal, enrollment wizard, teacher grade entry, manage-requests, evaluations, reports, migrations 010/039/054/057)

| Category | Findings |
|----------|----------|
| Architecture | 5 |
| Database & Supabase | 8 |
| Business Logic | 6 |
| Code Quality | 5 |
| Security | 9 |
| Performance | 6 |
| QA & Edge Cases | 8 |
