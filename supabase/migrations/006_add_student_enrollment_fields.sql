-- ============================================================================
-- ADD GRADE_LEVEL AND ENROLLMENT_ID TO SMS_STUDENTS
-- ============================================================================
-- This migration adds grade_level and enrollment_id fields to sms_students table
-- to track the student's current grade level and active enrollment
-- ============================================================================

-- Set the schema to procurements
SET search_path TO procurements, public;

-- Add grade_level column to sms_students
ALTER TABLE procurements.sms_students
ADD COLUMN IF NOT EXISTS grade_level INTEGER CHECK (grade_level >= 1 AND grade_level <= 12);

-- Add enrollment_id column to sms_students
ALTER TABLE procurements.sms_students
ADD COLUMN IF NOT EXISTS enrollment_id BIGINT REFERENCES procurements.sms_enrollments(id) ON DELETE SET NULL;

-- Create indexes for the new fields
CREATE INDEX IF NOT EXISTS idx_students_grade_level ON procurements.sms_students(grade_level);
CREATE INDEX IF NOT EXISTS idx_students_enrollment ON procurements.sms_students(enrollment_id);

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN procurements.sms_students.grade_level IS 'Current grade level of the student (1-12)';
COMMENT ON COLUMN procurements.sms_students.enrollment_id IS 'Reference to the current active enrollment record';
