/* ==========================================================================
   RE-APPLY THE MATATAG SCHEME  (paste the whole file into the Supabase editor)

   Run this when the division has approved. It is 177 again, with one thing
   the plain re-run would get wrong.

   WHY NOT JUST RE-RUN THE OLD SCRIPT. Step 1 there is CREATE TABLE IF NOT
   EXISTS. The backup table from the first attempt still exists, so step 1
   would SKIP and you would keep a snapshot taken on 2026-09-07 -- which no
   longer describes the grades as they are now. Every grade a teacher has
   encoded or posted since then would be rewritten with NO rollback behind it.
   Step 0 below archives the old snapshot under a timestamped name so step 1
   takes a fresh one. The old snapshot is kept, not dropped: it is the record
   of what the first attempt moved.

   SAFE. The editor runs this as one transaction, so a failure rolls back
   everything. LOCK TABLE up front means it cannot deadlock against a teacher
   posting. Measured at about 2 seconds on a clone.

   AFTER IT FINISHES, run verify_177_ONE_RESULT.sql. Expect essentially 100%%
   of the pass-to-fail cases in the 60.00 to 69.99 band, as before.
   ========================================================================== */

SET lock_timeout = '30s';
LOCK TABLE procurements.sms_grades IN SHARE ROW EXCLUSIVE MODE;

/* STEP 0 - archive the stale snapshot so step 1 takes a current one */
DO $$
DECLARE v_new text;
BEGIN
  IF to_regclass('procurements.sms_grades_pre_matatag_backup') IS NOT NULL THEN
    v_new := 'sms_grades_pre_matatag_backup_' ||
             to_char(COALESCE((SELECT max(backed_up_at)
                                 FROM procurements.sms_grades_pre_matatag_backup),
                              now()), 'YYYYMMDD_HH24MI');
    EXECUTE format(
      'ALTER TABLE procurements.sms_grades_pre_matatag_backup RENAME TO %I', v_new);
    RAISE NOTICE 'archived previous snapshot as %', v_new;
  END IF;
END $$;

/* STEP 1 - snapshot every grade step 3 can overwrite */
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

/* STEP 2 - move the records onto the MATATAG scheme */
UPDATE procurements.sms_class_records
   SET grading_scheme = 'matatag',
       updated_at     = NOW()
 WHERE school_year >= '2026-2027'
   AND grading_scheme IS DISTINCT FROM 'matatag';

/* STEP 3 - re-post so sms_grades agrees with the class records */
DO $$
DECLARE r RECORD; v_recs INTEGER := 0; v_grades INTEGER := 0;
BEGIN
  FOR r IN SELECT id FROM procurements.sms_class_records
            WHERE is_posted AND school_year >= '2026-2027' ORDER BY id
  LOOP
    v_grades := v_grades + procurements.post_class_record_grades(r.id);
    v_recs := v_recs + 1;
  END LOOP;
  RAISE NOTICE 're-posted % class records, % learner-terms', v_recs, v_grades;
END $$;

/* VERIFICATION - the editor shows only this */
SELECT 'records on MATATAG' AS check, count(*)::text AS value,
       CASE WHEN count(*) > 0 THEN 'OK' ELSE 'CHECK' END AS status
  FROM procurements.sms_class_records
 WHERE grading_scheme = 'matatag' AND school_year >= '2026-2027'
UNION ALL
SELECT 'records left on legacy', count(*)::text,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'CHECK' END
  FROM procurements.sms_class_records
 WHERE grading_scheme = 'legacy' AND school_year >= '2026-2027'
UNION ALL
SELECT 'fresh backup rows', count(*)::text,
       CASE WHEN count(*) > 0 THEN 'OK' ELSE 'CHECK' END
  FROM procurements.sms_grades_pre_matatag_backup
UNION ALL
SELECT 'fresh backup taken at', COALESCE(max(backed_up_at)::text, '-'), 'FYI'
  FROM procurements.sms_grades_pre_matatag_backup
UNION ALL
SELECT 'grades changed', count(*) FILTER (WHERE b.grade IS DISTINCT FROM g.grade)::text, 'FYI'
  FROM procurements.sms_grades_pre_matatag_backup b JOIN procurements.sms_grades g ON g.id = b.id
UNION ALL
SELECT 'learners who stop passing', count(*) FILTER (WHERE b.grade >= 75 AND g.grade < 75)::text, 'FYI'
  FROM procurements.sms_grades_pre_matatag_backup b JOIN procurements.sms_grades g ON g.id = b.id
UNION ALL
SELECT 'learners who start passing', count(*) FILTER (WHERE b.grade < 75 AND g.grade >= 75)::text, 'FYI'
  FROM procurements.sms_grades_pre_matatag_backup b JOIN procurements.sms_grades g ON g.id = b.id;
