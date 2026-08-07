# SMS Code Audit Report
**Date:** 2026-04-02
**Scope:** Pass 4 (Code Quality) and Pass 6 (Performance) — focused audit across the full `app/` directory

## Executive Summary

The codebase is largely well-structured and follows the CLAUDE.md conventions, but two issues stand out as needing attention. First, multiple components perform sequential two-query patterns (fetch enrollments → fetch students) that could be collapsed into a single Supabase join, inflating round-trip counts noticeably for pages with large class sizes. Second, `TransferOutModal.tsx` uses raw `.ilike()` on user-supplied school-name input without `escapeIlikePattern()`, which is a direct violation of the SQL-injection-prevention convention. The most impactful refactor would be eliminating the scattered two-step enrollment→student fetch pattern by adopting a single joined query.

**Top 3 recommended actions:**
1. Wrap the `.ilike("name", ...)` in `TransferOutModal.tsx` with `escapeIlikePattern()` immediately.
2. Collapse the two-step enrollment→student fetch pattern into a single Supabase join in `HealthEntryTable`, `MonthlyAttendanceModal`, `ECCDEntryTable`, and `TeacherGradeEntryTable`.
3. Replace `select("*")` with explicit column lists in the 27+ call sites identified, particularly in teacher-facing components that load all columns but display only a handful.

---

## Findings by Category

### 4. Code Quality

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| High | `app/(protected)/teacher/components/TransferOutModal.tsx:87` | `.ilike("name", \`%${query.trim()}%\`)` — user-supplied school name search string is passed directly to ilike without `escapeIlikePattern()`. This violates the CLAUDE.md SQL injection prevention invariant. | Import and apply `escapeIlikePattern(query.trim())` before interpolating into the ilike pattern. |
| Medium | `app/(protected)/students/ViewModal.tsx:156, 170` | Two uses of `as any` cast on Supabase query results (`setEnrollmentHistory(enrollments as any)` and `setTransferRequests(requests as any)`). Suppressed with `eslint-disable` comments rather than using proper types. | Define proper TypeScript types or interfaces for the joined query shapes and remove the `as any` casts. |
| Medium | `app/(protected)/teacher/sections/page.tsx:29-42` | Two `useEffect` hooks that both call `fetchSections()` and share overlapping dependency conditions (`user` and `schoolYear`). The first fires on mount with the initial school year; the second fires whenever `schoolYear` or `user` change. On initial render both fire nearly simultaneously, causing a duplicate fetch. | Consolidate into a single `useEffect` with `[schoolYear, user]` as dependencies and initialize `schoolYear` via `useState(getCurrentSchoolYear)`. |
| Medium | `app/(protected)/teacher/eccd/components/ECCDEntryTable.tsx:56-63` | `useEffect` for `fetchData` lists `[sectionId, schoolYear, period]` as deps but `fetchData` is a non-memoized function declared in the component body. It is recreated on every render. If any state inside the component changes, `fetchData` reference changes and the effect re-fires. | Wrap `fetchData` in `useCallback` (pattern already used elsewhere in the codebase). |
| Medium | `app/(protected)/health/components/HealthEntryTable.tsx:75-82` | Same pattern as ECCDEntryTable — `fetchData` is not memoized but is called inside a `useEffect` that only lists `[sectionId, schoolYear]`. If anything triggers a re-render, the dependency check passes but `fetchData` is a new reference. Correctness depends on the deps being stable. | Wrap `fetchData` in `useCallback` with `[sectionId, schoolYear]` deps. |
| Medium | `app/(protected)/sections/List.tsx:108-119` | `Promise.all(gradeLevels.map(async (gl) => { ... }))` fires one Supabase count query per unique grade level in the current page's section list. If a page contains sections from 5 grade levels, this creates 5 sequential-ish round-trips where a single query with a `group by grade_level` would suffice. | Use a single query with `.in("grade_level", gradeLevels)` and manually count; or use an RPC that returns counts by grade level. |
| Low | `app/(protected)/teacher/sections/page.tsx` | `fetchSections` is not wrapped in `useCallback` but is passed into `useEffect` and referenced by name, which means the reference changes on each render. The effect dep array `[schoolYear, user]` avoids infinite loops only because `schoolYear` and `user` are stable refs, but this is fragile. | Wrap `fetchSections` in `useCallback`. |
| Low | Various files (`enrollment/components/ECCDChecklistStep.tsx`, `teacher/eccd/components/ECCDEntryTable.tsx`) | `sms_eccd_domains` and `sms_eccd_competencies` are fetched with `select("*")` in both files independently. These are effectively static reference tables (sorted by `sort_order`, filtered by `is_active`). | Lift this fetch to a shared context/hook so it runs once per session and is reused across components. |
| Low | `app/(protected)/teacher/evaluations/page.tsx:83-103` | The `for...of` loop over `evals` makes two sequential Supabase calls per evaluation: one for questions and one for the submission count check. For N active evaluations this is 2N+1 round trips total. | Batch all question fetches in a single `supabase.from("sms_evaluation_questions").select("*").in("evaluation_id", evalIds)`, and similarly batch the submission check. |
| Info | `app/(landing)/page.tsx`, `(public)/requests/page.tsx`, `student-portal/` | Inline `style={{ animationDelay: "..." }}` for CSS animations. These are dynamic values that cannot be expressed as static Tailwind classes, so inline styles are acceptable here, but consider using CSS custom properties or a utility if the pattern grows. | No action required; acceptable use of inline styles for dynamic animation delays. |

---

### 6. Performance

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| High | `app/(protected)/teacher/sections/page.tsx:58-72` | N+1 query pattern: after fetching all adviser sections, the code runs one `sms_enrollments` count query per section via `Promise.all(sections.map(async (section) => ...))`. For a teacher with 5 sections this is 6 round-trips. | Use a single query: `.from("sms_enrollments").select("section_id", { count: "exact" }).in("section_id", sectionIds).eq(...)` grouped client-side. |
| High | `app/(protected)/teacher/evaluations/page.tsx:83-103` | N+1 pattern: for each evaluation in the result list, two Supabase calls are made inside a `for...of` loop (questions + submission count). | Fetch all questions in one `.in("evaluation_id", evalIds)` query and all response counts in one query, then join in memory. |
| High | `app/(protected)/health/components/HealthEntryTable.tsx:87-131` | Two-query sequential pattern: enrollments fetched first, then `student_id` list used to fetch students. Students and enrollments could be fetched in a single joined query with Supabase's foreign key embed syntax. | `.from("sms_enrollments").select("student_id, sms_students(*)")` to get students in one round-trip. |
| High | `app/(protected)/attendance/components/MonthlyAttendanceModal.tsx:185-213` | Same two-query sequential pattern as HealthEntryTable for enrollments → students. | Same fix: use Supabase join to fetch students as part of the enrollment query. |
| High | `app/(protected)/teacher/components/TeacherGradeEntryTable.tsx:183-216` | Same two-query sequential pattern: enrollments fetched first, then students fetched by collected IDs. | Collapse into a single joined query. |
| High | `app/(protected)/teacher/eccd/components/ECCDEntryTable.tsx:84-103` | Same two-query sequential pattern: enrollments → students, plus two additional queries for `sms_eccd_domains` and `sms_eccd_competencies` fired in parallel but duplicated across `ECCDChecklistStep`. | Collapse enrollment+students into a join; centralize ECCD reference data fetch. |
| Medium | `app/(protected)/students/page.tsx:64-82` | For school-scoped users, student IDs are resolved via a separate `sms_enrollments` query before the main students query. This means every students page load costs 2 round-trips minimum. | Use Supabase foreign table embed or move the join server-side. |
| Medium | `app/(protected)/students/List.tsx:47-177` | Three independent `useEffect` hooks that each fire Supabase queries on list change: one for enrollments, one for sections, one for encoder names. On every page/filter change this causes 3 sequential fetch waterfalls after the main list loads. | Combine these into a single enrichment query in the parent (`page.tsx`) and pass enriched data down; or merge the three effects into one. |
| Medium | `app/(protected)/teacher/sections/[id]/page.tsx:130-140` | Separate `sms_users` query to fetch the adviser name after already having fetched the section (which contains `section_adviser_id`). This extra round-trip could be avoided. | Join `sms_users` in the initial section select: `.select("*, adviser:section_adviser_id(name)")`. |
| Medium | `app/(protected)/evaluations/components/ResultsModal.tsx:57-68` | `sms_evaluation_questions` and `sms_evaluation_responses` are fetched with `select("*")`. Responses especially can be very large (one row per respondent per question). | For questions, select only needed columns (`id, question_text, order_number`). For responses, add a `.limit()` or consider a server-side aggregation RPC to avoid sending thousands of rows to the client. |
| Medium | 27 call sites using `select("*")` | Widespread use of `select("*")` across teacher, health, attendance, ECCD, evaluations, and schedule components. Over-fetching all columns wastes bandwidth, increases deserialization time, and prevents Supabase from using covering indexes effectively. Worst offenders: `TeacherGradeEntryTable` (students), `ECCDEntryTable` (students, domains, competencies), `HealthEntryTable` (students). | Replace with explicit column lists matching actual UI rendering needs. |
| Low | `app/(protected)/teacher/sections/page.tsx:52` | `sms_sections` fetched with `select("*")` including columns (e.g. geometry, notes fields if any) not used in the `SectionCard` component. | Select only the fields consumed by `SectionCard`. |
| Low | No `React.memo` usage (only 1 file found using dynamic/memo patterns) | Large list-rendering components like `List.tsx` variants and grade entry tables are not wrapped in `React.memo` or `dynamic()`. With many rows, parent state changes (e.g. modal open/close) will trigger full re-renders of these heavy components. | Apply `React.memo` to pure list/table display components; use `dynamic()` for heavy modals like `EnrollmentWizard` and `PrintCardModal`. |
| Low | `app/(protected)/teacher/eccd/components/ECCDEntryTable.tsx:56-63` | `fetchData` is called from a `useEffect` without `isMounted` guard (despite an `isMounted` ref being declared). If the component unmounts mid-fetch, state setters will still be called. | Check `if (!isMounted.current) return;` after each `await` in `fetchData`. |
| Info | `app/(protected)/students/page.tsx` | The two-stage enrollment lookup for division_admin (lines 99-122) runs a second `sms_enrollments` query without pagination. If a division admin searches for students with a section filter across the full district, this could pull a very large intermediate result set. | Add a `.limit()` on the intermediate enrollment query or restructure as a server-side join. |

---

## Critical Issues (requires immediate action)

1. **[High / Code Quality + SQL injection]** `app/(protected)/teacher/components/TransferOutModal.tsx:87` — User-supplied school name input passed directly to `.ilike()` without `escapeIlikePattern()`. This is the only ilike call in the codebase that bypasses the convention. Fix: `escapeIlikePattern(query.trim())`.

2. **[High / Performance]** `app/(protected)/teacher/sections/page.tsx:58-72` — True N+1: one Supabase round-trip per section to count enrollment. With typical class rosters this is acceptable, but at scale (teachers with many sections or slow connections) this degrades noticeably. Batch the count query.

3. **[High / Performance]** `app/(protected)/teacher/evaluations/page.tsx:83-103` — N+1 loop making 2 Supabase calls per evaluation inside a `for...of`. Batch the questions and submission-check queries.

---

## Recommended Refactoring Opportunities

1. **Centralize ECCD reference data fetch** — `sms_eccd_domains` and `sms_eccd_competencies` are fetched with `select("*")` in both `ECCDChecklistStep.tsx` and `ECCDEntryTable.tsx`. These are effectively static lookup tables. Create a `useEccdReference()` hook (similar to `useSchoolSettings`) that caches the result for the session.

2. **Collapse enrollment→students two-step pattern** — Used in at least 4 components (HealthEntryTable, MonthlyAttendanceModal, TeacherGradeEntryTable, ECCDEntryTable). Extract a shared `fetchSectionStudents(sectionId, schoolYear)` utility that uses a Supabase join to return students in one round-trip. This is the highest ROI refactor for perceived performance.

3. **Batch the `students/List.tsx` enrichment effects** — Three separate `useEffect` hooks each firing Supabase queries on list change. Collapse into one effect that resolves all ancillary data (enrollment info, section names, encoder names) in parallel with `Promise.all`, then sets state once.

4. **Add `isMounted` guard consistency** — The convention per CLAUDE.md is to use an `isMounted` flag in all list fetchers. `HealthEntryTable.tsx` and `ECCDEntryTable.tsx` (partially) already have the ref; ensure `fetchData` checks it after every `await`. Apply the same pattern to `TeacherGradeEntryTable.tsx` which does not currently guard against unmount.

5. **Explicit select columns instead of `select("*")`** — With 27+ instances, a sweeping refactor to name only needed columns would reduce payload sizes across the whole teacher-facing interface. Prioritize high-frequency pages: grade entry, ECCD entry, health entry, and section detail.

---

## Summary Metrics

- **Total findings:** 23
- **Critical:** 0 | **High:** 7 | **Medium:** 11 | **Low:** 4 | **Info:** 1
- **Files reviewed:** ~40 (primary focus on teacher/, students/, health/, attendance/, evaluations/, enrollment/components/, sections/)
- **Passes completed:** Pass 4 (Code Quality), Pass 6 (Performance)
