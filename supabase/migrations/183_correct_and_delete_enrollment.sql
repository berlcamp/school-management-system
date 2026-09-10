-- ============================================================================
-- Migration 183: correcting one enrollment, and deleting one safely
-- ============================================================================
--
-- APPLY AFTER 130 (current_staff / is_service_role), 135_allow_teacher_enrollment
-- + 139 (assert_enrollment_staff) and 131 (can_write_enrollment).
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
--
-- A teacher clicks Promote on a learner who was meant to be retained. The click
-- writes three things (PromoteStudentModal): the enrollment goes `promoted`,
-- sms_students.grade_level is bumped a year, and current_section_id is cleared.
-- The registrar then runs Enroll Existing Students and the learner is sitting in
-- the wrong grade for the new school year.
--
-- Putting that right today takes four screens and a known trap:
--
--   * ChangeStatusModal moves the status back but does not touch the student
--     row, so the bumped grade_level and the cleared section stay wrong;
--   * the enrollment wizard's Edit mode does fix the student row, but its
--     School Year and Semester dropdowns are live in edit mode, and both sit in
--     the expression index `uq_enrollments_student_school_year_semester`
--     (student_id, school_id, school_year, COALESCE(semester,0)) — so a
--     registrar who reads "retained" as "goes back a year" and rolls the School
--     Year back collides with the learner's own previous row and gets a raw
--     `duplicate key value violates unique constraint` with nothing to act on;
--   * Rollback Auto-Enroll is the only thing that removes a row, and it works
--     per school year + grade level: it deletes EVERY auto-enrolled row in that
--     grade. There is no way to undo one learner;
--   * so the field workaround became Change Status → Dropped followed by a
--     re-enrolment, which lands on the wizard's reactivate branch and silently
--     wipes the remarks that recorded why.
--
-- This migration adds the two operations that were missing, as functions rather
-- than as client queries, for the 161 reason: the anon key ships in the browser
-- bundle, so the rule has to live where the data is.
--
--   correct_enrollment      — move one row to the right grade level and section
--                             in one transaction, syncing the learner record.
--   delete_enrollment_safe  — delete one row, but only when nothing is encoded
--                             against it. Refuses, naming what it found.
--
-- ---------------------------------------------------------------------------
-- Why a delete needs a guard at all
-- ---------------------------------------------------------------------------
--
-- The FKs are not the hazard. Only three things reference sms_enrollments(id):
-- sms_student_disabilities.enrollment_id (CASCADE, 048 — those rows are part of
-- this enrollment and go with it), sms_students.enrollment_id (SET NULL, 006)
-- and sms_record_requests.origin_enrollment_id (SET NULL, 127).
--
-- The hazard is everything that has NO foreign key to the row. A learner's
-- academic record is keyed (student_id, section_id, school_year) and never by
-- enrollment_id: sms_grades (001), sms_attendance (019), sms_eccd_assessments
-- (047), sms_learner_health (023), sms_kinder_progress_ratings (172),
-- sms_pace_ratings (180), plus sms_report_card_core_values (055) on
-- (student_id, school_year) and the class record's scores one join away (080).
-- Deleting the enrollment removes the register entry and leaves every one of
-- those rows behind, still readable by every query that looks a learner up by
-- section and school year — an SF10 or a Form 137 would still print them, with
-- no enrollment to say the learner was ever there.
--
-- So: a delete is offered only for a row nothing has been encoded against,
-- which is exactly the case it exists for (a row created by mistake, caught the
-- same day). Anything with a record on it is a correction, not a deletion, and
-- `correct_enrollment` is how that is done.
--
-- The counts are read through `enrollment_dependents`, and delete_enrollment_safe
-- refuses on that same function's verdict — the preview the modal shows and the
-- rule the database enforces are one piece of code, so they cannot drift apart.
--
-- ---------------------------------------------------------------------------
-- What delete_enrollment_safe refuses, and why each one
-- ---------------------------------------------------------------------------
--
--   * any encoded record in the eight places above — see the section above;
--   * a transfer-linked row (`record_request_id` set, `origin_school_id` set, or
--     a status of pending_transfer / pending_review / transferred_out). Those
--     rows are owned by the record-request state machine (066/127): deleting one
--     strands the request and 127's origin_enrollment_id silently becomes NULL.
--     `remove_transfer_student` is the supported way out;
--   * `graduated`. trg_enforce_graduation_lock (062, tightened by 126) decides
--     whether a learner may be re-enrolled by looking for exactly this row, so
--     deleting it quietly re-opens a closed record;
--   * a row at another school, or one the caller's role may not touch.
--
-- Deletion is also restricted to a narrower roster than enrolment is. 135 let
-- teachers enrol, for good reasons that do not carry over: enrolling adds a
-- learner to the roll and is reversible, while deleting the register entry is
-- neither, so it stays school-head / assistant / admin / registrar plus the
-- division roles. Teachers, volunteer teachers, librarians and tutors are
-- refused — and STAFF_TYPES in lib/requests/auth.ts is again left alone, per the
-- 135/158 precedent.
--
-- Deleting a row from a school year that has already been reported to the
-- division is NOT refused — the encoded-record guard already catches the
-- realistic cases, and a registrar cleaning up a stray row from last year has a
-- legitimate reason. `is_past_school_year` is returned instead, so the dialog can
-- say so before the button is pressed.
--
-- ---------------------------------------------------------------------------
-- What correct_enrollment will not do
-- ---------------------------------------------------------------------------
--
-- It does not move grades. When the section changes, grades and attendance
-- already encoded against the OLD section stay where they are — they are keyed
-- by section and the subjects of one grade level are not the subjects of
-- another, so a silent re-point would invent a record. The counts come back as
-- `stranded_grades` / `stranded_attendance` for the UI to show; clearing them is
-- a decision for the registrar and the teacher, not a side effect of a fix.
--
-- It does not touch enrollment_status. A correction is about where the learner
-- is placed; the end-of-year outcome is ChangeStatusModal's business, and going
-- anywhere near it would drag in 062's promotion-deadline trigger for no reason
-- (that trigger is `UPDATE OF enrollment_status`, so nothing here fires it).
--
-- It does not roll the school year. That was the trap; the school year and the
-- school are fixed, read off the row, and are not parameters.
--
-- It writes the learner record only when the row is the live one
-- (`status = approved AND enrollment_status = active`). Correcting a historical
-- row must not re-point where the learner is sitting today.
--
-- ---------------------------------------------------------------------------
-- Drift
-- ---------------------------------------------------------------------------
--
-- The eight dependent tables are counted through `to_regclass` and a column
-- check rather than named in static SQL, so this file applies and runs whether
-- or not 172 and 180 have reached the database it is applied to (invariant 11,
-- and the 116 lesson that the files and the live schema disagree). A table that
-- is missing counts 0 instead of raising `relation does not exist` at call time,
-- which is what a plpgsql function referencing a table it cannot see would do.
--
-- ---------------------------------------------------------------------------
-- Blast radius
-- ---------------------------------------------------------------------------
--
-- Creates 5 functions. Creates no table, drops nothing, replaces no existing
-- function, policy or trigger, and modifies NO ROWS — there is no DML in this
-- file. Nothing in the application calls these until the two modals ship in the
-- same commit, so applying it alone changes no behaviour. Idempotent.
--
-- Reversible with:
--   DROP FUNCTION IF EXISTS procurements.delete_enrollment_safe(BIGINT, TEXT);
--   DROP FUNCTION IF EXISTS procurements.correct_enrollment(BIGINT, INTEGER, BIGINT, INTEGER, TEXT);
--   DROP FUNCTION IF EXISTS procurements.enrollment_dependents(BIGINT);
--   DROP FUNCTION IF EXISTS procurements.enrollment_scoped_count(TEXT, BIGINT, BIGINT, TEXT);
--   DROP FUNCTION IF EXISTS procurements.assert_enrollment_registrar(BIGINT);
--
-- Before applying, nothing needs counting: no row is read or written. To see
-- which enrollments would be deletable at a school, after applying:
--
--   SELECT e.id, procurements.enrollment_dependents(e.id) -> 'deletable'
--   FROM procurements.sms_enrollments e
--   WHERE e.school_id = <id> AND e.school_year = '<SY>';
-- ============================================================================

SET search_path TO procurements, public;

-- ---------------------------------------------------------------------------
-- 1. Who may delete an enrollment
-- ---------------------------------------------------------------------------
-- Deliberately narrower than assert_enrollment_staff (135/139). Same shape, so
-- the two read alike: service role authorises upstream, division roles act
-- across schools, everyone else only at their own active school (134).

CREATE OR REPLACE FUNCTION procurements.assert_enrollment_registrar(p_school_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_staff procurements.sms_users;
BEGIN
  IF procurements.is_service_role() THEN
    RETURN NULL;
  END IF;

  v_staff := procurements.current_staff();

  IF v_staff.id IS NULL THEN
    RAISE EXCEPTION
      'Not signed in as an active staff member.'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  IF v_staff.type NOT IN (
    'school_head', 'assistant_school_head', 'admin', 'registrar',
    'super admin', 'division_admin', 'division_type'
  ) THEN
    RAISE EXCEPTION
      'Your role (%) may not delete an enrollment. Ask the registrar or the school head.',
      v_staff.type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Division-level staff act across schools. Super admin sits here rather than
  -- in the school-matched branch because AuthGuard swaps their school_id for
  -- their active-school override (the 113 precedent).
  IF v_staff.type IN ('division_admin', 'division_type', 'super admin') THEN
    RETURN v_staff.id;
  END IF;

  IF p_school_id IS NULL OR v_staff.school_id IS DISTINCT FROM p_school_id THEN
    RAISE EXCEPTION
      'You may only delete an enrollment at your own school (yours: %, requested: %).',
      COALESCE(v_staff.school_id::TEXT, 'none'),
      COALESCE(p_school_id::TEXT, 'none')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_staff.id;
END;
$$;

COMMENT ON FUNCTION procurements.assert_enrollment_registrar IS
  'The signed-in staff member''s sms_users.id when they may delete an enrollment owned by p_school_id, else raises. Narrower than assert_enrollment_staff: teachers, volunteer teachers, librarians and tutors are refused.';

GRANT EXECUTE ON FUNCTION procurements.assert_enrollment_registrar(BIGINT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Count rows in one (student_id, section_id, school_year) table
-- ---------------------------------------------------------------------------
-- Dynamic on purpose — see "Drift" in the header. Returns 0 for a table this
-- database does not have, or one not keyed that way, instead of raising.
-- Internal: not granted to authenticated, so PostgREST cannot reach it.

CREATE OR REPLACE FUNCTION procurements.enrollment_scoped_count(
  p_table       TEXT,
  p_student_id  BIGINT,
  p_section_id  BIGINT,
  p_school_year TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_count BIGINT := 0;
BEGIN
  IF to_regclass('procurements.' || quote_ident(p_table)) IS NULL THEN
    RETURN 0;
  END IF;

  IF (
    SELECT count(DISTINCT column_name)
    FROM information_schema.columns
    WHERE table_schema = 'procurements'
      AND table_name = p_table
      AND column_name IN ('student_id', 'section_id', 'school_year')
  ) < 3 THEN
    RETURN 0;
  END IF;

  EXECUTE format(
    'SELECT count(*) FROM procurements.%I
      WHERE student_id = $1 AND section_id = $2 AND school_year = $3',
    p_table
  )
  INTO v_count
  USING p_student_id, p_section_id, p_school_year;

  RETURN COALESCE(v_count, 0);
END;
$$;

COMMENT ON FUNCTION procurements.enrollment_scoped_count IS
  'Rows in procurements.<p_table> for one learner, section and school year. 0 when the table is absent or not keyed that way, so the caller survives schema drift (invariant 11).';

REVOKE ALL ON FUNCTION procurements.enrollment_scoped_count(TEXT, BIGINT, BIGINT, TEXT) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 3. What is encoded against one enrollment, and may it be deleted
-- ---------------------------------------------------------------------------
-- The single source for both the dialog's preview and the delete's refusal.

CREATE OR REPLACE FUNCTION procurements.enrollment_dependents(p_enrollment_id BIGINT)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_row            procurements.sms_enrollments;
  v_student        RECORD;
  v_section        RECORD;
  v_grades         BIGINT;
  v_attendance     BIGINT;
  v_eccd           BIGINT;
  v_health         BIGINT;
  v_kinder         BIGINT;
  v_pace           BIGINT;
  v_core_values    BIGINT := 0;
  v_cr_scores      BIGINT := 0;
  v_sned           BIGINT := 0;
  v_blockers       TEXT[] := ARRAY[]::TEXT[];
  v_current_sy     TEXT;
BEGIN
  SELECT * INTO v_row
  FROM procurements.sms_enrollments
  WHERE id = p_enrollment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment % not found.', p_enrollment_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Reading the facts is enrolment-grade work; deleting is not (section 5).
  PERFORM procurements.assert_enrollment_staff(v_row.school_id);

  SELECT id, first_name, last_name, lrn, grade_level, current_section_id
    INTO v_student
  FROM procurements.sms_students
  WHERE id = v_row.student_id;

  SELECT id::BIGINT AS id, name::TEXT AS name
    INTO v_section
  FROM procurements.sms_sections
  WHERE id = v_row.section_id;

  v_grades     := procurements.enrollment_scoped_count('sms_grades',                   v_row.student_id, v_row.section_id, v_row.school_year);
  v_attendance := procurements.enrollment_scoped_count('sms_attendance',               v_row.student_id, v_row.section_id, v_row.school_year);
  v_eccd       := procurements.enrollment_scoped_count('sms_eccd_assessments',         v_row.student_id, v_row.section_id, v_row.school_year);
  v_health     := procurements.enrollment_scoped_count('sms_learner_health',           v_row.student_id, v_row.section_id, v_row.school_year);
  v_kinder     := procurements.enrollment_scoped_count('sms_kinder_progress_ratings',  v_row.student_id, v_row.section_id, v_row.school_year);
  v_pace       := procurements.enrollment_scoped_count('sms_pace_ratings',             v_row.student_id, v_row.section_id, v_row.school_year);

  -- Core values hang off (student, school year) with no section — 055.
  IF to_regclass('procurements.sms_report_card_core_values') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM procurements.sms_report_card_core_values
              WHERE student_id = $1 AND school_year = $2'
      INTO v_core_values USING v_row.student_id, v_row.school_year;
  END IF;

  -- Class record scores are two joins from the section — 080.
  IF to_regclass('procurements.sms_class_record_scores') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)
             FROM procurements.sms_class_record_scores s
             JOIN procurements.sms_class_record_items i ON i.id = s.item_id
             JOIN procurements.sms_class_records r ON r.id = i.class_record_id
             WHERE s.student_id = $1 AND r.section_id = $2 AND r.school_year = $3'
      INTO v_cr_scores USING v_row.student_id, v_row.section_id, v_row.school_year;
  END IF;

  -- Not a blocker: these belong to this enrollment and CASCADE with it (048).
  IF to_regclass('procurements.sms_student_disabilities') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM procurements.sms_student_disabilities
              WHERE enrollment_id = $1'
      INTO v_sned USING v_row.id;
  END IF;

  IF v_grades > 0 THEN
    v_blockers := v_blockers || format('%s grade row(s) are encoded for this learner in this section and school year.', v_grades);
  END IF;
  IF v_attendance > 0 THEN
    v_blockers := v_blockers || format('%s attendance day(s) are recorded.', v_attendance);
  END IF;
  IF v_eccd > 0 THEN
    v_blockers := v_blockers || format('%s ECCD checklist entr(y/ies) exist.', v_eccd);
  END IF;
  IF v_health > 0 THEN
    v_blockers := v_blockers || format('%s learner health (SF8) record(s) exist.', v_health);
  END IF;
  IF v_kinder > 0 THEN
    v_blockers := v_blockers || format('%s Kindergarten progress rating(s) exist.', v_kinder);
  END IF;
  IF v_pace > 0 THEN
    v_blockers := v_blockers || format('%s Grade 1 PACE rating(s) exist.', v_pace);
  END IF;
  IF v_core_values > 0 THEN
    v_blockers := v_blockers || format('%s report card core value record(s) exist for this school year.', v_core_values);
  END IF;
  IF v_cr_scores > 0 THEN
    v_blockers := v_blockers || format('%s class record score(s) are encoded in this section.', v_cr_scores);
  END IF;

  IF v_row.record_request_id IS NOT NULL
     OR v_row.origin_school_id IS NOT NULL
     OR v_row.enrollment_status IN ('pending_transfer', 'pending_review', 'transferred_out') THEN
    -- The cast is load-bearing: `text[] || <untyped literal>` is resolved as
    -- array || array and fails with "malformed array literal" at run time.
    v_blockers := v_blockers ||
      'This enrollment belongs to a transfer. Use Manage Requests (Remove Student) so the record request stays consistent.'::TEXT;
  END IF;

  IF v_row.enrollment_status = 'graduated' THEN
    v_blockers := v_blockers ||
      'This row records a graduation, which is what blocks the learner being re-enrolled. Change the status first if it is wrong.'::TEXT;
  END IF;

  -- School year runs June-May, matching getCurrentSchoolYear() in
  -- lib/utils/schoolYear.ts. Advisory only: not a blocker.
  v_current_sy := CASE
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 6
      THEN EXTRACT(YEAR FROM CURRENT_DATE)::INT || '-' || (EXTRACT(YEAR FROM CURRENT_DATE)::INT + 1)
    ELSE (EXTRACT(YEAR FROM CURRENT_DATE)::INT - 1) || '-' || EXTRACT(YEAR FROM CURRENT_DATE)::INT
  END;

  RETURN jsonb_build_object(
    'enrollment_id',       v_row.id,
    'student_id',          v_row.student_id,
    'student_name',        COALESCE(v_student.last_name || ', ' || v_student.first_name, 'Unknown learner'),
    'student_lrn',         v_student.lrn,
    'school_id',           v_row.school_id,
    'school_year',         v_row.school_year,
    'semester',            v_row.semester,
    'grade_level',         v_row.grade_level,
    'section_id',          v_row.section_id,
    'section_name',        v_section.name,
    'status',              v_row.status,
    'enrollment_status',   v_row.enrollment_status,
    'is_live',             (v_row.status = 'approved' AND v_row.enrollment_status = 'active'),
    'is_past_school_year', (v_row.school_year < v_current_sy),
    'counts', jsonb_build_object(
      'grades',             v_grades,
      'attendance',         v_attendance,
      'eccd',               v_eccd,
      'learner_health',     v_health,
      'kinder_progress',    v_kinder,
      'pace',               v_pace,
      'core_values',        v_core_values,
      'class_record_scores', v_cr_scores
    ),
    'cascades', jsonb_build_object('sned_disabilities', v_sned),
    'blockers',  to_jsonb(v_blockers),
    'deletable', (array_length(v_blockers, 1) IS NULL)
  );
END;
$$;

COMMENT ON FUNCTION procurements.enrollment_dependents IS
  'What is encoded against one enrollment and whether it may be deleted. Read by the Delete and Correct dialogs, and by delete_enrollment_safe itself, so preview and enforcement cannot drift.';

GRANT EXECUTE ON FUNCTION procurements.enrollment_dependents(BIGINT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Correct one enrollment's grade level and section
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.correct_enrollment(
  p_enrollment_id BIGINT,
  p_grade_level   INTEGER,
  p_section_id    BIGINT,
  p_semester      INTEGER DEFAULT NULL,
  p_reason        TEXT    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_row        procurements.sms_enrollments;
  v_section    RECORD;
  v_clash      RECORD;
  v_semester   INTEGER;
  v_remarks    TEXT;
  v_reason     TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_old_grade  INTEGER;
  v_old_section BIGINT;
  v_stranded_grades     BIGINT := 0;
  v_stranded_attendance BIGINT := 0;
  v_synced     BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_row
  FROM procurements.sms_enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment % not found.', p_enrollment_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The row is read before the caller is authorised so the guard can be
  -- explicit about the school it belongs to — the 156/157 lesson.
  PERFORM procurements.assert_enrollment_staff(v_row.school_id);

  IF v_row.enrollment_status IN ('pending_transfer', 'pending_review') THEN
    RAISE EXCEPTION
      'This enrollment is mid-transfer (%). The record request decides where it goes next — correct it from Manage Requests.',
      v_row.enrollment_status
      USING ERRCODE = 'check_violation';
  END IF;

  v_old_grade   := v_row.grade_level;
  v_old_section := v_row.section_id;

  -- Every column is cast to the type this function expects, per 157: a column
  -- made through the Supabase table editor lands as text/varchar, and
  -- `text IS DISTINCT FROM integer` raises rather than compares. The casts are
  -- no-ops where the schema matches the migration files.
  SELECT id::BIGINT           AS id,
         name::TEXT           AS name,
         grade_level::INTEGER AS grade_level,
         school_year::TEXT    AS school_year,
         school_id::BIGINT    AS school_id,
         is_active
    INTO v_section
  FROM procurements.sms_sections
  WHERE id = p_section_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Section % not found.', p_section_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_section.school_id IS DISTINCT FROM v_row.school_id THEN
    RAISE EXCEPTION 'Section "%" belongs to another school.', v_section.name
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_section.grade_level IS DISTINCT FROM p_grade_level THEN
    RAISE EXCEPTION
      'Section "%" is a grade % section, so it cannot hold a grade % enrollment.',
      v_section.name, v_section.grade_level, p_grade_level
      USING ERRCODE = 'check_violation';
  END IF;

  -- The school year is read off the row and is never a parameter: rolling it
  -- back is the mistake this function exists to make impossible.
  IF v_section.school_year IS DISTINCT FROM v_row.school_year THEN
    RAISE EXCEPTION
      'Section "%" belongs to SY %, but this enrollment is for SY %. Pick or create a section for SY %.',
      v_section.name, v_section.school_year, v_row.school_year, v_row.school_year
      USING ERRCODE = 'check_violation';
  END IF;

  -- chk_enrollments_semester (028): 11/12 carry a semester, nothing else may.
  IF p_grade_level BETWEEN 11 AND 12 THEN
    v_semester := COALESCE(p_semester, v_row.semester, 1);
    IF v_semester NOT IN (1, 2) THEN
      RAISE EXCEPTION 'Semester must be 1 or 2 for grade %.', p_grade_level
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    v_semester := NULL;
  END IF;

  -- uq_enrollments_student_school_year_semester, pre-checked so the registrar
  -- gets a sentence naming the other row instead of a raw 23505.
  SELECT id, grade_level, enrollment_status INTO v_clash
  FROM procurements.sms_enrollments
  WHERE student_id = v_row.student_id
    AND school_id IS NOT DISTINCT FROM v_row.school_id
    AND school_year = v_row.school_year
    AND COALESCE(semester, 0) = COALESCE(v_semester, 0)
    AND id <> v_row.id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'This learner already holds another enrollment for SY % at this school (grade %, %). Two rows cannot share one school year and semester — correct or remove that one first.',
      v_row.school_year, v_clash.grade_level, v_clash.enrollment_status
      USING ERRCODE = 'unique_violation';
  END IF;

  IF v_reason IS NOT NULL THEN
    v_remarks := btrim(concat_ws(
      E'\n',
      NULLIF(btrim(COALESCE(v_row.remarks, '')), ''),
      'Corrected ' || to_char(CURRENT_DATE, 'YYYY-MM-DD') || ': ' || v_reason
    ));
  ELSE
    v_remarks := v_row.remarks;
  END IF;

  UPDATE procurements.sms_enrollments
  SET grade_level = p_grade_level,
      section_id  = p_section_id,
      semester    = v_semester,
      remarks     = v_remarks,
      updated_at  = NOW()
  WHERE id = v_row.id;

  -- Only the live row says where the learner is sitting now. PromoteStudentModal
  -- bumps grade_level and clears current_section_id, and ChangeStatusModal does
  -- not put them back, so this is the write that finishes the repair.
  -- NOTE: sms_students.grade_level is TEXT on the live schema while
  -- sms_enrollments.grade_level is INTEGER (invariant 11). Assigning an integer
  -- to it is an I/O conversion cast, which PostgreSQL allows in assignment
  -- context, so this statement is correct against either type.
  IF v_row.status = 'approved' AND v_row.enrollment_status = 'active' THEN
    UPDATE procurements.sms_students
    SET grade_level        = p_grade_level,
        current_section_id = p_section_id
    WHERE id = v_row.student_id;
    v_synced := TRUE;
  END IF;

  -- Records left behind in the section the learner has just been moved out of.
  -- Reported, never moved — see the header.
  IF v_old_section IS DISTINCT FROM p_section_id THEN
    v_stranded_grades     := procurements.enrollment_scoped_count('sms_grades',     v_row.student_id, v_old_section, v_row.school_year);
    v_stranded_attendance := procurements.enrollment_scoped_count('sms_attendance', v_row.student_id, v_old_section, v_row.school_year);
  END IF;

  RETURN jsonb_build_object(
    'enrollment_id',        v_row.id,
    'student_id',           v_row.student_id,
    'school_year',          v_row.school_year,
    'from_grade_level',     v_old_grade,
    'to_grade_level',       p_grade_level,
    'from_section_id',      v_old_section,
    'to_section_id',        p_section_id,
    'to_section_name',      v_section.name,
    'semester',             v_semester,
    'student_record_synced', v_synced,
    'stranded_grades',      v_stranded_grades,
    'stranded_attendance',  v_stranded_attendance
  );
END;
$$;

COMMENT ON FUNCTION procurements.correct_enrollment IS
  'Move one enrollment to the right grade level and section in one transaction, syncing sms_students when the row is the live one. Never changes school year, school or enrollment_status, and never moves encoded grades.';

GRANT EXECUTE ON FUNCTION procurements.correct_enrollment(BIGINT, INTEGER, BIGINT, INTEGER, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Delete one enrollment, only when nothing is encoded against it
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.delete_enrollment_safe(
  p_enrollment_id BIGINT,
  p_reason        TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_row       procurements.sms_enrollments;
  v_facts     jsonb;
  v_blockers  TEXT;
  v_fallback  procurements.sms_enrollments;
  v_reverted  BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_row
  FROM procurements.sms_enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment % not found.', p_enrollment_id
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM procurements.assert_enrollment_registrar(v_row.school_id);

  -- The dialog's preview and this refusal are the same function, deliberately.
  v_facts := procurements.enrollment_dependents(p_enrollment_id);

  IF NOT (v_facts ->> 'deletable')::BOOLEAN THEN
    SELECT string_agg(value, ' ') INTO v_blockers
    FROM jsonb_array_elements_text(v_facts -> 'blockers');

    RAISE EXCEPTION
      'This enrollment cannot be deleted. %  Correct the enrollment instead — it keeps the row and its records.',
      v_blockers
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM procurements.sms_enrollments WHERE id = v_row.id;

  -- Point the learner back at whatever they still hold at this school, newest
  -- first. Without this the student row keeps a current_section_id belonging to
  -- an enrollment that no longer exists.
  SELECT * INTO v_fallback
  FROM procurements.sms_enrollments
  WHERE student_id = v_row.student_id
    AND school_id IS NOT DISTINCT FROM v_row.school_id
    AND status = 'approved'
  ORDER BY school_year DESC, COALESCE(semester, 0) DESC, id DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE procurements.sms_students
    SET grade_level        = v_fallback.grade_level,
        current_section_id = CASE
                               WHEN v_fallback.enrollment_status = 'active'
                               THEN v_fallback.section_id
                               ELSE NULL
                             END
    WHERE id = v_row.student_id;
    v_reverted := TRUE;
  ELSE
    UPDATE procurements.sms_students
    SET current_section_id = NULL
    WHERE id = v_row.student_id;
  END IF;

  RETURN jsonb_build_object(
    'deleted',                 TRUE,
    'enrollment_id',           v_row.id,
    'student_id',              v_row.student_id,
    'school_year',             v_row.school_year,
    'grade_level',             v_row.grade_level,
    'sned_disabilities_deleted', v_facts -> 'cascades' -> 'sned_disabilities',
    'reason',                  NULLIF(btrim(COALESCE(p_reason, '')), ''),
    'learner_reverted_to', CASE
      WHEN v_reverted THEN jsonb_build_object(
        'enrollment_id',     v_fallback.id,
        'school_year',       v_fallback.school_year,
        'grade_level',       v_fallback.grade_level,
        'enrollment_status', v_fallback.enrollment_status
      )
      ELSE NULL
    END
  );
END;
$$;

COMMENT ON FUNCTION procurements.delete_enrollment_safe IS
  'Delete one enrollment row when nothing is encoded against it, else raise naming what was found. Refuses transfer-linked and graduated rows. Registrar / school head / admin / division only.';

GRANT EXECUTE ON FUNCTION procurements.delete_enrollment_safe(BIGINT, TEXT) TO authenticated, service_role;
