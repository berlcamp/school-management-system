-- ============================================================================
-- ADD request_type TO sms_form137_requests
-- ============================================================================
-- Enables unified handling of Form 137 and Diploma requests.
-- ============================================================================

SET search_path TO procurements, public;

-- Add request_type column (DEFAULT ensures existing rows get 'form137')
ALTER TABLE procurements.sms_form137_requests
  ADD COLUMN IF NOT EXISTS request_type TEXT DEFAULT 'form137';

-- Backfill any nulls (e.g. from partial migration)
UPDATE procurements.sms_form137_requests
SET request_type = 'form137'
WHERE request_type IS NULL OR request_type = '';

-- Enforce NOT NULL and check
ALTER TABLE procurements.sms_form137_requests
  ALTER COLUMN request_type SET NOT NULL,
  ALTER COLUMN request_type SET DEFAULT 'form137';
ALTER TABLE procurements.sms_form137_requests
  DROP CONSTRAINT IF EXISTS chk_sms_form137_requests_request_type;
ALTER TABLE procurements.sms_form137_requests
  ADD CONSTRAINT chk_sms_form137_requests_request_type
  CHECK (request_type IN ('form137', 'diploma'));

-- Index for filtering by request type
CREATE INDEX IF NOT EXISTS idx_form137_request_type
  ON procurements.sms_form137_requests(request_type);

COMMENT ON COLUMN procurements.sms_form137_requests.request_type IS 'Type of document requested: form137 or diploma';
