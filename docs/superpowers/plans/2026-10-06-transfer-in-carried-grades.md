# Transfer-in Learners & Carried-over Grades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a school mark a learner as transferred in from a school **outside** the system, and let the adviser enter the Term 1 / Term 2 grades from that learner's previous SF9 so the report card, SF9 and Final Grade are complete. The Class Record must never overwrite or delete those grades.

**Architecture:** Migration 200 adds two nullable columns: `sms_enrollments.transfer_in_school_name`, the out-of-system twin of `origin_school_id`, and `sms_grades.carried_from_school` (NULL = graded here; set = copied from that school's SF9). Carried grades live in the ordinary `sms_grades` slot `(student, subject, section, period, school_year)`, so every reader (report card, SF9, FinalGradeView, GPA, grade monitoring) picks them up unchanged. `post_class_record_grades` and `unpost_class_record_grades` are replaced so they skip carried rows. One SECURITY DEFINER RPC, `save_transfer_in_grades`, is the only writer of carried grades. In the UI, the wizard gets a "transferred in from outside the system" checkbox, the section page gets a Transferee badge and a "Transferee Grades" modal, and the Class Record locks a carried learner's row.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Postgres (`procurements` schema), vitest, psql scenario tests on the local clone.

**Spec:** Design agreed in conversation on 2026-10-06; summarised in **Design decisions** below. The executor needs no other document.

## Design decisions (the spec)

1. **Who is a transferee.** `origin_school_id IS NOT NULL` (in-system, migration 066) **or** `transfer_in_school_name IS NOT NULL` (outside the system, this plan). Only the latter is new. The transfer-in date is the enrollment's existing `enrollment_date`; no new date column.
2. **Carried grade marker.** `sms_grades.carried_from_school TEXT NULL`. The NULL default is load-bearing (the 153 rule): every existing row stays "graded here" and nothing moves on apply.
3. **Class Record never touches a carried row.** Posting skips it (`ON CONFLICT … DO UPDATE … WHERE carried_from_school IS NULL`), and unposting deletes only non-carried rows.
4. **Saving a carried grade overwrites** whatever is in that slot, including a computed grade. It is an explicit adviser action on one learner and one term. Clearing a carried cell deletes only the carried row.
5. **Grades are whole numbers 60–100.** That matches the SF9, where the MATATAG floor is 60.
6. **Who may enter them:** the section's adviser, plus `school_head`, `assistant_school_head`, `admin` and `registrar` at the section's school, plus `super admin`. This is enforced in the RPC. **The UI ships only on the adviser's section page**; a registrar screen is a follow-up if wanted.
7. **Not for Kindergarten or Grade 1** (grade_level 0 / 1). Neither has numeric grades (ECCD/KPR, PACE). The RPC refuses them and the menu hides the action.
8. **In-system transferees** can use the same modal. The school name is then read-only (taken from the origin school) and `transfer_in_school_name` stays NULL.

## Global Constraints

- **RULE 0:** all work and all testing on the **local** Supabase only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). Never read `.env.local`. Applying migration 200 to production is the user's job.
- Migrations are immutable and additive: write `supabase/migrations/200_transfer_in_carried_grades.sql`, never edit 080/173/175/192.
- All SMS tables live in schema `procurements`; SQL uses `SET search_path TO procurements, public` in functions.
- TypeScript: no `any`. Use `Number()` when passing string ids to `.eq()` on BIGINT columns.
- Local clone is **behind the migration files**. Before Task 1, `sms_class_records.unposted_at` (migration 192) must exist locally; if it does not, apply `192_unpost_class_record_grades.sql` to local first (Task 1 Step 1).
- No new npm dependency.

## Review Focus

1. **A learner with carried Term 1 grades who later gets a score in the Term 1 class record.** The carried grade must survive the auto-post, and the Class Record row must be locked so the score can't be typed at all. Pinned in Task 1 (SQL) and Task 5 (UI lock).
2. **Unposting a term that contains a carried learner** must leave the carried row. Pinned in Task 1.
3. **A grade typed as "85.5", "59", "101", " " or "abc".** It must be refused client-side with a message, and refused by the RPC if it slips through. Pinned in Task 2 (vitest) and Task 1 (SQL).
4. **A teacher from another school, or a subject teacher who is not the adviser, calling the RPC from the console.** It must be refused. Pinned in Task 1.
5. **A learner with no carried grades.** Class Record, section page and SF1/SF2 must render exactly as before (no badge, no remark, no lock). Pinned in Task 2 (`movementRemark` unchanged-case test) and Task 1 (posting a normal learner still writes).

---

## File Structure

| File | Responsibility |
|---|---|
| Create `supabase/migrations/200_transfer_in_carried_grades.sql` | Two columns, two replaced functions, one new RPC |
| Create `supabase/tests/200_transfer_in_carried_grades.sql` | psql scenario test, one transaction, rolled back |
| Create `lib/utils/transferIn.ts` | Pure helpers: `transferInSchool`, `isTransferee`, `parseCarriedGrade` |
| Create `lib/utils/__tests__/transferIn.test.ts` | vitest for the helpers + `movementRemark` |
| Modify `lib/utils/enrollmentRemarks.ts` | SF1/SF2 remark knows `transfer_in_school_name` |
| Modify `app/(protected)/enrollment/components/enrollmentWizardSchema.ts`, `EnrollmentDetailsStep.tsx`, `EnrollmentWizard.tsx` | Wizard checkbox + school name for a new learner |
| Create `app/(protected)/teacher/components/TransferInGradesModal.tsx` | Subject × period grid for carried grades |
| Modify `app/(protected)/teacher/sections/[id]/page.tsx` | Transferee badge, menu item, mount modal |
| Modify `app/(protected)/teacher/class-record/components/ClassRecordTable.tsx` | Read carried rows, lock that learner's row, exclude from stale/unpost counts |
| Modify `CLAUDE.md` | Migration table row 200 |

---

### Task 1: Migration 200 + SQL scenario test

**Files:**
- Create: `supabase/migrations/200_transfer_in_carried_grades.sql`
- Create: `supabase/tests/200_transfer_in_carried_grades.sql`

**Interfaces:**
- Produces:
  - `sms_enrollments.transfer_in_school_name TEXT NULL` (CHECK non-blank when set)
  - `sms_grades.carried_from_school TEXT NULL` (CHECK non-blank when set)
  - `procurements.save_transfer_in_grades(p_enrollment_id BIGINT, p_school_name TEXT, p_grades JSONB) RETURNS INTEGER`. `p_grades` is a JSON array of `{ "subject_id": number, "grading_period": number, "grade": number | null }`; `grade: null` removes that carried grade. Returns the number of rows written or removed.
  - `post_class_record_grades(BIGINT)` and `unpost_class_record_grades(BIGINT)` keep their signatures.

- [ ] **Step 1: Make sure local has migration 192**

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -At -c \
  "select count(*) from information_schema.columns where table_schema='procurements' and table_name='sms_class_records' and column_name='unposted_at'"
```
If it prints `0`, apply 192 locally:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/migrations/192_unpost_class_record_grades.sql
```
Then run the command above again. Expected: `1`.

- [ ] **Step 2: Write the failing scenario test**

Create `supabase/tests/200_transfer_in_carried_grades.sql`:

```sql
-- Migration 200 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/200_transfer_in_carried_grades.sql
-- Everything runs in one transaction that is rolled back at the end.
\set ON_ERROR_STOP 1
BEGIN;
SET search_path TO procurements, public;

CREATE SCHEMA tst;
GRANT USAGE ON SCHEMA tst TO authenticated;
CREATE TABLE tst.ids (name TEXT PRIMARY KEY, id BIGINT, uid UUID);
GRANT SELECT ON tst.ids TO authenticated;
CREATE FUNCTION tst.id(p TEXT) RETURNS BIGINT LANGUAGE sql STABLE AS
  $$ SELECT id FROM tst.ids WHERE name = p $$;
CREATE FUNCTION tst.uid(p TEXT) RETURNS UUID LANGUAGE sql STABLE AS
  $$ SELECT uid FROM tst.ids WHERE name = p $$;
CREATE FUNCTION tst.claims(p_uid UUID) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION tst.expect_error(p_sql TEXT, p_like TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%' || p_like || '%' THEN
      RAISE NOTICE 'ok  refused: %', SQLERRM;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL expected error like "%" but got "%" for: %', p_like, SQLERRM, p_sql;
  END;
  RAISE EXCEPTION 'FAIL expected error like "%" but it succeeded: %', p_like, p_sql;
END $$;
CREATE FUNCTION tst.expect_count(p_sql TEXT, p_n BIGINT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE c BIGINT;
BEGIN
  EXECUTE p_sql INTO c;
  IF c IS DISTINCT FROM p_n THEN
    RAISE EXCEPTION 'FAIL expected %, got % for: %', p_n, c, p_sql;
  END IF;
  RAISE NOTICE 'ok  = %: %', c, left(p_sql, 80);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tst TO authenticated;

-- --------------------------------------------------------------- fixtures --
INSERT INTO tst.ids (name, uid) VALUES
  ('adv',   '00000000-0000-4000-8000-000000000201'),  -- adviser, school A
  ('subj',  '00000000-0000-4000-8000-000000000202'),  -- subject teacher, school A
  ('reg',   '00000000-0000-4000-8000-000000000203'),  -- registrar, school A
  ('other', '00000000-0000-4000-8000-000000000204');  -- teacher, school B
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@200.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id)
SELECT 'schoolA', min(id) FROM sms_schools
UNION ALL
SELECT 'schoolB', (SELECT id FROM sms_schools ORDER BY id OFFSET 1 LIMIT 1);

WITH u(name, type, school) AS (VALUES
  ('adv', 'teacher', 'schoolA'), ('subj', 'teacher', 'schoolA'),
  ('reg', 'registrar', 'schoolA'), ('other', 'teacher', 'schoolB'))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@200.test', u.type, tst.id(u.school), tst.uid(u.name), true
FROM u;
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;

INSERT INTO sms_sections (name, grade_level, school_year, section_adviser_id, is_active, school_id)
VALUES ('T200', 5, '2026-2027', tst.id('adv'), true, tst.id('schoolA'))
RETURNING id \gset sec_
INSERT INTO tst.ids (name, id) VALUES ('sec', :sec_id);

INSERT INTO sms_sections (name, grade_level, school_year, section_adviser_id, is_active, school_id)
VALUES ('T200-G1', 1, '2026-2027', tst.id('adv'), true, tst.id('schoolA'))
RETURNING id \gset g1_
INSERT INTO tst.ids (name, id) VALUES ('secG1', :g1_id);

INSERT INTO sms_subjects (name, code, school_id)
VALUES ('Mathematics T200', 'MATH-T200', tst.id('schoolA'))
RETURNING id \gset subj_
INSERT INTO tst.ids (name, id) VALUES ('math', :subj_id);
INSERT INTO sms_subjects (name, code, school_id)
VALUES ('Unscheduled T200', 'NOPE-T200', tst.id('schoolA'))
RETURNING id \gset nope_
INSERT INTO tst.ids (name, id) VALUES ('nope', :nope_id);

INSERT INTO sms_subject_schedules (subject_id, section_id, teacher_id, school_year, day_of_week, start_time, end_time, school_id)
VALUES (tst.id('math'), tst.id('sec'), tst.id('subj'), '2026-2027', 1, '08:00', '09:00', tst.id('schoolA'));

-- two learners: P = private-school transferee, N = ordinary learner
WITH s(name, lrn) AS (VALUES ('P', '900000000201'), ('N', '900000000202'))
INSERT INTO sms_students (lrn, first_name, last_name, date_of_birth, gender,
                          parent_guardian_name, parent_guardian_contact, parent_guardian_relationship, school_id)
SELECT s.lrn, s.name, 'T200', '2015-01-01', 'male', 'g', '0', 'parent', tst.id('schoolA') FROM s;
INSERT INTO tst.ids (name, id)
SELECT 'stu' || first_name, id FROM sms_students WHERE last_name = 'T200';

INSERT INTO sms_enrollments (student_id, section_id, school_year, grade_level, enrollment_date,
                             status, enrollment_status, school_id)
SELECT tst.id(n), tst.id('sec'), '2026-2027', 5, '2027-01-10', 'approved', 'active', tst.id('schoolA')
FROM (VALUES ('stuP'), ('stuN')) v(n);
INSERT INTO tst.ids (name, id)
SELECT 'enr' || s.first_name, e.id FROM sms_enrollments e JOIN sms_students s ON s.id = e.student_id
WHERE s.last_name = 'T200';
```

> ⚠ The column lists above are the local clone's. If an INSERT fails on a NOT NULL column the clone has and this file omits (e.g. `sms_subject_schedules.room_id`, `sms_students` address fields), run `\d procurements.<table>` locally and add the missing column with a harmless value. Change only the fixtures, never the assertions.

Then the assertions, appended to the same file:

```sql
-- ----------------------------------------------------------------- columns --
SELECT tst.expect_count($$ SELECT count(*) FROM information_schema.columns
  WHERE table_schema = 'procurements'
    AND ((table_name = 'sms_enrollments' AND column_name = 'transfer_in_school_name')
      OR (table_name = 'sms_grades' AND column_name = 'carried_from_school')) $$, 2);

-- ------------------------------------------------------------------ guard ---
SELECT tst.claims(tst.uid('other'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, 'St. Jude Academy',
  '[{"subject_id": %s, "grading_period": 1, "grade": 88}]') $$, tst.id('enrP'), tst.id('math')),
  'may not');
RESET ROLE;

SELECT tst.claims(tst.uid('subj'));   -- teaches Math here but is not the adviser
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, 'St. Jude Academy',
  '[{"subject_id": %s, "grading_period": 1, "grade": 88}]') $$, tst.id('enrP'), tst.id('math')),
  'may not');
RESET ROLE;

-- -------------------------------------------------------------- validation --
SELECT tst.claims(tst.uid('adv'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, '  ',
  '[{"subject_id": %s, "grading_period": 1, "grade": 88}]') $$, tst.id('enrP'), tst.id('math')),
  'Name the school');
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, 'St. Jude Academy',
  '[{"subject_id": %s, "grading_period": 1, "grade": 59}]') $$, tst.id('enrP'), tst.id('math')),
  'whole number from 60 to 100');
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, 'St. Jude Academy',
  '[{"subject_id": %s, "grading_period": 1, "grade": 85.5}]') $$, tst.id('enrP'), tst.id('math')),
  'whole number from 60 to 100');
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, 'St. Jude Academy',
  '[{"subject_id": %s, "grading_period": 5, "grade": 85}]') $$, tst.id('enrP'), tst.id('math')),
  'grading period');
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, 'St. Jude Academy',
  '[{"subject_id": %s, "grading_period": 1, "grade": 85}]') $$, tst.id('enrP'), tst.id('nope')),
  'not scheduled');

-- ------------------------------------------------------------------- save ---
SELECT tst.expect_count(format($$ SELECT save_transfer_in_grades(%s, ' St. Jude Academy ',
  '[{"subject_id": %s, "grading_period": 1, "grade": 88},
    {"subject_id": %s, "grading_period": 2, "grade": 90}]') $$,
  tst.id('enrP'), tst.id('math'), tst.id('math')), 2);
RESET ROLE;

SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_enrollments
  WHERE id = %s AND transfer_in_school_name = 'St. Jude Academy' $$, tst.id('enrP')), 1);
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_grades
  WHERE student_id = %s AND carried_from_school = 'St. Jude Academy'
    AND remarks = 'Passed' AND teacher_id = %s $$, tst.id('stuP'), tst.id('adv')), 2);

-- registrar at the same school may edit; grade null removes the carried row
SELECT tst.claims(tst.uid('reg'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count(format($$ SELECT save_transfer_in_grades(%s, 'St. Jude Academy',
  '[{"subject_id": %s, "grading_period": 2, "grade": null}]') $$,
  tst.id('enrP'), tst.id('math')), 1);
RESET ROLE;
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_grades WHERE student_id = %s $$,
  tst.id('stuP')), 1);

-- Kindergarten / Grade 1 refused
INSERT INTO sms_enrollments (student_id, section_id, school_year, grade_level, enrollment_date,
                             status, enrollment_status, school_id)
VALUES (tst.id('stuN'), tst.id('secG1'), '2027-2028', 1, '2027-06-10', 'approved', 'active', tst.id('schoolA'))
RETURNING id \gset g1enr_
SELECT tst.claims(tst.uid('adv'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, 'X', '[]') $$, :g1enr_id),
  'Kindergarten and Grade 1');
RESET ROLE;

-- ---------------------------------------------------- class record posting --
INSERT INTO sms_class_records (school_id, teacher_id, subject_id, section_id, school_year, grading_period,
                               ww_weight, pt_weight, st_weight, use_transmutation, is_posted,
                               grading_scheme, form_layout)
VALUES (tst.id('schoolA'), tst.id('subj'), tst.id('math'), tst.id('sec'), '2026-2027', 1,
        20, 50, 30, true, false, 'matatag', 'standard')
RETURNING id \gset cr_
INSERT INTO sms_class_record_items (class_record_id, component, position, max_score, title)
VALUES (:cr_id, 'WW', 1, 10, 'Quiz 1') RETURNING id \gset it_
-- both learners have a score in Term 1 (P's must NOT reach the card)
INSERT INTO sms_class_record_scores (item_id, student_id, raw_score)
VALUES (:it_id, tst.id('stuP'), 2), (:it_id, tst.id('stuN'), 9);

SELECT procurements.post_class_record_grades(:cr_id);
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_grades
  WHERE student_id = %s AND grading_period = 1 AND grade = 88
    AND carried_from_school = 'St. Jude Academy' $$, tst.id('stuP')), 1);
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_grades
  WHERE student_id = %s AND grading_period = 1 AND carried_from_school IS NULL $$,
  tst.id('stuN')), 1);

-- unpost removes N's computed grade but keeps P's carried one
SELECT tst.claims(tst.uid('subj'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count(format($$ SELECT unpost_class_record_grades(%s) $$, :cr_id), 1);
RESET ROLE;
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_grades
  WHERE student_id = %s AND grading_period = 1 $$, tst.id('stuP')), 1);
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_grades
  WHERE student_id = %s AND grading_period = 1 $$, tst.id('stuN')), 0);

-- saving a carried grade overwrites a computed one in the same slot
SELECT procurements.post_class_record_grades(:cr_id);   -- N gets a computed T1 again
SELECT tst.claims(tst.uid('adv'));
SET LOCAL ROLE authenticated;
SELECT save_transfer_in_grades(tst.id('enrN'), 'Holy Child School',
  format('[{"subject_id": %s, "grading_period": 1, "grade": 77}]', tst.id('math'))::jsonb);
RESET ROLE;
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_grades
  WHERE student_id = %s AND grading_period = 1 AND grade = 77
    AND carried_from_school = 'Holy Child School' $$, tst.id('stuN')), 1);

-- -------------------------------------------------------------- privileges --
SELECT tst.expect_count($$ SELECT count(*) FROM information_schema.routine_privileges
  WHERE routine_schema = 'procurements' AND routine_name = 'save_transfer_in_grades'
    AND grantee = 'anon' $$, 0);

\echo 'ALL 200 ASSERTIONS PASSED'
ROLLBACK;
```

> If `sms_class_record_items` has a different required column set locally (check `\d procurements.sms_class_record_items`), adjust the fixture INSERT only.

- [ ] **Step 3: Run the test to verify it fails**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/200_transfer_in_carried_grades.sql`
Expected: FAIL at the `columns` assertion (`expected 2, got 0`). Any earlier failure is a fixture problem; fix the fixtures per the notes above.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/200_transfer_in_carried_grades.sql`. The `post_class_record_grades` body is the **local live definition** (`select pg_get_functiondef('procurements.post_class_record_grades'::regproc)`, which matches 175) with two changes, both marked `-- 200:`. Before writing, re-dump it and diff it against the block below. If the live body differs elsewhere, keep the live body and re-apply only the two `-- 200:` changes.

```sql
-- =============================================================================
-- 200 — Transfer-in learners and carried-over grades
-- =============================================================================
-- A learner who transfers in mid-year from a school OUTSIDE the system (a
-- private school, a school in another division) arrives with an SF9 carrying
-- their Term 1 / Term 2 grades. Until now:
--   * nothing recorded that they were a transferee — the LRN lookup found no
--     record, so the wizard enrolled them as "new", and only the free-text
--     `sms_students.previous_school` hinted at it (066's `origin_school_id`
--     needs a school row the private school does not have);
--   * there was nowhere to put the carried grades — term-based years compute
--     every grade from Class Record scores, and manual grade entry is closed.
--
-- 1. `sms_enrollments.transfer_in_school_name` — the out-of-system twin of
--    `origin_school_id`. A transferee is either. The transfer-in date is the
--    enrollment's existing `enrollment_date`.
-- 2. `sms_grades.carried_from_school` — NULL = graded here (every existing
--    row, so nothing moves on apply — the 153 rule); set = copied from that
--    school's SF9. Carried grades sit in the ordinary grade slot, so the
--    report card, SF9, Final Grade, GPA and grade monitoring read them
--    unchanged.
-- 3. `post_class_record_grades` never overwrites a carried row, and
--    `unpost_class_record_grades` never deletes one.
-- 4. `save_transfer_in_grades` is the only writer of carried grades: adviser,
--    or school head / assistant / admin / registrar of the section's school,
--    or super admin. Whole numbers 60-100, on subjects scheduled in the
--    section. Not for Kindergarten / Grade 1 (no numeric grades).
--
-- Touches no existing row. Two nullable columns, two functions replaced with
-- the same signatures, one new function.
-- =============================================================================

ALTER TABLE procurements.sms_enrollments
  ADD COLUMN IF NOT EXISTS transfer_in_school_name TEXT;
ALTER TABLE procurements.sms_enrollments
  DROP CONSTRAINT IF EXISTS sms_enrollments_transfer_in_school_name_check;
ALTER TABLE procurements.sms_enrollments
  ADD CONSTRAINT sms_enrollments_transfer_in_school_name_check
  CHECK (transfer_in_school_name IS NULL OR btrim(transfer_in_school_name) <> '');

COMMENT ON COLUMN procurements.sms_enrollments.transfer_in_school_name IS
  'Migration 200: the school a learner transferred in from when it is not in '
  'the system. The in-system twin is origin_school_id.';

ALTER TABLE procurements.sms_grades
  ADD COLUMN IF NOT EXISTS carried_from_school TEXT;
ALTER TABLE procurements.sms_grades
  DROP CONSTRAINT IF EXISTS sms_grades_carried_from_school_check;
ALTER TABLE procurements.sms_grades
  ADD CONSTRAINT sms_grades_carried_from_school_check
  CHECK (carried_from_school IS NULL OR btrim(carried_from_school) <> '');

COMMENT ON COLUMN procurements.sms_grades.carried_from_school IS
  'Migration 200: NULL = graded at this school. Set = copied from that '
  'school''s SF9 for a transferee; the Class Record never overwrites or '
  'deletes such a row.';

-- -----------------------------------------------------------------------------
-- post_class_record_grades — 175's body; carried rows are skipped.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.post_class_record_grades(p_class_record_id BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO procurements, public
AS $$
DECLARE
  rec          procurements.sms_class_records%ROWTYPE;
  v_student_id BIGINT;
  v_initial    NUMERIC;
  v_term       INTEGER;
  v_posted     INTEGER := 0;
  v_written    INTEGER;
  v_has_score  BOOLEAN;
  v_has_blocks BOOLEAN;
BEGIN
  SELECT * INTO rec FROM procurements.sms_class_records WHERE id = p_class_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class record % not found', p_class_record_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_class_record_blocks b
     WHERE b.class_record_id = rec.id
  ) INTO v_has_blocks;

  FOR v_student_id IN
    SELECT e.student_id
    FROM procurements.sms_enrollments e
    WHERE e.section_id = rec.section_id
      AND e.school_year = rec.school_year
      AND e.status = 'approved'
      AND e.enrollment_status IN ('active', 'promoted', 'graduated', 'retained', 'completed')
  LOOP
    -- Skip learners with no score entered anywhere in this record.
    SELECT EXISTS (
      SELECT 1
      FROM procurements.sms_class_record_scores s
      JOIN procurements.sms_class_record_items i ON i.id = s.item_id
      WHERE i.class_record_id = rec.id
        AND s.student_id = v_student_id
        AND s.raw_score IS NOT NULL
    ) INTO v_has_score;

    IF NOT v_has_score THEN
      CONTINUE;
    END IF;

    IF v_has_blocks THEN
      SELECT COALESCE(SUM(
               COALESCE(procurements.sms_class_record_block_ps(b.id, v_student_id), 0)
               * b.weight / 100.0
             ), 0)
        INTO v_initial
        FROM procurements.sms_class_record_blocks b
       WHERE b.class_record_id = rec.id;
    ELSE
      -- Per-component percentage score (missing scores count as 0 on post).
      v_initial :=
          COALESCE(procurements.sms_class_record_component_ps(rec.id, v_student_id, 'WW'), 0)
            * rec.ww_weight / 100.0
        + COALESCE(procurements.sms_class_record_component_ps(rec.id, v_student_id, 'PT'), 0)
            * rec.pt_weight / 100.0
        + COALESCE(procurements.sms_class_record_component_ps(rec.id, v_student_id, 'ST'), 0)
            * rec.st_weight / 100.0;
    END IF;

    IF rec.grading_scheme = 'matatag' THEN
      -- The updated ECR always transmutes; use_transmutation does not apply.
      v_term := procurements.sms_transmute_grade_matatag(v_initial);
    ELSIF rec.use_transmutation THEN
      v_term := procurements.sms_transmute_grade(v_initial);
    ELSE
      v_term := ROUND(v_initial);
    END IF;

    INSERT INTO procurements.sms_grades (
      student_id, subject_id, section_id, grading_period, school_year,
      grade, remarks, teacher_id
    ) VALUES (
      v_student_id, rec.subject_id, rec.section_id, rec.grading_period, rec.school_year,
      v_term, CASE WHEN v_term >= 75 THEN 'Passed' ELSE 'Failed' END, rec.teacher_id
    )
    ON CONFLICT (student_id, subject_id, section_id, grading_period, school_year)
    DO UPDATE SET
      grade = EXCLUDED.grade,
      remarks = EXCLUDED.remarks,
      teacher_id = EXCLUDED.teacher_id,
      updated_at = NOW()
    -- 200: a grade carried over from a transferee's previous school is never
    -- overwritten by this school's class record.
    WHERE procurements.sms_grades.carried_from_school IS NULL;

    -- 200: count only rows actually written, now that the upsert can skip.
    GET DIAGNOSTICS v_written = ROW_COUNT;
    v_posted := v_posted + v_written;
  END LOOP;

  UPDATE procurements.sms_class_records SET is_posted = true, updated_at = NOW()
  WHERE id = rec.id;

  RETURN v_posted;
END;
$$;

-- -----------------------------------------------------------------------------
-- unpost_class_record_grades — 192's body; carried rows are kept.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.unpost_class_record_grades(p_class_record_id BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO procurements, public
AS $$
DECLARE
  rec       procurements.sms_class_records%ROWTYPE;
  v_caller  procurements.sms_users%ROWTYPE;
  v_removed INTEGER;
BEGIN
  SELECT * INTO rec FROM procurements.sms_class_records WHERE id = p_class_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class record % not found', p_class_record_id;
  END IF;

  SELECT * INTO v_caller FROM procurements.sms_users WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
       v_caller.type = 'super admin'
    OR v_caller.id = rec.teacher_id
    OR EXISTS (
         SELECT 1 FROM procurements.sms_subject_schedules ss
          WHERE ss.teacher_id  = v_caller.id
            AND ss.subject_id  = rec.subject_id
            AND ss.section_id  = rec.section_id
            AND ss.school_year = rec.school_year
       )
    OR EXISTS (
         SELECT 1 FROM procurements.sms_sections sec
          WHERE sec.id = rec.section_id
            AND sec.section_adviser_id = v_caller.id
            AND sec.school_year = rec.school_year
       )
  ) THEN
    RAISE EXCEPTION 'Only the teacher of this class record may unpost its grades.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM procurements.sms_grades g
   WHERE g.subject_id     = rec.subject_id
     AND g.section_id     = rec.section_id
     AND g.grading_period = rec.grading_period
     AND g.school_year    = rec.school_year
     -- 200: a carried-over grade was never this record's to take back.
     AND g.carried_from_school IS NULL;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  UPDATE procurements.sms_class_records
     SET is_posted = false, unposted_at = NOW(), updated_at = NOW()
   WHERE id = rec.id;

  RETURN v_removed;
END;
$$;

REVOKE ALL ON FUNCTION procurements.unpost_class_record_grades(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.unpost_class_record_grades(BIGINT) TO authenticated;

-- -----------------------------------------------------------------------------
-- save_transfer_in_grades — the only writer of carried grades.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.save_transfer_in_grades(
  p_enrollment_id BIGINT,
  p_school_name   TEXT,
  p_grades        JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO procurements, public
AS $$
DECLARE
  v_enr      procurements.sms_enrollments%ROWTYPE;
  v_sec      procurements.sms_sections%ROWTYPE;
  v_caller   procurements.sms_users%ROWTYPE;
  v_name     TEXT := NULLIF(btrim(COALESCE(p_school_name, '')), '');
  v_label    TEXT;
  v_item     JSONB;
  v_subject  BIGINT;
  v_period   INTEGER;
  v_grade    NUMERIC;
  v_n        INTEGER;
  v_count    INTEGER := 0;
BEGIN
  SELECT * INTO v_caller FROM procurements.sms_users WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_enr FROM procurements.sms_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment % not found', p_enrollment_id;
  END IF;
  SELECT * INTO v_sec FROM procurements.sms_sections WHERE id = v_enr.section_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This enrollment has no section.';
  END IF;

  IF NOT (
       v_caller.type = 'super admin'
    OR v_sec.section_adviser_id = v_caller.id
    OR (v_caller.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
        AND v_caller.school_id = v_sec.school_id)
  ) THEN
    RAISE EXCEPTION 'You may not enter carried-over grades for this learner — only the section adviser or school staff can.'
      USING ERRCODE = '42501';
  END IF;

  IF v_sec.grade_level IN (0, 1) THEN
    RAISE EXCEPTION 'Kindergarten and Grade 1 have no numeric grades to carry over.';
  END IF;

  IF jsonb_typeof(COALESCE(p_grades, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_grades must be a JSON array';
  END IF;

  -- The label carried on each grade: the in-system origin school's name wins,
  -- else the typed name. An in-system transferee keeps transfer_in_school_name
  -- NULL — origin_school_id already says it.
  IF v_enr.origin_school_id IS NOT NULL THEN
    SELECT name INTO v_label FROM procurements.sms_schools WHERE id = v_enr.origin_school_id;
    v_label := COALESCE(v_label, v_name);
  ELSE
    v_label := v_name;
    UPDATE procurements.sms_enrollments
       SET transfer_in_school_name = v_name, updated_at = NOW()
     WHERE id = v_enr.id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_grades, '[]'::jsonb)) LOOP
    v_subject := (v_item->>'subject_id')::BIGINT;
    v_period  := (v_item->>'grading_period')::INTEGER;
    v_grade   := NULLIF(v_item->>'grade', '')::NUMERIC;

    IF v_period IS NULL OR v_period NOT BETWEEN 1 AND 4 THEN
      RAISE EXCEPTION 'Invalid grading period %', v_item->>'grading_period';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM procurements.sms_subject_schedules ss
       WHERE ss.subject_id = v_subject
         AND ss.section_id = v_enr.section_id
         AND ss.school_year = v_enr.school_year
    ) THEN
      RAISE EXCEPTION 'Subject % is not scheduled in this section.', v_subject;
    END IF;

    IF v_grade IS NULL THEN
      DELETE FROM procurements.sms_grades g
       WHERE g.student_id = v_enr.student_id AND g.subject_id = v_subject
         AND g.section_id = v_enr.section_id AND g.grading_period = v_period
         AND g.school_year = v_enr.school_year
         AND g.carried_from_school IS NOT NULL;
    ELSE
      IF v_grade <> ROUND(v_grade) OR v_grade NOT BETWEEN 60 AND 100 THEN
        RAISE EXCEPTION 'A carried-over grade must be a whole number from 60 to 100 (got %).', v_grade;
      END IF;
      IF v_label IS NULL THEN
        RAISE EXCEPTION 'Name the school the learner transferred from.';
      END IF;
      INSERT INTO procurements.sms_grades (
        student_id, subject_id, section_id, grading_period, school_year,
        grade, remarks, teacher_id, carried_from_school
      ) VALUES (
        v_enr.student_id, v_subject, v_enr.section_id, v_period, v_enr.school_year,
        v_grade, CASE WHEN v_grade >= 75 THEN 'Passed' ELSE 'Failed' END,
        v_caller.id, v_label
      )
      ON CONFLICT (student_id, subject_id, section_id, grading_period, school_year)
      DO UPDATE SET
        grade = EXCLUDED.grade,
        remarks = EXCLUDED.remarks,
        teacher_id = EXCLUDED.teacher_id,
        carried_from_school = EXCLUDED.carried_from_school,
        updated_at = NOW();
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_count := v_count + v_n;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION procurements.save_transfer_in_grades(BIGINT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.save_transfer_in_grades(BIGINT, TEXT, JSONB) TO authenticated;
```

Note on the test's `'Name the school'` case: the name check fires in the loop, *after* `transfer_in_school_name` has been set to NULL. That is fine because the whole call raises, so the UPDATE rolls back with it.

- [ ] **Step 5: Apply to local and run the test**

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/migrations/200_transfer_in_carried_grades.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/200_transfer_in_carried_grades.sql
```
Expected: last line `ALL 200 ASSERTIONS PASSED`. Then apply the migration a second time and confirm it still succeeds (idempotent).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/200_transfer_in_carried_grades.sql supabase/tests/200_transfer_in_carried_grades.sql
git commit -m "feat(transfer-in): migration 200, carried-over grades the class record never overwrites"
```

---

### Task 2: Pure helpers + SF1/SF2 remark

**Files:**
- Create: `lib/utils/transferIn.ts`
- Create: `lib/utils/__tests__/transferIn.test.ts`
- Modify: `lib/utils/enrollmentRemarks.ts` (`MOVEMENT_SELECT`, `MovementRow`, `movementRemark`)

**Interfaces:**
- Produces:
  - `interface TransferInRow { origin_school_id?: string | number | null; transfer_in_school_name?: string | null }`
  - `isTransferee(row: TransferInRow): boolean`
  - `transferInSchool(row: TransferInRow, schoolNames: Map<string, string>): string | null`. The origin school's name wins; an origin id with no known name returns `"another school"`; otherwise it returns the trimmed `transfer_in_school_name`, or `null`.
  - `parseCarriedGrade(input: string): { ok: true; grade: number | null } | { ok: false; error: string }`
  - `MOVEMENT_SELECT` now also selects `transfer_in_school_name`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/utils/__tests__/transferIn.test.ts
import { describe, expect, it } from "vitest";

import { movementRemark } from "../enrollmentRemarks";
import { isTransferee, parseCarriedGrade, transferInSchool } from "../transferIn";

const names = new Map([["7", "Bayugan Central ES"]]);

describe("isTransferee", () => {
  it("is false for an ordinary enrolment", () => {
    expect(isTransferee({ origin_school_id: null, transfer_in_school_name: null })).toBe(false);
  });
  it("is true for an in-system transfer", () => {
    expect(isTransferee({ origin_school_id: 7 })).toBe(true);
  });
  it("is true for an out-of-system transfer", () => {
    expect(isTransferee({ transfer_in_school_name: "St. Jude Academy" })).toBe(true);
  });
  it("ignores a blank name", () => {
    expect(isTransferee({ transfer_in_school_name: "   " })).toBe(false);
  });
});

describe("transferInSchool", () => {
  it("prefers the origin school's name", () => {
    expect(transferInSchool({ origin_school_id: 7, transfer_in_school_name: "X" }, names)).toBe(
      "Bayugan Central ES",
    );
  });
  it("falls back when the origin school's name is unknown", () => {
    expect(transferInSchool({ origin_school_id: 99 }, names)).toBe("another school");
  });
  it("returns the trimmed typed name", () => {
    expect(transferInSchool({ transfer_in_school_name: " St. Jude Academy " }, names)).toBe(
      "St. Jude Academy",
    );
  });
  it("returns null for an ordinary enrolment", () => {
    expect(transferInSchool({}, names)).toBeNull();
  });
});

describe("parseCarriedGrade", () => {
  it("treats blank as no grade", () => {
    expect(parseCarriedGrade("  ")).toEqual({ ok: true, grade: null });
  });
  it("accepts whole numbers 60 to 100", () => {
    expect(parseCarriedGrade("60")).toEqual({ ok: true, grade: 60 });
    expect(parseCarriedGrade(" 100 ")).toEqual({ ok: true, grade: 100 });
  });
  it.each(["59", "101", "85.5", "abc", "8 5", "-80"])("refuses %s", (v) => {
    const r = parseCarriedGrade(v);
    expect(r.ok).toBe(false);
  });
});

describe("movementRemark (transfer-in)", () => {
  it("annotates an out-of-system transfer-in", () => {
    expect(
      movementRemark(
        { student_id: 1, enrollment_status: "active", transfer_in_school_name: "St. Jude Academy" },
        new Map(),
      ),
    ).toBe("Transferred in from St. Jude Academy");
  });
  it("still says nothing for a learner who stayed put", () => {
    expect(movementRemark({ student_id: 1, enrollment_status: "active" }, new Map())).toBe("");
  });
  it("keeps the in-system wording", () => {
    expect(
      movementRemark({ student_id: 1, enrollment_status: "active", origin_school_id: 7 }, names),
    ).toBe("Transferred in from Bayugan Central ES");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/utils/__tests__/transferIn.test.ts`
Expected: FAIL, "Cannot find module '../transferIn'".

- [ ] **Step 3: Implement**

```ts
// lib/utils/transferIn.ts
/**
 * Transfer-in learners (migration 200).
 *
 * A learner is a transferee when their enrollment names the school they came
 * from: `origin_school_id` for a school in the system (migration 066), or
 * `transfer_in_school_name` for one outside it — a private school, a school
 * in another division. Their grades from before the transfer are carried in
 * from the previous SF9 as `sms_grades` rows marked `carried_from_school`.
 */

export interface TransferInRow {
  origin_school_id?: string | number | null;
  transfer_in_school_name?: string | null;
}

export function isTransferee(row: TransferInRow): boolean {
  return row.origin_school_id != null || !!row.transfer_in_school_name?.trim();
}

/** The name of the school the learner transferred in from, or null. */
export function transferInSchool(
  row: TransferInRow,
  schoolNames: Map<string, string>,
): string | null {
  if (row.origin_school_id != null) {
    return schoolNames.get(String(row.origin_school_id)) || "another school";
  }
  return row.transfer_in_school_name?.trim() || null;
}

export type CarriedGradeParse =
  | { ok: true; grade: number | null }
  | { ok: false; error: string };

/**
 * One cell of the carried-grades grid. Blank means "no carried grade". The
 * rule matches `save_transfer_in_grades`: a whole number from 60 to 100.
 */
export function parseCarriedGrade(input: string): CarriedGradeParse {
  const v = input.trim();
  if (v === "") return { ok: true, grade: null };
  if (!/^\d{1,3}$/.test(v)) {
    return { ok: false, error: "Enter a whole number from 60 to 100" };
  }
  const n = Number(v);
  if (n < 60 || n > 100) {
    return { ok: false, error: "Enter a whole number from 60 to 100" };
  }
  return { ok: true, grade: n };
}
```

In `lib/utils/enrollmentRemarks.ts`:

```ts
export const MOVEMENT_SELECT =
  "student_id, enrollment_status, transfer_date, transfer_destination_school_id, origin_school_id, transfer_in_school_name, date_dropped, remarks";
```

Add `transfer_in_school_name?: string | null;` to `MovementRow`. In `movementRemark`, replace the `else if (row.origin_school_id != null)` branch with:

```ts
  } else if (isTransferee(row)) {
    const school = transferInSchool(row, schoolNames);
    parts.push(
      `Transferred in${school && school !== "another school" ? ` from ${school}` : ""}`,
    );
  }
```

Add `import { isTransferee, transferInSchool } from "./transferIn";` at the top. Also extend the header comment: "`transfer_in_school_name` (migration 200) is the out-of-system twin of `origin_school_id`."

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/utils/__tests__/transferIn.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors. Then check that SF1/SF2 still compile: `grep -n "MOVEMENT_SELECT" lib/pdf/generateSf1.ts lib/pdf/generateSf2.ts`. They spread the constant into `.select()`, so no further edit is needed.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/transferIn.ts lib/utils/__tests__/transferIn.test.ts lib/utils/enrollmentRemarks.ts
git commit -m "feat(transfer-in): helpers and SF1/SF2 remark for out-of-system transferees"
```

---

### Task 3: Enrollment wizard — mark a new learner as transferred in

**Files:**
- Modify: `app/(protected)/enrollment/components/enrollmentWizardSchema.ts` (`EnrollmentFormSchema`)
- Modify: `app/(protected)/enrollment/components/EnrollmentDetailsStep.tsx` (after the Balik-Aral field, ~line 280)
- Modify: `app/(protected)/enrollment/components/EnrollmentWizard.tsx` (form defaults ~line 174; new-learner insert ~line 990)

**Interfaces:**
- Consumes: column `sms_enrollments.transfer_in_school_name` (Task 1).
- Produces: `EnrollmentFormType.is_transfer_in: boolean` and `EnrollmentFormType.transfer_in_school_name?: string`.

- [ ] **Step 1: Schema.** Add these to the `EnrollmentFormSchema` object, after `is_balik_aral`:

```ts
    // Migration 200 — a NEW learner arriving mid-year from a school outside
    // the system (an in-system transferee is detected by LRN instead).
    is_transfer_in: z.boolean().default(false),
    transfer_in_school_name: z.string().optional(),
```

Then chain a second `.refine` after the semester one:

```ts
  .refine(
    (data) => !data.is_transfer_in || !!data.transfer_in_school_name?.trim(),
    {
      message: "Name the school the learner transferred from",
      path: ["transfer_in_school_name"],
    }
  );
```

- [ ] **Step 2: Defaults.** In `EnrollmentWizard.tsx`, next to `is_balik_aral: false,` (~line 174), add `is_transfer_in: false, transfer_in_school_name: "",`.

- [ ] **Step 3: Field.** In `EnrollmentDetailsStep.tsx`, directly after the Balik-Aral `FormField`, add the block below. It is shown only for `entryMode === "new"`, because the transferee mode already knows the origin school. Reuse the `Checkbox` / `Input` imports the file already has; add `Input` from `@/components/ui/input` if it is missing.

```tsx
      {/* Migration 200: a learner new to the system who transfers in from a
          school outside it — a private school, another division. */}
      {entryMode === "new" && (
        <FormField
          control={form.control}
          name="is_transfer_in"
          render={({ field }) => (
            <FormItem className="rounded-lg border p-4 space-y-3">
              <div className="flex items-start gap-3">
                <FormControl>
                  <Checkbox
                    checked={field.value ?? false}
                    onChange={(e) => field.onChange(e.target.checked)}
                    disabled={disabled}
                  />
                </FormControl>
                <div className="space-y-1">
                  <FormLabel className="text-sm font-medium">
                    Transferee from a school outside this system
                  </FormLabel>
                  <p className="text-xs text-muted-foreground">
                    e.g. a private school. The adviser can then enter the grades
                    from the learner&apos;s previous SF9.
                  </p>
                </div>
              </div>
              {field.value && (
                <FormField
                  control={form.control}
                  name="transfer_in_school_name"
                  render={({ field: nameField }) => (
                    <FormItem>
                      <FormLabel className="text-sm">
                        Previous school <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...nameField}
                          value={nameField.value ?? ""}
                          placeholder="e.g. St. Jude Academy"
                          disabled={disabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </FormItem>
          )}
        />
      )}
```

If `entryMode` is not already a prop of `EnrollmentDetailsStep`, it is: it is used at line 124 (`entryMode === "transferee"`).

- [ ] **Step 4: Persist.** In the **new learner** enrollment insert (`EnrollmentWizard.tsx` ~line 990, the one following `// Create enrollment`), add this after `is_balik_aral`:

```ts
              transfer_in_school_name: enrollData.is_transfer_in
                ? enrollData.transfer_in_school_name?.trim() || null
                : null,
```

Do **not** add it to the existing-learner insert (~line 1190) or the transferee RPC path.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit -p . && npm run lint -- "app/(protected)/enrollment"`
Expected: clean.

Manual check (local only; confirm `.env.development.local` exists first): run `npm run dev` and enrol a new test learner with the box ticked and "Test Private School". Then:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -At -c "select transfer_in_school_name from procurements.sms_enrollments order by id desc limit 1"
```
Expected: `Test Private School`. Also tick the box, leave the name blank and try to continue. Expected: "Name the school the learner transferred from".

- [ ] **Step 6: Commit**

```bash
git add "app/(protected)/enrollment/components/"
git commit -m "feat(enrollment): mark a new learner as transferred in from outside the system"
```

---

### Task 4: Section page — Transferee badge + Transferee Grades modal

**Files:**
- Create: `app/(protected)/teacher/components/TransferInGradesModal.tsx`
- Modify: `app/(protected)/teacher/sections/[id]/page.tsx` (enrollment type ~line 107, enrollments select ~line 236, mapper ~line 258, learner name cell ~line 946, row dropdown ~line 1078, modal mount near the other modals ~line 1425)

**Interfaces:**
- Consumes: `save_transfer_in_grades(p_enrollment_id, p_school_name, p_grades)` (Task 1); `parseCarriedGrade`, `isTransferee`, `transferInSchool` (Task 2); `getGradingPeriodsForSection(schoolYear, shsCurriculum)` from `@/lib/utils/schoolYear`.
- Produces: `<TransferInGradesModal isOpen onClose onSaved enrollmentId studentId studentName sectionId schoolYear shsCurriculum originSchoolName transferInSchoolName />`

- [ ] **Step 1: Write the modal**

```tsx
// app/(protected)/teacher/components/TransferInGradesModal.tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase/client";
import { getGradingPeriodsForSection } from "@/lib/utils/schoolYear";
import { parseCarriedGrade } from "@/lib/utils/transferIn";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

/**
 * Grades a transferee earned at their previous school, copied from that
 * school's SF9 (migration 200). Saved as ordinary `sms_grades` rows marked
 * `carried_from_school`, which the Class Record never overwrites or unposts.
 */
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  enrollmentId: string;
  studentId: string;
  studentName: string;
  sectionId: string;
  schoolYear: string;
  shsCurriculum?: string | null;
  /** In-system transfer: the origin school's name; the name field is then read-only. */
  originSchoolName: string | null;
  transferInSchoolName: string | null;
}

interface SubjectRow {
  id: string;
  name: string;
  code: string | null;
}

type CellKey = `${string}:${number}`; // subjectId:period
const key = (subjectId: string, period: number): CellKey => `${subjectId}:${period}`;

export function TransferInGradesModal({
  isOpen,
  onClose,
  onSaved,
  enrollmentId,
  studentId,
  studentName,
  sectionId,
  schoolYear,
  shsCurriculum,
  originSchoolName,
  transferInSchoolName,
}: Props) {
  const periods = getGradingPeriodsForSection(schoolYear, shsCurriculum);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [schoolName, setSchoolName] = useState("");
  // Carried values as loaded, and as edited.
  const [initial, setInitial] = useState<Record<CellKey, string>>({});
  const [values, setValues] = useState<Record<CellKey, string>>({});
  // Grades computed here (not carried) — shown greyed as a placeholder.
  const [computed, setComputed] = useState<Record<CellKey, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setSchoolName(originSchoolName ?? transferInSchoolName ?? "");
      const [{ data: sched }, { data: grades }] = await Promise.all([
        supabase
          .from("sms_subject_schedules")
          .select("subject:sms_subjects(id, name, code)")
          .eq("section_id", Number(sectionId))
          .eq("school_year", schoolYear),
        supabase
          .from("sms_grades")
          .select("subject_id, grading_period, grade, carried_from_school")
          .eq("student_id", Number(studentId))
          .eq("section_id", Number(sectionId))
          .eq("school_year", schoolYear),
      ]);
      if (!mounted) return;

      const byId = new Map<string, SubjectRow>();
      (sched || []).forEach((row) => {
        const s = Array.isArray(row.subject) ? row.subject[0] : row.subject;
        if (s) byId.set(String(s.id), { id: String(s.id), name: s.name, code: s.code });
      });
      setSubjects(
        Array.from(byId.values()).sort((a, b) =>
          (a.code || a.name).localeCompare(b.code || b.name),
        ),
      );

      const carried: Record<CellKey, string> = {};
      const own: Record<CellKey, number> = {};
      (grades || []).forEach((g) => {
        const k = key(String(g.subject_id), g.grading_period);
        if (g.carried_from_school) carried[k] = String(Math.round(Number(g.grade)));
        else own[k] = Number(g.grade);
      });
      setInitial(carried);
      setValues(carried);
      setComputed(own);
      setLoading(false);
    };
    load();
    return () => {
      mounted = false;
    };
  }, [isOpen, sectionId, studentId, schoolYear, originSchoolName, transferInSchoolName]);

  const errors: Record<CellKey, string> = {};
  (Object.keys(values) as CellKey[]).forEach((k) => {
    const r = parseCarriedGrade(values[k] ?? "");
    if (!r.ok) errors[k] = r.error;
  });
  const hasErrors = Object.keys(errors).length > 0;

  const handleSave = async () => {
    if (hasErrors) {
      toast.error("Fix the highlighted grades first");
      return;
    }
    const changed = new Set<CellKey>([
      ...(Object.keys(values) as CellKey[]),
      ...(Object.keys(initial) as CellKey[]),
    ]);
    const payload: { subject_id: number; grading_period: number; grade: number | null }[] = [];
    changed.forEach((k) => {
      const before = (initial[k] ?? "").trim();
      const after = (values[k] ?? "").trim();
      if (before === after) return;
      const parsed = parseCarriedGrade(after);
      if (!parsed.ok) return;
      const [subjectId, period] = k.split(":");
      payload.push({
        subject_id: Number(subjectId),
        grading_period: Number(period),
        grade: parsed.grade,
      });
    });
    if (payload.some((p) => p.grade !== null) && !schoolName.trim()) {
      toast.error("Name the school the learner transferred from");
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("save_transfer_in_grades", {
      p_enrollment_id: Number(enrollmentId),
      p_school_name: schoolName.trim() || null,
      p_grades: payload,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Carried-over grades saved");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Transferee Grades — {studentName}</DialogTitle>
          <DialogDescription>
            Copy the grades from the learner&apos;s previous SF9 for the terms
            before they transferred. They print on the report card and SF9 like
            any other grade, and the Class Record will not overwrite them. Leave
            a cell blank for a term graded at this school.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <label className="text-sm font-medium">Previous school</label>
          <Input
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            disabled={!!originSchoolName || saving}
            placeholder="e.g. St. Jude Academy"
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : subjects.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No subjects are scheduled in this section yet.
          </p>
        ) : (
          <div className="max-h-[50vh] overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Subject</th>
                  {periods.map((p) => (
                    <th key={p.value} className="px-2 py-2 text-center w-24">
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-1.5">{s.name}</td>
                    {periods.map((p) => {
                      const k = key(s.id, p.value);
                      return (
                        <td key={p.value} className="px-2 py-1 text-center">
                          <Input
                            inputMode="numeric"
                            className={`h-8 text-center ${errors[k] ? "border-destructive" : ""}`}
                            value={values[k] ?? ""}
                            placeholder={computed[k] != null ? String(computed[k]) : ""}
                            title={
                              errors[k] ??
                              (computed[k] != null
                                ? `Graded here: ${computed[k]}. Typing a value replaces it.`
                                : undefined)
                            }
                            onChange={(e) =>
                              setValues((prev) => ({ ...prev, [k]: e.target.value }))
                            }
                            disabled={saving}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || hasErrors}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Check that `@/components/ui/dialog` exports those names (`grep -n "export" components/ui/dialog.tsx`). If the Supabase client is typed, the `row.subject` shape may need the same `Array.isArray` normalisation used in `page.tsx` ~line 254, which is already applied above.

- [ ] **Step 2: Load the transfer columns on the section page.** In `page.tsx`, extend the enrollment state type (~line 107) with:

```ts
      transfer_from: string | null; // school name, null = not a transferee
      origin_school_name: string | null;
      transfer_in_school_name: string | null;
```

Extend the select (~line 236):

```ts
          enrollment_status,
          origin_school_id,
          transfer_in_school_name,
          origin_school:sms_schools!sms_enrollments_origin_school_id_fkey(name),
          student:sms_students!sms_enrollments_student_id_fkey(*)
```

In the mapper (~line 258), compute and return these values:

```ts
            const r = e as Record<string, unknown>;
            const origin = Array.isArray(r.origin_school)
              ? (r.origin_school[0] as { name?: string } | undefined)
              : (r.origin_school as { name?: string } | null);
            const originName = origin?.name ?? null;
            const names = new Map<string, string>(
              r.origin_school_id != null && originName
                ? [[String(r.origin_school_id), originName]]
                : [],
            );
            const row = {
              origin_school_id: r.origin_school_id as number | null,
              transfer_in_school_name: (r.transfer_in_school_name as string | null) ?? null,
            };
            // …existing return object, plus:
            //   transfer_from: transferInSchool(row, names),
            //   origin_school_name: originName,
            //   transfer_in_school_name: row.transfer_in_school_name,
```

Import `transferInSchool` from `@/lib/utils/transferIn`. Any other place that builds this enrollment object (e.g. the optimistic updates at ~lines 1375/1396 use `prev.map` with spread) keeps working, because those fields carry through the spread.

- [ ] **Step 3: Badge.** In the name cell (~line 946), after the middle name, add:

```tsx
                            {enrollment.transfer_from && (
                              <span
                                className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-teal-100 text-teal-800"
                                title={`Transferred in from ${enrollment.transfer_from}`}
                              >
                                Transferee
                              </span>
                            )}
```

- [ ] **Step 4: Menu item + mount.** Add state:

```ts
  const [transferGradesFor, setTransferGradesFor] = useState<
    (typeof enrollments)[number] | null
  >(null);
```

In the row dropdown, next to "Report Card Remarks", inside the same `section.grade_level !== 0 && section.grade_level !== 1` condition pattern:

```tsx
                                  {section.grade_level !== 0 &&
                                    section.grade_level !== 1 && (
                                      <DropdownMenuItem
                                        className="cursor-pointer"
                                        onClick={() => setTransferGradesFor(enrollment)}
                                      >
                                        <ArrowLeftRight className="mr-2 h-4 w-4" />
                                        Transferee Grades
                                      </DropdownMenuItem>
                                    )}
```

The item is shown for **every** learner, not only flagged ones: that is how an adviser marks a learner who was enrolled before this feature existed, which is exactly the user's case today. Saving with a school name flags the enrollment.

Mount it near the other modals:

```tsx
      {transferGradesFor && section && (
        <TransferInGradesModal
          isOpen={!!transferGradesFor}
          onClose={() => setTransferGradesFor(null)}
          onSaved={() => setReloadKey((k) => k + 1)}
          enrollmentId={String(transferGradesFor.id)}
          studentId={String(transferGradesFor.student.id)}
          studentName={`${transferGradesFor.student.last_name}, ${transferGradesFor.student.first_name}`}
          sectionId={sectionId}
          schoolYear={section.school_year}
          shsCurriculum={section.shs_curriculum}
          originSchoolName={transferGradesFor.origin_school_name}
          transferInSchoolName={transferGradesFor.transfer_in_school_name}
        />
      )}
```

`onSaved` must refetch enrollments so the badge appears. If the page has no `reloadKey`, find the function that loads the section (the `useEffect` around line 190) and either add a `reloadKey` state to its dependency array or call that loader directly.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit -p . && npm run lint -- "app/(protected)/teacher"`
Manual (local dev server): on a Grade 5 section, open a learner → Transferee Grades. Enter "St. Jude Academy", 88 for Math Term 1, and try `85.5` (red, Save disabled). Clear that, save, and confirm the Transferee badge appears. Open again and the 88 is pre-filled. Clear it and save, and the row is removed:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -At -c "select grade, carried_from_school from procurements.sms_grades where carried_from_school is not null order by updated_at desc limit 5"
```
Then print the learner's report card from the same page and confirm 88 appears under Term 1.

- [ ] **Step 6: Commit**

```bash
git add "app/(protected)/teacher/components/TransferInGradesModal.tsx" "app/(protected)/teacher/sections/[id]/page.tsx"
git commit -m "feat(sections): transferee badge and carried-over grades entry for advisers"
```

---

### Task 5: Class Record — lock carried learners

**Files:**
- Modify: `app/(protected)/teacher/class-record/components/ClassRecordTable.tsx` (`loadPostedGrades` ~line 506, `unpostedLearners` ~line 1080, unpost description ~line 1800, the student row component ~line 2025 and its call site)

**Interfaces:**
- Consumes: `sms_grades.carried_from_school` (Task 1).

- [ ] **Step 1: Read carried rows.** Add state next to `postedGrades`:

```ts
  // Migration 200 — learners whose grade for this term was carried over from
  // their previous school's SF9. The RPC never overwrites these, so their row
  // is locked here and they are left out of the stale-post warning.
  const [carried, setCarried] = useState<Record<string, string>>({});
```

In `loadPostedGrades`, select `"student_id, grade, carried_from_school"` and add:

```ts
    setCarried(
      Object.fromEntries(
        (data || [])
          .filter((row) => row.carried_from_school)
          .map((row) => [String(row.student_id), String(row.carried_from_school)])
      )
    );
```

Reset it with `setCarried({})` wherever `setPostedGrades({})` is reset (~line 563).

- [ ] **Step 2: Exclude from stale/unpost counts.** In `unpostedLearners`, first line inside the filter: `if (carried[s.id]) return false;`. In the unpost confirm description, replace `Object.keys(postedGrades).length` with `Object.keys(postedGrades).filter((id) => !carried[id]).length`. Apply the same filter to `hasPostedGrades` (~line 689) so a term whose only posted grades are carried does not offer "Unpost". Add one sentence to that description: `Carried-over grades of transferees are kept.`

- [ ] **Step 3: Lock the row.** Add props to the row component: `carriedFrom?: string; carriedGrade?: number;`. Pass them at the call site as `carriedFrom={carried[s.id]}` and `carriedGrade={postedGrades[s.id]}`, and pass `locked={locked || !!carried[s.id]}`. In the row, show this beside the name:

```tsx
        {carriedFrom && (
          <span
            className="ml-2 rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-800"
            title={`Term grade carried over from ${carriedFrom}. Edit it from the section page → Transferee Grades.`}
          >
            Carried
          </span>
        )}
```

Make the Term Grade cell show the carried grade:

```tsx
      <td className="border px-2 py-1 text-center font-semibold text-green-700">
        {carriedFrom ? carriedGrade ?? "-" : hasAnyScore ? term : "-"}
      </td>
```

Make the descriptor cell use `carriedFrom ? (carriedGrade != null ? descriptor(carriedGrade, scheme) : "-") : …existing…`. The Initial Grade cell shows `"-"` when `carriedFrom` is set.

The descriptor summary (`termGrades`, ~line 1058) maps every student through `termGrade(...)`. Change it to use the carried grade for carried learners, so the distribution counts what the card prints:

```ts
        .map((s) =>
          carried[s.id] && postedGrades[s.id] != null
            ? postedGrades[s.id]
            : termGrade(record, blocks, items, scores[s.id] || {})
        )
```

Keep whatever filter precedes `.map` unchanged, but make sure a carried learner passes it. If the filter is "has any score", add `|| !!carried[s.id]`.

- [ ] **Step 4: Verify**

Run: `npx vitest run "app/(protected)/teacher/class-record" && npx tsc --noEmit -p . && npm run lint -- "app/(protected)/teacher/class-record"`
Manual (local): with the Task 4 learner carrying 88 in Math Term 1, open Class Record → Math → Term 1. The learner's row shows "Carried" and 88, and their score cells are disabled. Type a score for another learner and wait for the auto-post. Then:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -At -c "select grade, carried_from_school from procurements.sms_grades where carried_from_school is not null"
```
Expected: still 88. Click Unpost and confirm, then re-run the query. Expected: still 88. The FinalGradeView tab shows 88 in Term 1 without any change.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/teacher/class-record/components/ClassRecordTable.tsx"
git commit -m "feat(class-record): lock carried-over transferee grades and keep them out of unpost"
```

---

### Task 6: Docs + whole-suite check

**Files:**
- Modify: `CLAUDE.md` (Notable Recent Migrations table, after the 199 row; Transfer Enrollment Workflow section)

- [ ] **Step 1: Migration table row**

```markdown
| 200 | **Transfer-in learners and carried-over grades** — a learner transferring in mid-year from a school *outside* the system was enrolled as "new" with only the free-text `sms_students.previous_school` to show for it, and in a term-based year there was nowhere to put the Term 1-2 grades on their previous SF9 (grades come only from Class Record scores; manual entry is closed). Adds `sms_enrollments.transfer_in_school_name` (the out-of-system twin of 066's `origin_school_id`; transfer-in date is `enrollment_date`) and `sms_grades.carried_from_school` (NULL = graded here — every existing row, so nothing moves on apply; set = copied from that school's SF9). Carried grades sit in the ordinary grade slot, so report card, SF9, Final Grade, GPA and grade monitoring read them unchanged. `post_class_record_grades` skips carried rows (`ON CONFLICT … WHERE carried_from_school IS NULL`) and `unpost_class_record_grades` never deletes them; both same signatures. `save_transfer_in_grades(enrollment, school_name, grades jsonb)` is the only writer: section adviser, or school head / assistant / admin / registrar of that school, or super admin; whole numbers 60-100; subjects scheduled in the section; not Kindergarten / Grade 1. UI: wizard checkbox for a new learner, Transferee badge and **Transferee Grades** on the adviser's section page, Class Record locks a carried learner's row. Two nullable columns, two functions replaced, one new; no DML. Tests: `supabase/tests/200_transfer_in_carried_grades.sql`. **Not done:** SF4 / KPI transfer-in counts still key on `origin_school_id` only (144/147/148/165 `CASE`, `generateSf4.ts`) |
```

- [ ] **Step 2:** In "Transfer Enrollment Workflow", add a short paragraph at the end: "**From outside the system** (migration 200): no record request is possible. The wizard's *Transferee from a school outside this system* box sets `transfer_in_school_name`, and the adviser copies the previous SF9's grades through Transferee Grades on the section page (`save_transfer_in_grades`)."

- [ ] **Step 3: Whole suite**

```bash
npm test
npx tsc --noEmit -p .
npm run lint
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/200_transfer_in_carried_grades.sql
```
Expected: all pass, and the last line reads `ALL 200 ASSERTIONS PASSED`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: migration 200 transfer-in carried grades"
```

- [ ] **Step 5: Hand-off to the user (do not apply anything to production).** Tell the user:
  - The file to apply is `supabase/migrations/200_transfer_in_carried_grades.sql`. It needs 192 already applied in production (it sets `unposted_at`).
  - It touches no rows: two nullable columns, two replaced functions with the same signatures, one new function.
  - Pre-apply check to run in the SQL editor: `select count(*) from information_schema.columns where table_schema='procurements' and table_name='sms_class_records' and column_name='unposted_at';` Expected: `1`.

## Out of scope (follow-ups, not in this plan)

- **SF4 / KPI transfer-in counts** for out-of-system transferees. Those RPCs (144/147/148/165) and `generateSf4.ts` share one `CASE` on `origin_school_id`, and changing it means changing them together.
- **Prefilling** carried grades for an **in-system** transferee from the origin school's `sms_grades` once record access is granted.
- **A registrar-side screen** for carried grades. The RPC already admits registrars; only the UI is missing.
