-- ============================================================================
-- CLASS RECORD — RESET LEGACY SUMMATIVE ITEMS TO FIXED ST1 / ST2 / TE
--
-- Migration 081 seeded the fixed ST items (ST1/ST2/TE) only for class records
-- that had NO summative columns yet. Records where a teacher had already added
-- free-form ST columns were skipped, so they still show the old columns — which
-- carry no per-item weight and therefore can't produce an ST score under the
-- new weighted model, and offer no add/remove controls.
--
-- Legacy ST items are identified by weight IS NULL (the new fixed items always
-- carry a weight). This migration drops those legacy columns (their scores go
-- with them via ON DELETE CASCADE — they don't map to the new model) and seeds
-- the fixed ST1 (30%) / ST2 (30%) / TE (40%) set wherever it is now missing.
-- Idempotent and safe to re-run.
-- ============================================================================

SET search_path TO procurements, public;

-- 1. Remove legacy free-form ST columns (and their scores, via cascade).
DELETE FROM procurements.sms_class_record_items
WHERE component = 'ST'
  AND weight IS NULL;

-- 2. Seed the fixed ST items for every class record that now lacks them.
INSERT INTO procurements.sms_class_record_items
  (class_record_id, component, label, max_score, weight, position)
SELECT cr.id, 'ST', v.label, 100, v.weight, v.position
FROM procurements.sms_class_records cr
CROSS JOIN (VALUES
  ('ST1', 30, 0),
  ('ST2', 30, 1),
  ('TE',  40, 2)
) AS v(label, weight, position)
WHERE NOT EXISTS (
  SELECT 1 FROM procurements.sms_class_record_items i
  WHERE i.class_record_id = cr.id AND i.component = 'ST'
);
