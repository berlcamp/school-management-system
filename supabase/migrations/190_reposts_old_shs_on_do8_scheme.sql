-- ============================================================================
-- 190. Re-post the old-curriculum SHS class records under DO 8, s.2015
-- ============================================================================
--
-- WHY
-- ---
-- 189 explains the cause; this corrects the rows it left behind. Since 173
-- flipped `sms_class_records.grading_scheme` to default `matatag`, every class
-- record opened for an old-curriculum Senior High section has transmuted its
-- Initial Grades through the **updated K-10 table** instead of DO 8, s.2015.
--
-- The two tables are not close. Across the 10,001 Initial Grades from 0.00 to
-- 100.00 they disagree on **8,253**, by up to **seven points**, and everywhere
-- a real grade lands the updated table is the harsher of the two:
--
--     Initial Grade   DO 8, s.2015   MATATAG   the learner loses
--        90.00             93           91            2
--        85.00             90           87            3
--        80.00             87           83            4
--        75.00             84           79            5
--        70.00             81           75            6
--        65.00             78           73            5
--
-- So a learner's posted Quarterly Grade is currently two to seven marks below
-- what their own curriculum gives them, on every Grade 12 subject encoded this
-- school year.
--
-- WHY THIS IS SAFE TO RE-RUN, AND WHY IT IS REVERSIBLE
-- ---------------------------------------------------
-- **No raw score is touched.** `sms_class_record_scores` is the teacher's
-- work and is the input here, not the output; the posted Quarterly Grade in
-- `sms_grades` is derived from it and is recomputed, not edited. Re-running
-- this file changes nothing the second time, because the scheme is already
-- `legacy` and posting is an upsert.
--
-- Reversing it is the same two statements with `matatag` in place of `legacy`,
-- followed by the same re-post. That is the whole rollback: the grades come
-- back exactly, because they were never the stored thing.
--
-- WHAT `use_transmutation` IS DOING HERE
-- --------------------------------------
-- It is a legacy-only switch — the updated ECR transmutes unconditionally, so
-- the column means nothing while a record is `matatag`. Flipping the scheme
-- alone would therefore stop these records transmuting AT ALL and post the
-- rounded Initial Grade, which is not DO 8 either. Setting it true alongside
-- the scheme keeps the behaviour the records already had ("this record
-- transmutes") and changes only the table it transmutes through, which is the
-- single thing that is wrong.
--
-- WHAT IS RE-POSTED, AND WHAT IS NOT
-- ----------------------------------
-- Only records that are **already posted** (`is_posted`). An unposted record is
-- a term in progress: its scheme is corrected so it computes right when the
-- teacher posts it, but posting it here would publish grades nobody has
-- finished. ⚠ Re-posting overwrites the `sms_grades` row for every learner in
-- the record, so a grade that was hand-edited in the grades table after being
-- posted is replaced by the class record's own figure. That is the existing
-- behaviour of every re-post, stated here because this file triggers a batch
-- of them.
--
-- BEFORE APPLYING — the two counts this touches
-- ---------------------------------------------
--   SELECT cr.grading_scheme, cr.is_posted, count(*) AS records
--   FROM procurements.sms_class_records cr
--   JOIN procurements.sms_sections sec ON sec.id = cr.section_id
--   WHERE sec.shs_curriculum = 'old'
--   GROUP BY 1, 2 ORDER BY 1, 2;
--
--   SELECT count(*) AS grade_rows_that_may_move
--   FROM procurements.sms_grades g
--   JOIN procurements.sms_class_records cr
--     ON cr.subject_id = g.subject_id AND cr.section_id = g.section_id
--    AND cr.school_year = g.school_year AND cr.grading_period = g.grading_period
--   JOIN procurements.sms_sections sec ON sec.id = cr.section_id
--   WHERE sec.shs_curriculum = 'old' AND cr.is_posted AND cr.grading_scheme = 'matatag';
--
-- Requires 189 to have been applied — `shs_curriculum` is what identifies the
-- affected records, and identifying them by grade level and school year here
-- would be the re-derivation invariant 14 forbids.
--
-- SCOPE
-- -----
-- One UPDATE over old-SHS class records, and one re-post per already-posted
-- record among them. No table, column, policy, trigger or function touched.
-- ============================================================================

DO $$
DECLARE
  v_switched     INTEGER := 0;
  v_switched_ids BIGINT[] := '{}';
  v_records  INTEGER := 0;
  v_posted   INTEGER := 0;
  rec        RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'procurements'
      AND table_name = 'sms_sections'
      AND column_name = 'shs_curriculum'
  ) THEN
    RAISE EXCEPTION 'Migration 189 must be applied first: sms_sections.shs_curriculum does not exist.';
  END IF;

  -- 1. Every old-curriculum SHS record resolves through DO 8, s.2015 from here
  --    on, whether it has been posted yet or not.
  WITH switched AS (
    UPDATE procurements.sms_class_records cr
    SET grading_scheme = 'legacy',
        use_transmutation = TRUE,
        updated_at = NOW()
    FROM procurements.sms_sections sec
    WHERE sec.id = cr.section_id
      AND sec.shs_curriculum = 'old'
      AND cr.grading_scheme = 'matatag'
    RETURNING cr.id
  )
  SELECT count(*), COALESCE(array_agg(id), '{}'::BIGINT[])
  INTO v_switched, v_switched_ids
  FROM switched;

  -- 2. Re-post the ones whose grades are already out, so the posted Quarterly
  --    Grade catches up with the scheme. An unposted record waits for its
  --    teacher.
  --
  --    ONLY the records this migration just switched. An old-SHS record that
  --    was ALREADY on `legacy` — anything opened before 173 flipped the
  --    default, in a school year long closed — computes the same before and
  --    after, so re-posting it could only overwrite a grade someone corrected
  --    by hand in `sms_grades` afterwards. Nothing that was right is touched.
  FOR rec IN
    SELECT cr.id
    FROM procurements.sms_class_records cr
    WHERE cr.id = ANY(v_switched_ids)
      AND cr.is_posted
    ORDER BY cr.id
  LOOP
    v_records := v_records + 1;
    v_posted := v_posted + procurements.post_class_record_grades(rec.id);
  END LOOP;

  RAISE NOTICE 'Old-SHS class records switched to DO 8, s.2015: %', v_switched;
  RAISE NOTICE 'Records re-posted: %, learner-subject grades rewritten: %', v_records, v_posted;
END $$;
