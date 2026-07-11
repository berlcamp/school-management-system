-- ============================================================================
-- ARAL — add suggested_start_grade
--
-- The instructional entry grade for a learner's reading intervention (a few
-- grade levels below their grade for struggling readers). Computed by the app
-- at enrollment (Phil-IRI: GST-based "2-3 levels down"; CRLA: Refresher
-- severity). Idempotent so it is safe whether or not 097 already added it.
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_aral_enrollments
  ADD COLUMN IF NOT EXISTS suggested_start_grade INTEGER;
