-- One GPA implementation for section placement.
--
-- Two code paths decided which section a learner lands in, and they disagreed:
--
--   * EnrollmentWizard → get_student_previous_gpa (036, then 076): excludes
--     madrasah subjects, but averages EVERY grade row — including the zeros
--     that stand for "not encoded yet". A section with one quarter still blank
--     therefore reported a GPA well below the learner's real standing, which
--     pushed them toward a Crack section.
--   * EnrollStudentsTabContent (Auto Enroll): filtered `grade > 0` in
--     JavaScript, but had no idea about madrasah subjects, so MEP grades were
--     counted toward the general average — contrary to DepEd practice and to
--     what migration 076 established.
--
-- Same learner, two answers, two placements. This makes students_gpa_for_grade
-- the only implementation — madrasah excluded, zeros excluded — and reduces
-- get_student_previous_gpa to a single-student wrapper over it.
--
-- The batch form also replaces a client-side fetch of every grade row for a
-- whole grade level, which Auto Enroll was doing on each run.

-- ---------------------------------------------------------------------------
-- 1. The one implementation
-- ---------------------------------------------------------------------------
-- Returns one row per id in p_student_ids, gpa NULL when the learner has no
-- enrollment at that grade level or no usable grades. p_school_year pins the
-- source year (Auto Enroll knows it exactly); NULL takes the most recent.

CREATE OR REPLACE FUNCTION procurements.students_gpa_for_grade(
  p_student_ids BIGINT[],
  p_grade_level INTEGER,
  p_school_year TEXT DEFAULT NULL,
  p_school_id   BIGINT DEFAULT NULL
)
RETURNS TABLE (student_id BIGINT, gpa NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT ids.sid, avg_row.value
  FROM unnest(COALESCE(p_student_ids, ARRAY[]::BIGINT[])) AS ids(sid)
  -- The enrollment that grade level was taken in …
  LEFT JOIN LATERAL (
    SELECT e.section_id, e.school_year
    FROM procurements.sms_enrollments e
    WHERE e.student_id = ids.sid
      AND e.grade_level = p_grade_level
      AND e.status = 'approved'
      AND (p_school_year IS NULL OR e.school_year = p_school_year)
      AND (p_school_id IS NULL OR e.school_id = p_school_id)
    ORDER BY e.school_year DESC, e.created_at DESC
    LIMIT 1
  ) src ON TRUE
  -- … and its average, excluding MEP subjects and un-encoded zeros.
  LEFT JOIN LATERAL (
    SELECT ROUND(AVG(g.grade)::numeric, 2) AS value
    FROM procurements.sms_grades g
    JOIN procurements.sms_subjects s ON s.id = g.subject_id
    WHERE g.student_id  = ids.sid
      AND g.section_id  = src.section_id
      AND g.school_year = src.school_year
      AND COALESCE(s.is_madrasah, false) = false
      AND g.grade > 0
  ) avg_row ON TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION procurements.students_gpa_for_grade IS
  'Average grade per learner for a given grade level, excluding madrasah subjects and un-encoded (0) grades. The single source of truth for section placement — both the enrollment wizard and Auto Enroll go through it.';

GRANT EXECUTE ON FUNCTION procurements.students_gpa_for_grade(BIGINT[], INTEGER, TEXT, BIGINT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. get_student_previous_gpa is now a wrapper
-- ---------------------------------------------------------------------------
-- Same signature and meaning as 076 (the average at grade_level - 1); it now
-- also drops zero grades, which is the behaviour change this migration exists
-- for.

CREATE OR REPLACE FUNCTION procurements.get_student_previous_gpa(
  p_student_id BIGINT,
  p_grade_level INTEGER,
  p_school_id BIGINT DEFAULT NULL
)
RETURNS NUMERIC AS $$
  SELECT g.gpa
  FROM procurements.students_gpa_for_grade(
    ARRAY[p_student_id], p_grade_level - 1, NULL, p_school_id
  ) g;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION procurements.get_student_previous_gpa IS
  'Average grade from a learner''s most recent approved enrollment at (grade_level - 1), excluding madrasah subjects and un-encoded (0) grades. Thin wrapper over students_gpa_for_grade.';
