-- Add date_dropped column to sms_enrollments
ALTER TABLE procurements.sms_enrollments
  ADD COLUMN IF NOT EXISTS date_dropped DATE;

-- Drop the existing enrollment_status CHECK constraint and recreate with 'retained'
ALTER TABLE procurements.sms_enrollments
  DROP CONSTRAINT IF EXISTS sms_enrollments_enrollment_status_check;

ALTER TABLE procurements.sms_enrollments
  ADD CONSTRAINT sms_enrollments_enrollment_status_check
  CHECK (enrollment_status IN ('active', 'completed', 'transferred_out', 'dropped', 'pending_transfer', 'retained'));
