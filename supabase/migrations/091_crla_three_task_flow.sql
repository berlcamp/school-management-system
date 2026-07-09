-- ============================================================================
-- CRLA — THREE-TASK BRANCHING FLOW (30-point total)
--
-- DepEd CRLA is a 3-task branching screening:
--   • Task 1  (max 10)  — gates the second stage.
--       Task 1 0–6  → Task 2L is recorded; Task 2H is n/a.
--       Task 1 7–10 → Task 2L is auto-awarded full marks; Task 2H is recorded.
--   • Task 2H 7–10 → the learner's Part 2 Record Form should be filled.
-- The Reading Profile is auto-banded from the 0–30 total:
--       0–10 Full Refresher · 11–16 Moderate · 17–26 Light · 27–30 Grade Ready.
--
-- Earlier CRLA materials were seeded as a 2-task / 20-point instrument. This
-- migration normalizes EVERY existing division-authored material to the 3-task
-- shape and the new bands, and re-bands existing per-learner records.
--
-- NOTE: this intentionally overwrites task labels / max scores and replaces the
-- band rows for all CRLA materials (uniform DepEd rollout). Uploaded per-task
-- files (`file_url` / `file_name`) and printable `items` are preserved.
-- ============================================================================

SET search_path TO procurements, public;

DO $$
DECLARE
  mat        RECORD;
  task_ids   BIGINT[];
  n          INT;
BEGIN
  FOR mat IN SELECT id FROM procurements.sms_crla_materials LOOP
    -- Existing tasks for this material, in display order.
    SELECT array_agg(id ORDER BY position, id)
      INTO task_ids
      FROM procurements.sms_crla_material_tasks
     WHERE material_id = mat.id;
    n := COALESCE(array_length(task_ids, 1), 0);

    -- Task 1 (position 0)
    IF n >= 1 THEN
      UPDATE procurements.sms_crla_material_tasks
         SET label = 'Task 1', task_type = 'letters', max_score = 10, position = 0
       WHERE id = task_ids[1];
    ELSE
      INSERT INTO procurements.sms_crla_material_tasks
        (material_id, label, task_type, max_score, position)
      VALUES (mat.id, 'Task 1', 'letters', 10, 0);
    END IF;

    -- Task 2L (position 1)
    IF n >= 2 THEN
      UPDATE procurements.sms_crla_material_tasks
         SET label = 'Task 2L', task_type = 'words', max_score = 10, position = 1
       WHERE id = task_ids[2];
    ELSE
      INSERT INTO procurements.sms_crla_material_tasks
        (material_id, label, task_type, max_score, position)
      VALUES (mat.id, 'Task 2L', 'words', 10, 1);
    END IF;

    -- Task 2H (position 2)
    IF n >= 3 THEN
      UPDATE procurements.sms_crla_material_tasks
         SET label = 'Task 2H', task_type = 'sentences', max_score = 10, position = 2
       WHERE id = task_ids[3];
    ELSE
      INSERT INTO procurements.sms_crla_material_tasks
        (material_id, label, task_type, max_score, position)
      VALUES (mat.id, 'Task 2H', 'sentences', 10, 2);
    END IF;

    -- Any extra (4th+) legacy tasks are left in place but no longer used by the
    -- flow; remove them so the scoresheet shows exactly three columns.
    IF n > 3 THEN
      DELETE FROM procurements.sms_crla_material_tasks
       WHERE material_id = mat.id
         AND id = ANY(task_ids[4:n]);
    END IF;

    -- Replace the reading-profile bands with the new 0–30 set.
    DELETE FROM procurements.sms_crla_bands WHERE material_id = mat.id;
    INSERT INTO procurements.sms_crla_bands
      (material_id, min_score, max_score, label, position)
    VALUES
      (mat.id, 0,  10, 'Full Refresher',     0),
      (mat.id, 11, 16, 'Moderate Refresher', 1),
      (mat.id, 17, 26, 'Light Refresher',    2),
      (mat.id, 27, 30, 'Grade Ready',        3);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- Re-band existing per-learner records against the new bands.
--
-- Stored `total_score` already reflects the old auto-fill (Task 1 + effective
-- Task 2). Under the new flow a legacy record has no Task 2H (contributes 0),
-- so the effective total is unchanged — only the band label needs updating.
-- Records get their totals recomputed from raw scores the next time a teacher
-- edits the scoresheet.
-- ----------------------------------------------------------------------------
UPDATE procurements.sms_crla_records
   SET profile_label = CASE
     WHEN total_score BETWEEN 0  AND 10 THEN 'Full Refresher'
     WHEN total_score BETWEEN 11 AND 16 THEN 'Moderate Refresher'
     WHEN total_score BETWEEN 17 AND 26 THEN 'Light Refresher'
     WHEN total_score BETWEEN 27 AND 30 THEN 'Grade Ready'
     ELSE profile_label
   END
 WHERE total_score IS NOT NULL;
