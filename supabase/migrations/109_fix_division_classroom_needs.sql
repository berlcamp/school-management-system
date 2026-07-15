-- ============================================================================
-- FIX: division_classroom_needs — enrolled always returned 0
-- ============================================================================
-- Two defects in the version from migration 075:
--
--   1. The enroll CTE filtered on e.status, which is the *approval* status
--      ('pending','approved','rejected' — migration 001). The lifecycle values
--      it tested for ('active','promoted',...) live in e.enrollment_status
--      (migration 038). The filter therefore matched no rows, so every school
--      reported enrolled = 0 and classrooms_needed = 0, which in turn made
--      delta equal the raw classroom count — i.e. a phantom surplus everywhere.
--      (enrollment_autofill in migration 072 already uses enrollment_status.)
--
--   2. Enrollments were attributed to sms_students.school_id (the learner's
--      home-school record) instead of sms_enrollments.school_id (the school
--      they are actually enrolled at for that school year). These diverge for
--      transferees, who are immediately active at the destination school while
--      their student record may still point elsewhere. Counting by
--      e.school_id matches how every other division report scopes enrollment.
--
-- Signature and result columns are unchanged — no frontend change required.
-- Read-only aggregate; no schema or data changes.
-- ============================================================================

SET search_path TO procurements, public;

CREATE OR REPLACE FUNCTION procurements.division_classroom_needs(
  p_school_year TEXT
)
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
  school_type TEXT,
  grade_level INT,
  enrolled BIGINT,
  standard_class_size INT,
  classrooms_needed INT,
  classrooms_available BIGINT,
  delta INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  WITH enroll AS (
    SELECT
      e.school_id,
      e.grade_level,
      COUNT(*) AS enrolled
    FROM procurements.sms_enrollments e
    WHERE e.school_year = p_school_year
      AND e.enrollment_status IN
        ('active','promoted','retained','graduated','completed')
    GROUP BY e.school_id, e.grade_level
  ),
  classrooms AS (
    SELECT
      r.school_id,
      COUNT(*) AS classrooms_available
    FROM procurements.sms_rooms r
    WHERE r.is_active AND r.room_type = 'classroom'
    GROUP BY r.school_id
  )
  SELECT
    s.id AS school_id,
    s.name AS school_name,
    s.school_type,
    COALESCE(e.grade_level, 0) AS grade_level,
    COALESCE(e.enrolled, 0) AS enrolled,
    COALESCE(st.max_students, 40) AS standard_class_size,
    CEIL(COALESCE(e.enrolled, 0)::numeric / GREATEST(COALESCE(st.max_students, 40), 1))::int
      AS classrooms_needed,
    COALESCE(c.classrooms_available, 0) AS classrooms_available,
    (COALESCE(c.classrooms_available, 0)::int
      - CEIL(COALESCE(e.enrolled, 0)::numeric / GREATEST(COALESCE(st.max_students, 40), 1))::int
    ) AS delta
  FROM procurements.sms_schools s
  LEFT JOIN enroll e ON e.school_id = s.id
  LEFT JOIN classrooms c ON c.school_id = s.id
  LEFT JOIN procurements.sms_class_size_standards st
    ON st.grade_level = e.grade_level
  WHERE s.is_active
  ORDER BY s.name, grade_level;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_classroom_needs(TEXT) TO authenticated;

COMMENT ON FUNCTION procurements.division_classroom_needs(TEXT) IS
  'Classroom shortage/surplus per (school, grade_level) from live enrollments '
  'vs classrooms vs class size standards. Counts enrollments by '
  'sms_enrollments.school_id and enrollment_status (not status).';
