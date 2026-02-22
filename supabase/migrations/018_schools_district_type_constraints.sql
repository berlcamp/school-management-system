-- ============================================================================
-- ADD CHECK CONSTRAINTS FOR SMS_SCHOOLS DISTRICT AND SCHOOL_TYPE
-- ============================================================================
-- Ensures district and school_type accept only valid values from constants.
-- Both columns remain nullable (optional).
-- ============================================================================

SET search_path TO procurements, public;

-- school_type: elementary, junior_high, senior_high, complete_secondary, integrated
ALTER TABLE procurements.sms_schools
  DROP CONSTRAINT IF EXISTS sms_schools_school_type_check;

ALTER TABLE procurements.sms_schools
  ADD CONSTRAINT sms_schools_school_type_check
  CHECK (
    school_type IS NULL
    OR school_type IN (
      'elementary',
      'junior_high',
      'senior_high',
      'complete_secondary',
      'integrated'
    )
  );

-- district: values from SCHOOL_DISTRICTS constant
ALTER TABLE procurements.sms_schools
  DROP CONSTRAINT IF EXISTS sms_schools_district_check;

ALTER TABLE procurements.sms_schools
  ADD CONSTRAINT sms_schools_district_check
  CHECK (
    district IS NULL
    OR district IN (
      'North District',
      'South District',
      'East District',
      'West District',
      'Central District'
    )
  );
