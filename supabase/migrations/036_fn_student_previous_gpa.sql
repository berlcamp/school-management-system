-- ============================================================================
-- FUNCTION: get_student_previous_gpa
-- Returns the average grade for a student's most recent approved enrollment
-- in the grade level immediately below the given one.
-- Returns NULL when no previous enrollment or grades exist.
-- ============================================================================

CREATE OR REPLACE FUNCTION procurements.get_student_previous_gpa(
  p_student_id BIGINT,
  p_grade_level INTEGER,
  p_school_id BIGINT DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  v_section_id BIGINT;
  v_school_year TEXT;
  v_gpa NUMERIC;
BEGIN
  -- Find the most recent approved enrollment at the previous grade level
  SELECT e.section_id, e.school_year
    INTO v_section_id, v_school_year
    FROM procurements.sms_enrollments e
   WHERE e.student_id = p_student_id
     AND e.grade_level = p_grade_level - 1
     AND e.status = 'approved'
     AND (p_school_id IS NULL OR e.school_id = p_school_id)
   ORDER BY e.school_year DESC
   LIMIT 1;

  IF v_section_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Compute average grade
  SELECT ROUND(AVG(g.grade)::numeric, 2)
    INTO v_gpa
    FROM procurements.sms_grades g
   WHERE g.student_id = p_student_id
     AND g.section_id = v_section_id
     AND g.school_year = v_school_year;

  RETURN v_gpa;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION procurements.get_student_previous_gpa IS
  'Returns the average grade from a student''s most recent approved enrollment at (grade_level - 1). NULL if no data.';
