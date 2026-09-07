-- ============================================================================
-- MIGRATION 177 — PASTE THIS WHOLE FILE INTO THE SUPABASE SQL EDITOR
-- ============================================================================
-- Same three steps as 177_class_record_adopt_matatag_scheme.sql, plus the one
-- thing that stops the deadlock, and a verification block at the end because
-- the editor does not show RAISE NOTICE output.
--
-- WHY THE DEADLOCK HAPPENED, AND WHY THIS FIXES IT
--   Step 3 re-posts every affected class record while a teacher may be posting
--   theirs through the app. Both take row locks on sms_grades, in different
--   orders, and Postgres kills one of the two.
--
--   LOCK TABLE takes a single coarse lock UP FRONT instead. Teachers' writes
--   queue behind it rather than interleaving with it, so there is no lock cycle
--   left to deadlock on. Reads are unaffected -- nobody's screen goes down; a
--   teacher who presses Post mid-run waits a few seconds and then proceeds.
--
-- SAFE TO RE-RUN. The editor sends this as ONE transaction, so if anything
-- fails, everything rolls back and you are exactly where you started -- which
-- is what happened on your first attempt. It is also idempotent by design:
--   step 1  CREATE TABLE IF NOT EXISTS -- keeps the ORIGINAL snapshot if one
--           already exists, so re-running never overwrites the backup with
--           already-changed grades
--   step 2  only touches records not already 'matatag'
--   step 3  INSERT ... ON CONFLICT DO UPDATE -- re-posting is a no-op
--
-- HOW LONG IT BLOCKS. Grade writes only, for as long as it runs: measured at
-- 2 SECONDS on a clone of this database (955 records, 7,209 learner-terms).
-- Reads are never blocked. A teacher pressing Post mid-run waits a moment and
-- then proceeds. Out of school hours is still better, but the window is small
-- enough that it does not have to wait for one.
--
-- IF IT FAILS AGAIN: nothing changed. Check the last query's output, wait for
-- a quieter moment, and run it again.
-- ============================================================================

-- Don't queue behind a stuck teacher transaction forever; fail and roll back.
SET lock_timeout = '30s';

-- The fix. Blocks concurrent WRITES to sms_grades; reads continue normally.
LOCK TABLE procurements.sms_grades IN SHARE ROW EXCLUSIVE MODE;


-- STEP 1 — snapshot every grade step 3 can overwrite (skipped if it exists)
CREATE TABLE IF NOT EXISTS procurements.sms_grades_pre_matatag_backup AS
SELECT g.*, NOW() AS backed_up_at
  FROM procurements.sms_grades g
 WHERE EXISTS (
   SELECT 1 FROM procurements.sms_class_records r
    WHERE r.is_posted
      AND r.school_year >= '2026-2027'
      AND r.subject_id     = g.subject_id
      AND r.section_id     = g.section_id
      AND r.grading_period = g.grading_period
      AND r.school_year    = g.school_year
 );


-- STEP 2 — move the records onto the MATATAG scheme
UPDATE procurements.sms_class_records
   SET grading_scheme = 'matatag',
       updated_at     = NOW()
 WHERE school_year >= '2026-2027'
   AND grading_scheme IS DISTINCT FROM 'matatag';


-- STEP 3 — re-post so sms_grades agrees with the class records again
DO $$
DECLARE
  r        RECORD;
  v_recs   INTEGER := 0;
  v_grades INTEGER := 0;
BEGIN
  FOR r IN
    SELECT id FROM procurements.sms_class_records
     WHERE is_posted AND school_year >= '2026-2027'
     ORDER BY id
  LOOP
    v_grades := v_grades + procurements.post_class_record_grades(r.id);
    v_recs   := v_recs + 1;
  END LOOP;
  RAISE NOTICE 're-posted % class records, % learner-terms', v_recs, v_grades;
END $$;


-- VERIFICATION — the editor shows this; NOTICE output above it, it does not.
-- Every row must read OK. If any reads CHECK, screenshot it and stop.
SELECT 'records on MATATAG' AS check,
       count(*)::text AS value,
       CASE WHEN count(*) > 0 THEN 'OK' ELSE 'CHECK' END AS status
  FROM procurements.sms_class_records
 WHERE grading_scheme = 'matatag' AND school_year >= '2026-2027'
UNION ALL
SELECT 'records left on legacy (SY 2026-2027)',
       count(*)::text,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'CHECK' END
  FROM procurements.sms_class_records
 WHERE grading_scheme = 'legacy' AND school_year >= '2026-2027'
UNION ALL
SELECT 'backup rows (rollback available)',
       count(*)::text,
       CASE WHEN count(*) > 0 THEN 'OK' ELSE 'CHECK' END
  FROM procurements.sms_grades_pre_matatag_backup
UNION ALL
SELECT 'backup taken at',
       COALESCE(max(backed_up_at)::text, '-'),
       'FYI'
  FROM procurements.sms_grades_pre_matatag_backup
UNION ALL
SELECT 'grades changed vs backup',
       count(*) FILTER (WHERE b.grade IS DISTINCT FROM g.grade)::text,
       'FYI'
  FROM procurements.sms_grades_pre_matatag_backup b
  JOIN procurements.sms_grades g ON g.id = b.id
UNION ALL
SELECT 'learners who stop passing',
       count(*) FILTER (WHERE b.grade >= 75 AND g.grade < 75)::text,
       'FYI'
  FROM procurements.sms_grades_pre_matatag_backup b
  JOIN procurements.sms_grades g ON g.id = b.id
UNION ALL
SELECT 'learners who start passing',
       count(*) FILTER (WHERE b.grade < 75 AND g.grade >= 75)::text,
       'FYI'
  FROM procurements.sms_grades_pre_matatag_backup b
  JOIN procurements.sms_grades g ON g.id = b.id;
