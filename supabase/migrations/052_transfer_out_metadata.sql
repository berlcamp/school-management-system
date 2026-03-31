-- Add transfer metadata columns to sms_enrollments
-- Supports the proactive "Transfer Out" workflow where origin school
-- pre-releases a student before the destination school requests records.

ALTER TABLE procurements.sms_enrollments
  ADD COLUMN IF NOT EXISTS transfer_destination_school_id BIGINT
    REFERENCES procurements.sms_schools(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_date DATE;

-- Index for querying transferred-out students by destination
CREATE INDEX IF NOT EXISTS idx_enrollments_transfer_destination
  ON procurements.sms_enrollments (transfer_destination_school_id)
  WHERE transfer_destination_school_id IS NOT NULL;

COMMENT ON COLUMN procurements.sms_enrollments.transfer_destination_school_id
  IS 'Optional destination school when a student is proactively transferred out';

COMMENT ON COLUMN procurements.sms_enrollments.transfer_date
  IS 'Effective date of the transfer out';
