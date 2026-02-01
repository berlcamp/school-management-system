-- ============================================================================
-- GRANT PERMISSIONS FOR PUBLIC ACCESS
-- ============================================================================
-- This migration grants necessary permissions to anon and authenticated roles
-- for accessing tables in the procurements schema, especially for public forms
-- ============================================================================

-- Grant usage on the procurements schema
GRANT USAGE ON SCHEMA procurements TO anon, authenticated;

-- Grant permissions on sms_form137_requests table for public access
-- This allows anonymous users to insert Form 137 requests
GRANT SELECT, INSERT ON procurements.sms_form137_requests TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_form137_requests_id_seq TO anon, authenticated;

-- Grant permissions on sms_students table for LRN verification
-- Anonymous users need SELECT to verify LRN exists
GRANT SELECT ON procurements.sms_students TO anon, authenticated;
