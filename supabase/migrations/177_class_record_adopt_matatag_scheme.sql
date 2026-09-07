-- ============================================================================
-- ADOPT THE MATATAG GRADING SCHEME ON EXISTING CLASS RECORDS
-- ============================================================================
-- 173 added `sms_class_records.grading_scheme` and backfilled every existing
-- record 'legacy', so that nothing already encoded would move when it was
-- applied; only the column DEFAULT was flipped to 'matatag', which means only
-- records created after that point adopt the updated E-Class Record. 176 then
-- corrected the matatag table itself to DepEd's separately issued one.
--
-- This migration is the deliberate second half: it moves the records that
-- already exist onto the updated scheme. It is NOT a correction of a bug --
-- 173's backfill did exactly what it was designed to do. It is a policy
-- decision, taken once, and it is the moment invariant 14 exists to make
-- explicit rather than accidental.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS CHANGES, AND IT IS TWO THINGS, NOT ONE
-- ---------------------------------------------------------------------------
-- `post_class_record_grades` reads the scheme like this:
--
--     IF grading_scheme = 'matatag' THEN  transmute_matatag(initial)
--     ELSIF use_transmutation       THEN  transmute_legacy(initial)
--     ELSE                                ROUND(initial)
--
-- So flipping the scheme swaps the table AND makes transmutation
-- unconditional.
--
-- Measured on the local clone (957 records, 7,277 learner-terms carrying
-- scores) AGAINST THE WORKBOOK TABLE RESTORED BY 178 -- not 176's, which these
-- figures were first taken under and which no longer runs anywhere. The two
-- cohorts behave completely differently:
--
--   use_transmutation = TRUE   (102 records, 1,520 learner-terms)
--     A true table swap, DO 8 s.2015 -> the workbook's MATATAG table.
--     1,390 grades move, average -0.71. 230 learner-terms go PASS -> FAIL,
--     17 go FAIL -> PASS.
--
--     The average is near zero and the pass/fail movement is not, because the
--     whole effect sits at the bottom of the scale: THE PASSING FLOOR MOVED
--     FROM AN INITIAL GRADE OF 60.00 TO 70.00.
--
--         Initial Grade    DO 8 s.2015    workbook
--            59.99              74            72
--            60.00              75 (pass)     72
--            65.00              78 (pass)     73
--            69.99              81 (pass)     74
--            70.00              81 (pass)     75 (pass)
--
--     229 of the 230 pass -> fail learner-terms have an Initial Grade between
--     58.00 and 69.99. They were passing only because DO 8 transmuted an
--     Initial Grade of 60 into a 75. Under MATATAG they are not passing. That
--     is the reform working, not a bug -- but it is 230 learners, and somebody
--     has to be told before report cards print.
--
--   use_transmutation = FALSE  (852 records, 5,757 learner-terms)
--     These post the ROUNDED INITIAL GRADE today -- they have never been
--     transmuted at all. 5,700 grades move, average +26.88, worst +84.
--     357 learner-terms go FAIL -> PASS; none goes the other way.
--     An Initial Grade of 40.00 posts 40 today and 68 after.
--     This is not the new table. It is transmutation being switched on.
--
-- If the division's position is that the updated ECR always transmutes, the
-- second cohort is correct and this migration is right. If it is not, narrow
-- the WHERE clause in step 2 to `use_transmutation = TRUE` and the 852 records
-- keep posting the rounded Initial Grade until a teacher turns it on.
--
-- ---------------------------------------------------------------------------
-- WHY STEP 3 IS NOT OPTIONAL
-- ---------------------------------------------------------------------------
-- A term grade lives in TWO places: computed live on the class record screen,
-- and posted into `sms_grades`, which is what the report card, SF9, SF10, the
-- student portal and `students_gpa_for_grade` (128) all read. Flipping the
-- scheme changes only the first. Every one of the ~7,090 changed learner-terms
-- measured above sits on an ALREADY-POSTED record, so without step 3 the class
-- record and the report card would disagree for every one of them.
--
-- ---------------------------------------------------------------------------
-- WHY STEP 1 EXISTS
-- ---------------------------------------------------------------------------
-- Step 3 overwrites `sms_grades.grade` in place; the previous value is not
-- recoverable from anywhere else, because a posted grade is not versioned.
-- Step 1 snapshots every row step 3 can touch, so this migration is reversible
-- in full. `sms_grades_pre_matatag_backup` is a recovery artefact, not part of
-- the schema -- drop it once the division has signed off on the new figures.
--
-- ROLLBACK (complete):
--   UPDATE procurements.sms_class_records r SET grading_scheme = 'legacy'
--    WHERE r.school_year >= '2026-2027';
--   UPDATE procurements.sms_grades g SET grade = b.grade, remarks = b.remarks
--     FROM procurements.sms_grades_pre_matatag_backup b WHERE b.id = g.id;
--
-- ---------------------------------------------------------------------------
-- KNOWN BAD DATA, NOT ADDRESSED HERE
-- ---------------------------------------------------------------------------
-- 245 scores exceed their item's max_score (110 on a 10-point quiz, 209 on a
-- 20-point one -- transcription errors), producing an Initial Grade above 100
-- for 26 learner-terms. Step 3 recomputes faithfully from them, exactly as the
-- original post did. Cleaning them is a separate decision about somebody's
-- encoded scores and is deliberately not bundled into a grading-scheme change.
--   SELECT i.class_record_id, i.label, i.max_score, s.raw_score, s.student_id
--     FROM procurements.sms_class_record_scores s
--     JOIN procurements.sms_class_record_items i ON i.id = s.item_id
--    WHERE s.raw_score > i.max_score ORDER BY s.raw_score - i.max_score DESC;
--
-- ---------------------------------------------------------------------------
-- SCOPE
-- ---------------------------------------------------------------------------
-- School year 2026-2027 onward. MATATAG begins this year; a closed prior year
-- was graded, reported and signed under DO 8, s.2015 and re-scoring it has no
-- basis (the 121 career_stage rule). `school_year` is TEXT in 'YYYY-YYYY'
-- form, so the string comparison orders correctly.
-- ============================================================================


-- --------------------------------------------------------------------------
-- STEP 1 — snapshot every sms_grades row step 3 can overwrite
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_grades_pre_matatag_backup AS
SELECT g.*, NOW() AS backed_up_at
  FROM procurements.sms_grades g
 WHERE EXISTS (
   SELECT 1
     FROM procurements.sms_class_records r
    WHERE r.is_posted
      AND r.school_year >= '2026-2027'
      AND r.subject_id      = g.subject_id
      AND r.section_id      = g.section_id
      AND r.grading_period  = g.grading_period
      AND r.school_year     = g.school_year
 );

COMMENT ON TABLE procurements.sms_grades_pre_matatag_backup IS
  'Recovery snapshot taken by migration 177 immediately before class records '
  'were moved onto the MATATAG grading scheme and re-posted. Not part of the '
  'schema; drop once the new figures are signed off.';


-- --------------------------------------------------------------------------
-- STEP 2 — move the records onto the updated scheme
-- --------------------------------------------------------------------------
-- To adopt the issued table WITHOUT switching transmutation on for records
-- that never had it, add:  AND use_transmutation
UPDATE procurements.sms_class_records
   SET grading_scheme = 'matatag',
       updated_at     = NOW()
 WHERE school_year >= '2026-2027'
   AND grading_scheme IS DISTINCT FROM 'matatag';


-- --------------------------------------------------------------------------
-- STEP 3 — re-post, so sms_grades agrees with the class record again
-- --------------------------------------------------------------------------
-- Only records already posted. An unposted record picks the new scheme up
-- when its teacher posts it for the first time, which is the normal path.
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

  RAISE NOTICE 'migration 177: re-posted % class records, % learner-terms',
    v_recs, v_grades;
END $$;
