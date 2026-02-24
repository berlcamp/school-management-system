-- ============================================================================
-- ADD diploma_file_path TO sms_students
-- ============================================================================
-- Stores path to diploma file in Supabase Storage (e.g. {school_id}/{student_id}/diploma.pdf)
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_students
  ADD COLUMN IF NOT EXISTS diploma_file_path TEXT;

COMMENT ON COLUMN procurements.sms_students.diploma_file_path IS 'Path to diploma file in Supabase Storage (PDF or image)';
