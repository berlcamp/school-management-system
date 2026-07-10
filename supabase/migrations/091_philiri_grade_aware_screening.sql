-- ============================================================================
-- Phil-IRI — grade-aware Group Screening Test + number-free result labels
--
-- The GST is now scaled by key stage:
--   - Grades 3-6:  20-item form (7 / 7 / 6),   pass threshold >= 14
--   - Grades 7-10: 40-item form (14 / 14 / 12), pass threshold >= 28
--
-- The stored `screening_result` label used to embed the elementary threshold
-- ("For Phil-IRI (<14)" / "No Phil-IRI (>=14)"). Those numbers are wrong for the
-- 40-item form, so the app now stores number-free labels ("For Phil-IRI" /
-- "No Phil-IRI") and the threshold lives in the (grade-aware) UI text instead.
--
-- Normalise any rows written before this change so the division assessment
-- rollup (which groups by the exact label) keeps counting them.
-- ============================================================================

SET search_path TO procurements, public;

UPDATE procurements.sms_philiri_records
   SET screening_result = 'For Phil-IRI'
 WHERE screening_result = 'For Phil-IRI (<14)';

UPDATE procurements.sms_philiri_records
   SET screening_result = 'No Phil-IRI'
 WHERE screening_result = 'No Phil-IRI (≥14)';
