-- ============================================================================
-- ADD CONTACT FIELDS TO SMS_SCHOOLS
-- ============================================================================
-- Adds email, telephone_number, mobile_number, facebook_url columns
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_schools
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS telephone_number TEXT,
  ADD COLUMN IF NOT EXISTS mobile_number TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url TEXT;
