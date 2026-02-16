-- ============================================================================
-- REMOVE division_id REQUIREMENT
-- ============================================================================
-- Makes division_id optional - no longer used in the application
-- ============================================================================

SET search_path TO procurements, public;

-- sms_schools: division_id becomes nullable
ALTER TABLE procurements.sms_schools
  ALTER COLUMN division_id DROP NOT NULL;

-- Drop index if division_id is no longer used for filtering (optional - keep for legacy data)
-- CREATE INDEX is kept for any existing queries; can be dropped later if desired
