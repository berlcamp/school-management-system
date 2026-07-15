-- ============================================================================
-- CRLA — GRADE 3 ENGLISH TWO-TASK FORM (20-point total)
--
-- DepEd ships a reduced CRLA form for Grade 3 English ONLY: two tasks, 10
-- points each, with no Task 2L / Task 2H branch. Both tasks are always
-- administered, nothing is auto-awarded, and every learner gets a Part 2
-- Record Form. The Reading Profile is banded off the 0–20 total:
--       0 Full Refresher · 1–10 Moderate · 11–16 Light · 17–20 Grade Ready.
--
-- Migration 091 normalized EVERY CRLA material to the 3-task / 30-point shape,
-- including Grade 3 English. This migration walks that back for that one
-- grade+language combination:
--   1. Task 1 keeps its label/score; Task 2L is relabelled 'Task 2'.
--   2. Task 2H (position 2) is DELETED — its per-learner scores cascade away.
--   3. Bands are replaced with the 20-point set.
--   4. Existing records are re-totalled from the two surviving tasks and
--      re-banded against the new bands.
--
-- NOTE ON DATA: under the 3-task flow the app auto-awarded and persisted
-- Task 2L = 10 whenever Task 1 >= 7. Those synthetic 10s are kept as the
-- learner's Task 2 score (decision: keep rather than blank for re-assessment),
-- so some learners will shift band — e.g. Task1=8 / 2L=10 auto / 2H=5 was 23
-- (Light Refresher) and becomes 18 (Grade Ready). Materials with a task count
-- other than the expected 3 are left alone and reported via RAISE NOTICE.
-- ============================================================================

SET search_path TO procurements, public;

DO $$
DECLARE
  mat          RECORD;
  task_ids     BIGINT[];
  n            INT;
  materials    INT := 0;
  records_hit  INT := 0;
BEGIN
  FOR mat IN
    SELECT id, title
      FROM procurements.sms_crla_materials
     WHERE grade_level = 3
       AND language = 'English'
  LOOP
    SELECT array_agg(id ORDER BY position, id)
      INTO task_ids
      FROM procurements.sms_crla_material_tasks
     WHERE material_id = mat.id;
    n := COALESCE(array_length(task_ids, 1), 0);

    IF n = 2 THEN
      -- Already the 2-task shape (e.g. re-run); just normalize the label.
      UPDATE procurements.sms_crla_material_tasks
         SET label = 'Task 2', task_type = 'words', max_score = 10, position = 1
       WHERE id = task_ids[2];
    ELSIF n = 3 THEN
      UPDATE procurements.sms_crla_material_tasks
         SET label = 'Task 1', task_type = 'letters', max_score = 10, position = 0
       WHERE id = task_ids[1];

      UPDATE procurements.sms_crla_material_tasks
         SET label = 'Task 2', task_type = 'words', max_score = 10, position = 1
       WHERE id = task_ids[2];

      -- Drops Task 2H and cascades sms_crla_record_scores for it.
      DELETE FROM procurements.sms_crla_material_tasks WHERE id = task_ids[3];
    ELSE
      RAISE NOTICE 'CRLA material % (%) has % task(s); expected 3. Left unchanged — fix by hand.',
        mat.id, mat.title, n;
      CONTINUE;
    END IF;

    -- Replace the bands with the 20-point set.
    DELETE FROM procurements.sms_crla_bands WHERE material_id = mat.id;
    INSERT INTO procurements.sms_crla_bands
      (material_id, min_score, max_score, label, position)
    VALUES
      (mat.id,  0,  0, 'Full Refresher',     0),
      (mat.id,  1, 10, 'Moderate Refresher', 1),
      (mat.id, 11, 16, 'Light Refresher',    2),
      (mat.id, 17, 20, 'Grade Ready',        3);

    -- Re-total and re-band every learner record for this material. Records
    -- with no score at all keep a NULL total/profile.
    WITH totals AS (
      SELECT r.id AS record_id,
             SUM(COALESCE(sc.raw_score, 0))    AS total,
             COUNT(sc.raw_score)               AS entered
        FROM procurements.sms_crla_records r
        LEFT JOIN procurements.sms_crla_record_scores sc ON sc.record_id = r.id
       WHERE r.material_id = mat.id
       GROUP BY r.id
    )
    UPDATE procurements.sms_crla_records r
       SET total_score   = CASE WHEN t.entered > 0 THEN t.total END,
           profile_label = CASE
             WHEN t.entered > 0 THEN (
               SELECT b.label
                 FROM procurements.sms_crla_bands b
                WHERE b.material_id = mat.id
                  AND t.total BETWEEN b.min_score AND b.max_score
                ORDER BY b.position
                LIMIT 1
             )
           END
      FROM totals t
     WHERE r.id = t.record_id;

    GET DIAGNOSTICS n = ROW_COUNT;
    records_hit := records_hit + n;
    materials   := materials + 1;
  END LOOP;

  RAISE NOTICE 'CRLA Grade 3 English: % material(s) collapsed to the 2-task form, % learner record(s) re-banded.',
    materials, records_hit;
END $$;
