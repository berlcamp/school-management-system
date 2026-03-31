-- Add 'promoted' and 'graduated' to enrollment_status lifecycle values.
-- Previously, promotion was tracked as 'completed'. Now 'promoted' and 'graduated'
-- are explicit statuses used before a new enrollment is created.

ALTER TABLE procurements.sms_enrollments
  DROP CONSTRAINT IF EXISTS sms_enrollments_enrollment_status_check;

ALTER TABLE procurements.sms_enrollments
  ADD CONSTRAINT sms_enrollments_enrollment_status_check
  CHECK (enrollment_status IN ('active', 'completed', 'transferred_out', 'dropped', 'pending_transfer', 'retained', 'promoted', 'graduated'));
