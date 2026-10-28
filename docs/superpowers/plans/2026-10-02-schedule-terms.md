# Subject Schedules by Term / Semester — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a subject schedule apply to some grading periods only (Teacher A in T1–T2, Teacher B in T3; or 1st / 2nd Semester on old-curriculum SHS), and make conflicts, grade entry, class records, timetables and load reports respect it.

**Architecture:** One nullable `SMALLINT[]` column `grading_periods` on `sms_subject_schedules` (NULL = whole year; a semester is stored as its two periods). Two rules — *covers(row, p)* and *overlap(a, b)* — written once in TS (`lib/utils/scheduleTerms.ts`) and inline in SQL (migration 222). Every consumer that asks "who teaches this, when" applies them; a "Change from…" action splits a schedule at a period boundary.

**Tech Stack:** Next.js 16 / React 19, Supabase Postgres (`procurements` schema; the conflict functions live in `public`), vitest, psql against the local clone.

**Spec:** `docs/superpowers/specs/2026-10-02-schedule-terms-design.md` (revised 2026-10-28). This plan replaces the 2026-10-02 plan written for migration 198.

## Global Constraints

- **Local Supabase only** (CLAUDE.md Rule 0): `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Never production, never `.env.local`. `npm run dev` only if `.env.development.local` exists — otherwise stop and say so. Applying 222 to production is the user's job.
- If the local DB is down: `colima start && docker start supabase_db_school-management` (see memory note on local quirks).
- Migration number **222**. Never edit an applied migration.
- NULL `grading_periods` = whole year. Nothing is backfilled. Everything ticked is saved as NULL.
- Values are grading periods 1–4. Options come from the **section**: `getGradingPeriodsForSection(schoolYear, shsCurriculum)`; on `shs_curriculum === "old"` the picker shows **1st Semester `[1,2]` / 2nd Semester `[3,4]`** (`gradingPeriodsOfSemester()`), everywhere else one checkbox per period (T1–T3 / Q1–Q4). Strengthened SHS = terms.
- Functions in the migration are rebuilt from their **live** definitions on the local clone (`pg_get_functiondef`), not from the migration files (116/157 drift). `check_schedule_conflicts` keeps 138's `SECURITY DEFINER` + `SET search_path TO 'procurements', 'public'` and cross-school message; the trigger keeps 124's `conflict_override` early return.
- No `any` types. Match the surrounding comment density.
- Checks: `npx vitest run <path>`, `npx eslint <files>`, `npx tsc --noEmit -p .`.

## Review Focus

1. **A part-year teacher's grade save must not touch other periods.** `TeacherGradeEntryTable.handleSave` (~L419–445) DELETEs every period's grades for the subject/section and re-inserts them all under the saver's `teacher_id` — Teacher B saving would wipe and re-attribute Teacher A's T1–T2. Pinned in Task 6 (save + delete scoped to editable periods, verified in psql).
2. **Opening a class record for a period the teacher does not cover must not create it** (`ensureRecord` inserts on load), or Teacher A browsing T3 would create the record B later inherits. Pinned in Task 7 (view-only path returns null, verified in psql).
3. **Old-SHS sections live in a term-based year** (SY 2026-2027 Grade 12 has 4 periods). The picker, badges and selectors must read the section's `shs_curriculum`, not the year. Pinned in Task 1 tests (`scheduleTermOptions("2026-2027","old")` → two semesters) and Task 4 manual check.
4. **"Change from" half-saving**: narrowing succeeds, insert fails (conflict raised by the trigger) → original must be restored. Pinned in Task 5 Step 4 (forced trigger conflict, psql shows original `grading_periods`).
5. **A Temporary row (no teacher) with terms** still occupies its room only in those terms. Pinned in Task 2 SQL case [6].

---

### Task 1: Term helpers and type

**Files:**
- Create: `lib/utils/scheduleTerms.ts`
- Create: `lib/utils/__tests__/scheduleTerms.test.ts`
- Modify: `types/database.ts` (interface `SubjectSchedule`, after `conflict_override`)

**Interfaces:**
- Produces:
  - `type ScheduleTerms = number[] | null`
  - `interface ScheduleTermOption { label: string; short: string; periods: number[] }`
  - `scheduleTermOptions(schoolYear: string, shsCurriculum?: string | null): ScheduleTermOption[]` — old SHS → `[{label:"1st Semester",short:"S1",periods:[1,2]},{label:"2nd Semester",short:"S2",periods:[3,4]}]` (labels from `SEMESTER_LABELS`); otherwise one option per `getGradingPeriodsForSection` entry (`periods: [p.value]`, its `label`/`short`).
  - `normaliseScheduleTerms(selected: number[], allPeriods: number[]): ScheduleTerms` — sort, de-dupe, drop periods not in `allPeriods`; `[]` or all → `null`.
  - `scheduleCoversPeriod(terms: ScheduleTerms | undefined, period: number): boolean`
  - `scheduleTermsOverlap(a: ScheduleTerms | undefined, b: ScheduleTerms | undefined): boolean`
  - `periodsBefore(period: number, allPeriods: number[]): number[]` / `periodsFrom(period: number, allPeriods: number[]): number[]` — for "Change from".
  - `formatScheduleTerms(terms: ScheduleTerms | undefined, options: ScheduleTermOption[]): string` — `""` whole year; a set exactly equal to one option's periods → `"<short> only"` (T) or the option label for semesters (`"2nd Sem"`); contiguous run → `"T1–T2"`; else `"T1, T3"`.
  - `SubjectSchedule.grading_periods?: number[] | null`

- [ ] **Step 1: Write the failing tests** — `lib/utils/__tests__/scheduleTerms.test.ts`

```ts
const TERMS = scheduleTermOptions("2026-2027");          // T1..T3
const QUARTERS = scheduleTermOptions("2025-2026");       // Q1..Q4
const OLD_SHS = scheduleTermOptions("2026-2027", "old"); // 2 semesters

it("old SHS offers two semesters of two periods", () => {
  expect(OLD_SHS.map((o) => o.periods)).toEqual([[1, 2], [3, 4]]);
  expect(scheduleTermOptions("2026-2027", "strengthened").map((o) => o.short)).toEqual(["T1", "T2", "T3"]);
});
it("normalise: nothing or everything ticked is whole year", () => {
  expect(normaliseScheduleTerms([], [1, 2, 3])).toBeNull();
  expect(normaliseScheduleTerms([3, 1, 2], [1, 2, 3])).toBeNull();
  expect(normaliseScheduleTerms([3, 1, 3, 4], [1, 2, 3])).toEqual([1, 3]);
});
it("covers", () => {
  expect(scheduleCoversPeriod(null, 2)).toBe(true);
  expect(scheduleCoversPeriod([3], 1)).toBe(false);
  expect(scheduleCoversPeriod([3, 4], 4)).toBe(true);
});
it("overlap", () => {
  expect(scheduleTermsOverlap(null, [3])).toBe(true);
  expect(scheduleTermsOverlap([1, 2], [3])).toBe(false);
  expect(scheduleTermsOverlap([1, 2], [3, 4])).toBe(false);
  expect(scheduleTermsOverlap([1, 2], [2, 3])).toBe(true);
});
it("before / from", () => {
  expect(periodsBefore(3, [1, 2, 3])).toEqual([1, 2]);
  expect(periodsFrom(3, [1, 2, 3])).toEqual([3]);
});
it("format", () => {
  expect(formatScheduleTerms(null, TERMS)).toBe("");
  expect(formatScheduleTerms([3], TERMS)).toBe("T3 only");
  expect(formatScheduleTerms([1, 2], TERMS)).toBe("T1–T2");
  expect(formatScheduleTerms([2, 3, 4], QUARTERS)).toBe("Q2–Q4");
  expect(formatScheduleTerms([1, 3], TERMS)).toBe("T1, T3");
  expect(formatScheduleTerms([3, 4], OLD_SHS)).toBe("2nd Sem");
});
```

- [ ] **Step 2: Run** `npx vitest run lib/utils/__tests__/scheduleTerms.test.ts` → FAIL (cannot resolve `../scheduleTerms`).
- [ ] **Step 3: Implement** `lib/utils/scheduleTerms.ts` with the Interfaces above. File header: what `grading_periods` means (migration 222), that a semester is stored as its two periods, and "the two rules are mirrored inline in migration 222 — change one, change the other". Add the `SubjectSchedule.grading_periods` line with a `// NULL = whole school year — migration 222` comment.
- [ ] **Step 4: Run** the test file → PASS.
- [ ] **Step 5: Commit** — `git add lib/utils/scheduleTerms.ts lib/utils/__tests__/scheduleTerms.test.ts types/database.ts && git commit -m "feat(schedules): term/semester helpers for part-year schedules (222)"`

---

### Task 2: Migration 222 + SQL tests

**Files:**
- Create: `supabase/migrations/222_schedule_terms.sql`
- Create: `supabase/tests/222_schedule_terms.sql`

**Interfaces:**
- Produces: column `procurements.sms_subject_schedules.grading_periods SMALLINT[]` + CHECK `sms_subject_schedules_grading_periods_check`; `public.check_schedule_conflicts(<live 8 args>, p_grading_periods smallint[] DEFAULT NULL)`; `get_grade_encoding_status` with per-period `assigned_teachers` (signature unchanged); `unpost_class_record_grades` guard per period (signature unchanged).

Dump the live definitions first (scratchpad):

```bash
SP=/private/tmp/claude-501/-Users-berltreasurecampomanes-Documents-GithubBuilds-school-management-system/9ca62d3c-02de-43c4-a1db-2c4651016281/scratchpad
for f in check_schedule_conflicts check_schedule_conflicts_trigger unpost_class_record_grades get_grade_encoding_status; do
  psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -Atc "select pg_get_functiondef(oid) from pg_proc where proname='$f'" > $SP/$f.sql; done
```

- [ ] **Step 1: Write the failing SQL test** — `supabase/tests/222_schedule_terms.sql`. One transaction, `\set ON_ERROR_STOP 0`, each case under `SAVEPOINT a … ROLLBACK TO a`, final `ROLLBACK`. Fixture: a temp table `t` picking one real schedule on the clone with a teacher, a room, `grading_periods IS NULL`, `NOT conflict_override`, plus `teacher_b` = another `teacher` of the same school with a `user_id` and no schedule that year. Cases, each echoing `[n]` and returning `'ok-n'` on success:
  1. CHECK: UPDATE to `{3}`, `{1,2}`, `{3,4}` succeed; `{}` and `{5}` → check-constraint ERROR.
  2. A `{1,2}` + insert B `{3}` same subject/section/room/slot → `ok-2`.
  3. A whole year + insert B `{3}` → ERROR `Schedule conflict detected`.
  4. A `{1,2}` + insert B `{3,4}` (semesters) → `ok-4`.
  5. Case 3 with `conflict_override = true` → `ok-5`.
  6. A `{1,2}` + insert Temporary (teacher NULL) `{3}` same room → `ok-6`.
  7. A `{1,2}`, B `{3}` inserted, then UPDATE A to NULL → ERROR (re-terming re-checked).
  8. Remove other rows for the pair, A `{1,2}`, B `{3}` (override): `get_grade_encoding_status(t.school_id, t.school_year, 3)` for the pair → periods 1,2 list A only; period 3 lists B only.
  9. A `{1,2}`, B `{3}`; insert class records for periods 1 and 3 owned by `teacher_a` (`ON CONFLICT DO NOTHING`; add any NOT NULL columns `\d` shows); `set_config('request.jwt.claims', json_build_object('sub', <B's user_id>, 'role','authenticated')::text, true)`; unposting the period-3 record → `ok-9a`; unposting period 1 → ERROR `Only the teacher of this class record`.
- [ ] **Step 2: Run** `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/222_schedule_terms.sql` → every case errors `column "grading_periods" does not exist`.
- [ ] **Step 3: Write the migration.** Header in the repo's migration style: why (spec "Why"); NULL = whole year, nothing backfilled; semester = two periods; the two rules and their TS twin; why the 8-arg conflict function is DROPped (signature change) and why that is safe; read-only pre-apply check and row count:

```sql
-- Pre-apply (read-only): only the trigger may call the 8-arg version.
--   SELECT p.oid::regprocedure FROM pg_proc p
--    WHERE p.prosrc ILIKE '%check_schedule_conflicts(%' AND p.proname <> 'check_schedule_conflicts';
--   -- expect exactly: check_schedule_conflicts_trigger()
-- Rows touched: 0 (DDL + function replacements only).
```

  Body, in order:
  1. `ADD COLUMN IF NOT EXISTS grading_periods SMALLINT[]`; `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` with the spec's CHECK; `COMMENT ON COLUMN`.
  2. `DROP FUNCTION IF EXISTS public.check_schedule_conflicts(<live 8-arg types>)` then `CREATE FUNCTION` = live body + 9th param `p_grading_periods smallint[] DEFAULT NULL::smallint[]` after `p_id`; each of the room / teacher / section scans gains `AND (<alias>.grading_periods IS NULL OR p_grading_periods IS NULL OR <alias>.grading_periods && p_grading_periods)` beside its days-overlap line. Re-`GRANT EXECUTE … TO authenticated, service_role`.
  3. `CREATE OR REPLACE public.check_schedule_conflicts_trigger()` = live body, call gains `NEW.grading_periods` as 9th argument.
  4. `CREATE OR REPLACE procurements.unpost_class_record_grades(p_class_record_id bigint)` = live body (200's), scheduled-teacher `EXISTS` gains `AND (ss.grading_periods IS NULL OR rec.grading_period = ANY (ss.grading_periods))`.
  5. `CREATE OR REPLACE procurements.get_grade_encoding_status(...)` = live body with: the `sched` CTE reduced to `DISTINCT subject_id, section_id` pairs (keep its existing filters); in the final SELECT replace `s.assigned_teachers` with `t.assigned_teachers` from a `CROSS JOIN LATERAL` after the period series that aggregates `ARRAY_REMOVE(ARRAY_AGG(DISTINCT u.name), NULL)` (default `ARRAY[]::TEXT[]`) over the pair's rows with `(ss.grading_periods IS NULL OR p.period = ANY (ss.grading_periods))`. Keep every other column and the 179 denominator `CASE` verbatim.
- [ ] **Step 4: Apply locally and run the test**

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/migrations/222_schedule_terms.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/222_schedule_terms.sql 2>&1 | grep -E "^\[|ERROR|ok-|^ +[0-9] \|"
```

  Expected: [1] exactly two CHECK errors (`{}`, `{5}`); [2] ok-2; [3] ERROR Schedule conflict; [4] ok-4; [5] ok-5; [6] ok-6; [7] ERROR on the final UPDATE; [8] A for 1–2, B for 3; [9] ok-9a then ERROR Only the teacher. Run the header's pre-apply query → only the trigger.
- [ ] **Step 5: Re-apply** the migration once more → no error (idempotent).
- [ ] **Step 6: Commit** — `git add supabase/migrations/222_schedule_terms.sql supabase/tests/222_schedule_terms.sql && git commit -m "feat(schedules): grading_periods on subject schedules (migration 222)"`

---

### Task 3: Client conflict check honours terms

**Files:**
- Modify: `lib/utils/scheduleConflicts.ts` (`checkScheduleConflicts` param type + loop; the same-save internal block-overlap check)
- Test: `lib/utils/__tests__/scheduleConflicts.test.ts`

**Interfaces:**
- Consumes: `scheduleTermsOverlap` (Task 1).
- Produces: `checkScheduleConflicts` accepts `grading_periods?: number[] | null` on the candidate and on existing rows; otherwise unchanged.

- [ ] **Step 1: Add failing tests** using the file's existing `existing()` / `candidate()` helpers: `candidate({grading_periods:[3]})` vs `existing({grading_periods:[1,2]})` → `[]`; vs `existing({grading_periods:null})` → contains `"room"`; `[2,3]` vs `[1,2]` → non-empty; `[3,4]` vs `[1,2]` → `[]`.
- [ ] **Step 2: Run** `npx vitest run lib/utils/__tests__/scheduleConflicts.test.ts` → the disjoint cases FAIL.
- [ ] **Step 3: Implement** — at the top of the loop over same-year rows, `continue` when `!scheduleTermsOverlap(schedule.grading_periods, existing.grading_periods)`; one doc-comment line citing migration 222. Internal (same-save) block overlap is unaffected: blocks of one save share their terms.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(schedules): client conflict check skips disjoint terms"` (both files).

---

### Task 4: Entering terms, badges, duplicates

**Files:**
- Create: `components/ScheduleTermsBadge.tsx`
- Modify: `app/(protected)/schedules/AddModal.tsx` (sections query + state type, `FormSchema` L128, edit reset ~L474, add reset ~L501, `detectConflicts` ~L582, `rowFor` ~L662, markup after the Teacher/Room grid)
- Modify: `app/(protected)/schedules/DuplicateModal.tsx`, `app/(protected)/sections/DuplicateModal.tsx` (carry `grading_periods` beside `conflict_override`, in the conflict input and the inserted row)
- Modify badge sites (beside each `<TemporaryScheduleBadge />`, outside its conditional): `app/(protected)/schedules/List.tsx:208`, `app/(protected)/sections/List.tsx:423`, `app/(protected)/sections/ViewSubjectsModal.tsx:533`, `app/(protected)/sections/DuplicateModal.tsx:474`, `app/(protected)/teacher/sections/[id]/page.tsx:1338`

**Interfaces:**
- Consumes: `scheduleTermOptions`, `normaliseScheduleTerms`, `formatScheduleTerms` (Task 1); Task 3's `checkScheduleConflicts`.
- Produces: `<ScheduleTermsBadge terms schoolYear shsCurriculum? className? />` (renders nothing for whole year; sky-100/sky-800 pill like the Temporary badge); AddModal form field `grading_periods: number[]` (`[]` = whole year) and a derived `termOptions: ScheduleTermOption[]` / `termsFor(values): ScheduleTerms` used by Task 5.

- [ ] **Step 1: Badge** — implement `components/ScheduleTermsBadge.tsx` from the Interfaces.
- [ ] **Step 2: AddModal data.** Select `shs_curriculum` on sections; `FormSchema` gains `grading_periods: z.array(z.number())`; edit reset `editData.grading_periods ?? []`, add reset `[]`; `termOptions = scheduleTermOptions(form.watch("school_year") || getCurrentSchoolYear(), selectedSection?.shs_curriculum)`; `termsFor` = `normaliseScheduleTerms(ticked, termOptions.flatMap(o => o.periods))`; pass `grading_periods: termsFor(values)` into `detectConflicts` and `rowFor`. When the section changes and the ticked periods are not all valid for it, reset to `[]`.
- [ ] **Step 3: AddModal markup.** An "Applies to" field under Teacher/Room: one checkbox per `termOptions` entry (ticking an option adds/removes *all* its `periods`; checked = every period present), project `Checkbox` from `@/components/ui/checkbox`. Help text: "Leave all unticked for the whole school year. Tick only the <terms|semesters> this teacher handles when the subject changes hands — schedule the other teacher for the rest." Hidden (not just disabled) in `teacherOnly` mode — a GLC cannot change it (216's column guard refuses it).
- [ ] **Step 4: Duplicates** — both modals copy `grading_periods ?? null`; confirm their source queries include the column (add it if they list columns).
- [ ] **Step 5: Badges** — at each site, `<ScheduleTermsBadge terms={row.grading_periods} schoolYear={row.school_year} shsCurriculum={<section's shs_curriculum where already in scope; add it to that site's select when cheap, else omit>} />`; add `grading_periods` to any explicit column list.
- [ ] **Step 6: Verify.** tsc + eslint on touched files. Local app as a school head: Science / section X / MWF 8–9 / Teacher A ticked T1+T2 → saves; same slot, Teacher B, T3 → no conflict warning; change B to T2+T3 → warning; tick all → saved as whole year (badge gone; psql shows NULL). On an old-SHS Grade 12 section the field shows 1st / 2nd Semester and saves `{3,4}` for 2nd.
- [ ] **Step 7: Commit** — `git commit -m "feat(schedules): pick terms or semesters on a schedule; badges; duplicates carry them"`

---

### Task 5: "Change from…" handover and the removal guard

**Files:**
- Create: `lib/utils/scheduleHandover.ts`
- Create: `lib/utils/__tests__/scheduleHandover.test.ts`
- Create: `app/(protected)/schedules/ChangeFromDialog.tsx`
- Modify: `app/(protected)/schedules/AddModal.tsx` (new `handover` prop; add-path submit; edit-path guard)
- Modify: `app/(protected)/schedules/List.tsx` (row menu ~L276), `app/(protected)/sections/ViewSubjectsModal.tsx` (row actions beside Edit ~L259)

**Interfaces:**
- Consumes: Task 1 helpers; Task 4's `termOptions` / `termsFor`.
- Produces:
  - `planHandover(sourceTerms: ScheduleTerms, fromPeriod: number, allPeriods: number[]): { narrowed: ScheduleTerms; handedOver: ScheduleTerms } | null` — `narrowed` = periods the source covered before `fromPeriod`, `handedOver` = periods it covered from `fromPeriod` on (each normalised); `null` when either side would be empty (nothing to hand over, or the change starts at the source's first period — that is an Edit, not a handover).
  - `fetchEncodedPeriods(supabase, { subjectId: number; sectionId: number; schoolYear: string; teacherId: number }): Promise<number[]>` — periods having an `sms_class_records` row with that `teacher_id` and at least one `sms_class_record_scores.raw_score IS NOT NULL` (via `sms_class_record_items.class_record_id`).
  - AddModal prop `handover?: { sources: SubjectSchedule[]; fromPeriod: number }` — pre-fills subject, section, teacher, room, school year and one block per source row; "Applies to" preset to `handedOver`; subject and section locked.
  - `<ChangeFromDialog open schedule siblings onClose onContinue(handover) />` — picks the period to change from (options after the schedule's first covered period, labelled "Term 3" / "2nd Semester") and the sibling blocks of the same subject/section/teacher/SY to move (checklist, all ticked).

- [ ] **Step 1: Failing tests** — `planHandover(null, 3, [1,2,3])` → `{narrowed:[1,2], handedOver:[3]}`; `planHandover([1,2], 2, [1,2,3])` → `{narrowed:[1], handedOver:[2]}`; `planHandover(null, 3, [1,2,3,4])` (old SHS 2nd Sem) → `{narrowed:[1,2], handedOver:[3,4]}`; `planHandover([3], 3, [1,2,3])` → `null`; `planHandover(null, 1, [1,2,3])` → `null`.
- [ ] **Step 2: Run** `npx vitest run lib/utils/__tests__/scheduleHandover.test.ts` → FAIL.
- [ ] **Step 3: Implement** `planHandover` and `fetchEncodedPeriods` → tests PASS.
- [ ] **Step 4: Handover submit in AddModal.** When `handover` is set, the add path runs, in order: (a) `fetchEncodedPeriods` for the source teacher — if any is in `handedOver`, refuse with the spec's copy `"<Teacher> has already encoded <Term 3>. Move the scores or unpost first."` and stop; (b) UPDATE each source row's `grading_periods` to `narrowed` (remember originals); (c) INSERT the new blocks with `grading_periods = termsFor(data)`; (d) if (c) fails, UPDATE every source row back to its original value, then surface the error through the existing conflict/override handling. Toast on success: "Schedule changed from <Term 3>."
  Verify locally: hand over A's whole-year row from T3 to B in a slot that clashes with another of B's classes → trigger error shown and psql shows A's row back at NULL; without the clash → A `{1,2}`, B `{3}`.
- [ ] **Step 5: Removal guard on Edit.** On the edit path, when the saved terms drop periods the row covered before, or the teacher changes, run `fetchEncodedPeriods` for the *original* teacher over the dropped periods (all covered periods if the teacher changed) and refuse with the same copy. Verify: with a score in A's T3 record, narrowing A to T1–T2 is refused; with an empty T3 record it saves.
- [ ] **Step 6: Entry points.** "Change from…" item in the `/schedules` row menu and the section's Manage Schedules row actions, shown only when the row's edit mode is `"full"` (`scheduleEditMode` / `scope.modeFor`) and its school year has more than one period. It opens `ChangeFromDialog`, whose Continue opens `AddModal` with `handover`. Disabled with a tooltip when `planHandover` returns null for every option.
- [ ] **Step 7: Verify** tsc + eslint; end-to-end on local: Mon/Wed + Fri subject handed over from T3 — both blocks narrowed, two new rows inserted for B.
- [ ] **Step 8: Commit** — `git commit -m "feat(schedules): change a schedule from a term onward, guarding encoded scores"`

---

### Task 6: Grade entry per period

**Files:**
- Modify: `app/(protected)/teacher/components/TeacherGradeEntryTable.tsx` (`validateAssignment` L144, `loadData` ~L126, save ~L419–445, cell `disabled` ~L804, header ~L741)

**Interfaces:**
- Consumes: `scheduleCoversPeriod`.
- Produces: internal `editablePeriods: Set<number>` state.

- [ ] **Step 1: Assignment returns editable periods.** `validateAssignment(): Promise<Set<number>>` — adviser of the section → every period of `gradingPeriods`; else the periods covered by any of the teacher's rows for (subject, section, SY) — select `grading_periods`, no `.limit(1)`; empty set = not assigned. `loadData` sets `editablePeriods` and `isValidAssignment = size > 0`. Super admin bypass, if present, keeps every period.
- [ ] **Step 2: Cells.** Input `disabled` adds `|| !editablePeriods.has(value)`; header shows a muted "(view)" on non-editable periods.
- [ ] **Step 3: Save only editable periods.** The insert loop iterates `gradingPeriods.filter(p => editablePeriods.has(p.value))`; the DELETE adds `.in("grading_period", [...editablePeriods])`. Comment: another teacher's term is theirs to save (222).
- [ ] **Step 4: Verify.** tsc + eslint. Local, a quarter-based SY so the screen is editable: Teacher B with a Q4-only row — Q1–Q3 disabled with "(view)", Q4 editable; save; psql: Q1–Q3 `sms_grades` rows keep their original `teacher_id` and grade.
- [ ] **Step 5: Commit** — `git commit -m "feat(grades): a part-year teacher encodes only their own periods"`

---

### Task 7: Class record per period + ownership

**Files:**
- Modify: `app/(protected)/teacher/class-record/components/ClassRecordTable.tsx` (prop `readOnly` L169, `validateAssignment` L248–275, `ensureRecord` L337, banners)
- Modify: `app/(protected)/teacher/class-record/page.tsx` (select `grading_periods` in the schedules query ~L68; initial term = first period the teacher covers; mark others "view only" in the term selector)

**Interfaces:**
- Consumes: `scheduleCoversPeriod`.
- Produces: `ClassRecordSubjectOption.coveredPeriods: number[] | null` (null = all) on the page's subject options.

- [ ] **Step 1: Effective read-only.** Rename the prop to `readOnly: readOnlyProp = false`; add `termViewOnly` state and `const readOnly = readOnlyProp || termViewOnly;` so every existing `readOnly` use (no-create in `ensureRecord`, toolbar, inputs) applies.
- [ ] **Step 2: Validation per term.** `validateAssignment` bypass uses `readOnlyProp`; fetch the teacher's rows with `grading_periods`; assigned but not covering `term` → `setTermViewOnly(true)` and return true; adviser → `setTermViewOnly(false)`. Deps: `term`, `readOnlyProp`.
- [ ] **Step 3: Ownership.** In `ensureRecord`, when an existing record is found and the opener is **not** view-only and is not `existing.teacher_id`: if `existing.teacher_id` has no covering row for this period (query schedules for that teacher_id + pair) **and** the record has no score with `raw_score IS NOT NULL`, UPDATE `teacher_id` to the opener and return the updated row. Otherwise return it unchanged and show the encoder's name in the header ("Encoded by <name>").
- [ ] **Step 4: Banner.** Beside the `locked && !readOnly` banner: when `termViewOnly && !readOnlyProp` — "You are not scheduled for this subject in this term, so its class record is view-only. The teacher scheduled for it encodes and posts it."
- [ ] **Step 5: Page.** Subject options carry `coveredPeriods` (union over the teacher's rows; null if any row is whole-year); on subject change the term selector jumps to the first covered period; non-covered terms keep their label plus " (view only)".
- [ ] **Step 6: Verify.** tsc + eslint. Local: B (T3 only) opens T3 → editable; T1 → banner, no inputs, psql shows no new T1 record. A opens an empty T3 record first (before the handover) — then after handover B opens it → psql `teacher_id` = B; B posts → `sms_grades.teacher_id` = B.
- [ ] **Step 7: Commit** — `git commit -m "feat(class-record): per-term editing and hand-over of empty records"`

---

### Task 8: Timetables, load reports, SF7

**Files:**
- Create: `components/SchedulePeriodSelect.tsx`
- Modify: `app/(protected)/schedules/CalendarView.tsx`, `app/(protected)/schedules/page.tsx` (~L250)
- Modify: `lib/utils/teachingLoad.ts` (`fetchTeacherLoads`), `lib/utils/subjectsHandled.ts` (`fetchSubjectsHandled`, `SubjectHandledRow`), `lib/pdf/generateSubjectsHandled.ts`
- Modify: `app/(protected)/school-reports/teaching-load/page.tsx` (~L51), `app/(protected)/school-reports/subjects-handled/page.tsx` (~L51), `app/(protected)/school-reports/components/ReportFilters.tsx`
- Modify: `components/dashboards/SchoolDashboard.tsx` (~L326)
- Modify: `lib/pdf/generateSf7.ts` (~L38)

**Interfaces:**
- Consumes: `scheduleCoversPeriod`, `formatScheduleTerms`, `scheduleTermOptions`; `resolveCurrentPeriod(schoolYear, getCurrentSchoolYear(), new Date(), termDates)` from `lib/utils/departmentMps.ts`; `fetchTermDates` from `lib/utils/termDates.ts`.
- Produces: `<SchedulePeriodSelect schoolYear value onChange allowWholeYear? />` (`value: number | "all"`); `fetchTeacherLoads(schoolId, schoolYear, gradingPeriod?: number)` and `fetchSubjectsHandled(schoolId, schoolYear, gradingPeriod?: number)` — omitted = current period; `SubjectHandledRow.termsLabel: string`; `ReportFilters` optional `period?: number; onPeriodChange?: (p: number) => void`.

- [ ] **Step 1: Default period.** A small `useCurrentPeriod(schoolId, schoolYear)` inside `SchedulePeriodSelect.tsx` (exported) resolving via `fetchTermDates` + `resolveCurrentPeriod`.
- [ ] **Step 2: Calendar.** `/schedules` calendar view gets `SchedulePeriodSelect` with "Whole year" (default = current period); `CalendarView` filters `scheduleCoversPeriod(row.grading_periods, period)` unless "all"; cells show `ScheduleTermsBadge`.
- [ ] **Step 3: Loads.** Both fetchers select `grading_periods`, skip rows not covering the period; `termsLabel` from `formatScheduleTerms(row.grading_periods, scheduleTermOptions(schoolYear))`. `ReportFilters` renders the period select when `onPeriodChange` is given; both pages hold `period` state (seeded from `useCurrentPeriod`, reset on SY change), pass it, and print the period label in the description; the Subjects Handled page and PDF show `(T1–T2)` after a part-year subject. Dashboard: pass the resolved current period; one comment line saying so.
- [ ] **Step 4: SF7.** Select `grading_periods`; append `formatScheduleTerms` in parentheses after a part-year subject/section in the assignment column. No minutes logic.
- [ ] **Step 5: Verify.** tsc + eslint + `npx vitest run`. Local: A `{1,2}` and B `{3}` — Teaching Load at Term 1 lists A not B, Term 3 the reverse; calendar at Term 3 shows only B in that slot, "Whole year" shows both with badges; SF7 lists both with their terms.
- [ ] **Step 6: Commit** — `git commit -m "feat(schedules): timetable, teaching load, subjects handled and SF7 by term"`

---

### Task 9: Documentation and full verification

**Files:**
- Modify: `CLAUDE.md` (Notable Recent Migrations table after 221; Key Features "Schedules" row)

- [ ] **Step 1: CLAUDE.md.** A **222** row in the table's style: column + CHECK, NULL = whole year and nothing backfilled, semester stored as two periods (old SHS only; strengthened SHS = terms), the two rules + TS twin, `check_schedule_conflicts` DROP-and-recreate (9 args) and why it is safe, trigger / unpost / `get_grade_encoding_status` changes, app-layer per-period grade access with save scoped to own periods, class-record view-only + empty-record hand-over, "Change from…" (narrow → insert → restore on failure) and the encoded-scores guard, period selectors defaulting to the current period. Schedules row: one sentence — a block may apply to some grading periods only (`grading_periods`, 222).
- [ ] **Step 2: Full checks.** `npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run` → all pass; re-run `supabase/tests/222_schedule_terms.sql` with Task 2 Step 4's expectations.
- [ ] **Step 3: Commit** — `git commit -m "docs: migration 222 — subject schedules by term"`

Do **not** push or apply to production: hand the user `supabase/migrations/222_schedule_terms.sql` with what it changes (one column, one CHECK, four functions; 0 rows touched) and the pre-apply dependency query.
