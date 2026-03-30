-- ============================================================================
-- SNED DISABILITY / IMPAIRMENT INFORMATION
-- ============================================================================
-- Stores disability types for SNED (grade_level = -1) enrolled students.
-- A student may have multiple disabilities (multi-select).
-- ============================================================================

SET search_path TO procurements, public;

CREATE TABLE IF NOT EXISTS procurements.sms_student_disabilities (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id    uuid NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES procurements.sms_enrollments(id) ON DELETE CASCADE,
  disability    text NOT NULL,
  school_id     uuid,
  created_at    timestamptz DEFAULT now(),

  CONSTRAINT uq_student_enrollment_disability UNIQUE (student_id, enrollment_id, disability)
);

CREATE INDEX idx_sms_student_disabilities_student ON procurements.sms_student_disabilities(student_id);
CREATE INDEX idx_sms_student_disabilities_enrollment ON procurements.sms_student_disabilities(enrollment_id);

COMMENT ON TABLE procurements.sms_student_disabilities IS 'Disability/impairment types for SNED students (DepEd-aligned categories)';
