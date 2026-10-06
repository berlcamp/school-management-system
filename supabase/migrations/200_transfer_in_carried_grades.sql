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

  IF v_sec.grade_level::INTEGER IN (0, 1) THEN
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
    -- A blank name never clears a stored one (removal-only calls pass none).
    IF v_name IS NOT NULL THEN
      UPDATE procurements.sms_enrollments
         SET transfer_in_school_name = v_name, updated_at = NOW()
       WHERE id = v_enr.id;
    END IF;
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
