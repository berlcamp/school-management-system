-- Fix: include school_id in enrollment uniqueness constraint
-- so a student can have enrollments at different schools for the same school_year/semester
-- (required for the transfer workflow)

DROP INDEX IF EXISTS procurements.uq_enrollments_student_school_year_semester;

CREATE UNIQUE INDEX uq_enrollments_student_school_year_semester
  ON procurements.sms_enrollments (student_id, school_id, school_year, COALESCE(semester, 0));
