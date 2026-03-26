-- ============================================================================
-- ADD SNED (SPECIAL NEEDS EDUCATION) GRADE LEVEL SUPPORT
-- ============================================================================
-- Extends grade_level from 0-12 to -1-12 (-1 = SNED)
-- SNED behaves like Kindergarten; students promote to Grade 1.
-- ============================================================================

SET search_path TO procurements, public;

-- sms_subjects: Drop and recreate grade_level check
ALTER TABLE procurements.sms_subjects
  DROP CONSTRAINT IF EXISTS sms_subjects_grade_level_check;
ALTER TABLE procurements.sms_subjects
  ADD CONSTRAINT sms_subjects_grade_level_check CHECK ((grade_level::integer) >= -1 AND (grade_level::integer) <= 12);

-- sms_sections: Drop and recreate grade_level check
ALTER TABLE procurements.sms_sections
  DROP CONSTRAINT IF EXISTS sms_sections_grade_level_check;
ALTER TABLE procurements.sms_sections
  ADD CONSTRAINT sms_sections_grade_level_check CHECK ((grade_level::integer) >= -1 AND (grade_level::integer) <= 12);

-- sms_enrollments: Drop and recreate grade_level check
ALTER TABLE procurements.sms_enrollments
  DROP CONSTRAINT IF EXISTS sms_enrollments_grade_level_check;
ALTER TABLE procurements.sms_enrollments
  ADD CONSTRAINT sms_enrollments_grade_level_check CHECK ((grade_level::integer) >= -1 AND (grade_level::integer) <= 12);

-- sms_students: Drop and recreate grade_level check
ALTER TABLE procurements.sms_students
  DROP CONSTRAINT IF EXISTS sms_students_grade_level_check;
ALTER TABLE procurements.sms_students
  ADD CONSTRAINT sms_students_grade_level_check CHECK ((grade_level::integer) >= -1 AND (grade_level::integer) <= 12);

COMMENT ON COLUMN procurements.sms_students.grade_level IS 'Current grade level (-1 = SNED, 0 = Kindergarten, 1-12 = Grade 1-12)';
