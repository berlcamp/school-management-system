# Subject schedules by term / semester (migration 222)

**Status:** revised 2026-10-28, awaiting review. Supersedes the 2026-10-02 draft (numbered 198, never
built — 198 went to announcements). The plan `docs/superpowers/plans/2026-10-02-schedule-terms.md`
was written against that draft and must be regenerated from this spec.
**Migration number:** 222 (221 is the latest applied file).

## Why

A subject in a section can change hands — and times — mid-year. Teacher A teaches Science 7-Rizal
Mon/Wed 8–9 in Terms 1–2; Teacher B takes it Tue/Thu 1–2 in Term 3. `sms_subject_schedules` has no
notion of a term: one row is one time block for the whole school year, so the only workaround is
scheduling both teachers for the whole year. That makes both of them "the teacher" everywhere: both
may encode every term, both appear in Grade Monitoring for every term, both carry the load all year,
and the two rooms/slots clash with each other in the conflict check although they never run at once.

The class record is already per term (`UNIQUE (subject_id, section_id, school_year,
grading_period)`, 080) and carries its own `teacher_id`, so it can belong to a different teacher per
term today. What is missing is the schedule saying *which* term each teacher has.

## Decisions (made with the user)

1. **Whole terms only.** A schedule applies to whole grading periods; a mid-term handover (week 6 of
   Term 2) is out of scope. Dates are not modelled.
2. **Tick one or more periods per schedule.** None ticked / all ticked = whole year.
3. **Senior High on the old curriculum picks a semester**, not a term. Strengthened SHS (graded in
   three terms, `lib/constants/shs.ts`) picks terms exactly like K-10.
4. **A teacher encodes only the periods their schedule covers**, and can still *view* every period
   of that subject/section (the new teacher must see Terms 1–2 to read the Final Grade, which needs
   all three — 173). The outgoing teacher keeps full access to their own periods after handover.
   The section adviser is unchanged (adviser access is not schedule-based).
5. Same subject + section with **overlapping** periods and different teachers stays legal — team
   teaching, which schools already do.

## Data

```sql
ALTER TABLE procurements.sms_subject_schedules
  ADD COLUMN IF NOT EXISTS grading_periods SMALLINT[];   -- NULL = whole school year
ALTER TABLE procurements.sms_subject_schedules
  ADD CONSTRAINT sms_subject_schedules_grading_periods_check
  CHECK (grading_periods IS NULL
         OR (cardinality(grading_periods) > 0
             AND grading_periods <@ ARRAY[1,2,3,4]::SMALLINT[]));
```

- Values are **grading periods**, which is what makes one column serve all three calendars:
  terms 1–3 (SY 2026-2027 on, incl. strengthened SHS), quarters 1–4 (earlier years) and old-SHS
  semestral quarters 1–4 (189).
- **A semester is stored as its two periods**, never as a separate value: Semester 1 = `{1,2}`,
  Semester 2 = `{3,4}` (`gradingPeriodsOfSemester()`, already the rule SF10 and the class record's
  Final Grade view read). Nothing downstream needs to know a picker said "semester" — grade access,
  conflicts and reports all ask "does this row cover period *p*", which works identically.
- **NULL default is load-bearing** (153/160 rule): nothing is backfilled, every existing row stays
  whole-year, so nothing moves on apply. Clearing the ticks reverts a row exactly.
- The app normalises before save: every period of the section ticked → NULL; values sorted and
  de-duplicated. The CHECK cannot know a year has 3 or 4 periods; the app offers only the section's
  periods (`getGradingPeriodsForSection()`), so a stray `4` on a term-based year never matches.

One rule, written once per language:

- **covers(row, p)** = `grading_periods IS NULL OR p = ANY(grading_periods)`
- **overlap(a, b)** = either is NULL, or `a && b`

TS: new `lib/utils/scheduleTerms.ts` — `scheduleCoversPeriod`, `scheduleTermsOverlap`,
`normaliseScheduleTerms(periods, sectionPeriods)`, `scheduleTermOptions(schoolYear, shsCurriculum)`
(→ T1/T2/T3, Q1–Q4, or **Sem 1 / Sem 2** for old SHS, each option carrying its period set), and
`formatScheduleTerms` (→ "T3 only", "T1–T2", "2nd Sem", "" for whole year). SQL: the two inline
expressions above, no helper function.

## Entering it

- **Add/Edit Schedule** (`schedules/AddModal.tsx`) and the section's **Manage Schedules**
  (`sections/ViewSubjectsModal.tsx`): an "Applies to" checkbox row under Teacher, labelled from
  `scheduleTermOptions` — `☑ Term 1 ☑ Term 2 ☑ Term 3`, or `☑ 1st Semester ☑ 2nd Semester` on an
  old-SHS section. All ticked by default. Applies to every time block saved together (blocks of one
  save share teacher and terms). Editing a row shows its periods.
- **"Change from Term ___" / "Change from 2nd Semester"** — a row action on part- and whole-year rows
  for the common real case, a teacher reassigned between terms. It opens the Add modal pre-filled
  from the row (subject, section, teacher, room, days, times), with "Applies to" set to the chosen
  period onward, for the user to change teacher/room/time. On save:
  1. narrow the original row(s) to the periods **before** the chosen one;
  2. insert the new row(s) for the chosen period onward.
  Order matters: narrowing first means the conflict trigger does not see the new blocks clash with
  the old ones. If step 2 fails, step 1 is restored to the original value and the error shown — the
  slot is never left uncovered by a half-finished save. All of a subject/section's blocks taught by
  that teacher are narrowed together (offered as a checklist, all ticked), so a Mon/Wed + Fri subject
  does not keep a stray Friday block.
- **Guard on removing a period from a teacher** (edit modal and "Change from"): if
  `sms_class_records` holds a record for (subject, section, SY, that period) whose `teacher_id` is
  the row's teacher and which has **any score** (`sms_class_record_scores`), the save is refused with
  "<Teacher> has already encoded <Term 3>. Move the scores or unpost first." — encoded work never
  silently changes owner. An empty record is fine (see Class record ownership).
- **Both Duplicate modals** (`schedules/DuplicateModal.tsx`, `sections/DuplicateModal.tsx`) copy
  `grading_periods` forward, as they copy 124's `conflict_override`. Duplicating to another school
  year keeps it (term numbering is per year, not per date).
- **Lists** (`schedules/page.tsx`, Manage Schedules, `sections/List.tsx`, teacher's subjects): a small
  badge from `formatScheduleTerms` beside the teacher on part-year rows.
- **Timetable / calendar views** (section, teacher, room): a period selector, defaulting to the
  current period from `sms_school_term_dates` (205) when set for the school year, else the first;
  "Whole year" shows every row with badges. Two rows in one slot for different periods are therefore
  shown one at a time instead of stacked.

## Conflicts

`public.check_schedule_conflicts` (138, SECURITY DEFINER, pinned `search_path`) gains
`p_grading_periods SMALLINT[] DEFAULT NULL`; each of its room / teacher / section scans adds

```sql
AND (s.grading_periods IS NULL OR p_grading_periods IS NULL
     OR s.grading_periods && p_grading_periods)
```

Adding a parameter changes the signature, so the current version is **dropped and re-created**;
`check_schedule_conflicts_trigger` is replaced to pass `NEW.grading_periods`. 138's security
settings, its cross-school message and 124's `conflict_override` early return are copied verbatim
from the **live** definition (pulled from the local clone with `pg_get_functiondef`, not from the
files — 116/157). The header carries the pre-apply check that nothing but the trigger depends on the
old signature. `lib/utils/scheduleConflicts.ts` (the modal's pre-save warning) and the same-save
"blocks overlap each other" hard error apply the same overlap rule.

Result: A{1,2} and B{3} in the same room and slot do not clash; A (whole year) and B{3} do; old-SHS
A{1,2} (Sem 1) and B{3,4} (Sem 2) do not.

## Grade access

A teacher may **encode** period *p* of (subject, section, SY) iff they have a schedule row for it
that covers *p*; otherwise that period is view-only. Advisers keep their current access; super admin
unchanged; school heads stay read-only.

- `TeacherGradeEntryTable.tsx` — the assignment check fetches the teacher's rows' `grading_periods`
  and gates editing **per period** (today one boolean for all periods).
- `teacher/grades/page.tsx`, `teacher/class-record/page.tsx` — the subject pickers list a subject if
  any of the teacher's rows covers any period (unchanged query + `grading_periods` selected); the
  class record's term selector **opens on the first period the teacher covers**, and marks the others
  "view only".
- `ClassRecordTable.tsx` — `canEdit` uses `covers(row, record.grading_period)` instead of "any row".
- `unpost_class_record_grades` (192 → 200): the scheduled-teacher branch of its guard adds
  `AND (ss.grading_periods IS NULL OR rec.grading_period = ANY(ss.grading_periods))`. Body otherwise
  verbatim from 200 (carried grades still never deleted). Same signature → `CREATE OR REPLACE`.
- `post_class_record_grades` has no caller guard and is not touched (it writes `rec.teacher_id`,
  which the ownership rule below keeps right).

Grades RLS is app-layer (invariant 2) and stays so — no policy changes.

## Class record ownership

`ensureRecord` in `ClassRecordTable.tsx` finds a record by (subject, section, SY, period), whoever
created it. If Teacher A opened an empty Term 3 record before the handover, Teacher B would inherit
a record whose `teacher_id` is A — and `post_class_record_grades` stamps `sms_grades.teacher_id`
from it, crediting A for B's grades, while 192's `rec.teacher_id` branch would still let A unpost.

Rule: when a teacher who **covers** the period opens a record whose `teacher_id` does **not** cover
it, and the record has **no scores**, `teacher_id` is reassigned to the opener. With scores it is
left alone (the edit guard above already prevents getting there through the schedule UI) and the
record shows the encoder's name. No new RPC: class-record RLS is `authenticated` (080), so this is a
plain UPDATE from the client, matching how the record is created.

## Places that name the teacher

| Consumer | Change |
|---|---|
| `get_grade_encoding_status` (191) | `assigned_teachers` and "expected" computed **per period**: a period's teachers are those whose rows cover it. `RETURNS TABLE` unchanged → `CREATE OR REPLACE`, body otherwise verbatim from live. |
| Teaching Load (`lib/utils/teachingLoad.ts`, `school-reports/teaching-load`, `SchoolDashboard`) | Period selector (default: current period per 205, else first); a row counts iff it covers that period. |
| Subjects Handled (`lib/utils/subjectsHandled.ts`, page, `generateSubjectsHandled.ts`) | Same selector, so the weekly total never adds a T1 class to the T3 class that replaced it; each row prints its terms label. |
| SF7 (`generateSf7.ts`) | Lists the periods beside a part-year assignment; no minutes are computed, so no other change. |
| Grade Level Teachers (156/157) | No change — answered for the year; a part-year teacher appears, which is right. |
| Designee scopes (`scheduleEditScope.ts`, 216/217 triggers) | GLC may change `grading_periods`? **No** — the GLC column guard admits teacher + `conflict_override` only; a reassignment by term is a Department Head / school head action. DH guard unchanged (they edit their subjects' schedules wholesale). |
| Report card, SF9, student portal, books, exam roster | No change — they read schedules for the subject list / roster, which is per year. |

## Out of scope

- Mid-term handovers (decision 1) and date-based schedules.
- Moving already-encoded scores between teachers.
- Any change to grades or class-record RLS.

## Testing (local only)

- `supabase/tests/222_schedule_terms.sql` (one transaction, rolled back): CHECK accepts NULL / {3} /
  {1,2} / {3,4} and rejects {} / {5}; conflict trigger — A{1,2} vs B{3} same room/slot passes,
  A NULL vs B{3} raises, old-SHS {1,2} vs {3,4} passes, `conflict_override` still exempts, cross-school
  teacher message intact; unpost guard — B unposts a T3 record, is refused on T1; A refused on T3;
  `get_grade_encoding_status` returns B for period 3 and A for 1–2 only.
- Vitest: `scheduleTerms` helpers (incl. semester ↔ periods, normalise all-ticked → NULL),
  `scheduleConflicts` overlap with terms.
- Manual on the local clone: run the "Change from Term 3" flow end to end — narrow + insert,
  forced insert failure restores the original, refusal when A has T3 scores, B's first open of A's
  empty T3 record takes ownership, B's posted grades carry B's `teacher_id`.
- Migration header: rows touched (0 — DDL + function replacements only) and the dependency check on
  the old `check_schedule_conflicts` signature.
