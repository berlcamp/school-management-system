# Mid-Year Section Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a learner moves to another section of the same grade during the year, the report card, SF9, grade slip, grades matrix and promotion GPA show every quarter/term and every attendance day, wherever it was encoded — and the move itself is offered as **Change section** on Enrollment.

**Architecture:** Nothing is moved or copied. Grades, attendance and term remarks stay keyed to the section they were encoded in (183's rule). Every *reader* that builds one learner's year widens its query from "this section" to "every section of the same school, school year and grade level", then keeps one row per key, **preferring the section being printed**. The same rule lives once in TypeScript (`lib/utils/learnerYearRecords.ts`) and once in SQL (`students_gpa_for_grade`, migration 234). The move reuses `correct_enrollment` (183) unchanged; the existing modal gains a `change_section` mode.

**Tech Stack:** Next.js 16 / React 19, Supabase (PostgREST + plpgsql, `procurements` schema), vitest, psql against local Supabase.

**Spec:** this conversation — "report card, SF9, final grade, GPA and attendance read every section the learner was in that school year; Correct Enrollment offered as *Change section*."

## Global Constraints

- **Local Supabase only** (CLAUDE.md Rule 0). SQL tests run against `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. If `.env.development.local` is missing, stop.
- Migration 234 is **new and additive**; never edit 153 or 183. Applying it to production is the user's job (Rule 6).
- "Sibling sections" = `sms_sections` with the **same `school_id`, same `school_year`, same `grade_level`** as the section being printed. Never another school (in-system transferee records stay behind the record-request flow, invariant 8), never another grade level (a mis-clicked Promote corrected by 183 must not drag the wrong grade's rows onto the card).
- Tie rule, everywhere: for one key, the row from the **primary section** wins; otherwise the row from the sibling with the **lowest section id** wins. Deterministic, documented, identical in TS and SQL.
- Senior High (grade 11–12) promotion GPA is **not** changed by 234 — it would start counting semester-1 subjects that it does not count today. The SHS *card* does get the sibling read (per semester block).
- No `any`. `school_id` filters on every query. `Number()` on ids passed to BIGINT `.eq()` / `.in()`.
- Out of scope (write a follow-up note, do not build): Kindergarten Progress Report (172), Grade 1 PACE / progress card (180/205), ECCD, SF1/SF2 per-section listings, the class record's Final Grade view, the old section's roster no longer listing the learner.

## Review Focus

1. **Both sections hold a grade for the same subject + quarter** (old adviser posted Q3 after the move, or the learner moved back and forth) — the card must print the current section's figure, never an average, never both. → Task 1 test `primary section wins a clash`; Task 4 SQL test case C.
2. **A school that keeps per-section subject rows** ("Math 7 – Rizal" and "Math 7 – Mabini" as two `sms_subjects`) — the card would print two Math lines with half the quarters each. Not fixable by this design; the Change section dialog must say so when the two sections' scheduled subject ids differ. → Task 5 step "subject mismatch warning".
3. **A learner corrected out of a wrongly promoted grade** (183's original case) — the wrong grade's stranded rows must stay off the card. → Task 1 is grade-scoped by construction; Task 4 SQL test case D.
4. **Attendance on the same date in both sections** — one day, counted once, current section's row. → Task 1 test `attendance keyed by date`.
5. **A learner who never moved** — card, slip and GPA byte-identical to today. → Task 2 step "regression check"; Task 4 SQL test case A.

---

## File Structure

| File | Responsibility |
|---|---|
| Create `lib/utils/learnerYearRecords.ts` | Pure `pickPrimaryPerKey` + the three fetchers (sibling section ids, grades, attendance, term remarks) for one learner's year |
| Create `lib/utils/__tests__/learnerYearRecords.test.ts` | Unit tests for the pure merge |
| Modify `lib/pdf/generateReportCard.ts` | K-10/MATATAG path, SHS semester blocks, attendance, remarks read through the new helpers (SF9 inherits — it calls `generateReportCardPrint`) |
| Modify `lib/utils/sectionGrades.ts` | Optional sibling read for learners currently in the section (grade slip + grades matrix) |
| Modify `app/(protected)/teacher/components/{SectionGradesMatrixModal,GradeSlipModal}.tsx` | Pass the section's learner ids + grade level |
| Create `supabase/migrations/234_section_change_reads_every_section.sql` | Replace `students_gpa_for_grade` (same signature) |
| Create `supabase/tests/234_section_change_gpa.sql` | One transaction, rolled back |
| Modify `app/(protected)/enrollment/components/CorrectEnrollmentModal.tsx`, `app/(protected)/enrollment/List.tsx` | `mode: "correct" \| "change_section"` + a row action |
| Modify `components/system-guide/system-guide-data.ts`, `CLAUDE.md` | Guide entry + migration-table row |

---

### Task 1: The merge rule and the year fetchers

**Files:**
- Create: `lib/utils/learnerYearRecords.ts`
- Test: `lib/utils/__tests__/learnerYearRecords.test.ts`

**Interfaces:**
- Produces:
  - `pickPrimaryPerKey<T extends { section_id: string | number }>(rows: T[], keyOf: (row: T) => string, primarySectionId: string): T[]` — one row per key; primary section wins, else lowest numeric `section_id`. Output order = first appearance of each key in `rows`.
  - `fetchSiblingSectionIds(args: { schoolId: string | number; schoolYear: string; gradeLevel: number }): Promise<string[]>`
  - `fetchLearnerYearGrades(args: { studentId: string; schoolYear: string; sectionIds: string[]; primarySectionId: string }): Promise<Array<{ subject_id: string; section_id: string; grading_period: number; grade: number }>>` — key `subject_id:grading_period`
  - `fetchLearnerYearAttendance(args: same shape): Promise<Array<{ date: string; section_id: string; am_present: boolean; pm_present: boolean }>>` — key `date`
  - `fetchLearnerYearRemarks(args: same shape): Promise<Record<number, string>>` — reads `sms_report_card_remarks`, key `term`

- [ ] **Step 1: Write the failing tests** in `learnerYearRecords.test.ts` (mock `@/lib/supabase/client` with `lib/utils/__tests__/__mocks__/supabaseClient.ts`, as `mapeh.test.ts` does):
  - `keeps one row per key` — rows `[{section_id:"5",k:"a"},{section_id:"7",k:"b"}]`, primary `"7"` → length 2.
  - `primary section wins a clash` — `[{section_id:"5",k:"m:3",grade:80},{section_id:"7",k:"m:3",grade:91}]`, primary `"7"` → `[ {grade:91} ]`.
  - `lowest section id wins among non-primary` — sections `"12"` (grade 70) and `"9"` (grade 85), primary `"7"` → grade 85.
  - `numeric not lexical comparison` — sections `"10"` and `"9"`, primary `"1"` → section `"9"`.
  - `attendance keyed by date` — two rows dated `2026-09-01` in sections 5 and 7, primary `"7"` → the section-7 row only.
  - `no rows` → `[]`.

- [ ] **Step 2: Run** `npx vitest run lib/utils/__tests__/learnerYearRecords.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `pickPrimaryPerKey` and the four fetchers. Fetchers: `fetchSiblingSectionIds` selects `id` from `sms_sections` `.eq("school_id", Number(schoolId)).eq("school_year", schoolYear).eq("grade_level", gradeLevel)` and **always includes** the primary section the caller passes on (callers union it in; an empty sibling list must never empty the card). Grade/attendance/remark fetchers query `.eq("student_id", Number(studentId)).eq("school_year", schoolYear).in("section_id", sectionIds.map(Number))`, then `pickPrimaryPerKey`. Throw on `error`, except remarks, which log and return `{}` (the report card's existing behaviour). Header comment: the rule, why nothing is moved (183), why grade-scoped (Review Focus 3).

- [ ] **Step 4: Run** the same command — Expected: 6 passed.

- [ ] **Step 5: Commit** `feat(records): read one learner's year across sections of the same grade`

### Task 2: Report card and SF9 read every section

**Files:**
- Modify: `lib/pdf/generateReportCard.ts` — `fetchReportCardData` (≈602–794) and `fetchShsSemesterBlocks` (≈432–600)

**Interfaces:**
- Consumes: Task 1's `fetchSiblingSectionIds`, `fetchLearnerYearGrades`, `fetchLearnerYearAttendance`, `fetchLearnerYearRemarks`.

- [ ] **Step 1: Seed a local scenario** in a scratch SQL file (not committed): pick an active Grade 7 section A and a second Grade 7 section B at the same school on the local clone; insert Q1–Q2 `sms_grades` for one learner in A and Q3 in B for the same subject ids; two absent `sms_attendance` days in A; move the learner with `SELECT procurements.correct_enrollment(<enrollment_id>, 7, <B>, NULL, 'test')`. Record the ids.

- [ ] **Step 2: Print the card before the change** from section B (`npm run dev`, Teacher → My Sections → B → Print Card, MATATAG design). Expected: Q1–Q2 blank, the two absences missing — the bug, reproduced.

- [ ] **Step 3: K-10 / strengthened-SHS path.** In `fetchReportCardData`, resolve `siblingIds = union(sectionId, await fetchSiblingSectionIds({ schoolId, schoolYear, gradeLevel: section.grade_level }))` once, then replace the `sms_grades` query (`.eq("section_id", sectionId)`) with `fetchLearnerYearGrades`, the `sms_attendance` query with `fetchLearnerYearAttendance`, and the `sms_report_card_remarks` query with `fetchLearnerYearRemarks` — all with `primarySectionId: sectionId`. Header, adviser, section name, `fetchGradeLevelSubjectRows` roster: unchanged (they describe the section being printed).

- [ ] **Step 4: Old-curriculum SHS blocks.** In `fetchShsSemesterBlocks`, widen the grades query to the siblings of every block's section; inside each block, apply `pickPrimaryPerKey` to grades with periods in `gradingPeriodsOfSemester(semester)` and `primarySectionId = scope.sectionId`, then read `gradeOf` / `graded` from that list instead of filtering `section_id === scope.sectionId`. Schedules stay per block's own section.

- [ ] **Step 5: Print again.** Expected: Q1–Q2 from A, Q3 from B on one subject line; final grade/general average computed over all three; Attendance shows the two absences. SF9 (Reports → SF9 for the learner) shows the same figures.

- [ ] **Step 6: Regression check.** Print the card for a learner in B who never moved, before and after (save both HTML via the print preview's page source or a screenshot). Expected: identical.

- [ ] **Step 7:** `npm run lint && npx vitest run lib/pdf` — Expected: clean, existing report-card tests pass.

- [ ] **Step 8: Commit** `fix(report-card): print quarters and attendance encoded in a learner's earlier section`

### Task 3: Grade slip and grades matrix agree with the card

**Files:**
- Modify: `lib/utils/sectionGrades.ts:78` (`fetchSectionGrades`)
- Modify: `app/(protected)/teacher/components/SectionGradesMatrixModal.tsx:141`, `GradeSlipModal.tsx:161`

**Interfaces:**
- Produces: `fetchSectionGrades(sectionId, schoolYear, subjects, periodValues, options?: { learnerIds: string[]; schoolId: string | number; gradeLevel: number })` — when `options` is given, additionally fetch those learners' grades in sibling sections (Task 1 helpers, primary = `sectionId`) and merge per `student:subject:period`. Without `options`, behaviour is unchanged. `extraSubjects` also considers sibling rows.

- [ ] **Step 1:** Implement; page `.in("student_id", …)` in chunks of 200 ids to stay under URL limits.
- [ ] **Step 2:** Pass `options` from both modals (both already hold the learner list, grade level and school).
- [ ] **Step 3:** With Task 2's seeded learner, open B's Grades Matrix (Q1 view) and print a Grade Slip. Expected: Q1–Q2 figures from A appear and match the card.
- [ ] **Step 4:** `npm run lint` — clean.
- [ ] **Step 5: Commit** `fix(grades): slip and matrix include a moved learner's earlier quarters`

### Task 4: Migration 234 — promotion GPA counts every section (K–10)

**Files:**
- Create: `supabase/migrations/234_section_change_reads_every_section.sql`
- Test: `supabase/tests/234_section_change_gpa.sql`

**Interfaces:**
- Produces: `procurements.students_gpa_for_grade(BIGINT[], INTEGER, TEXT, BIGINT) RETURNS TABLE(student_id BIGINT, gpa NUMERIC)` — **same signature**, plain `CREATE OR REPLACE`, grants re-stated.

- [ ] **Step 1: Write the failing SQL test** (one transaction, rolled back, header carrying the psql command, as 231's test does). Fixture: one learner, two Grade 7 sections at one school, one approved enrollment pointing at section B.
  - **A** never moved (all grades in B) → GPA equals the 153 body's result on the same data.
  - **B** Q1–Q2 = 80 in A, Q3–Q4 = 90 in B, one subject → GPA `85.00`.
  - **C** clash: Q3 = 70 in A and 90 in B, Q1/Q2/Q4 = 90 in B → GPA `90.00` (B wins).
  - **D** grade-scoped: 60s in a Grade 8 section of the same school → ignored.
  - **E** SHS unchanged: grade 11 learner with semester-1 grades in another section → GPA equals the 153 result.
  - **F** another school's Grade 7 section → ignored.
- [ ] **Step 2: Run** `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/234_section_change_gpa.sql` — Expected: FAIL at case B (`80 or 90 ≠ 85`).
- [ ] **Step 3: Write the migration.** Start from the **live** body (`SELECT pg_get_functiondef('procurements.students_gpa_for_grade(bigint[],integer,text,bigint)'::regprocedure);` on local; compare with 153 and stop if they differ — 116/157). Changes only: the `src` lateral also selects `e.school_id`; for `p_grade_level < 11`, the inner grade read becomes `DISTINCT ON (g.subject_id, g.grading_period)` over grades whose section has `school_id = src.school_id`, `school_year = src.school_year`, `grade_level::INTEGER = p_grade_level`, ordered `(g.section_id = src.section_id) DESC, g.section_id ASC`; for 11–12, keep `g.section_id = src.section_id`. MAPEH bucketing, `is_madrasah` and `grade > 0` exclusions unchanged. Header: why, the tie rule, why SHS is excluded, blast radius (one function replaced, no DML), the pre-apply count of affected learners:
  ```sql
  SELECT count(DISTINCT g.student_id) FROM procurements.sms_grades g
  JOIN procurements.sms_enrollments e ON e.student_id = g.student_id AND e.school_year = g.school_year AND e.status = 'approved'
  WHERE g.section_id <> e.section_id AND e.grade_level < 11;
  ```
  and the rollback (re-run 153's function body).
- [ ] **Step 4: Apply locally** with psql `-f`, then re-run the test — Expected: 6 `ok:` notices, no exception.
- [ ] **Step 5: Commit** `feat(db): 234 promotion GPA reads every same-grade section of the year`

### Task 5: "Change section" on Enrollment

**Files:**
- Modify: `app/(protected)/enrollment/components/CorrectEnrollmentModal.tsx`, `app/(protected)/enrollment/List.tsx`
- Modify: `components/system-guide/system-guide-data.ts` (enrollment module), `CLAUDE.md` (Notable Recent Migrations row 234 + a Key Features line)

**Interfaces:**
- Consumes: `correct_enrollment` (183, unchanged).
- Produces: `CorrectEnrollmentModal` prop `mode?: "correct" | "change_section"` (default `"correct"`, today's behaviour).

- [ ] **Step 1: Mode behaviour.** In `change_section`: title "Change section", grade level locked to the current one, section picker excludes the current section, reason **required**, sent as `p_reason = "Section change from <old name>: <reason>"` (so 183's remark reads *Corrected YYYY-MM-DD: Section change from 7-Rizal: …*). Shown before Save:
  - per grading period, how many subjects carry a grade for this learner in the current section (`sms_grades` grouped by `grading_period`), under the line *"These stay with <old section> and still print on the card. Ask its teachers to finish posting every quarter the learner completed there before you move them — once moved, the learner no longer appears on that section's class lists."*
  - **subject mismatch warning** (Review Focus 2): if the subject ids scheduled in the old and new section (`sms_subject_schedules`, same school year) differ, list the old-only subjects with *"These subjects are not scheduled in <new section>; their earlier grades print on their own line."*
  - after success, the existing stranded toast is replaced in this mode by *"Moved to <section>. Earlier grades and attendance stay with <old section> and print on the card."*
- [ ] **Step 2:** In `List.tsx`, add a **Change section** row action beside Correct, shown for `status = approved` and `enrollment_status = active` rows only, opening the modal with `mode="change_section"`. Same roles that see Correct today.
- [ ] **Step 3:** System guide: an Enrollment step "Change section (mid-year)" saying the above in two sentences. CLAUDE.md: 234 row and a Key Features row *Mid-year section change* pointing at `learnerYearRecords.ts`, stating the sibling rule and tie rule.
- [ ] **Step 4: Verify locally:** move a second seeded learner with the new action; the remark is written, the learner appears in the new section, the card shows both sections' quarters. `npm run lint && npm test` — clean / all pass.
- [ ] **Step 5: Commit** `feat(enrollment): Change section action for mid-year moves`

---

## Hand-off notes for the user (not tasks)

- Migration 234 is the only database change; it needs applying to production by you, with its pre-apply count run first.
- Follow-ups deliberately left out: Kinder Progress / Grade 1 PACE cards, SF1/SF2 per-section listings, the old section's class list keeping the learner for the quarters before the move.
