-- ============================================================================
-- RESUMABLE, DEADLOCK-TOLERANT RE-POST  (completes step 3 of migration 177)
-- ============================================================================
-- WHY 177 STEP 3 DEADLOCKED. It re-posts hundreds of class records inside ONE
-- transaction, holding a row lock on every sms_grades row it touches until the
-- whole thing finishes. A teacher posting their own class record through the
-- app at the same time takes the same locks in a different order, and Postgres
-- kills one of the two. On a division-wide database during school hours that
-- is not bad luck, it is the expected outcome.
--
-- WHAT THIS DOES DIFFERENTLY
--   * ONE TRANSACTION PER CLASS RECORD, not one for all of them. Locks are held
--     for milliseconds. A teacher posting concurrently waits, then proceeds.
--   * RETRIES on deadlock (40P01) and lock timeout, backing off 0.5s, 1s, 1.5s.
--     Whichever side Postgres picks as victim, the record is simply retried.
--   * RESUMABLE. Interrupt it and run it again; posting is idempotent
--     (INSERT ... ON CONFLICT DO UPDATE), so redoing a record is harmless.
--   * REPORTS anything it could not do rather than failing silently.
--
-- WHAT IT DOES NOT DO. It does not create the backup and does not flip any
-- record's scheme -- steps 1 and 2 of 177. Run it only when diagnose_177.sql
-- shows those already applied. If the backup table does not exist, STOP: run
-- 177 itself instead, so the snapshot is taken before anything is rewritten.
--
--   psql "$PROD" -f repost_safely.sql
--
-- Must be run by psql (or anything in autocommit). The COMMIT inside the loop
-- requires that there is no enclosing transaction, so it will NOT work pasted
-- into the Supabase SQL editor -- which is also what wrapped 177 into a single
-- transaction in the first place if that is how it was run.
--
-- STILL: run it out of school hours if you can. Retrying is a safety net, not
-- a reason to rewrite 7,000 grades while teachers are encoding.
-- ============================================================================

\set ON_ERROR_STOP on

-- Fail a lock wait fast rather than piling up behind a teacher's transaction.
SET lock_timeout = '5s';

CREATE OR REPLACE PROCEDURE procurements.matatag_repost_resumable()
LANGUAGE plpgsql
AS $$
DECLARE
  r         RECORD;
  v_try     INTEGER;
  v_done    BOOLEAN;
  v_recs    INTEGER := 0;
  v_grades  INTEGER := 0;
  v_failed  BIGINT[] := '{}';
  v_n       INTEGER;
BEGIN
  IF to_regclass('procurements.sms_grades_pre_matatag_backup') IS NULL THEN
    RAISE EXCEPTION
      'sms_grades_pre_matatag_backup does not exist -- run migration 177 '
      'instead, so the snapshot is taken before any grade is rewritten';
  END IF;

  FOR r IN
    SELECT id FROM procurements.sms_class_records
     WHERE is_posted AND grading_scheme = 'matatag'
     ORDER BY id
  LOOP
    v_try := 0;
    v_done := FALSE;

    WHILE NOT v_done AND v_try < 4 LOOP
      BEGIN
        v_n := procurements.post_class_record_grades(r.id);
        v_grades := v_grades + v_n;
        v_done := TRUE;
      EXCEPTION
        WHEN deadlock_detected OR lock_not_available THEN
          v_try := v_try + 1;
          PERFORM pg_sleep(0.5 * v_try);
      END;
    END LOOP;

    IF v_done THEN
      v_recs := v_recs + 1;
    ELSE
      v_failed := v_failed || r.id;
      RAISE WARNING 'class record % could not be re-posted after % attempts',
        r.id, v_try;
    END IF;

    COMMIT;   -- per-record, so locks are never held across records
  END LOOP;

  RAISE NOTICE 're-posted % class records, % learner-terms', v_recs, v_grades;

  IF array_length(v_failed, 1) > 0 THEN
    RAISE NOTICE 'NOT DONE (re-run to retry): %', v_failed;
  ELSE
    RAISE NOTICE 'all posted matatag records are up to date';
  END IF;
END;
$$;

CALL procurements.matatag_repost_resumable();
