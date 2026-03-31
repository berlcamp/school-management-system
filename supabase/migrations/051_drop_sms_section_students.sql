-- ============================================================================
-- DROP sms_section_students
-- ============================================================================
-- Section-student relationships are now based on sms_enrollments.
-- This migration removes the deprecated sms_section_students table.
-- ============================================================================

SET search_path TO procurements, public;

DROP TABLE IF EXISTS procurements.sms_section_students CASCADE;
