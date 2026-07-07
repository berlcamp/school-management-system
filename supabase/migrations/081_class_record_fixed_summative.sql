-- ============================================================================
-- CLASS RECORD — FIXED SUMMATIVE ITEMS (ST1 / ST2 / TE) WITH PER-ITEM WEIGHTS
--
-- The "Summative Tests & Term Exams" (ST) component is no longer a free-form
-- set of teacher-added columns. It now has three fixed items:
--   ST1 (default 30%), ST2 (default 30%), TE (default 40%)
-- Each item carries its own editable weight. The ST component percentage score
-- becomes the weighted average of each item's own percentage score:
--
--   ST PS = SUM( (raw_i / max_i * 100) * weight_i ) / SUM(weight_i)
--
-- WW and PT keep the original SUM(raw)/SUM(max) model (weight stays NULL there).
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. Per-item weight (used only by ST items; NULL for WW/PT)
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_class_record_items
  ADD COLUMN IF NOT EXISTS weight NUMERIC(5,2) CHECK (weight IS NULL OR (weight >= 0 AND weight <= 100));

COMMENT ON COLUMN procurements.sms_class_record_items.weight IS
  'Per-item weight (percent) within its component. Used by fixed ST items (ST1/ST2/TE); NULL for dynamic WW/PT columns.';

-- ----------------------------------------------------------------------------
-- 2. Seed the three fixed ST items for every existing class record that has
--    none yet (idempotent).
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 3. Component percentage score: ST is now a weighted average of per-item PS;
--    WW/PT keep SUM(raw)/SUM(max)*100. Missing scores count as 0.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sms_class_record_component_ps(
  p_class_record_id BIGINT,
  p_student_id BIGINT,
  p_component TEXT
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_component = 'ST' THEN (
      SELECT CASE
        WHEN SUM(i.weight) IS NULL OR SUM(i.weight) = 0 THEN NULL
        ELSE ROUND(
          SUM( (COALESCE(s.raw_score, 0) / i.max_score * 100) * i.weight )
          / SUM(i.weight), 2)
      END
      FROM procurements.sms_class_record_items i
      LEFT JOIN procurements.sms_class_record_scores s
        ON s.item_id = i.id AND s.student_id = p_student_id
      WHERE i.class_record_id = p_class_record_id
        AND i.component = 'ST'
    )
    ELSE (
      SELECT CASE
        WHEN SUM(i.max_score) IS NULL OR SUM(i.max_score) = 0 THEN NULL
        ELSE ROUND(SUM(COALESCE(s.raw_score, 0)) / SUM(i.max_score) * 100, 2)
      END
      FROM procurements.sms_class_record_items i
      LEFT JOIN procurements.sms_class_record_scores s
        ON s.item_id = i.id AND s.student_id = p_student_id
      WHERE i.class_record_id = p_class_record_id
        AND i.component = p_component
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION procurements.sms_class_record_component_ps(BIGINT, BIGINT, TEXT) TO authenticated;
