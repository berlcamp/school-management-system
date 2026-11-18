# Senior High subjects offered in some terms only — design

## Intent

Under the term-based Senior High curriculum (Grades 11–12, SY 2026-2027 onward, three terms), a
section carries **full-year subjects** (e.g. core subjects, Terms 1–3) **beside single-term
subjects** (e.g. an elective in Term 1 only, another in Term 2 only). For a single-term subject,
**that term's grade is the subject's final grade** — there is no other term to wait for.

Today the system cannot say this. The report card / SF9 requires all three terms before printing a
final grade (migration 173), so a single-term subject never gets one and silently falls out of the
general average.

**The term is a property of the subject *in a section*, not of the subject.** The owner confirmed
the same subject can sit in different terms in different sections (Physics in Term 1 for STEM-A,
Term 2 for STEM-B), and one section mixes full-year and single-term subjects.

## Goals

- In a section's **Manage Schedules**, each subject can be marked **Offered in: Whole year / Term 1
  / Term 2 / Term 3** (any non-empty subset of the year's terms; whole year is the default).
- **Report card / SF9, Grade Slip, Grades Matrix:** a subject's final grade is the mean of the terms
  it is offered in, printed once all of those terms are encoded. A Term 1-only subject's final is
  its Term 1 grade. It counts **once** in the general average, like any other subject.
- **Promotion GPA (`students_gpa_for_grade`)** weighs a single-term subject the same as the card's
  general average does.
- **Grade Monitoring** stops expecting grades for a subject in terms it is not offered.
- **Schedules** for that subject in that section are kept inside its offered terms.

## Non-goals

- K–10, and Grade 11–12 sections on the **old (semestral) curriculum** (`shs_curriculum = 'old'`,
  migration 189) — semester blocks already handle those. The setting is not shown there.
- Quarter-based school years (before SY 2026-2027).
- SF10 and Form 137 — archival forms, deliberately untouched, as 153/155/174 left them.
- A per-subject (school-wide) default term. Each section is set on its own.

## Anti-goals (a failure even if it "works")

- A final grade printing **early** — from fewer terms than the subject is actually offered in.
- Treating a **teacher hand-over** (223's `grading_periods` on a schedule row) as an offering. The
  two are different facts and must never be derived from each other.
- Any change for a section or subject nobody has set: **no row = whole year**, byte-identical
  output to today.

## Approaches considered

- **A. Derive the offering from the schedule rows' `grading_periods` (223).** No new setting. But a
  hand-over with the Term 3 teacher not yet assigned reads as "offered in Terms 1–2", printing a
  final early. Rejected for that reason (anti-goal 1/2).
- **B. An explicit per-section offering, stored separately (chosen by the owner).** One more setting
  for the registrar, unambiguous, and nothing changes until it is used.
- C. A flag on each schedule row. A subject has several rows (one per time block); the flag would
  be duplicated and could disagree with itself. Not pursued.

## Design (decided)

### Data — migration 235

New table `procurements.sms_section_subject_terms`:

| column | type | notes |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `section_id` | BIGINT NOT NULL → `sms_sections(id)` ON DELETE CASCADE | |
| `subject_id` | BIGINT NOT NULL → `sms_subjects(id)` ON DELETE CASCADE | |
| `school_year` | TEXT NOT NULL | the section's school year |
| `terms` | SMALLINT[] NOT NULL | CHECK: non-empty, every element 1–3, no duplicates |
| `created_at`, `updated_at`, `updated_by` | | as the other tables |

- `UNIQUE (section_id, subject_id, school_year)`.
- **No row = offered the whole year.** A row whose `terms` is `{1,2,3}` is normalised away by the app
  (deleted), so "whole year" has one representation.
- Rows only for Grade 11–12 sections whose `shs_curriculum` is not `'old'`, in term-based school
  years — enforced by a trigger (cross-table, per the 136 lesson), with a readable message.
  *Builder's call (recorded):* there is no SQL helper for "term-based year"; 177 and 189 compare
  `school_year >= '2026-2027'` literally. 235 does the same, and its header names the TS twin
  (`TERM_SYSTEM_START_SY` in `lib/utils/schoolYear.ts`) so a change to one is made to both.
- RLS: SELECT `authenticated`; INSERT/UPDATE/DELETE for exactly the people who may write that
  section's schedules today (the `sms_subject_schedules` write rule as 115/216/217 left it —
  roster roles at the section's school, super admin, and a Department Head for subjects they head).
  *My call:* a **Grade Level Coordinator** does not set offerings — 216 lets a GLC change only a
  schedule's teacher, and an offering rewrites `grading_periods`; the control is hidden for a GLC
  and the policy has no GLC branch. A **Department Head** may, for subjects they head.
- **Schedule consistency trigger** on `sms_subject_schedules` (and on the new table): when an
  offering row exists for (section, subject, school year), every schedule row for that triple must
  have a non-NULL `grading_periods` that is a subset of `terms`. Refuses with a message naming the
  offered terms.
- **Grade guard:** changing an offering so that it drops a term in which grades are already
  encoded (`sms_grades.grade > 0` for that subject, section, school year and period) is refused,
  naming the term. Adding a term is always allowed. *My call:* a carried transfer-in grade (200)
  is a grade like any other here — it also blocks.

### Saving an offering (app, Manage Schedules)

- Each subject heading in the section's Manage Schedules modal gets an **Offered in** control:
  `Whole year · Term 1 · Term 2 · Term 3` (multi-select of terms; "Whole year" = all ticked).
  Shown only where the trigger would accept a row.
- On save, the subject's existing schedule rows in that section are **narrowed** to the offered
  terms in the same operation: a NULL row becomes `terms`; a row with other periods is intersected
  with `terms`; if an intersection would be empty, the save is refused ("this time block only covers
  Term 3; remove it or change it first"). *My call:* the whole save is refused — a schedule row is
  never deleted as a side effect, since a 223 hand-over row may have grades under it. Ordering matters because of the trigger — write the
  schedule rows first, then the offering, or do both in one RPC (builder's call; one RPC preferred,
  SECURITY INVOKER so RLS still applies).
- Setting it back to Whole year deletes the row; schedule rows keep the periods they now have
  (widening them back is the registrar's choice through Edit).
- New schedule rows for an offered subject default their term picker to the offered terms and offer
  no others. The **Change from…** hand-over (223) offers only the offered terms.
- The Duplicate schedule modals copy the offering row to the target section when they copy that
  subject's schedules.

### Final grade, general average (card / SF9, slip, matrix)

- `MapehSourceRow` gains an optional `offeredPeriods?: number[]` (absent = all periods of the year).
  `finalOf` uses it in place of `requirePeriods` for that row: the mean of the offered periods'
  grades, null until every offered period carries a grade. Grades encoded in a non-offered period
  are ignored for the final (they should not exist — the schedule trigger makes them unlikely).
- A grouped parent (MAPEH, EPP/TLE) uses the union of its components' offered periods.
- **General average: blank while any counted row that carries a grade lacks its final.** Without
  this, a Term 1 elective's final would produce a general average at the end of Term 1 from one
  subject. A row nobody has encoded is excluded, exactly as today. *My call:* "carries a grade"
  means a grade in an **offered** period (carried transfer-in grades included, since they sit in the
  ordinary slot); a stray grade in a non-offered period is ignored here as it is for the final, so it
  can never keep the general average blank forever.
- `periodGeneralAverage` is unchanged: a single-term subject contributes to its own term only.
- Cells for non-offered terms print blank.
- The offering rows are read for the **section the card is printed for**. *Verified on the local
  clone:* every strengthened Grade 11 learner (1,620) holds one enrollment for the year (semester 1)
  and none sits in two Grade 11–12 sections, so one section's offering is the learner's offering.
  234 already keeps SHS to its own section.
- *My call — the other final-grade surfaces follow the same rule:* the class record's **Final**
  view (`teacher/class-record/components/FinalGradeView.tsx`, its own `finalOf`) and the **student
  portal** grades page (`computeAverage`, "Final Term Grade"). Otherwise a learner, a teacher and the
  card would show three different finals.

### Promotion GPA — `students_gpa_for_grade` (same migration 235)

For grade levels 11–12 only: average **per subject first** (MAPEH bucket kept as 153), then the mean
across subjects — so a single-term subject weighs the same as a full-year one, matching the card's
general average. *My call:* the GPA joins `sms_section_subject_terms` for the enrollment's section
and ignores grades in non-offered periods, but does **not** wait for a subject to be complete: the
GPA has always averaged whatever is encoded (it places learners mid-process), unlike the card's
final, and changing that is a separate decision. K–10 keeps 234's per-(period, subject) bucket average unchanged. For an SHS learner
whose subjects all have every period encoded, the result is identical to today; it differs only
when subjects carry different numbers of encoded periods — the case this fixes. The header carries
a pre-apply count of SHS learners whose GPA would move.

### Grade Monitoring — `get_grade_encoding_status`

Replaced (same signature, body from 223 plus one predicate): a (subject, section, period) row is
emitted only when there is no offering row or `period = ANY(terms)`.

### Class record

No change expected: a class record is created and edited only by a teacher whose schedule row covers
the term (223), and the trigger keeps schedule rows inside the offering. The builder verifies this
end to end rather than assuming it.

## Constraints

- Local Supabase only; migration 235 is applied to production by the owner (CLAUDE.md Rule 0).
  Replaced function bodies are compared with production first through `supabase-prod-ro` once it is
  connected, else with the clone and the 116/157 caveat stated in the header.
- Migrations additive; `IF NOT EXISTS` guards; no DML beyond none (nothing is backfilled).
- The final-grade rule is written once in TS (`lib/utils/mapeh.ts`) and once in SQL (the GPA); the
  CLAUDE.md row says so.

### Side effects that are intended

Narrowing a subject's schedule rows to its offered terms changes the 223 surfaces that default to
the current period — Teaching Load, Subjects Handled, the calendar, the School Dashboard: a Term 1
elective no longer appears there in Term 2. That is correct (the class does not meet). *My call:*
the builder spot-checks each on the local clone rather than leaving it assumed.

## Left to the builder

- Exact UI of the Offered-in control (chip toggles vs. a select), within the modal's existing style.
- Whether saving is one RPC or ordered client writes (one RPC preferred).
- Test fixtures and the SQL test file `supabase/tests/235_section_subject_terms.sql`.
