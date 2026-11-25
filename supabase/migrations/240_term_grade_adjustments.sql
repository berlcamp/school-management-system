-- ============================================================================
-- 240: Additional points on a term grade
-- ============================================================================
-- 239 takes points on the FINAL grade only. A teacher may now ask for points on
-- one posted TERM grade, through the same request, approval and notifications.
--
-- sms_grade_adjustments.semester gains 11-14 = grading period 1-4. Everything
-- that reads 0 / 1 / 2 (students_gpa_for_grade, lib/utils/finalPoints.ts, the
-- app version before this) ignores them, so nothing counts points twice.
--
-- Unlike final points, approved term points go INTO sms_grades.grade, so every
-- reader of the term (card, SF9, MAPEH, GPA, SF10, portal) carries them with no
-- change. sms_grades.added_points is how much of the grade they are: re-posting
-- the class record adds them again, revoking takes them out. Capped at 100.
-- Only a grade posted from a class record, SY 2026-2027 on, and never a
-- carried-over one. Unposting deletes the grade; posting again restores both.
--
-- Changes no row: added_points is 0 on every existing grade (constant default,
-- no table rewrite). One column, one CHECK widened, six functions replaced with
-- the same signatures (bodies of 200 and 239), two new. Requires 223, 239.
-- Tests: supabase/tests/240_term_grade_adjustments.sql
-- ============================================================================

ALTER TABLE procurements.sms_grades
  ADD COLUMN IF NOT EXISTS added_points SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE procurements.sms_grade_adjustments
  DROP CONSTRAINT IF EXISTS sms_grade_adjustments_semester_check;
ALTER TABLE procurements.sms_grade_adjustments
  ADD CONSTRAINT sms_grade_adjustments_semester_check
  CHECK (semester IN (0, 1, 2, 11, 12, 13, 14));

-- ------------------------------------------------------------ new helpers --
CREATE OR REPLACE FUNCTION procurements.grade_adjustment_term_points(
  p_student_id BIGINT, p_subject_id BIGINT, p_section_id BIGINT,
  p_school_year TEXT, p_period INTEGER)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT COALESCE(sum(a.points), 0)::INTEGER FROM sms_grade_adjustments a
   WHERE a.student_id = p_student_id AND a.subject_id = p_subject_id
     AND a.section_id = p_section_id AND a.school_year = p_school_year
     AND a.semester = 10 + p_period AND a.status = 'approved';
$$;

-- Make the posted term grade agree with what is approved now.
CREATE OR REPLACE FUNCTION procurements.grade_adjustment_apply_term(p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE a sms_grade_adjustments; v_points INTEGER;
BEGIN
  SELECT * INTO a FROM sms_grade_adjustments WHERE id = p_id;
  IF a.id IS NULL OR a.semester < 11 THEN RETURN; END IF;
  v_points := grade_adjustment_term_points(
    a.student_id, a.subject_id, a.section_id, a.school_year, a.semester - 10);
  UPDATE sms_grades g
     SET grade = n.total, added_points = n.total - n.base,
         remarks = CASE WHEN n.total >= 75 THEN 'Passed' ELSE 'Failed' END,
         updated_at = now()
    FROM (SELECT x.id, x.grade - x.added_points AS base,
                 LEAST(100, x.grade - x.added_points + v_points) AS total
            FROM sms_grades x
           WHERE x.student_id = a.student_id AND x.subject_id = a.subject_id
             AND x.section_id = a.section_id AND x.school_year = a.school_year
             AND x.grading_period = a.semester - 10
             AND x.carried_from_school IS NULL) n
   WHERE g.id = n.id AND g.added_points IS DISTINCT FROM n.total - n.base;
END $$;

REVOKE ALL ON FUNCTION procurements.grade_adjustment_term_points(BIGINT, BIGINT, BIGINT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.grade_adjustment_apply_term(BIGINT) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------- replaced functions (240 marks) --
CREATE OR REPLACE FUNCTION procurements.grade_adjustment_base_final(
  p_student_id BIGINT, p_subject_id BIGINT, p_section_id BIGINT, p_semester SMALLINT)
RETURNS SMALLINT LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE v_sy TEXT; v_old BOOLEAN; v_periods INT[]; v_n INT; v_avg NUMERIC; v_term SMALLINT;
BEGIN
  SELECT s.school_year::TEXT, COALESCE(s.shs_curriculum, '') = 'old'
    INTO v_sy, v_old FROM sms_sections s WHERE s.id = p_section_id;
  -- 240: a term (11-14). The grade as scored, from a posted class record; never
  -- a carried-over grade, never a year whose grades are typed by hand.
  IF p_semester BETWEEN 11 AND 14 THEN
    IF v_sy IS NULL OR v_sy < '2026-2027' THEN RETURN NULL; END IF;
    SELECT (g.grade - g.added_points)::SMALLINT INTO v_term
      FROM sms_grades g
      JOIN sms_class_records r
        ON r.subject_id = g.subject_id AND r.section_id = g.section_id
       AND r.school_year = g.school_year AND r.grading_period = g.grading_period
     WHERE g.student_id = p_student_id AND g.subject_id = p_subject_id
       AND g.section_id = p_section_id AND g.school_year = v_sy
       AND g.grading_period::INT = p_semester - 10
       AND g.grade > 0 AND g.carried_from_school IS NULL AND r.is_posted;
    RETURN v_term;
  END IF;
  IF v_sy IS NULL OR v_old <> (p_semester <> 0) THEN RETURN NULL; END IF;

  IF p_semester = 1 THEN v_periods := '{1,2}';
  ELSIF p_semester = 2 THEN v_periods := '{3,4}';
  ELSE
    SELECT o.terms::INT[] INTO v_periods FROM sms_section_subject_terms o
     WHERE o.section_id = p_section_id AND o.subject_id = p_subject_id
       AND o.school_year = v_sy;
    v_periods := COALESCE(v_periods,
      CASE WHEN v_sy >= '2026-2027' THEN '{1,2,3}'::INT[] ELSE '{1,2,3,4}'::INT[] END);
  END IF;

  SELECT count(DISTINCT g.grading_period), avg(g.grade) INTO v_n, v_avg
    FROM sms_grades g
   WHERE g.student_id = p_student_id AND g.subject_id = p_subject_id
     AND g.section_id = p_section_id AND g.school_year = v_sy
     AND g.grading_period::INT = ANY (v_periods) AND g.grade > 0;
  IF v_n < cardinality(v_periods) THEN RETURN NULL; END IF;
  RETURN round(v_avg)::SMALLINT;
END $$;

CREATE OR REPLACE FUNCTION procurements.grade_adjustment_label(p_id BIGINT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT concat_ws(', ', st.last_name, st.first_name) || ': +' || a.points
         || ' in ' || sub.name || ' (' || sec.name || ')'
         || CASE WHEN a.semester < 11 THEN ''
                 WHEN sec.shs_curriculum = 'old' THEN
                   ', ' || CASE WHEN a.semester <= 12 THEN '1st' ELSE '2nd' END
                   || ' Semester Quarter ' || CASE WHEN a.semester IN (11, 13) THEN 1 ELSE 2 END
                 ELSE ', Term ' || (a.semester - 10) END
  FROM sms_grade_adjustments a
  JOIN sms_students st ON st.id = a.student_id
  JOIN sms_subjects sub ON sub.id = a.subject_id
  JOIN sms_sections sec ON sec.id = a.section_id
  WHERE a.id = p_id;
$$;

CREATE OR REPLACE FUNCTION procurements.grade_adjustment_request(
  p_student_id BIGINT, p_subject_id BIGINT, p_section_id BIGINT,
  p_semester SMALLINT, p_points INTEGER, p_reason TEXT, p_note TEXT DEFAULT NULL)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE v_me BIGINT; v_type TEXT; v_school BIGINT; v_sy TEXT; v_base SMALLINT; v_id BIGINT;
BEGIN
  SELECT u.id, u.type INTO v_me, v_type FROM sms_users u
   WHERE u.user_id = auth.uid() AND u.is_active LIMIT 1;
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not signed in.'; END IF;

  SELECT s.school_id, s.school_year::TEXT INTO v_school, v_sy
    FROM sms_sections s WHERE s.id = p_section_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'Section not found.'; END IF;

  IF v_type IN ('region_account', 'sbfp_viewer') OR NOT (
       v_type = 'super admin' OR EXISTS (
         SELECT 1 FROM sms_subject_schedules ss
         WHERE ss.section_id = p_section_id AND ss.subject_id = p_subject_id
           AND ss.school_year = v_sy AND ss.teacher_id = v_me
           -- 240 / 223: a term belongs to the teacher whose row covers it.
           AND (p_semester < 11 OR ss.grading_periods IS NULL
                OR (p_semester - 10)::SMALLINT = ANY (ss.grading_periods)))) THEN
    RAISE EXCEPTION 'Only the subject''s teacher in this section may request additional points.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM sms_enrollments e
    WHERE e.student_id = p_student_id AND e.section_id = p_section_id
      AND e.status = 'approved') THEN
    RAISE EXCEPTION 'The learner is not enrolled in this section.';
  END IF;
  IF p_points IS NULL OR p_points NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Points must be a whole number from 1 to 10.';
  END IF;
  IF p_reason = 'other' AND NULLIF(btrim(p_note), '') IS NULL THEN
    RAISE EXCEPTION 'Describe the reason.';
  END IF;

  v_base := grade_adjustment_base_final(p_student_id, p_subject_id, p_section_id, p_semester);
  IF v_base IS NULL THEN
    RAISE EXCEPTION '%', CASE WHEN p_semester >= 11
      THEN 'The term grade is not posted from a class record.'
      ELSE 'The final grade is not complete yet.' END;
  END IF;
  IF v_base + p_points > 100 THEN
    RAISE EXCEPTION 'The grade cannot go above 100.';
  END IF;

  BEGIN
    INSERT INTO sms_grade_adjustments (school_id, student_id, subject_id, section_id,
      school_year, semester, points, reason, note, base_final, requested_by)
    VALUES (v_school, p_student_id, p_subject_id, p_section_id, v_sy, p_semester,
      p_points, p_reason, NULLIF(btrim(p_note), ''), v_base, v_me)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This learner already has pending or approved points for this grade.';
  END;
  PERFORM grade_adjustment_notify_approvers(v_id);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION procurements.grade_adjustment_decide(
  p_id BIGINT, p_approve BOOLEAN, p_remarks TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE a sms_grade_adjustments; v_final SMALLINT;
BEGIN
  SELECT * INTO a FROM sms_grade_adjustments WHERE id = p_id FOR UPDATE;
  IF a.id IS NULL OR NOT grade_adjustment_can_decide(a.subject_id, a.school_id) THEN
    RAISE EXCEPTION 'Only the subject''s Department Head or the School Head may decide this request.';
  END IF;
  IF a.requested_by = announcement_me_id() THEN
    RAISE EXCEPTION 'You cannot decide your own request.';
  END IF;
  IF a.status <> 'pending' THEN
    RAISE EXCEPTION 'This request is no longer pending.';
  END IF;
  IF p_approve IS NULL THEN RAISE EXCEPTION 'Approve or reject.'; END IF;
  -- 240: before reading the grade, wait for a running post of the term.
  IF a.semester >= 11 THEN
    PERFORM 1 FROM sms_class_records r
     WHERE r.subject_id = a.subject_id AND r.section_id = a.section_id
       AND r.school_year = a.school_year AND r.grading_period = a.semester - 10
       FOR UPDATE;
  END IF;
  IF p_approve THEN
    v_final := grade_adjustment_base_final(a.student_id, a.subject_id, a.section_id, a.semester);
    IF v_final IS NULL THEN
      RAISE EXCEPTION '%', CASE WHEN a.semester >= 11
        THEN 'The term grade is no longer posted.'
        ELSE 'The final grade is no longer complete.' END;
    END IF;
    IF v_final + a.points > 100 THEN
      RAISE EXCEPTION 'The grade cannot go above 100.';
    END IF;
  ELSIF NULLIF(btrim(p_remarks), '') IS NULL THEN
    RAISE EXCEPTION 'Give a reason for rejecting.';
  END IF;

  UPDATE sms_grade_adjustments
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         decided_by = announcement_me_id(), decided_at = now(),
         decision_remarks = NULLIF(btrim(p_remarks), '')
   WHERE id = p_id;
  PERFORM grade_adjustment_apply_term(p_id);
  PERFORM grade_adjustment_clear_requests(p_id);
  PERFORM grade_adjustment_notify_teacher(p_id,
    CASE WHEN p_approve THEN 'Additional points approved'
         ELSE 'Additional points rejected' END, p_remarks);
END $$;

CREATE OR REPLACE FUNCTION procurements.grade_adjustment_revoke(
  p_id BIGINT, p_remarks TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE a sms_grade_adjustments;
BEGIN
  SELECT * INTO a FROM sms_grade_adjustments WHERE id = p_id FOR UPDATE;
  IF a.id IS NULL OR NOT grade_adjustment_can_decide(a.subject_id, a.school_id) THEN
    RAISE EXCEPTION 'Only the subject''s Department Head or the School Head may revoke this.';
  END IF;
  IF a.requested_by = announcement_me_id() THEN
    RAISE EXCEPTION 'You cannot decide your own request.';
  END IF;
  IF a.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved points can be revoked.';
  END IF;
  IF NULLIF(btrim(p_remarks), '') IS NULL THEN
    RAISE EXCEPTION 'Give a reason for revoking.';
  END IF;
  -- 240: wait for a running post of the term.
  IF a.semester >= 11 THEN
    PERFORM 1 FROM sms_class_records r
     WHERE r.subject_id = a.subject_id AND r.section_id = a.section_id
       AND r.school_year = a.school_year AND r.grading_period = a.semester - 10
       FOR UPDATE;
  END IF;
  UPDATE sms_grade_adjustments
     SET status = 'revoked', revoked_by = announcement_me_id(),
         revoked_at = now(), revoke_remarks = btrim(p_remarks)
   WHERE id = p_id;
  PERFORM grade_adjustment_apply_term(p_id);
  PERFORM grade_adjustment_notify_teacher(p_id, 'Additional points revoked', p_remarks);
END $$;

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
  v_base       INTEGER;
BEGIN
  SELECT * INTO rec FROM procurements.sms_class_records WHERE id = p_class_record_id
     FOR UPDATE; -- 240: a decision on points waits for this post, and vice versa
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

    -- 240: approved points on this term stay on every re-post.
    v_base := v_term;
    v_term := LEAST(100, v_base + procurements.grade_adjustment_term_points(
      v_student_id, rec.subject_id, rec.section_id, rec.school_year,
      rec.grading_period::INTEGER));

    INSERT INTO procurements.sms_grades (
      student_id, subject_id, section_id, grading_period, school_year,
      grade, remarks, teacher_id, added_points
    ) VALUES (
      v_student_id, rec.subject_id, rec.section_id, rec.grading_period, rec.school_year,
      v_term, CASE WHEN v_term >= 75 THEN 'Passed' ELSE 'Failed' END, rec.teacher_id,
      v_term - v_base
    )
    ON CONFLICT (student_id, subject_id, section_id, grading_period, school_year)
    DO UPDATE SET
      grade = EXCLUDED.grade,
      remarks = EXCLUDED.remarks,
      teacher_id = EXCLUDED.teacher_id,
      added_points = EXCLUDED.added_points,
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
