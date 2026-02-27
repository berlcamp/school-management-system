-- ============================================================================
-- ADD birth_certificate_file_path AND good_moral_file_path TO sms_students
-- ============================================================================
-- Paths to files in Supabase Storage (diplomas bucket): e.g. {school_id}/{student_id}/birth_certificate.pdf
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_students
  ADD COLUMN IF NOT EXISTS birth_certificate_file_path TEXT;

ALTER TABLE procurements.sms_students
  ADD COLUMN IF NOT EXISTS good_moral_file_path TEXT;

COMMENT ON COLUMN procurements.sms_students.birth_certificate_file_path IS 'Path to birth certificate file in Supabase Storage (PDF or image)';
COMMENT ON COLUMN procurements.sms_students.good_moral_file_path IS 'Path to good moral certificate file in Supabase Storage (PDF or image)';
