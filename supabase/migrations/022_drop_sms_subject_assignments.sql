-- ============================================================================
-- DROP sms_subject_assignments
-- ============================================================================
-- Subject assignments are now based on sms_subject_schedules.
-- This migration removes the deprecated sms_subject_assignments table.
-- ============================================================================

SET search_path TO procurements, public;

DROP TABLE IF EXISTS procurements.sms_subject_assignments CASCADE;
