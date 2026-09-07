-- ============================================================================
-- WHAT STATE DID THE DEADLOCK LEAVE 177 IN?  (READ-ONLY)
-- ============================================================================
-- 177 has three steps. How much of it survived depends ENTIRELY on how it was
-- run, because a deadlock aborts the whole transaction it happened in:
--
--   Supabase SQL editor / one multi-statement send
--       -> all three steps are ONE implicit transaction -> ALL rolled back.
--          Nothing happened. Clean slate.
--
--   psql -f  (autocommit, one transaction per statement)
--       -> step 1 CREATE TABLE committed
--          step 2 UPDATE committed
--          step 3 is a single DO block = a single transaction, so it rolled
--          back ENTIRELY. No record is half re-posted.
--       -> records now say 'matatag' but sms_grades still holds the grades
--          computed under 'legacy'. THE DIVERGENCE 177 STEP 3 EXISTS TO
--          PREVENT IS NOW LIVE.
--
-- Run all four. Row 1 tells you which case you are in.
-- ============================================================================

-- 1. Did steps 1 and 2 survive?
SELECT
  to_regclass('procurements.sms_grades_pre_matatag_backup') IS NOT NULL
    AS backup_table_exists,
  (SELECT count(*) FROM procurements.sms_class_records
    WHERE grading_scheme = 'matatag') AS records_matatag,
  (SELECT count(*) FROM procurements.sms_class_records
    WHERE grading_scheme = 'legacy')  AS records_legacy;
-- backup_table_exists = false            -> fully rolled back. Re-run 177.
-- backup_table_exists = true, matatag>0  -> steps 1+2 applied, step 3 did not.
--                                           DIVERGENCE IS LIVE. Fix now.

-- 2. How many posted grades disagree with what the class record now computes?
--    Anything above zero is a learner whose report card and class record differ.
WITH roster AS (
  SELECT r.id rec_id, r.subject_id, r.section_id, r.grading_period, r.school_year,
         r.ww_weight, r.pt_weight, r.st_weight, e.student_id,
         EXISTS (SELECT 1 FROM procurements.sms_class_record_blocks b
                  WHERE b.class_record_id = r.id) AS has_blocks
    FROM procurements.sms_class_records r
    JOIN procurements.sms_enrollments e
      ON e.section_id = r.section_id AND e.school_year = r.school_year
     AND e.status = 'approved'
     AND e.enrollment_status IN ('active','promoted','graduated','retained','completed')
   WHERE r.is_posted AND r.grading_scheme = 'matatag'
     AND EXISTS (SELECT 1 FROM procurements.sms_class_record_scores s
                   JOIN procurements.sms_class_record_items i ON i.id = s.item_id
                  WHERE i.class_record_id = r.id AND s.student_id = e.student_id
                    AND s.raw_score IS NOT NULL)
), ig AS (
  SELECT ro.*, CASE WHEN ro.has_blocks THEN (
           SELECT COALESCE(SUM(COALESCE(procurements.sms_class_record_block_ps(b.id, ro.student_id),0)
                  * b.weight/100.0),0)
             FROM procurements.sms_class_record_blocks b WHERE b.class_record_id = ro.rec_id)
         ELSE COALESCE(procurements.sms_class_record_component_ps(ro.rec_id, ro.student_id,'WW'),0)*ro.ww_weight/100.0
            + COALESCE(procurements.sms_class_record_component_ps(ro.rec_id, ro.student_id,'PT'),0)*ro.pt_weight/100.0
            + COALESCE(procurements.sms_class_record_component_ps(ro.rec_id, ro.student_id,'ST'),0)*ro.st_weight/100.0
         END AS initial FROM roster ro
)
SELECT count(*) AS learner_terms_checked,
       count(*) FILTER (
         WHERE g.grade IS DISTINCT FROM procurements.sms_transmute_grade_matatag(ig.initial)
       ) AS grades_still_stale
  FROM ig
  JOIN procurements.sms_grades g
    ON g.student_id = ig.student_id AND g.subject_id = ig.subject_id
   AND g.section_id = ig.section_id AND g.grading_period = ig.grading_period
   AND g.school_year = ig.school_year;

-- 3. Is the backup intact and usable for rollback?
SELECT count(*) AS backup_rows,
       min(backed_up_at) AS taken_at
  FROM procurements.sms_grades_pre_matatag_backup;

-- 4. Who else is writing right now? Re-running while teachers post will
--    deadlock again. Ideally this returns only your own session.
SELECT pid, state, wait_event_type, left(query, 90) AS query
  FROM pg_stat_activity
 WHERE datname = current_database()
   AND pid <> pg_backend_pid()
   AND state <> 'idle'
 ORDER BY query_start;
