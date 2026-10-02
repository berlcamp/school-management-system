# Subject Schedules by Term — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a subject schedule apply to some grading periods only (e.g. Teacher A in T1–T2, Teacher B in T3), and make conflicts, grade entry, class records, grade monitoring and load reports respect it.

**Architecture:** One nullable `SMALLINT[]` column `grading_periods` on `sms_subject_schedules` (NULL = whole year). Two rules — *covers(row, p)* and *overlap(a, b)* — written once in TS (`lib/utils/scheduleTerms.ts`) and inline in SQL (migration 198). Every consumer that asks "who teaches this, when" applies them.

**Tech Stack:** Next.js 16 / React 19, Supabase Postgres (`procurements` schema; conflict functions live in `public`), vitest, psql against the local clone.

**Spec:** `docs/superpowers/specs/2026-10-02-schedule-terms-design.md`

## Global Constraints

- **Local Supabase only** (CLAUDE.md Rule 0): `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Never production, never `.env.local`. Applying 198 to production is the user's job.
- If the local DB is down: `colima start && docker start supabase_db_school-management` (Postgres only).
- Migration number **198** (195 reserved for the question bank). Never edit an applied migration.
- NULL `grading_periods` = whole year. Nothing is backfilled. All periods ticked is saved as NULL.
- Values are grading periods 1–4; labels come from `getGradingPeriodsForSection(schoolYear, shsCurriculum)` ("T1"/"Q1" short, "1st Term" label).
- `check_schedule_conflicts` keeps 138's `SECURITY DEFINER` + `SET search_path TO 'procurements', 'public'`; the trigger keeps 124's `conflict_override` early return.
- No `any` types. Match surrounding comment density.
- Tests: `npx vitest run <path>`; lint `npx eslint <files>`; types `npx tsc --noEmit -p .`.

## Review Focus

1. **A part-year teacher's grade save must not touch other periods.** `TeacherGradeEntryTable` today DELETEs every period's grades for the subject/section and re-inserts all of them under the saver's `teacher_id` — Teacher B saving would wipe and re-attribute Teacher A's Q1–Q2. Pinned in Task 5 (save scoped to editable periods).
2. **Changing the term on an existing row** (A whole-year → A T1–T2) must re-run the conflict trigger and the client check with the new terms. Pinned in Task 2 SQL test (UPDATE path) and Task 4.
3. **A class record for a period the teacher does not cover must not be created** by merely opening it (ensureRecord inserts on load). Pinned in Task 6 (view-only path returns null like `readOnly`).
4. **Old-curriculum SHS sections have 4 periods in a term-based year.** The term checkboxes must offer the section's periods, not the year's. Pinned in Task 4 (periods from the selected section's `shs_curriculum`).
5. **A Temporary row (no teacher) with terms** still occupies its room only in those terms. Pinned in Task 2 SQL test (room clash with disjoint terms passes).

---

### Task 1: Term helpers and type

**Files:**
- Create: `lib/utils/scheduleTerms.ts`
- Create: `lib/utils/__tests__/scheduleTerms.test.ts`
- Modify: `types/database.ts` (interface `SubjectSchedule`, after `conflict_override`)

**Interfaces:**
- Produces:
  - `type ScheduleTerms = number[] | null`
  - `normaliseScheduleTerms(selected: number[], allPeriods: number[]): ScheduleTerms`
  - `scheduleCoversPeriod(terms: ScheduleTerms | undefined, period: number): boolean`
  - `scheduleTermsOverlap(a: ScheduleTerms | undefined, b: ScheduleTerms | undefined): boolean`
  - `formatScheduleTerms(terms: ScheduleTerms | undefined, periods: GradingPeriodOption[]): string`
  - `SubjectSchedule.grading_periods?: number[] | null`

- [ ] **Step 1: Write the failing tests** — `lib/utils/__tests__/scheduleTerms.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  formatScheduleTerms,
  normaliseScheduleTerms,
  scheduleCoversPeriod,
  scheduleTermsOverlap,
} from "../scheduleTerms";
import { getGradingPeriods } from "../schoolYear";

const TERMS = getGradingPeriods("2026-2027"); // T1..T3
const QUARTERS = getGradingPeriods("2025-2026"); // Q1..Q4

describe("normaliseScheduleTerms", () => {
  it("is null when nothing or everything is ticked", () => {
    expect(normaliseScheduleTerms([], [1, 2, 3])).toBeNull();
    expect(normaliseScheduleTerms([3, 1, 2], [1, 2, 3])).toBeNull();
  });
  it("sorts, de-duplicates and drops periods the section does not have", () => {
    expect(normaliseScheduleTerms([3, 1, 3, 4], [1, 2, 3])).toEqual([1, 3]);
  });
});

describe("scheduleCoversPeriod", () => {
  it("whole year covers every period", () => {
    expect(scheduleCoversPeriod(null, 2)).toBe(true);
    expect(scheduleCoversPeriod(undefined, 4)).toBe(true);
  });
  it("part year covers only its periods", () => {
    expect(scheduleCoversPeriod([3], 3)).toBe(true);
    expect(scheduleCoversPeriod([3], 1)).toBe(false);
  });
});

describe("scheduleTermsOverlap", () => {
  it("whole year overlaps everything", () => {
    expect(scheduleTermsOverlap(null, [3])).toBe(true);
    expect(scheduleTermsOverlap([1], undefined)).toBe(true);
  });
  it("disjoint terms do not overlap", () => {
    expect(scheduleTermsOverlap([1, 2], [3])).toBe(false);
    expect(scheduleTermsOverlap([1, 2], [2, 3])).toBe(true);
  });
});

describe("formatScheduleTerms", () => {
  it("is empty for the whole year", () => {
    expect(formatScheduleTerms(null, TERMS)).toBe("");
  });
  it("names a single period", () => {
    expect(formatScheduleTerms([3], TERMS)).toBe("T3 only");
  });
  it("joins a contiguous run with an en dash", () => {
    expect(formatScheduleTerms([1, 2], TERMS)).toBe("T1–T2");
    expect(formatScheduleTerms([2, 3, 4], QUARTERS)).toBe("Q2–Q4");
  });
  it("lists a broken run", () => {
    expect(formatScheduleTerms([1, 3], TERMS)).toBe("T1, T3");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/utils/__tests__/scheduleTerms.test.ts`
Expected: FAIL — cannot resolve `../scheduleTerms`.

- [ ] **Step 3: Implement** — `lib/utils/scheduleTerms.ts`

```ts
/**
 * Which grading periods a subject schedule applies to (migration 198).
 *
 * `sms_subject_schedules.grading_periods` is NULL for the whole school year —
 * every row before 198 — or the periods it is taught in, so a subject can pass
 * from Teacher A (T1–T2) to Teacher B (T3). The two rules below are the whole
 * model; migration 198 writes the same two inline in SQL. Change one, change
 * the other.
 */

import type { GradingPeriodOption } from "@/lib/utils/schoolYear";

/** NULL = whole school year. */
export type ScheduleTerms = number[] | null;

/** What the form saves: sorted, de-duplicated, and NULL when nothing or everything is ticked. */
export function normaliseScheduleTerms(
  selected: number[],
  allPeriods: number[],
): ScheduleTerms {
  const picked = Array.from(new Set(selected))
    .filter((p) => allPeriods.includes(p))
    .sort((a, b) => a - b);
  if (picked.length === 0 || picked.length === allPeriods.length) return null;
  return picked;
}

/** covers(row, p): the row applies in period p. */
export function scheduleCoversPeriod(
  terms: ScheduleTerms | undefined,
  period: number,
): boolean {
  return terms == null || terms.includes(period);
}

/** overlap(a, b): two rows can clash only when they share a period. */
export function scheduleTermsOverlap(
  a: ScheduleTerms | undefined,
  b: ScheduleTerms | undefined,
): boolean {
  if (a == null || b == null) return true;
  return a.some((p) => b.includes(p));
}

/** "" (whole year), "T3 only", "T1–T2", "T1, T3". */
export function formatScheduleTerms(
  terms: ScheduleTerms | undefined,
  periods: GradingPeriodOption[],
): string {
  if (terms == null || terms.length === 0) return "";
  const short = (p: number) =>
    periods.find((o) => o.value === p)?.short ?? `P${p}`;
  const sorted = [...terms].sort((a, b) => a - b);
  if (sorted.length === 1) return `${short(sorted[0]!)} only`;
  const contiguous = sorted.every((p, i) => i === 0 || p === sorted[i - 1]! + 1);
  return contiguous
    ? `${short(sorted[0]!)}–${short(sorted[sorted.length - 1]!)}`
    : sorted.map(short).join(", ");
}
```

In `types/database.ts`, inside `interface SubjectSchedule`, after the `conflict_override` line:

```ts
  grading_periods?: number[] | null; // NULL = whole school year; else the grading periods this row applies to — see migration 198
```

- [ ] **Step 4: Run tests** — `npx vitest run lib/utils/__tests__/scheduleTerms.test.ts` → PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/scheduleTerms.ts lib/utils/__tests__/scheduleTerms.test.ts types/database.ts
git commit -m "feat(schedules): term helpers for part-year schedules (198)"
```

---

### Task 2: Migration 198 + SQL tests

**Files:**
- Create: `supabase/migrations/198_schedule_terms.sql`
- Create: `supabase/tests/198_schedule_terms.sql`

**Interfaces:**
- Produces: column `procurements.sms_subject_schedules.grading_periods SMALLINT[]`; `public.check_schedule_conflicts(p_room_id bigint, p_teacher_id bigint, p_section_id bigint, p_days_of_week integer[], p_start_time time, p_end_time time, p_school_year text, p_id bigint DEFAULT NULL, p_grading_periods smallint[] DEFAULT NULL)`; per-period `assigned_teachers` from `procurements.get_grade_encoding_status` (signature unchanged).

The four functions are rebuilt from their **live** definitions on the local clone (the files and the live schema are known to drift — invariant 11), with the exact edits below. Dump them first:

```bash
SP=<scratchpad>; for f in check_schedule_conflicts check_schedule_conflicts_trigger unpost_class_record_grades get_grade_encoding_status; do
  psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -Atc "select pg_get_functiondef(oid) from pg_proc where proname='$f'" > $SP/$f.sql; done
```

- [ ] **Step 1: Write the failing SQL test** — `supabase/tests/198_schedule_terms.sql`

Runs in one transaction and rolls back; each case under a savepoint so a raised conflict does not abort the rest (and so the FK re-check on a row updated twice in one transaction never fires). Picks real ids from the clone.

```sql
-- 198 schedule terms — local only, rolled back. psql -f supabase/tests/198_schedule_terms.sql
\set ON_ERROR_STOP 0
BEGIN;
CREATE TEMP TABLE t AS
SELECT s.id AS sched_id, s.subject_id, s.section_id, s.room_id, s.teacher_id AS teacher_a,
       s.school_year, s.school_id, s.days_of_week, s.start_time, s.end_time,
       (SELECT u.id FROM procurements.sms_users u
         WHERE u.school_id = s.school_id AND u.type = 'teacher' AND u.id <> s.teacher_id
           AND NOT EXISTS (SELECT 1 FROM procurements.sms_subject_schedules x
                            WHERE x.teacher_id = u.id AND x.school_year = s.school_year)
         LIMIT 1) AS teacher_b
FROM procurements.sms_subject_schedules s
WHERE s.teacher_id IS NOT NULL AND s.room_id IS NOT NULL AND s.grading_periods IS NULL
  AND NOT s.conflict_override
LIMIT 1;
SELECT * FROM t;

\echo [1] CHECK accepts NULL, {3}, {1,2}; rejects {} and {5}
SAVEPOINT a; UPDATE procurements.sms_subject_schedules SET grading_periods='{3}' WHERE id=(SELECT sched_id FROM t); ROLLBACK TO a;
SAVEPOINT a; UPDATE procurements.sms_subject_schedules SET grading_periods='{1,2}' WHERE id=(SELECT sched_id FROM t); ROLLBACK TO a;
SAVEPOINT a; UPDATE procurements.sms_subject_schedules SET grading_periods='{}' WHERE id=(SELECT sched_id FROM t); ROLLBACK TO a;   -- expect ERROR check
SAVEPOINT a; UPDATE procurements.sms_subject_schedules SET grading_periods='{5}' WHERE id=(SELECT sched_id FROM t); ROLLBACK TO a;  -- expect ERROR check

\echo [2] A{1,2} + B{3} in the same room/section/slot: no conflict
SAVEPOINT a;
UPDATE procurements.sms_subject_schedules SET grading_periods='{1,2}' WHERE id=(SELECT sched_id FROM t);
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods)
SELECT subject_id, section_id, teacher_b, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3}' FROM t RETURNING 'ok-2' AS result;
ROLLBACK TO a;

\echo [3] A whole year + B{3}: conflict (expect ERROR Schedule conflict detected)
SAVEPOINT a;
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods)
SELECT subject_id, section_id, teacher_b, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3}' FROM t;
ROLLBACK TO a;

\echo [4] conflict_override still exempts
SAVEPOINT a;
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods, conflict_override)
SELECT subject_id, section_id, teacher_b, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3}', true FROM t RETURNING 'ok-4' AS result;
ROLLBACK TO a;

\echo [5] Temporary row with disjoint terms: room free (expect ok-5)
SAVEPOINT a;
UPDATE procurements.sms_subject_schedules SET grading_periods='{1,2}' WHERE id=(SELECT sched_id FROM t);
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods)
SELECT subject_id, section_id, NULL, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3}' FROM t RETURNING 'ok-5' AS result;
ROLLBACK TO a;

\echo [6] Re-terming an existing row onto a clash is re-checked (expect ERROR)
SAVEPOINT a;
UPDATE procurements.sms_subject_schedules SET grading_periods='{1,2}' WHERE id=(SELECT sched_id FROM t);
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods)
SELECT subject_id, section_id, teacher_b, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3}' FROM t;
UPDATE procurements.sms_subject_schedules SET grading_periods=NULL WHERE id=(SELECT sched_id FROM t);
ROLLBACK TO a;

\echo [7] get_grade_encoding_status: B for period 3 only, A for periods 1-2 only
SAVEPOINT a;
DELETE FROM procurements.sms_subject_schedules x USING t
 WHERE x.subject_id=t.subject_id AND x.section_id=t.section_id AND x.school_year=t.school_year AND x.id<>t.sched_id;
UPDATE procurements.sms_subject_schedules SET grading_periods='{1,2}' WHERE id=(SELECT sched_id FROM t);
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods, conflict_override)
SELECT subject_id, section_id, teacher_b, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3}', true FROM t;
SELECT g.grading_period, g.assigned_teachers
  FROM t, procurements.get_grade_encoding_status(t.school_id, t.school_year, 3) g
 WHERE g.subject_id=t.subject_id AND g.section_id=t.section_id ORDER BY 1;
ROLLBACK TO a;

\echo [8] unpost guard: B may unpost a period-3 record, not a period-1 one
SAVEPOINT a;
UPDATE procurements.sms_subject_schedules SET grading_periods='{1,2}' WHERE id=(SELECT sched_id FROM t);
INSERT INTO procurements.sms_subject_schedules (subject_id, section_id, teacher_id, room_id, days_of_week, start_time, end_time, school_year, school_id, grading_periods, conflict_override)
SELECT subject_id, section_id, teacher_b, room_id, days_of_week, start_time, end_time, school_year, school_id, '{3}', true FROM t;
INSERT INTO procurements.sms_class_records (subject_id, section_id, grading_period, school_year, teacher_id, school_id)
SELECT subject_id, section_id, p, school_year, teacher_a, school_id FROM t, (VALUES (1),(3)) v(p)
ON CONFLICT DO NOTHING;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_id FROM procurements.sms_users WHERE id=(SELECT teacher_b FROM t)), 'role','authenticated')::text, true);
SAVEPOINT b;
SELECT 'ok-8a' AS result, procurements.unpost_class_record_grades(cr.id) FROM procurements.sms_class_records cr, t
 WHERE cr.subject_id=t.subject_id AND cr.section_id=t.section_id AND cr.school_year=t.school_year AND cr.grading_period=3;
ROLLBACK TO b;
SELECT procurements.unpost_class_record_grades(cr.id) FROM procurements.sms_class_records cr, t
 WHERE cr.subject_id=t.subject_id AND cr.section_id=t.section_id AND cr.school_year=t.school_year AND cr.grading_period=1; -- expect ERROR Only the teacher
ROLLBACK TO a;
ROLLBACK;
```

If `sms_class_records` needs more NOT NULL columns on the clone, read them with `\d procurements.sms_class_records` and add them to the INSERT in [8]. If teacher_b has no `user_id`, pick one that does (`AND u.user_id IS NOT NULL`).

- [ ] **Step 2: Run to verify it fails**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/198_schedule_terms.sql`
Expected: every case errors with `column "grading_periods" does not exist`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/198_schedule_terms.sql`

Header (write it out in full, in the repo's migration-header style): what/why from the spec's "Why"; NULL = whole year and nothing backfilled so nothing moves; the two rules and their TS twin `lib/utils/scheduleTerms.ts`; the DROP of the 8-arg `check_schedule_conflicts` and why it is safe; read-only pre-apply checks:

```sql
-- Pre-apply (read-only): nothing but the trigger function may call the 8-arg version.
--   SELECT p.oid::regprocedure FROM pg_proc p
--    WHERE p.prosrc ILIKE '%check_schedule_conflicts(%' AND p.proname <> 'check_schedule_conflicts';
--   -- expect exactly: check_schedule_conflicts_trigger()
-- Rows touched: 0 (DDL only).
```

Body, in order:

```sql
-- 1. Column
ALTER TABLE procurements.sms_subject_schedules
  ADD COLUMN IF NOT EXISTS grading_periods SMALLINT[];

ALTER TABLE procurements.sms_subject_schedules
  DROP CONSTRAINT IF EXISTS sms_subject_schedules_grading_periods_check;
ALTER TABLE procurements.sms_subject_schedules
  ADD CONSTRAINT sms_subject_schedules_grading_periods_check
  CHECK (grading_periods IS NULL
         OR (cardinality(grading_periods) > 0
             AND grading_periods <@ ARRAY[1,2,3,4]::SMALLINT[]));

COMMENT ON COLUMN procurements.sms_subject_schedules.grading_periods IS
  'Grading periods this time block applies to; NULL = the whole school year (migration 198).';
```

`-- 2.` `DROP FUNCTION IF EXISTS public.check_schedule_conflicts(bigint, bigint, bigint, integer[], time without time zone, time without time zone, text, bigint);` then `CREATE FUNCTION public.check_schedule_conflicts(...)` = the live definition with these edits only:
- signature gains a 9th parameter `p_grading_periods smallint[] DEFAULT NULL::smallint[]` after `p_id`;
- each of the three scans (room; teacher — the `FROM procurements.sms_subject_schedules s … WHERE s.teacher_id = p_teacher_id` one; section) gains, beside its `days_overlap` line:
  - room/section scans: `AND (grading_periods IS NULL OR p_grading_periods IS NULL OR grading_periods && p_grading_periods)`
  - teacher scan: `AND (s.grading_periods IS NULL OR p_grading_periods IS NULL OR s.grading_periods && p_grading_periods)`
- keep `STABLE SECURITY DEFINER SET search_path TO 'procurements', 'public'`. Re-grant: `GRANT EXECUTE ON FUNCTION public.check_schedule_conflicts(bigint, bigint, bigint, integer[], time, time, text, bigint, smallint[]) TO authenticated, service_role;`

`-- 3.` `CREATE OR REPLACE FUNCTION public.check_schedule_conflicts_trigger()` = live definition with the call gaining `NEW.grading_periods` as its 9th argument (after `NEW.id`).

`-- 4.` `CREATE OR REPLACE FUNCTION procurements.unpost_class_record_grades(p_class_record_id bigint)` = live definition with the schedule `EXISTS` gaining:

```sql
            AND (ss.grading_periods IS NULL
                 OR rec.grading_period = ANY (ss.grading_periods))
```

`-- 5.` `CREATE OR REPLACE FUNCTION procurements.get_grade_encoding_status(...)` (same signature and `RETURNS TABLE`) = live definition with:
- the `sched` CTE reduced to the pairs:
  ```sql
  WITH sched AS (
    SELECT DISTINCT ss.subject_id, ss.section_id
    FROM procurements.sms_subject_schedules ss
    WHERE ss.school_id = p_school_id
      AND ss.school_year = p_school_year
  ),
  ```
- the `encoded` CTE unchanged (it joins `sched` on the pair);
- in the final SELECT, `s.assigned_teachers` replaced by `t.assigned_teachers`, and after the `CROSS JOIN LATERAL generate_series(...) AS p(period)` add:
  ```sql
  -- The teachers whose rows cover THIS period (198): a subject that passes
  -- from Teacher A (T1-T2) to Teacher B (T3) names B for T3 only.
  CROSS JOIN LATERAL (
    SELECT COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT u.name), NULL), ARRAY[]::TEXT[])
             AS assigned_teachers
    FROM procurements.sms_subject_schedules ss
    LEFT JOIN procurements.sms_users u ON u.id = ss.teacher_id
    WHERE ss.school_id = p_school_id
      AND ss.school_year = p_school_year
      AND ss.subject_id = s.subject_id
      AND ss.section_id = s.section_id
      AND (ss.grading_periods IS NULL OR p.period = ANY (ss.grading_periods))
  ) t
  ```

- [ ] **Step 4: Apply locally and run the test**

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/migrations/198_schedule_terms.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/198_schedule_terms.sql 2>&1 | grep -E "^\[|ERROR|ok-|^ +[0-9] \|"
```

Expected: [1] two check-constraint ERRORs (`{}`, `{5}`) only; [2] `ok-2`; [3] ERROR `Schedule conflict detected`; [4] `ok-4`; [5] `ok-5`; [6] ERROR `Schedule conflict detected` on the final UPDATE; [7] periods 1,2 list A only and period 3 lists B only; [8] `ok-8a` then ERROR `Only the teacher of this class record`.
Also run the pre-apply dependency query from the header; expect only `check_schedule_conflicts_trigger()`.

- [ ] **Step 5: Re-apply to prove idempotence** — run the migration a second time; expect no error.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/198_schedule_terms.sql supabase/tests/198_schedule_terms.sql
git commit -m "feat(schedules): grading_periods on subject schedules (migration 198)"
```

---

### Task 3: Client conflict check honours terms

**Files:**
- Modify: `lib/utils/scheduleConflicts.ts` (`checkScheduleConflicts` parameter type and loop)
- Test: `lib/utils/__tests__/scheduleConflicts.test.ts`

**Interfaces:**
- Consumes: `scheduleTermsOverlap` (Task 1).
- Produces: `checkScheduleConflicts(schedule: { …existing fields…; grading_periods?: number[] | null }, …)` — unchanged otherwise.

- [ ] **Step 1: Add failing tests** to the existing `describe` for `checkScheduleConflicts` (helpers `existing()` / `candidate()` already exist in the file):

```ts
  it("ignores a clash in disjoint terms", () => {
    const result = checkScheduleConflicts(
      candidate({ grading_periods: [3] }),
      [existing({ grading_periods: [1, 2] })],
    );
    expect(result).toEqual([]);
  });

  it("reports a clash when one side is whole year", () => {
    const result = checkScheduleConflicts(
      candidate({ grading_periods: [3] }),
      [existing({ grading_periods: null })],
    );
    expect(result.map((c) => c.type)).toContain("room");
  });

  it("reports a clash in overlapping terms", () => {
    const result = checkScheduleConflicts(
      candidate({ grading_periods: [2, 3] }),
      [existing({ grading_periods: [1, 2] })],
    );
    expect(result.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run** `npx vitest run lib/utils/__tests__/scheduleConflicts.test.ts` → the first new test FAILS (a conflict is reported).

- [ ] **Step 3: Implement.** In `checkScheduleConflicts`'s `schedule` parameter type add `grading_periods?: number[] | null;`. Import `scheduleTermsOverlap` from `@/lib/utils/scheduleTerms`. At the top of the `for (const existing of sameYearSchedules)` loop, before the days check:

```ts
    // 0. Rows in different terms never meet (migration 198)
    if (!scheduleTermsOverlap(schedule.grading_periods, existing.grading_periods)) {
      continue;
    }
```

Add one line to the function's doc comment: `Rows whose grading periods do not overlap never clash (migration 198).`

- [ ] **Step 4: Run** the test file → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/scheduleConflicts.ts lib/utils/__tests__/scheduleConflicts.test.ts
git commit -m "feat(schedules): client conflict check skips disjoint terms"
```

---

### Task 4: Entering terms; badges; duplicates

**Files:**
- Create: `components/ScheduleTermsBadge.tsx`
- Modify: `app/(protected)/schedules/AddModal.tsx` (sections select ~L391, `FormSchema` L126, edit reset ~L447, add reset ~L474, `detectConflicts` call ~L539, `rowFor` ~L634, markup after the Teacher field ~L960)
- Modify: `app/(protected)/schedules/DuplicateModal.tsx` (~L227 conflict input, ~L267 row)
- Modify: `app/(protected)/sections/DuplicateModal.tsx` (~L285 row)
- Modify badge sites: `app/(protected)/sections/ViewSubjectsModal.tsx:525`, `app/(protected)/sections/List.tsx:416`, `app/(protected)/schedules/List.tsx:149`, `app/(protected)/teacher/sections/[id]/page.tsx:1274`

**Interfaces:**
- Consumes: `normaliseScheduleTerms`, `formatScheduleTerms` (Task 1); `checkScheduleConflicts` with `grading_periods` (Task 3); `getGradingPeriodsForSection`.
- Produces: `<ScheduleTermsBadge terms={number[] | null | undefined} schoolYear={string} shsCurriculum?={string | null} />` — renders nothing for whole year.

- [ ] **Step 1: Badge** — `components/ScheduleTermsBadge.tsx`

```tsx
"use client";

import { cn } from "@/lib/utils";
import { formatScheduleTerms } from "@/lib/utils/scheduleTerms";
import { getGradingPeriodsForSection } from "@/lib/utils/schoolYear";

interface ScheduleTermsBadgeProps {
  terms: number[] | null | undefined;
  schoolYear: string;
  shsCurriculum?: string | null;
  className?: string;
}

/** "T3 only" / "T1–T2" on a part-year schedule (migration 198); nothing for the whole year. */
export const ScheduleTermsBadge = ({
  terms,
  schoolYear,
  shsCurriculum,
  className,
}: ScheduleTermsBadgeProps) => {
  const label = formatScheduleTerms(
    terms,
    getGradingPeriodsForSection(schoolYear, shsCurriculum),
  );
  if (!label) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800",
        className,
      )}
    >
      {label}
    </span>
  );
};
```

- [ ] **Step 2: AddModal — data.**
  - Sections query: select `"id, name, grade_level, section_type, shs_curriculum"`; add `shs_curriculum: string | null;` to the `sections` state type.
  - `FormSchema`: add `grading_periods: z.array(z.number()),` (form holds the ticked list; `[]` = whole year).
  - `LooseValues`: add `grading_periods?: (number | undefined)[];`.
  - Edit reset: `grading_periods: editData.grading_periods ?? [],`. Add reset: `grading_periods: [],`.
  - Derive the section's periods:
    ```ts
    const selectedSectionId = form.watch("section_id");
    const selectedSection = sections.find((s) => String(s.id) === selectedSectionId);
    const sectionPeriods = getGradingPeriodsForSection(
      form.watch("school_year") || getCurrentSchoolYear(),
      selectedSection?.shs_curriculum,
    );
    const termsFor = (values: { grading_periods?: (number | undefined)[] }) =>
      normaliseScheduleTerms(
        (values.grading_periods ?? []).filter((p): p is number => p != null),
        sectionPeriods.map((p) => p.value),
      );
    ```
  - `detectConflicts`: pass `grading_periods: termsFor(values),` in the object given to `checkScheduleConflicts`; add `sectionPeriods` to the `useCallback` deps.
  - `rowFor`: add `grading_periods: termsFor(data),`.

- [ ] **Step 3: AddModal — markup.** After the Teacher/Room grid (the `</div>` closing the `grid grid-cols-2` that holds `teacher_id`), add:

```tsx
            <FormField
              control={form.control}
              name="grading_periods"
              render={({ field }) => {
                const picked = field.value ?? [];
                const noun =
                  sectionPeriods.length === 3 ? "term" : "quarter";
                return (
                  <FormItem>
                    <FormLabel className="text-sm font-medium capitalize">
                      {noun}s (optional)
                    </FormLabel>
                    <div className="flex flex-wrap gap-4">
                      {sectionPeriods.map((p) => (
                        <label key={p.value} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={picked.includes(p.value)}
                            disabled={isSubmitting}
                            onChange={(e) =>
                              field.onChange(
                                e.target.checked
                                  ? [...picked, p.value]
                                  : picked.filter((v) => v !== p.value),
                              )
                            }
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Leave all unticked for the whole school year. Tick only
                      the {noun}s this teacher handles when the subject changes
                      hands mid-year — schedule the other teacher for the rest.
                    </p>
                  </FormItem>
                );
              }}
            />
```

Import `Checkbox` from `@/components/ui/checkbox` (the project's Checkbox takes `onChange`, as in `GradeSlipModal`), `normaliseScheduleTerms` from `@/lib/utils/scheduleTerms`, `getGradingPeriodsForSection` from `@/lib/utils/schoolYear` (alongside the existing `getCurrentSchoolYear` import).

- [ ] **Step 4: Duplicates.** `schedules/DuplicateModal.tsx`: add `grading_periods: scheduleData.grading_periods ?? null,` to `scheduleDataForConflict` and beside `conflict_override` in the inserted row. `sections/DuplicateModal.tsx`: add `grading_periods: schedule.grading_periods ?? null,` beside `conflict_override`. Confirm each source query selects `*` or add `grading_periods` to its select list.

- [ ] **Step 5: Badges.** At each site listed in **Files**, beside `<TemporaryScheduleBadge />` (outside its conditional), render `<ScheduleTermsBadge terms={<row>.grading_periods} schoolYear={<row>.school_year} shsCurriculum={<section's shs_curriculum if in scope, else omit>} />`, where `<row>` is the schedule variable already used at that site. If a site's query lists columns explicitly, add `grading_periods` to it.

- [ ] **Step 6: Verify.** `npx tsc --noEmit -p .` and `npx eslint` on every touched file → clean. Then run the app against local (`npm run dev` — `.env.development.local` must exist; stop if it does not) and, as a school head on the local clone: create Science/section X/MWF 8–9/Teacher A with T1+T2 ticked; create the same slot with Teacher B and T3 → saves with no conflict warning; change B to T2+T3 → conflict warning appears; tick all three → saves as whole year (badge disappears). Both rows show their badges in Manage Schedules and `/schedules`.

- [ ] **Step 7: Commit**

```bash
git add components/ScheduleTermsBadge.tsx "app/(protected)/schedules" "app/(protected)/sections" "app/(protected)/teacher/sections/[id]/page.tsx"
git commit -m "feat(schedules): pick terms on a schedule; term badges; duplicates carry terms"
```

---

### Task 5: Grade entry per period

**Files:**
- Modify: `app/(protected)/teacher/components/TeacherGradeEntryTable.tsx` (`validateAssignment` ~L145, state ~L97, save ~L400–445, cell `disabled` ~L804, header cells)

**Interfaces:**
- Consumes: `scheduleCoversPeriod` (Task 1).
- Produces: nothing new outward.

- [ ] **Step 1: Assignment returns the editable periods.** Add state `const [editablePeriods, setEditablePeriods] = useState<Set<number>>(new Set());`. Rewrite `validateAssignment` to return `Set<number>` (empty = not assigned):

```ts
  // Which periods this teacher may encode (migration 198): every period when
  // they advise the section or hold a whole-year row, else only the periods
  // their part-year rows cover. Empty = not assigned at all.
  const validateAssignment = async (): Promise<Set<number>> => {
    const all = new Set(gradingPeriods.map((p) => p.value));
    if (!sectionId || !subjectId || !teacherId || !schoolYear) return new Set();

    const { data: adviser } = await supabase
      .from("sms_sections")
      .select("id")
      .eq("id", sectionId)
      .eq("section_adviser_id", teacherId)
      .eq("school_year", schoolYear)
      .maybeSingle();
    if (adviser) return all;

    const { data: rows } = await supabase
      .from("sms_subject_schedules")
      .select("grading_periods")
      .eq("teacher_id", teacherId)
      .eq("subject_id", subjectId)
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear);

    return new Set(
      [...all].filter((p) =>
        (rows ?? []).some((r) =>
          scheduleCoversPeriod(r.grading_periods as number[] | null, p),
        ),
      ),
    );
  };
```

In `loadData`: `const periods = await validateAssignment(); … setEditablePeriods(periods); setIsValidAssignment(periods.size > 0);` and `if (periods.size > 0) await fetchStudents();`. Make sure `gradingPeriods` is defined above `validateAssignment` (move the declaration up if needed).

- [ ] **Step 2: Cells.** In the cell `disabled` expression add `|| !editablePeriods.has(value)`. In the header cell for each period, when `!editablePeriods.has(value)`, append ` (view)` in a muted span so the read-only column is explained.

- [ ] **Step 3: Save only editable periods.** In `handleSave`:
  - `gradingPeriods.forEach(...)` → iterate `gradingPeriods.filter((p) => editablePeriods.has(p.value))`;
  - the DELETE gains `.in("grading_period", [...editablePeriods])`.
  Add a comment: `// Only the periods this teacher handles: another teacher's term is theirs to save (198).`

- [ ] **Step 4: Verify.** tsc + eslint clean. On the local app, sign in as Teacher B (T3 row only, pre-2026 SY so the screen is editable, e.g. a quarter year with Q4) — Q1–Q3 inputs disabled with "(view)", Q4 editable; save; in psql confirm Q1–Q3 `sms_grades` rows for that subject/section keep their original `teacher_id` and grade.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/teacher/components/TeacherGradeEntryTable.tsx"
git commit -m "feat(grades): a part-year teacher encodes only their own terms"
```

---

### Task 6: Class record view-only outside the teacher's terms

**Files:**
- Modify: `app/(protected)/teacher/class-record/components/ClassRecordTable.tsx` (props destructure L166, `validateAssignment` L238–265, `ensureRecord` L340, banners ~L1373)

**Interfaces:**
- Consumes: `scheduleCoversPeriod`.

- [ ] **Step 1: Split the prop from the effective flag.** Rename the destructured prop to `readOnly: readOnlyProp = false`; add state `const [termViewOnly, setTermViewOnly] = useState(false);` and `const readOnly = readOnlyProp || termViewOnly;` directly below (so every existing `readOnly` use — `locked`, `ensureRecord`'s no-create, the toolbar — applies).

- [ ] **Step 2: Validation per term.** In `validateAssignment`, the bypass uses `readOnlyProp` (not `readOnly`, which would latch). Replace the schedule query with one selecting `grading_periods` for all the teacher's rows (no `.limit(1)`), then:

```ts
    if (rows && rows.length > 0) {
      // Assigned, but maybe not in this term (198): view, don't edit.
      setTermViewOnly(
        !rows.some((r) => scheduleCoversPeriod(r.grading_periods as number[] | null, term)),
      );
      return true;
    }
```

Before the adviser check add `setTermViewOnly(false);` (advisers edit every term). Add `term` and `readOnlyProp` to the `useCallback` deps (replacing `readOnly`).

- [ ] **Step 3: Banner.** Beside the existing `locked && !readOnly` banner add:

```tsx
          {termViewOnly && !readOnlyProp && (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
              You are not scheduled for this subject in this term, so its class
              record is view-only. The teacher scheduled for it encodes and posts it.
            </div>
          )}
```

- [ ] **Step 4: Verify.** tsc + eslint. On local as Teacher B (T3 only) open the class record: T3 editable; switch to T1 → view-only banner, no inputs, and in psql no new `sms_class_records` row was created for T1 if none existed.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/teacher/class-record/components/ClassRecordTable.tsx"
git commit -m "feat(class-record): view-only outside the teacher's scheduled terms"
```

---

### Task 7: Teaching Load and Subjects Handled by term

**Files:**
- Modify: `lib/utils/teachingLoad.ts` (`fetchTeacherLoads`)
- Modify: `lib/utils/subjectsHandled.ts` (`fetchSubjectsHandled`, `SubjectHandledRow`)
- Modify: `app/(protected)/school-reports/components/ReportFilters.tsx`
- Modify: `app/(protected)/school-reports/teaching-load/page.tsx`, `app/(protected)/school-reports/subjects-handled/page.tsx`, `lib/pdf/generateSubjectsHandled.ts:35`
- Modify: `components/dashboards/SchoolDashboard.tsx:312` (no change needed if the default is used — verify)

**Interfaces:**
- Produces: `fetchTeacherLoads(schoolId, schoolYear, gradingPeriod = 1)`; `fetchSubjectsHandled(schoolId, schoolYear, gradingPeriod = 1)`; `SubjectHandledRow.termsLabel: string`; `ReportFilters` optional props `period?: number; onPeriodChange?: (p: number) => void`.

- [ ] **Step 1: `fetchTeacherLoads`.** Add parameter `gradingPeriod = 1`; select `grading_periods` too; inside `schedules?.forEach` after the Temporary check: `if (!scheduleCoversPeriod(sch.grading_periods as number[] | null, gradingPeriod)) return;`. Doc line: `Counts the rows that apply in \`gradingPeriod\` (198) — a teacher who swapped one class for another mid-year is not carrying both.`

- [ ] **Step 2: `fetchSubjectsHandled`.** Same parameter and filter; select `grading_periods` and add it to `ScheduleQueryRow`; add `termsLabel: string` to `SubjectHandledRow`, set with `formatScheduleTerms(sch.grading_periods, getGradingPeriods(schoolYear))`.

- [ ] **Step 3: `ReportFilters`.** Add the optional props; when `onPeriodChange` is given render, after School Year:

```tsx
      {onPeriodChange && (
        <div className="space-y-1.5 w-full sm:w-40">
          <Label className="text-xs text-muted-foreground">
            {getGradingPeriodType(schoolYear) === "term" ? "Term" : "Quarter"}
          </Label>
          <Select value={String(period ?? 1)} onValueChange={(v) => onPeriodChange(Number(v))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getGradingPeriods(schoolYear).map((p) => (
                <SelectItem key={p.value} value={String(p.value)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
```

- [ ] **Step 4: Pages.** In both report pages add `const [period, setPeriod] = useState(1);`, pass it to the fetcher and its effect deps, pass `period` / `onPeriodChange={setPeriod}` to `ReportFilters`, reset to 1 when the school year changes, and put the period label in the shell `description` (e.g. `SY 2026-2027 · 1st Term — daily teaching minutes per teacher`). Subjects Handled page and PDF: render `{r.subjectName}` followed by the terms label when non-empty (page: a `ScheduleTermsBadge`-styled span or plain ` (T1–T2)`; PDF: `${esc(r.subjectName)}${r.termsLabel ? ` (${esc(r.termsLabel)})` : ""}`). Pass the period label into the PDF generator's title if it takes a description.

- [ ] **Step 5: Dashboard.** Confirm `SchoolDashboard` calls `fetchTeacherLoads(schoolId, schoolYear)` and so gets period 1; add a one-line comment there saying so.

- [ ] **Step 6: Verify.** tsc + eslint + `npx vitest run`. On local: Teacher A (T1–T2) and B (T3) — Teaching Load at Term 1 shows A's minutes and not B's; Term 3 the reverse. Subjects Handled likewise, with the term label.

- [ ] **Step 7: Commit**

```bash
git add lib/utils/teachingLoad.ts lib/utils/subjectsHandled.ts lib/pdf/generateSubjectsHandled.ts "app/(protected)/school-reports" components/dashboards/SchoolDashboard.tsx
git commit -m "feat(reports): teaching load and subjects handled by term"
```

---

### Task 8: Documentation and full verification

**Files:**
- Modify: `CLAUDE.md` (Notable Recent Migrations table; Key Features "Schedules" row)

- [ ] **Step 1: CLAUDE.md.** Add a **198** row after 197, in the table's style: column + CHECK, NULL = whole year and nothing backfilled, the two rules and their TS twin, `check_schedule_conflicts` DROP-and-recreate (9 args) and why it is safe, trigger / unpost / `get_grade_encoding_status` changes, app-layer grade access per period (save scoped to own periods), class record view-only, Teaching Load / Subjects Handled period selector defaulting to the first period. In the Key Features "Schedules" row append one sentence: a block may apply to some grading periods only (`grading_periods`, 198).

- [ ] **Step 2: Full checks.** `npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run` (expect all pass), and re-run `supabase/tests/198_schedule_terms.sql` with the expectations from Task 2 Step 4.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: migration 198 — subject schedules by term"
```

Do **not** push or apply to production: hand the user `supabase/migrations/198_schedule_terms.sql` with what it changes (one column, one CHECK, four functions; 0 rows touched) and the pre-apply dependency query.
