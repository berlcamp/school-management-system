-- ============================================================================
-- ADD ATTACHMENT TO SMS_HISTORICAL_GRADES
-- ============================================================================
-- Allows users to attach a supporting document (e.g., scanned SF10/report card)
-- when encoding historical grade records.
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_historical_grades
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT;

COMMENT ON COLUMN procurements.sms_historical_grades.attachment_url IS
  'Public URL of the attached supporting document stored in the diplomas bucket';
COMMENT ON COLUMN procurements.sms_historical_grades.attachment_name IS
  'Original filename of the attached document for display purposes';
