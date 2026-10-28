# Subject Schedules by Term — Gap Plan (after rebase)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the schedules-by-term feature on branch `feat/schedule-terms` (worktree `../school-management-system-terms`), which already implements the 2026-10-02 plan, so it matches the revised 2026-10-28 spec.

**Architecture:** The branch already has `sms_subject_schedules.grading_periods` (NULL = whole year), the `covers` / `overlap` rules in `lib/utils/scheduleTerms.ts` and inline SQL, the term picker in `schedules/AddModal.tsx`, `ScheduleTermsBadge`, per-period grade entry, view-only class records outside the teacher's terms, Teaching Load / Subjects Handled by period (default 1) and Grade Monitoring per period. These tasks renumber the migration to 223 and rebuild it on today's function definitions, then add semesters, the "Change from…" handover with its encoded-scores guard, class-record ownership, the calendar selector, current-period defaults and SF7.

**Tech Stack:** Next.js 16 / React 19, Supabase Postgres (`procurements` schema; conflict functions in `public`), vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-schedule-terms-design.md` (revised 2026-10-28). Full original plan for context: `docs/superpowers/plans/2026-10-02-schedule-terms.md`.

## Global Constraints

- **Work only in `/Users/berltreasurecampomanes/Documents/GithubBuilds/school-management-system-terms`** on branch `feat/schedule-terms`.
- **No database is available.** The SMS local clone is not running and port 54322 belongs to another project (`pr-tracker`). **Do not run `psql`, `supabase`, `npm run dev`, or any DB/browser step.** Never production, never `.env.local` (Rule 0). Every DB / manual-app verification step below is marked **PENDING LOCAL DB**: do not attempt it — list it in your report under "Pending local DB" exactly as written.
- Migration number **223**. Never edit an already-applied migration (≤ 221).
- NULL `grading_periods` = whole year; nothing backfilled; all ticked saved as NULL.
- Values are grading periods 1–4. Old-curriculum SHS (`shs_curriculum === "old"`) offers **1st Semester `[1,2]` / 2nd Semester `[3,4]`** (`gradingPeriodsOfSemester()` in `lib/utils/schoolYear.ts`); everything else one option per period from `getGradingPeriodsForSection()`. Strengthened SHS = terms.
- Comments that cite "migration 198" / "(198)" for this feature become "223" (198 is the announcements migration on `main`).
- No `any`. Match surrounding comment density. Checks: `npx vitest run <path>`, `npx eslint <files>`, `npx tsc --noEmit -p .` — all must be clean of errors.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Migration 223 must not regress 200.** The branch's `unpost_class_record_grades` was dumped before migration 200 existed; 200 made it never delete carried-over transferee grades (`carried_from_school IS NOT NULL`). Rebuilt from 200's body in Task 1; reviewer diffs the two.
2. **"Change from" half-save**: narrow succeeds, insert fails → originals restored. Pinned in Task 3 (unit-tested orchestration with a fake client).
3. **Removal guard must look at the original teacher**, not the edited one, when Edit changes both teacher and terms. Pinned in Task 3 tests.
4. **Ownership take-over must never move a record that has scores** — `raw_score IS NOT NULL` on any item. Pinned in Task 4 tests.
5. **Old-SHS sections in a term-based year** get semesters, not three terms. Pinned in Task 2 tests.

---

### Task 1: Renumber migration to 223 and rebuild on current definitions

**Files:**
- Rename: `supabase/migrations/198_schedule_terms.sql` → `supabase/migrations/223_schedule_terms.sql` (`git mv`)
- Rename: `supabase/tests/198_schedule_terms.sql` → `supabase/tests/223_schedule_terms.sql`
- Modify: every file in `git diff main...HEAD --name-only` whose comments cite 198 for this feature (`grep -rn "198" ` over those files)

**Interfaces:**
- Produces: migration 223 with the same objects as the branch's 198 (column + CHECK, 9-arg `public.check_schedule_conflicts`, trigger, `unpost_class_record_grades`, `get_grade_encoding_status`).

- [ ] **Step 1: Rename** both files with `git mv`; replace 198 → 223 in their headers/comments/COMMENTs and in the feature's code comments.
- [ ] **Step 2: Rebuild `unpost_class_record_grades`** in the migration from the **latest** definition in `supabase/migrations/200_transfer_in_carried_grades.sql` verbatim, plus exactly one change in the scheduled-teacher `EXISTS`: `AND (ss.grading_periods IS NULL OR rec.grading_period = ANY (ss.grading_periods))`. Keep 200's carried-grades exclusion.
- [ ] **Step 3: Check the other three functions** against the latest file defining each on `main` (`grep -ln "FUNCTION <name>(" supabase/migrations/*.sql | sort | tail -1`): `get_grade_encoding_status` (expect 191), `check_schedule_conflicts` and `check_schedule_conflicts_trigger` (expect 138 / 124). If any later migration changed one after 2026-10-02, rebuild from it with only this feature's edits. Record in the report which file each body was taken from.
- [ ] **Step 4: Header note** — add to the migration header: "Bodies taken from the migration files named below because no local clone was available when this was rebuilt; before applying, compare each against `pg_get_functiondef` on the local clone (116/157 drift)." and list the files.
- [ ] **Step 5: SQL test** — add a semester case to `supabase/tests/223_schedule_terms.sql`: A `{1,2}` + insert B `{3,4}` same slot → `ok-sem`. Also a carried-grade case for unpost: a `sms_grades` row in the slot with `carried_from_school` set survives `unpost_class_record_grades` (follow 200's test file for fixture shape).
- [ ] **Step 6: PENDING LOCAL DB** — apply 223 and run `supabase/tests/223_schedule_terms.sql`; compare function bodies with `pg_get_functiondef`.
- [ ] **Step 7:** `npx vitest run` + `npx tsc --noEmit -p .` clean → **Commit** `chore(schedules): renumber schedule terms to migration 223; rebuild on 200's unpost`

---

### Task 2: Semesters for old-curriculum SHS

**Files:**
- Modify: `lib/utils/scheduleTerms.ts`, `lib/utils/__tests__/scheduleTerms.test.ts`
- Modify: `app/(protected)/schedules/AddModal.tsx` (`sectionPeriods` ~L360, the `grading_periods` field ~L1067)
- Modify: `components/ScheduleTermsBadge.tsx` and every caller of `formatScheduleTerms` (`grep -rn formatScheduleTerms app lib components`)

**Interfaces:**
- Produces:
  - `interface ScheduleTermOption { label: string; short: string; periods: number[] }`
  - `scheduleTermOptions(schoolYear: string, shsCurriculum?: string | null): ScheduleTermOption[]` — old SHS → `[{label:"1st Semester",short:"1st Sem",periods:[1,2]},{label:"2nd Semester",short:"2nd Sem",periods:[3,4]}]` (labels from `SEMESTER_LABELS`); else one per `getGradingPeriodsForSection` entry (`periods:[value]`, its `label`, `short`).
  - `formatScheduleTerms(terms, options: ScheduleTermOption[]): string` — signature changes from `GradingPeriodOption[]` to `ScheduleTermOption[]`: `""` whole year; terms exactly equal to one multi-period option → that option's `short` (`"2nd Sem"`); a single period → `"<short> only"`; contiguous run → `"T1–T2"`; else `"T1, T3"`.
  - `periodsBefore(period: number, allPeriods: number[]): number[]`, `periodsFrom(period: number, allPeriods: number[]): number[]` (used by Task 3).

- [ ] **Step 1: Failing tests** (add to the existing test file, update existing `formatScheduleTerms` calls to pass `scheduleTermOptions(...)`):

```ts
const OLD_SHS = scheduleTermOptions("2026-2027", "old");
expect(OLD_SHS.map((o) => o.periods)).toEqual([[1, 2], [3, 4]]);
expect(scheduleTermOptions("2026-2027", "strengthened").map((o) => o.short)).toEqual(["T1", "T2", "T3"]);
expect(formatScheduleTerms([3, 4], OLD_SHS)).toBe("2nd Sem");
expect(formatScheduleTerms([3], scheduleTermOptions("2026-2027"))).toBe("T3 only");
expect(formatScheduleTerms([1, 2], scheduleTermOptions("2026-2027"))).toBe("T1–T2");
expect(periodsBefore(3, [1, 2, 3])).toEqual([1, 2]);
expect(periodsFrom(3, [1, 2, 3, 4])).toEqual([3, 4]);
```

- [ ] **Step 2: Run** `npx vitest run lib/utils/__tests__/scheduleTerms.test.ts` → FAIL.
- [ ] **Step 3: Implement** the helpers; switch every `formatScheduleTerms` caller to `scheduleTermOptions(schoolYear, shsCurriculum)`.
- [ ] **Step 4: AddModal** — derive `termOptions = scheduleTermOptions(year, selectedShsCurriculum)`; render one checkbox per option (checked = all its periods ticked; toggling adds/removes all its periods); label the field "Semesters" on old SHS else "Terms"/"Quarters" as today; `termsFor` normalises against `termOptions.flatMap(o => o.periods)`. When the section changes, drop ticked periods not valid for it. Confirm the field is hidden in `teacherOnly` (GLC) mode — 216's guard refuses `grading_periods` for a GLC; hide it if it is not.
- [ ] **Step 5:** tests PASS, tsc + eslint clean. **PENDING LOCAL DB**: on an old-SHS Grade 12 section the field shows 1st/2nd Semester and saves `{3,4}`.
- [ ] **Step 6: Commit** `feat(schedules): semesters on old-curriculum SHS schedules`

---

### Task 3: "Change from…" handover and the encoded-scores guard

**Files:**
- Create: `lib/utils/scheduleHandover.ts`, `lib/utils/__tests__/scheduleHandover.test.ts`
- Create: `app/(protected)/schedules/ChangeFromDialog.tsx`
- Modify: `app/(protected)/schedules/AddModal.tsx` (new `handover` prop; add path; edit-path guard)
- Modify: `app/(protected)/schedules/List.tsx` (row menu, ~L276), `app/(protected)/sections/ViewSubjectsModal.tsx` (row actions beside Edit, ~L259)

**Interfaces:**
- Consumes: Task 2's `ScheduleTermOption`, `scheduleTermOptions`, `periodsBefore`, `periodsFrom`; `normaliseScheduleTerms`.
- Produces:
  - `planHandover(sourceTerms: ScheduleTerms, fromPeriod: number, allPeriods: number[]): { narrowed: ScheduleTerms; handedOver: ScheduleTerms } | null` — `narrowed` = periods the source covered before `fromPeriod`, `handedOver` = periods it covered from `fromPeriod` on, each through `normaliseScheduleTerms`; `null` if either is empty.
  - `fetchEncodedPeriods(supabase: SupabaseClient, args: { subjectId: number; sectionId: number; schoolYear: string; teacherId: number }): Promise<number[]>` — grading periods with an `sms_class_records` row for (subject, section, SY) whose `teacher_id = teacherId` and which has ≥1 `sms_class_record_scores` row with `raw_score IS NOT NULL` (scores → `item_id` → `sms_class_record_items.class_record_id`). Sorted, distinct.
  - `encodedConflictMessage(teacherName: string, periodLabels: string[]): string` → `` `${teacherName} has already encoded ${labels joined with " and "}. Move the scores or unpost first.` ``
  - `runHandover(client, { sources: { id: number; grading_periods: ScheduleTerms }[]; narrowed: ScheduleTerms; insertRows: Record<string, unknown>[] }): Promise<{ ok: true; inserted: SubjectSchedule[] } | { ok: false; error: string }>` — (1) UPDATE each source `grading_periods = narrowed`; (2) INSERT `insertRows`; (3) if (2) fails, UPDATE each source back to its original `grading_periods` and return the insert's error. If (1) fails partway, restore the ones already updated and return the error.
  - AddModal prop `handover?: { sources: SubjectSchedule[]; fromPeriod: number }` — pre-fills subject, section, teacher, room, school year, one block per source row; "Applies to" preset to `handedOver`; subject and section locked.
  - `<ChangeFromDialog open schedule siblings onClose onContinue={(h) => …} />` — choose the period (options after the schedule's first covered period, labelled from `scheduleTermOptions`, e.g. "Term 3", "2nd Semester") and the sibling blocks (same subject, section, teacher, SY) to move (checklist, all ticked).

- [ ] **Step 1: Failing tests** — `planHandover(null,3,[1,2,3])` → `{narrowed:[1,2],handedOver:[3]}`; `planHandover([1,2],2,[1,2,3])` → `{narrowed:[1],handedOver:[2]}`; `planHandover(null,3,[1,2,3,4])` → `{narrowed:[1,2],handedOver:[3,4]}`; `planHandover([3],3,[1,2,3])` → `null`; `planHandover(null,1,[1,2,3])` → `null`. `encodedConflictMessage("Ana Cruz",["3rd Term"])` → `"Ana Cruz has already encoded 3rd Term. Move the scores or unpost first."`. `runHandover` with a fake client whose insert fails: asserts the sources were updated to `narrowed` and then back to their originals, and the result is `{ok:false}` carrying the error; with a passing insert, `{ok:true}` and no restore call. `fetchEncodedPeriods` with a fake client returning records for periods 1 and 3 where only period 3 has a non-null score → `[3]`.
- [ ] **Step 2: Run** `npx vitest run lib/utils/__tests__/scheduleHandover.test.ts` → FAIL.
- [ ] **Step 3: Implement** `lib/utils/scheduleHandover.ts` → PASS.
- [ ] **Step 4: AddModal handover path** — when `handover` is set: (a) `fetchEncodedPeriods` for the source teacher; any period in `handedOver` → toast `encodedConflictMessage` and stop; (b) `runHandover`; on `ok:false` route the error through the existing `parseDbConflictError` handling (conflict list + override checkbox) so the user can retry. Success toast: `Schedule changed from <period label>.` Dispatch Redux updates for narrowed and inserted rows unless `skipReduxUpdate`.
- [ ] **Step 5: Edit-path guard** — on edit, compute the periods the original row covered that the saved row no longer gives the **original** teacher (all covered periods if the teacher changed, else covered-before minus covered-after); if `fetchEncodedPeriods(original teacher)` intersects them, refuse with `encodedConflictMessage`. Skip when nothing is dropped.
- [ ] **Step 6: Entry points** — "Change from…" in the `/schedules` row menu and the section Manage Schedules row actions, only when the row's edit mode is `"full"` (`useScheduleScope().modeFor` / `scheduleEditMode`) and the section has more than one option; disabled with a title tooltip when `planHandover` is null for every option.
- [ ] **Step 7:** tsc + eslint clean. **PENDING LOCAL DB**: hand A's whole-year Mon/Wed + Fri subject over from T3 to B → A's two rows `{1,2}`, B's two new rows `{3}`; with a clash on B's side the trigger error shows and psql shows A's rows back at NULL; with a T3 score in A's record the handover and an Edit narrowing A are both refused.
- [ ] **Step 8: Commit** `feat(schedules): change a schedule from a term onward, guarding encoded scores`

---

### Task 4: Class record ownership and opening on the teacher's own term

**Files:**
- Create: `lib/utils/classRecordOwnership.ts`, `lib/utils/__tests__/classRecordOwnership.test.ts`
- Modify: `app/(protected)/teacher/class-record/components/ClassRecordTable.tsx` (`ensureRecord`, header)
- Modify: `app/(protected)/teacher/class-record/page.tsx` (schedules query ~L68, subject options, term selector)

**Interfaces:**
- Consumes: `scheduleCoversPeriod`.
- Produces:
  - `shouldTakeOverRecord(args: { openerId: number; ownerId: number | null; ownerCoversPeriod: boolean; hasScores: boolean; openerCovers: boolean }): boolean` — true iff `openerCovers && ownerId !== openerId && !ownerCoversPeriod && !hasScores`.
  - `ClassRecordSubjectOption.coveredPeriods: number[] | null` (null = some row is whole year).

- [ ] **Step 1: Failing tests** for `shouldTakeOverRecord`: take over when owner A no longer covers and no scores; not when scores exist; not when owner still covers (team teaching); not when opener is owner; not when opener does not cover.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** → PASS.
- [ ] **Step 4: `ensureRecord`** — when an existing record is found, the opener is not view-only and `existing.teacher_id !== teacherId`: query whether `existing.teacher_id` has a covering schedule row for this (subject, section, SY, term) and whether the record has any score with `raw_score IS NOT NULL`; if `shouldTakeOverRecord`, UPDATE `teacher_id = teacherId` and use the updated row. When the record is kept by another teacher, show "Encoded by <name>" in the header (fetch via the existing staff-name helper used on this page or `fetchStaffNames`).
- [ ] **Step 5: Page** — select `grading_periods` in the schedules query; build `coveredPeriods` per subject option (union over the teacher's rows; null if any row is NULL; for `canViewAll` users leave null). On subject change set the term to the first covered period; append " (view only)" to term labels outside `coveredPeriods`.
- [ ] **Step 6:** tsc + eslint clean. **PENDING LOCAL DB**: A opens an empty T3 record, schedule handed over, B opens it → psql `teacher_id` = B, B's posted grades carry B's `teacher_id`; with a score in it, ownership stays A and the header says "Encoded by A".
- [ ] **Step 7: Commit** `feat(class-record): scheduled teacher takes over an empty record; open on own term`

---

### Task 5: Calendar selector, current-period defaults, SF7

**Files:**
- Create: `components/SchedulePeriodSelect.tsx`
- Modify: `app/(protected)/schedules/CalendarView.tsx`, `app/(protected)/schedules/page.tsx` (~L250)
- Modify: `app/(protected)/school-reports/teaching-load/page.tsx`, `app/(protected)/school-reports/subjects-handled/page.tsx`, `components/dashboards/SchoolDashboard.tsx` (~L326)
- Modify: `lib/pdf/generateSf7.ts` (~L38)

**Interfaces:**
- Consumes: `resolveCurrentPeriod(schoolYear, getCurrentSchoolYear(), new Date(), termDates)` from `lib/utils/departmentMps.ts`; `fetchTermDates` from `lib/utils/termDates.ts` (read its signature); `scheduleCoversPeriod`, `formatScheduleTerms`, `scheduleTermOptions`; branch's `fetchTeacherLoads(schoolId, schoolYear, gradingPeriod = 1)` / `fetchSubjectsHandled(..., gradingPeriod = 1)`.
- Produces: `useCurrentPeriod(schoolId: number | null | undefined, schoolYear: string): number | null` (null while loading) and `<SchedulePeriodSelect schoolYear value onChange allowWholeYear? />` (`value: number | "all"`), both exported from `components/SchedulePeriodSelect.tsx`.

- [ ] **Step 1: Implement** `useCurrentPeriod` + `SchedulePeriodSelect` (labels from `getGradingPeriods(schoolYear)`, "Whole year" option when `allowWholeYear`).
- [ ] **Step 2: Calendar** — `/schedules` calendar view gets the select (default = current period, "Whole year" allowed); `CalendarView` filters rows with `scheduleCoversPeriod` unless `"all"` and shows `ScheduleTermsBadge` in a cell.
- [ ] **Step 3: Defaults** — both report pages seed their `period` state from `useCurrentPeriod` once it resolves (still resettable by the user; reset on SY change); `SchoolDashboard` passes the current period to `fetchTeacherLoads` with a one-line comment.
- [ ] **Step 4: SF7** — select `grading_periods`; append ` (<formatScheduleTerms>)` after a part-year assignment in the subject column; no other change.
- [ ] **Step 5:** tsc + eslint + `npx vitest run` clean. **PENDING LOCAL DB**: calendar at Term 3 shows only B in a shared slot, "Whole year" both with badges; Teaching Load opens on the current term; SF7 lists both teachers with their terms.
- [ ] **Step 6: Commit** `feat(schedules): calendar term selector, current-term defaults, SF7 terms`

---

### Task 6: CLAUDE.md and full checks

**Files:**
- Modify: `CLAUDE.md` (Notable Recent Migrations table after 221; Key Features "Schedules" row)

- [ ] **Step 1:** Add a **223** row in the table's style: `grading_periods SMALLINT[]` + CHECK; NULL = whole year, nothing backfilled; semester = two periods (old SHS only); the covers/overlap rules + `lib/utils/scheduleTerms.ts`; `check_schedule_conflicts` dropped and re-created with 9 args (only the trigger calls it); trigger, `unpost_class_record_grades` (200's body + period line) and `get_grade_encoding_status` per period; app-layer per-period grade entry with save scoped to own periods; class record view-only outside one's terms and empty-record take-over; "Change from…" (narrow → insert → restore on failure) and the encoded-scores guard; period selectors defaulting to the current period. Append to the Schedules row: "A block may apply to some grading periods only (`grading_periods`, 223): a part-year teacher is the teacher for those periods alone."
- [ ] **Step 2:** `npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run` → no errors, all pass.
- [ ] **Step 3: Commit** `docs: migration 223 — subject schedules by term`
