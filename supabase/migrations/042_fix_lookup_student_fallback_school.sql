-- Fix: lookup_student_by_lrn should fall back to sms_students.school_id
-- when no enrollment exists. Previously, students added to a school but
-- not yet enrolled would show current_school_id = NULL, causing the
-- enrollment wizard to incorrectly flag them as transferees.

CREATE OR REPLACE FUNCTION procurements.lookup_student_by_lrn(p_lrn TEXT)
RETURNS TABLE (
  student_id BIGINT, lrn TEXT, first_name TEXT, last_name TEXT,
  middle_name TEXT, suffix TEXT, date_of_birth DATE, gender TEXT,
  current_school_id BIGINT, current_school_name TEXT,
  current_grade_level INTEGER, current_school_year TEXT, enrollment_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.lrn, s.first_name, s.last_name, s.middle_name, s.suffix,
    s.date_of_birth, s.gender,
    COALESCE(e.school_id, s.school_id),
    COALESCE(sch_e.name, sch_s.name),
    e.grade_level, e.school_year, e.enrollment_status
  FROM procurements.sms_students s
  LEFT JOIN LATERAL (
    SELECT e2.school_id, e2.grade_level, e2.school_year, e2.enrollment_status
    FROM procurements.sms_enrollments e2
    WHERE e2.student_id = s.id AND e2.status = 'approved'
    ORDER BY e2.school_year DESC, e2.created_at DESC LIMIT 1
  ) e ON TRUE
  LEFT JOIN procurements.sms_schools sch_e ON sch_e.id = e.school_id
  LEFT JOIN procurements.sms_schools sch_s ON sch_s.id = s.school_id
  WHERE s.lrn = p_lrn;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
