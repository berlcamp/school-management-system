# Code Quality & Performance Audit Report
**School Management System (SMS) — Bayugan City DepEd**
**Date:** 2026-04-02
**Audited by:** Claude Sonnet 4.6 (baseline, no skill guidance)

---

## Executive Summary

The codebase is generally well-structured and follows consistent patterns. TypeScript `any` usage is minimal and isolated. School-scoping (`school_id` filters) is correctly applied in the majority of query sites. The main problem areas are **N+1 query patterns** in several list components, a **two-query keyword-search workaround** that adds a round-trip on every keystroke filter, **broad `select("*")` fetches** where only specific columns are needed, and a handful of smaller issues including a hardcoded school ID, a duplicated utility function, and silent empty `catch {}` blocks.

---

## 1. N+1 Query Patterns (Performance — High Priority)

### 1.1 Teacher Sections Page — Per-Section Enrollment Count
**File:** `app/(protected)/teacher/sections/page.tsx` (lines 58–73)

`fetchSections` fetches all adviser sections, then fires **one `sms_enrollments` count query per section** inside `Promise.all`. With N sections this is N+1 round-trips to Supabase:

```ts
const sectionsWithCounts = await Promise.all(
  (adviserSections || []).map(async (section) => {
    const { count } = await supabase
      .from("sms_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("section_id", section.id)
      ...
```

**Fix:** Use a single query with `.in("section_id", sectionIds)` then aggregate counts in JavaScript, or use a Postgres function.

### 1.2 Sections List — Per-Grade-Level Subject Count
**File:** `app/(protected)/sections/List.tsx` (lines 107–119)

`fetchScheduleCounts` extracts unique grade levels from the displayed sections list and then fires **one `sms_subjects` count query per grade level** in `Promise.all`:

```ts
await Promise.all(
  gradeLevels.map(async (gl) => {
    let query = supabase
      .from("sms_subjects")
      .select("*", { count: "exact", head: true })
      .eq("grade_level", gl)
      ...
```

With typical page sizes covering many grade levels this can fire 10+ concurrent queries. A single query filtering with `.in("grade_level", gradeLevels)` and grouping client-side is the remedy.

### 1.3 SchoolDashboard — Sequential Waterfall of 5+ Queries
**File:** `components/dashboards/SchoolDashboard.tsx` (lines 72–146)

`fetchDashboardData` executes queries sequentially rather than in parallel:
- school name lookup
- students count
- sections count
- staff count
- enrollments (with nested student join)
- requests

None of these depends on the result of a prior query. All six could be wrapped in `Promise.all`, halving the perceived load time.

---

## 2. Two-Query Keyword Search (Performance — Medium Priority)

### 2.1 Enrollment Page — Student ID Pre-fetch for Keyword Search
**File:** `app/(protected)/enrollment/page.tsx` (lines 101–121)

When a keyword filter is active, the page fires a **separate `sms_students` query** to collect matching student IDs, then feeds those into an `.in()` on `sms_enrollments`. This adds a full round-trip on every search:

```ts
const { data: matchingStudents } = await studentQuery;
// ...
query = query.in("student_id", studentIds);
```

The comment acknowledges PostgREST's limitation, but this should be noted as a latency cost. A Postgres full-text search index or a DB-level view joining enrollments and students would eliminate the extra trip.

---

## 3. Overly Broad `select("*")` (Performance — Medium Priority)

Many queries fetch all columns from wide tables when only specific fields are used:

| File | Table | Impact |
|------|-------|--------|
| `app/(protected)/health/components/HealthEntryTable.tsx` lines 111, 127 | `sms_students`, `sms_learner_health` | Fetches all student columns; only name/id needed |
| `app/(protected)/teacher/components/TeacherGradeEntryTable.tsx` lines 213, 264 | `sms_students`, `sms_grades` | All student columns fetched for grade display |
| `app/(protected)/teacher/eccd/components/ECCDEntryTable.tsx` lines 99, 112 | `sms_students`, `sms_eccd_assessments` | Wide fetch for name display only |
| `app/(protected)/attendance/components/MonthlyAttendanceModal.tsx` line 203 | `sms_students` | Full student rows; only id/name needed |
| `lib/pdf/generateSf10.ts` line 895, `lib/pdf/generateSf9.ts` line 35 | `sms_students` | PDF generation benefits from full record, but intermediate fetches are still wide |
| `app/(protected)/schedules/page.tsx` line 71 | `sms_subject_schedules` | Paginated list; column pruning would reduce payload |

Narrowing these selects reduces network payload and PostgREST serialization overhead.

---

## 4. `as any` Type Suppressions

**File:** `app/(protected)/students/ViewModal.tsx` (lines 155–170)

Two explicit `// eslint-disable-next-line @typescript-eslint/no-explicit-any` + `as any` casts are used when setting enrollment history and transfer requests from Supabase query results. The local inline types defined for these state variables (lines 103–132) match the query shape but TypeScript cannot infer the nested relation types automatically. The correct fix is to define proper types using the generated `Database` types from `types/database.ts` so the cast is unnecessary.

---

## 5. Missing `school_id` Filter — Section Enrollment Guard
**File:** `app/(protected)/sections/ViewStudentsModal.tsx`

The `fetchEnrollments` function queries `sms_enrollments` by `section_id` and `school_year` only. There is no `school_id` filter applied. While RLS policies on Supabase should prevent cross-school data leakage, the absence of an explicit client-side `school_id` filter is inconsistent with the rest of the codebase and means an attacker who obtains a valid `section_id` from another school could still request data (relying entirely on RLS for protection, with no defense-in-depth at the query layer). All other enrollment queries in the codebase do apply `.eq("school_id", ...)`.

---

## 6. Missing `isMounted` Guard — Potential State Update After Unmount

**File:** `app/(protected)/teacher/sections/page.tsx`

`fetchSections` is an `async` function called from `useEffect` but there is no `isMounted` ref to cancel the state update if the component unmounts while the query is in flight. The rest of the codebase uses `isMounted` consistently (enrollment page, health entry table, ECCD table, etc.). This can cause React "setState on unmounted component" warnings in development and subtle bugs when navigating away quickly.

---

## 7. Hardcoded School ID (Logic Bug — Low Risk, High Smell)

**File:** `app/(protected)/enrollment/page.tsx` (line 168)

```tsx
{user?.school_id === 9 && (
  <Button ... >Auto Enroll</Button>
)}
```

The "Auto Enroll" button is gated on `school_id === 9` — a hardcoded numeric constant with no explanation. This is a maintenance hazard: if the school is re-seeded or the feature should be generalized, this magic number will be missed. It should be an environment variable, a feature flag in school settings, or at minimum a named constant.

---

## 8. Duplicated `getCurrentSchoolYear` Implementation

**File:** `app/(protected)/sections/page.tsx` (lines 35–48)

This page re-implements `getCurrentSchoolYear()` inline instead of importing from `@/lib/utils/schoolYear` where the canonical implementation lives. The logic appears identical, but any future change to school-year boundary rules would need to be applied in two places.

---

## 9. Silent Empty `catch {}` Blocks

Several files use bare `catch {}` (no variable, no logging):

- `app/(protected)/manage-requests/components/record-requests/OutgoingRequestsTab.tsx` line 73
- `app/(protected)/manage-requests/components/record-requests/IncomingRequestsTab.tsx` lines 80, 106
- `app/(protected)/teacher/components/TransferOutModal.tsx` line 98
- `app/(protected)/enrollment/components/EnrollmentWizard.tsx` line 211
- `app/student-portal/page.tsx` line 40

Each swallows exceptions silently. When these operations fail (network errors, RPC errors), the user sees no feedback and developers have no log to debug. At minimum these should call `toast.error(...)` and `console.error(...)`.

---

## 10. Delete-then-Insert Grade Save (Correctness Risk)

**File:** `app/(protected)/teacher/components/TeacherGradeEntryTable.tsx` (lines 367–379)

Grade save is implemented as a hard delete followed by an insert:

```ts
await supabase.from("sms_grades").delete()...in("student_id", editableIds);
const { error } = await supabase.from("sms_grades").insert(gradeEntries);
```

There is no transaction wrapping these two operations. If the network fails between the delete and insert, grades are lost entirely for the affected students. The existing `upsert` pattern used in `sms_learner_health` and `sms_attendance` should be applied here instead (the table has a unique key on `student_id, subject_id, section_id, grading_period, school_year`).

---

## Summary Table

| # | Issue | Severity | File(s) |
|---|-------|----------|---------|
| 1.1 | N+1: per-section enrollment count queries | High | `teacher/sections/page.tsx` |
| 1.2 | N+1: per-grade subject count queries | High | `sections/List.tsx` |
| 1.3 | Sequential dashboard queries (should be parallel) | Medium | `dashboards/SchoolDashboard.tsx` |
| 2.1 | Two-query keyword search adds extra round-trip | Medium | `enrollment/page.tsx` |
| 3 | Broad `select("*")` on wide tables | Medium | Multiple (see table above) |
| 4 | `as any` type suppressions | Low | `students/ViewModal.tsx` |
| 5 | Missing `school_id` filter on enrollment query | Medium | `sections/ViewStudentsModal.tsx` |
| 6 | Missing `isMounted` guard (stale setState risk) | Low | `teacher/sections/page.tsx` |
| 7 | Hardcoded `school_id === 9` magic number | Low | `enrollment/page.tsx` |
| 8 | Duplicate `getCurrentSchoolYear` implementation | Low | `sections/page.tsx` |
| 9 | Silent empty `catch {}` swallowing errors | Medium | Multiple manage-requests files, wizard, student portal |
| 10 | Non-atomic delete+insert for grade save | High | `teacher/components/TeacherGradeEntryTable.tsx` |
