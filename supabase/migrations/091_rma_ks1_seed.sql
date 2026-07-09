-- ============================================================================
-- RMA — seed the DepEd KS1 levelling instrument (Grades 1-10)
--
-- The RMA scoresheet renders whatever division-authored material exists for a
-- section's grade level. This migration seeds ONE KS1 material per grade so the
-- grid works immediately after deploy, each with:
--   * 8 tasks (A-H) worth 2,1,2,3,3,2,3,4 = 20 points (the UI derives the A-H
--     letter from `position`; the human label is stored in `domain`).
--   * 3 levelling bands on the percentage of the total possible score:
--       Intervention < 75%, Consolidation 75-84%, Enhancement >= 85%.
--
-- No DDL / column changes — seed only. Idempotent: a grade is skipped if it
-- already has an active KS1 material (title 'RMA (KS1)'), so re-running is safe.
-- Division admins may edit task labels / max scores / bands afterwards.
-- ============================================================================

SET search_path TO procurements, public;

DO $$
DECLARE
  g INTEGER;
  mid BIGINT;
BEGIN
  FOR g IN 1..10 LOOP
    -- Skip grades that already have an active KS1 material.
    IF EXISTS (
      SELECT 1 FROM procurements.sms_rma_materials
      WHERE grade_level = g AND title = 'RMA (KS1)' AND is_active = true
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO procurements.sms_rma_materials (title, grade_level, instructions, is_active)
    VALUES (
      'RMA (KS1)',
      g,
      'Rapid Mathematics Assessment — KS1 three-level profile. Enter each task score; the system computes the percentage and levelling.',
      true
    )
    RETURNING id INTO mid;

    -- 8 tasks A-H (position 0-7). `domain` holds the printable task label.
    INSERT INTO procurements.sms_rma_items (material_id, item_no, domain, max_score, position)
    VALUES
      (mid, 1, 'Task A', 2, 0),
      (mid, 2, 'Task B', 1, 1),
      (mid, 3, 'Task C', 2, 2),
      (mid, 4, 'Task D', 3, 3),
      (mid, 5, 'Task E', 3, 4),
      (mid, 6, 'Task F', 2, 5),
      (mid, 7, 'Task G', 3, 6),
      (mid, 8, 'Task H', 4, 7);

    -- 3 KS1 levelling bands (percentage lookup). Max values sit just below the
    -- next threshold so the boundary lands on spec (75% -> Consolidation, 85% ->
    -- Enhancement).
    INSERT INTO procurements.sms_rma_bands (material_id, min_score, max_score, label, position)
    VALUES
      (mid, 0,     74.99, 'Intervention',  0),
      (mid, 75,    84.99, 'Consolidation', 1),
      (mid, 85,    100,   'Enhancement',   2);
  END LOOP;
END $$;
