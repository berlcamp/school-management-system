# Senior High Term Offerings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Grade 11–12 section can mark a subject as offered in some terms only; that subject's final grade is the mean of its offered terms, everywhere a final or a general average is computed.

**Architecture:** A new table `sms_section_subject_terms` (no row = whole year) holds the offering per (section, subject, school year). Two triggers keep schedules inside the offering and refuse dropping a term that has grades; one RPC saves an offering and narrows the schedule rows together. Readers attach `offeredPeriods` to each subject line, and `lib/utils/mapeh.ts` (TS) and `students_gpa_for_grade` (SQL) apply the rule.

**Tech Stack:** Next.js 16 / React 19, Supabase (`procurements` schema, plpgsql), vitest, psql on the local clone.

**Spec:** `docs/superpowers/specs/2026-11-18-shs-term-offerings-design.md`

## Global Constraints

- Local Supabase only (CLAUDE.md Rule 0). If the standard stack is not up, the side DB fallback is `127.0.0.1:55422` (memory: local-test-environment-quirks). Migration 235 is applied to production by the owner.
- Eligible section = `grade_level IN (11,12)` AND `COALESCE(shs_curriculum,'') <> 'old'` AND `school_year >= '2026-2027'` (TS twin: `TERM_SYSTEM_START_SY`, `isShsGrade`, `isOldShsCurriculum`).
- `terms`: non-empty, each 1–3, no duplicates, stored sorted. `{1,2,3}` is never stored — the app deletes the row instead.
- **No row = whole year**, output byte-identical to today for every learner with no term-limited subject.
- Grade guard counts `grade > 0` rows, carried transfer-in grades (200) included.
- A Grade Level Coordinator never sets an offering; a Department Head may, for subjects they head.
- Narrowing never deletes a schedule row; an empty intersection refuses the whole save.
- K–10, old-curriculum SHS, quarter-based years, SF10, Form 137: untouched.
- Work on branch `feat/shs-term-offerings`. No `any`. `Number()` on ids for BIGINT filters.

## Review Focus

1. **A schedule added from `/schedules` (not the section modal) for an offered subject** — must be limited to the offered terms, never saved whole-year. → Task 1 SQL case "NULL schedule refused"; Task 4 step "AddModal limits the picker".
2. **End of Term 1 with a Term 1 elective encoded and core subjects mid-year** — elective shows its final; general average stays blank. → Task 2 test `general average waits for every graded subject`.
3. **A Term 2-only subject printed at the end of Term 1** — blank row, not counted, not blocking. → Task 2 test `an offered subject with no grade yet is not counted`.
4. **A two-term offering `{1,2}`** — final = mean of T1 and T2 once both are in. → Task 2 test `two-term offering`.
5. **A section later switched to old curriculum while offering rows exist** — the card must ignore them (semester blocks rule). → Task 3 step "ignore offerings for old-curriculum sections" + its test.

---

## File Structure

| File | Responsibility |
|---|---|
| Create `supabase/migrations/235_section_subject_terms.sql` | table, RLS, triggers, `save_section_subject_terms` RPC, replaced `students_gpa_for_grade` and `get_grade_encoding_status` |
| Create `supabase/tests/235_section_subject_terms.sql` | SQL tests, one transaction, rolled back |
| Create `lib/utils/sectionOfferings.ts` (+ `__tests__/sectionOfferings.test.ts`) | pure term helpers + `fetchSectionOfferings` |
| Modify `lib/utils/mapeh.ts` (+ `__tests__/mapeh.test.ts`) | `offeredPeriods` on rows, final and general-average rules |
| Modify `lib/pdf/generateReportCard.ts`, `lib/utils/sectionGrades.ts`, `app/(protected)/teacher/components/{GradeSlipModal,SectionGradesMatrixModal}.tsx` | attach offerings |
| Modify `app/(protected)/teacher/class-record/components/FinalGradeView.tsx`, `lib/student-portal/actions.ts` | follow the offering |
| Create `app/(protected)/sections/components/OfferedTermsControl.tsx`; modify `sections/ViewSubjectsModal.tsx`, `schedules/AddModal.tsx`, `schedules/ChangeFromDialog.tsx`, the Duplicate modals | the setting and the term pickers |
| Modify `CLAUDE.md` (row 235 + Key Features), `components/system-guide/system-guide-data.ts` | docs |

---

### Task 1: Migration 235 — table, guards, save RPC

**Files:** Create `supabase/migrations/235_section_subject_terms.sql`, `supabase/tests/235_section_subject_terms.sql`

**Interfaces:**
- Produces: table `procurements.sms_section_subject_terms(id, section_id, subject_id, school_year, terms SMALLINT[], created_at, updated_at, updated_by)`, `UNIQUE (section_id, subject_id, school_year)`.
- Produces: `procurements.save_section_subject_terms(p_section_id BIGINT, p_subject_id BIGINT, p_terms SMALLINT[]) RETURNS jsonb` — SECURITY INVOKER; `p_terms` NULL or `{1,2,3}` = whole year (deletes the row); returns `{"terms": [...]|null, "narrowed_schedules": n}`.

- [ ] **Step 1: Write the failing SQL test** (header with the psql command, as `supabase/tests/234_section_change_gpa.sql`). Fixture: one strengthened Grade 11 section and one Grade 10 section, SY `2030-2031`, one subject, two schedule rows (one NULL terms, one `{1,2}`), service-role claims for the RPC. Cases, each `RAISE NOTICE 'ok: …'` or `RAISE EXCEPTION 'FAIL …'`:
  - A `save_section_subject_terms(sec, subj, '{1}')` → returns `narrowed_schedules = 2`; both rows now `{1}`; one offering row `{1}`.
  - B `'{1,2,3}'` → offering row deleted; schedule rows still `{1}`.
  - C after A, `INSERT` a schedule row with NULL `grading_periods` → raises, message contains `Term 1`.
  - D after A, `UPDATE` a schedule row to `{2}` → raises.
  - E with a schedule row `{3}` present, `save(…, '{1}')` → raises "only covers Term 3", nothing changed.
  - F with a grade 85 in period 2, `save(…, '{1}')` → raises naming Term 2; with the same grade, `save(…, '{1,2}')` → ok.
  - G a carried grade (`carried_from_school` set) in period 3 also blocks dropping Term 3.
  - H `save` on the Grade 10 section → raises "Grade 11–12".
  - I `p_terms '{0}'`, `'{}'`, `'{1,1}'` → each raises.
- [ ] **Step 2: Run** `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/235_section_subject_terms.sql` — Expected: FAIL, function does not exist.
- [ ] **Step 3: Write the migration (parts 1–4).** Header: why, rules, blast radius (one table, two triggers, one RPC; no DML), rollback.
  1. Table + CHECK (`cardinality(terms) >= 1 AND terms <@ '{1,2,3}' AND cardinality(terms) = cardinality(ARRAY(SELECT DISTINCT unnest(terms)))`), unique key, `updated_at` trigger like its neighbours.
  2. RLS: SELECT `authenticated`; INSERT/UPDATE/DELETE with the predicate of 216's schedule INSERT policy (roster roles at the section's school, division_admin, super admin; DH via `sms_heads_subject(subject_id)` with the subject's and section's school matching), substituting the row's `section_id`/`subject_id` and the section's `school_id`. **No GLC branch.**
  3. Trigger `sms_section_subject_terms_guard` BEFORE INSERT OR UPDATE: section eligible (Global Constraints) and `NEW.school_year = section.school_year`; every schedule row of the triple has non-NULL `grading_periods <@ NEW.terms`; no `sms_grades` row (`grade > 0`) of the triple in a period outside `NEW.terms`. Messages name terms as "Term n".
  4. Trigger on `sms_subject_schedules` BEFORE INSERT OR UPDATE OF `grading_periods, subject_id, section_id, school_year`: if an offering row exists for the triple, `NEW.grading_periods` must be non-NULL and `<@ terms`.
  5. `save_section_subject_terms`: normalise `p_terms` (sort, NULL if all three); lock the offering row; if NULL → delete it and return; else for each schedule row of the triple compute `COALESCE(grading_periods, '{1,2,3}') ∩ p_terms`, raise if any is empty (name its terms), update the rows (schedule trigger is satisfied because the offering is upserted **after**: temporarily the old offering — if any — is wider or absent), then upsert the offering. `GRANT EXECUTE … TO authenticated`.
- [ ] **Step 4: Apply locally and run the test** — Expected: all `ok:` notices.
- [ ] **Step 5: Commit** `feat(db): 235 subjects offered in some terms of a Senior High section`

### Task 2: The final-grade rule in `mapeh.ts`

**Files:** Modify `lib/utils/mapeh.ts`; Test `lib/utils/__tests__/mapeh.test.ts`

**Interfaces:**
- Produces: `MapehSourceRow.offeredPeriods?: number[] | null` (null/absent = all periods); `CardSubjectRow.termLimited: boolean` and `CardSubjectRow.awaitingFinal: boolean` (has a grade in an offered period, final still null).
- `computeGeneralAverage(rows)` unchanged in signature.

- [ ] **Step 1: Write the failing tests** (in a new `describe("term offerings")`), with `buildCardSubjectRows(rows, { gradeLevel: 11, groupByShsCategory: false, requirePeriods: 3 })`:
  - `term-only subject's final is its term grade` — `{q1: 88, offeredPeriods: [1]}` → `final 88`, `remarks "Passed"`.
  - `two-term offering` — `{q1: 80, q2: 90, offeredPeriods: [1,2]}` → `final 85`; with `q2: null` → `final null`.
  - `grades outside the offering are ignored` — `{q1: 80, q3: 60, offeredPeriods: [1]}` → `final 80` and `q3 null` (the cell prints blank).
  - `whole-year rows unchanged` — no `offeredPeriods`, `q1..q3 = 80, 82, 84` → `83`; `q3 null` → `null`.
  - `general average waits for every graded subject` — rows: elective `{q1: 90, offeredPeriods:[1]}`, core `{q1: 80}` → `computeGeneralAverage(...).average === null`; core with `q1..q3 = 80` → average `85`.
  - `an offered subject with no grade yet is not counted` — elective `{offeredPeriods: [2]}` all null, core `q1..q3 = 80` → average `80`.
  - `no term-limited row: general average as today` — two whole-year rows, one complete (90) one incomplete → average `90` (today's behaviour kept).
  - `a grouped parent uses the union of its components' offerings` — two MAPEH components `offeredPeriods [1]` and `[2]` → parent final = mean of its T1 and T2 period values.
- [ ] **Step 2: Run** `npx vitest run lib/utils/__tests__/mapeh.test.ts` — Expected: the new cases FAIL.
- [ ] **Step 3: Implement.** `finalOf(quarters, requirePeriods, offered)`: the periods are `offered ?? [1…requirePeriods]` (or all present periods when both are null, as today); values outside them ignored; null while any required one is missing (with `offered` set, require every offered period whether or not `requirePeriods` is set). `toCardRow` takes `offered`, blanks the period values outside it, and sets `termLimited = offered != null`, `awaitingFinal`. Parent rows: `offered` = union of components' (null if any component is whole-year). `computeGeneralAverage`: when any counted row is `termLimited`, return `average: null` if any counted row is `awaitingFinal`; otherwise today's body.
- [ ] **Step 4: Run** the same command, then `npm test` — Expected: all pass (existing mapeh/report-card tests unchanged).
- [ ] **Step 5: Commit** `feat(grades): a term-limited subject's final is its offered terms`

### Task 3: Offerings reach the card, SF9, slip, matrix, class record, portal

**Files:** Create `lib/utils/sectionOfferings.ts`, `lib/utils/__tests__/sectionOfferings.test.ts`; modify `lib/pdf/generateReportCard.ts` (`fetchReportCardData`, `fetchGradeLevelSubjectRows`), `lib/utils/sectionGrades.ts` (`learnerCardRows`), `GradeSlipModal.tsx`, `SectionGradesMatrixModal.tsx`, `FinalGradeView.tsx`, `lib/student-portal/actions.ts` (`getStudentGrades`)

**Interfaces:**
- Consumes: Task 2's `offeredPeriods`.
- Produces: `fetchSectionOfferings(sectionId: string, schoolYear: string): Promise<Map<string, number[]>>` (subject id → terms); `offeredFor(map: Map<string, number[]>, subjectId: string): number[] | null`; `normaliseOfferedTerms(terms: number[], periodCount: number): number[] | null` (sorted, de-duplicated, null when it covers every period); `narrowToOffering(rowTerms: number[] | null, offered: number[], periodCount: number): number[] | null` (null = empty intersection).

- [ ] **Step 1: Failing tests** in `sectionOfferings.test.ts` (fake builder as in `learnerYearRecords.test.ts`): `normaliseOfferedTerms([3,1,1], 3)` → `[1,3]`; `([1,2,3], 3)` → `null`; `narrowToOffering(null, [1], 3)` → `[1]`; `([1,2], [2,3], 3)` → `[2]`; `([3], [1], 3)` → `null`; `fetchSectionOfferings` maps rows `{subject_id: 11, terms: [1]}` to `Map{"11" → [1]}` and reads only the given section and school year.
- [ ] **Step 2: Run** `npx vitest run lib/utils/__tests__/sectionOfferings.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `sectionOfferings.ts`, then wire:
  - **Card / SF9:** in `fetchReportCardData`, when `isShsGrade(section.grade_level)` and `!isOldShsCurriculum(section.shs_curriculum)`, fetch the map for `sectionId`; set `offeredPeriods` on every `MapehSourceRow` built (the grades-derived `subjectsMap` and `fetchGradeLevelSubjectRows`' roster rows — pass the map in). Otherwise attach nothing (Review Focus 5).
  - **Slip / matrix:** `learnerCardRows` takes an optional `offerings?: Map<string, number[]>` and sets `offeredPeriods`; both modals fetch it under the same eligibility test and pass it.
  - **Class record Final view:** fetch the map for the record's section; each column's periods become `column.periods ∩ offered` (unchanged without a row); an empty intersection prints "—".
  - **Student portal:** `getStudentGrades` also selects `section_id`, reads offerings for those sections, and drops grades in non-offered periods.
- [ ] **Step 4: Run** `npx vitest run lib/utils/__tests__/sectionOfferings.test.ts` then `npm test`, `npx tsc --noEmit -p .` — Expected: pass, clean. Add one test to `sectionOfferings.test.ts`: `ignore offerings for old-curriculum sections` — the eligibility helper `offeringsApply({ gradeLevel: 12, shsCurriculum: "old", schoolYear: "2026-2027" })` → `false`; `{11, "strengthened", "2026-2027"}` → `true`; `{11, null, "2025-2026"}` → `false` (export `offeringsApply` from `sectionOfferings.ts`, used by every reader above).
- [ ] **Step 5: Commit** `feat(grades): card, SF9, slip, matrix, class record and portal follow term offerings`

### Task 4: "Offered in" in Manage Schedules; term pickers respect it

**Files:** Create `app/(protected)/sections/components/OfferedTermsControl.tsx`; modify `app/(protected)/sections/ViewSubjectsModal.tsx`, `app/(protected)/schedules/AddModal.tsx`, `app/(protected)/schedules/ChangeFromDialog.tsx`, the schedule Duplicate modals (find with `grep -rln "Duplicate" app/\(protected\)/schedules app/\(protected\)/sections`)

**Interfaces:**
- Consumes: Task 1's RPC, Task 3's `fetchSectionOfferings`, `normaliseOfferedTerms`, `offeringsApply`.
- Produces: `<OfferedTermsControl sectionId subjectId schoolYear offered={number[] | null} canEdit onSaved={(terms: number[] | null) => void} />`.

- [ ] **Step 1:** Control: label "Offered in", one toggle per term ("Term 1", "Term 2", "Term 3"); all on = "Whole year". Save calls `save_section_subject_terms` with `normaliseOfferedTerms(...)`; on error shows the RPC message (`toast.error`); on success toast `Offered in Term 1 only — n schedule(s) narrowed.` (or `Offered the whole year.`). Rendered beside each subject heading in Manage Schedules only when `offeringsApply(...)`; `canEdit` false for a GLC-only designee (`isSubjectRosterRole` false and not a DH of the subject) — then it shows read-only text.
- [ ] **Step 2:** Term pickers: in `AddModal`, `ChangeFromDialog` and the section modal's add/edit, filter `scheduleTermOptions(...)` to the subject's offered terms and preselect them when the subject has an offering (**AddModal limits the picker** — Review Focus 1). Duplicate modals: after copying a subject's schedules to a target section, copy its offering row with `save_section_subject_terms(target, subject, terms)`.
- [ ] **Step 3: Verify on the local clone (SQL, rolled back) and by typecheck:** `npx tsc --noEmit -p .`, `npx eslint` on the touched files — clean; SQL: create an offering via the RPC, then insert a schedule exactly as `AddModal` would with the filtered terms → succeeds; with NULL → refused (already covered by Task 1 case C).
- [ ] **Step 4: Commit** `feat(schedules): Offered in setting per subject in a Senior High section`

### Task 5: GPA and Grade Monitoring follow the offering (migration 235, parts 6–7)

**Files:** Modify `supabase/migrations/235_section_subject_terms.sql`, `supabase/tests/235_section_subject_terms.sql`

**Interfaces:** same signatures as 234's `students_gpa_for_grade(BIGINT[], INTEGER, TEXT, BIGINT)` and 223's `get_grade_encoding_status` (plain `CREATE OR REPLACE`).

- [ ] **Step 1: Failing SQL cases** appended to the test: J Grade 11 learner, core subject 80/80/80 (whole year), elective 95 in T1 with offering `{1}` → GPA `87.50` (per-subject mean of 80 and 95); K same learner with a stray elective grade 60 in T2 → still `87.50`; L a Grade 11 learner with no offerings, two subjects fully encoded (80/80/80 and 90/90/90) → `85.00`, the same as 234 gives; M a Grade 7 learner → GPA unchanged from 234 (repeat 234's case B: `85.00`); N `get_grade_encoding_status` for the Grade 11 section returns the elective for period 1 only.
- [ ] **Step 2: Run** the SQL test — Expected: FAIL at J.
- [ ] **Step 3: Append parts 6–7.** Compare each body with the clone first (`pg_get_functiondef`); note the comparison in the header. GPA: for `p_grade_level IN (11,12)`, average per bucket (subject, MAPEH collapsed) over periods first, excluding grades in periods outside an offering row for (enrollment section, subject, school year), then the mean of the buckets; K–10 = 234's body verbatim. Monitoring: 223's body plus `LEFT JOIN sms_section_subject_terms o ON (section, subject, school year)` and `WHERE o.terms IS NULL OR p.period = ANY(o.terms)`. Header: pre-apply count of Grade 11–12 learners whose GPA moves (learners with subjects carrying unequal numbers of encoded periods).
- [ ] **Step 4: Re-apply locally, run the test** — Expected: all `ok:`.
- [ ] **Step 5: Commit** `feat(db): 235 promotion GPA and grade monitoring follow term offerings`

### Task 6: Side effects, docs

**Files:** `CLAUDE.md`, `AGENTS.md` (only if its migration table mirrors CLAUDE.md's — check), `components/system-guide/system-guide-data.ts`

- [ ] **Step 1: Spot-check on the clone (SQL):** with an elective offered `{1}` and its schedules narrowed, the rows Teaching Load / Subjects Handled read for period 2 (`scheduleCoversPeriod`) exclude it. Record the result in the commit message.
- [ ] **Step 2:** CLAUDE.md: Notable Recent Migrations row **235**; Key Features row **Term offerings (SHS)** naming `sectionOfferings.ts`, the table, the no-row rule, and "TS rule in `mapeh.ts`, SQL rule in `students_gpa_for_grade` — change one, change the other". System guide: a Sections → Manage Schedules step "Offered in (Senior High)".
- [ ] **Step 3:** `npm test`, `npm run lint` (errors only in files untouched by this branch, as on main) — Expected: green.
- [ ] **Step 4: Commit** `docs: term offerings for Senior High subjects`
