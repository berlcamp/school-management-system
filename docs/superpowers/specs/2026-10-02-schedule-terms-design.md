# Subject schedules by term (migration 198)

**Status:** approved in conversation 2026-10-02, spec awaiting review
**Migration number:** 198 (195 is reserved for the division question bank; 196/197 are applied)

## Why

A subject in a section can change hands mid-year — Teacher A handles Science 5-Rizal in Terms 1-2,
Teacher B takes it in Term 3. `sms_subject_schedules` has no notion of a term: one row is one time
block for the whole school year, so the only workaround is scheduling both teachers for the whole
year (6 subject/section pairs on the local clone already carry two teachers). That makes both of them
"the teacher" everywhere: both may encode every term, both appear in Grade Monitoring for every term,
and both carry the load in Teaching Load all year.

## Decisions (made with the user)

1. **Tick one or more terms per schedule** — not a single-term dropdown. None ticked = whole year.
2. **A teacher encodes only the terms their schedule covers**, and can still *view* every term. The
   section adviser is unchanged (adviser access is not schedule-based).
3. Same subject + section with **overlapping** terms and different teachers stays legal — that is team
   teaching, which schools already do.
4. Teaching Load gets a Term selector that **defaults to Term 1** (nothing maps today's date to a
   term).

## Data

```sql
ALTER TABLE procurements.sms_subject_schedules
  ADD COLUMN IF NOT EXISTS grading_periods SMALLINT[];
-- NULL = whole school year.
ALTER TABLE ... ADD CONSTRAINT sms_subject_schedules_grading_periods_check
  CHECK (grading_periods IS NULL
         OR (cardinality(grading_periods) > 0 AND grading_periods <@ ARRAY[1,2,3,4]::SMALLINT[]));
```

- Values are **grading periods**, so the same column serves terms (1-3, SY 2026-2027 on), quarters
  (1-4, earlier years) and old-curriculum SHS's four semestral quarters (189). Labels come from
  `getGradingPeriodsForSection()`, the helper grade entry already uses — "Term" or "Quarter".
- **Nothing is backfilled.** Every existing row stays NULL = whole year, so nothing moves on apply.
- The app normalises: all periods ticked → NULL; values sorted and de-duplicated.
- The CHECK does not know how many periods a school year has (3 vs 4); the app offers only the
  section's periods. A stray `4` on a term-based year simply never matches a period.

One shared rule, written once per language:

- **covers(row, p)** = `grading_periods IS NULL OR p = ANY(grading_periods)`
- **overlap(a, b)** = either is NULL, or the arrays share an element (`&&`)

TS: `lib/utils/scheduleTerms.ts` (`scheduleCoversPeriod`, `scheduleTermsOverlap`,
`normaliseScheduleTerms`, `formatScheduleTerms` → "T3 only" / "T1–T2" / "" for whole year).
SQL: inline expressions (no helper function — two one-liners do not earn a dependency).

## Entering it

- **Add/Edit Schedule modal** (`schedules/AddModal.tsx`) and the section's **Manage Schedules**
  (`sections/ViewSubjectsModal.tsx`): a "Term" (or "Quarter") checkbox row under Teacher; applies to
  every time block saved together. Editing a row shows its terms.
- **Both Duplicate modals** (`schedules/DuplicateModal.tsx`, `sections/DuplicateModal.tsx`) copy
  `grading_periods` forward, as they copy 124's `conflict_override`.
- **Lists** (`schedules/page.tsx`, Manage Schedules, `sections/List.tsx` where teachers show): a small
  badge from `formatScheduleTerms` beside the teacher on part-year rows.

## Conflicts

`check_schedule_conflicts` gains `p_grading_periods SMALLINT[] DEFAULT NULL`; each of its room /
teacher / section scans adds `AND (s.grading_periods IS NULL OR p_grading_periods IS NULL OR
s.grading_periods && p_grading_periods)`. The client does not call this function (only
`check_schedule_conflicts_trigger` does), so the 8-argument version is **dropped and re-created** with
9 arguments, and the trigger function is replaced to pass `NEW.grading_periods`. 138's SECURITY
DEFINER + pinned `search_path` and 124's `conflict_override` early return are kept verbatim.
`lib/utils/scheduleConflicts.ts` (the modal's pre-save warning) applies the same overlap rule.

Result: A (T1-T2) and B (T3) in the same room and slot do not clash; A (whole year) and B (T3) do.

## Grade access

A teacher may **encode** period *p* of (subject, section, SY) iff they have a schedule row for it
that covers *p*; otherwise the period is read-only. Advisers keep their current access.

- `TeacherGradeEntryTable.tsx` — the assignment check fetches the teacher's rows' `grading_periods`
  and gates editing per period (today: one boolean for all periods).
- `teacher/grades/page.tsx`, `teacher/class-record/page.tsx` — subject pickers still list a subject
  if any row covers any period (unchanged query; nothing to hide).
- `ClassRecordTable.tsx` — a class record is per grading period, so its assignment check uses
  `covers(row, record.grading_period)`.
- `unpost_class_record_grades` (192) — the scheduled-teacher branch of its guard adds
  `AND (ss.grading_periods IS NULL OR rec.grading_period = ANY(ss.grading_periods))`.
  `post_class_record_grades` has no schedule check and is not touched.

Grades RLS is app-layer (invariant 2) and stays so — no policy changes.

## Places that name the teacher

| Consumer | Change |
|---|---|
| `get_grade_encoding_status` (107/179/191) | `assigned_teachers` computed **per period**: the `sched` CTE keeps the rows, and the final select aggregates the teachers whose rows cover `p.period`. `RETURNS TABLE` unchanged → `CREATE OR REPLACE`. |
| Teaching Load (`lib/utils/teachingLoad.ts`, `school-reports/teaching-load`, `SchoolDashboard`) | Term selector (default the first period); a row counts toward the selected period iff it covers it. Dashboard widget uses the first period too. |
| Subjects Handled (`lib/utils/subjectsHandled.ts`), SF7 (`generateSf7.ts`) | Part-year teachers still listed; show `formatScheduleTerms` beside the subject. SF7's per-day minutes count rows covering the first period, matching Teaching Load's default. |
| Grade Level Teachers (156/157) | No change — "who teaches Grade 5" is answered for the year, so a part-year teacher appears, which is right. |
| Report card, student portal, books, exam roster, calendars (`get_*_schedule`) | No change — they read schedules for the subject list / roster or show the timetable; a part-year block appearing with its badge is correct. |

## Out of scope

- Per-term *time* changes beyond what separate rows already allow (they do: a T3 row may have its own
  days and times).
- Mapping dates to terms (would let Teaching Load default to "now").
- Any change to grades RLS.

## Testing (local only)

- `supabase/tests/198_schedule_terms.sql` (one transaction, rolled back): CHECK accepts NULL / {3} /
  {1,2} and rejects {} / {5}; conflict trigger — A{1,2} vs B{3} same room/slot passes, A NULL vs B{3}
  raises, `conflict_override` still exempts; unpost guard — B unposting a T3 record succeeds, a T1
  record is refused; `get_grade_encoding_status` returns B for period 3 and A for periods 1-2 only.
- Vitest: `scheduleTerms` helpers; `scheduleConflicts` overlap with terms.
- Migration header carries the read-only `count(*)` of rows touched (0 — DDL only) and the
  pre-apply check that no other object depends on the 8-arg `check_schedule_conflicts`.
