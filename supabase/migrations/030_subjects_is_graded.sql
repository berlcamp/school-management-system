-- ============================================================================
-- ADD is_graded COLUMN TO sms_subjects
-- ============================================================================
-- When false, subject does not require grading and will not appear in Grade Entry
-- Default true for backward compatibility with existing subjects
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_subjects
  ADD COLUMN IF NOT EXISTS is_graded BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN procurements.sms_subjects.is_graded IS 'When false, subject does not require grading and will not appear in Grade Entry module';
