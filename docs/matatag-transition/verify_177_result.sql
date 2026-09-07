-- ============================================================================
-- IS THE PASS -> FAIL COUNT REAL?  (READ-ONLY, run on production)
-- ============================================================================
-- 177 is applied. It reported far more learners ceasing to pass than the clone
-- predicted, and in a different proportion:
--
--                          clone   scaled to prod   actual prod
--     stop passing           230        ~919           2,945     3.2x more
--     start passing          374      ~1,494             282     0.2x
--
-- The clone was a quarter the size of production and is stale, so a bigger
-- number is expected. A different SHAPE is not. These four queries decide
-- whether that shape has an innocent explanation.
--
-- THE MECHANISM IT SHOULD HAVE. Only the table-swap cohort can produce a
-- pass -> fail: a record that never transmuted posts ROUND(Initial), and for
-- that to be >= 75 the Initial must be >= 74.5, which transmutes to >= 79 --
-- still passing. So EVERY pass -> fail must be a record with
-- use_transmutation = TRUE and an Initial Grade between 60.00 and 69.99, where
-- DO 8 gave a 75+ and MATATAG does not.
--
-- If query 1 shows ~100% in that band and query 2 shows ~100% in cohort A,
-- the number is real and production simply has far more transmuting records
-- than the stale clone did. If it does not, STOP and roll back (see bottom).
-- ============================================================================

-- 1. Where do the pass -> fail learners sit on the Initial Grade scale?
--    EXPECT: essentially all of them in 60.00-69.99.
WITH moved AS (
  SELECT b.grade AS before_grade, g.grade AS after_grade,
         r.use_transmutation, r.school_id,
         CASE WHEN EXISTS (SELECT 1 FROM procurements.sms_class_record_blocks bl
                            WHERE bl.class_record_id = r.id)
              THEN (SELECT COALESCE(SUM(COALESCE(
                      procurements.sms_class_record_block_ps(bl.id, g.student_id),0)
                      * bl.weight/100.0),0)
                      FROM procurements.sms_class_record_blocks bl
                     WHERE bl.class_record_id = r.id)
              ELSE COALESCE(procurements.sms_class_record_component_ps(r.id,g.student_id,'WW'),0)*r.ww_weight/100.0
                 + COALESCE(procurements.sms_class_record_component_ps(r.id,g.student_id,'PT'),0)*r.pt_weight/100.0
                 + COALESCE(procurements.sms_class_record_component_ps(r.id,g.student_id,'ST'),0)*r.st_weight/100.0
         END AS initial
    FROM procurements.sms_grades_pre_matatag_backup b
    JOIN procurements.sms_grades g ON g.id = b.id
    JOIN procurements.sms_class_records r
      ON r.subject_id = g.subject_id AND r.section_id = g.section_id
     AND r.grading_period = g.grading_period AND r.school_year = g.school_year
   WHERE b.grade >= 75 AND g.grade < 75
)
SELECT CASE WHEN initial >= 70 THEN 'e. 70.00 and above  <- UNEXPECTED'
            WHEN initial >= 60 THEN 'd. 60.00-69.99      <- expected'
            WHEN initial >= 50 THEN 'c. 50.00-59.99      <- UNEXPECTED'
            WHEN initial >= 40 THEN 'b. 40.00-49.99      <- UNEXPECTED'
            ELSE                    'a. below 40.00      <- UNEXPECTED' END AS initial_grade_band,
       count(*) AS learners,
       round(100.0*count(*)/sum(count(*)) OVER (), 1) AS pct,
       min(before_grade) AS min_before, max(before_grade) AS max_before,
       min(after_grade)  AS min_after,  max(after_grade)  AS max_after
  FROM moved GROUP BY 1 ORDER BY 1;

-- 2. Which cohort are they in? EXPECT: all cohort A (use_transmutation TRUE).
SELECT r.use_transmutation,
       count(*) FILTER (WHERE b.grade >= 75 AND g.grade <  75) AS stop_passing,
       count(*) FILTER (WHERE b.grade <  75 AND g.grade >= 75) AS start_passing,
       count(*)                                                AS grades_in_cohort
  FROM procurements.sms_grades_pre_matatag_backup b
  JOIN procurements.sms_grades g ON g.id = b.id
  JOIN procurements.sms_class_records r
    ON r.subject_id = g.subject_id AND r.section_id = g.section_id
   AND r.grading_period = g.grading_period AND r.school_year = g.school_year
 GROUP BY 1;

-- 3. How is it spread across schools? A school with almost everyone failing
--    is a data problem at that school, not the transmutation table.
SELECT s.name AS school,
       count(*) FILTER (WHERE b.grade >= 75 AND g.grade <  75) AS stop_passing,
       count(*) FILTER (WHERE b.grade <  75 AND g.grade >= 75) AS start_passing,
       count(*) AS grades,
       round(100.0*count(*) FILTER (WHERE b.grade >= 75 AND g.grade < 75)/count(*),1) AS pct_stop
  FROM procurements.sms_grades_pre_matatag_backup b
  JOIN procurements.sms_grades g ON g.id = b.id
  JOIN procurements.sms_class_records r
    ON r.subject_id = g.subject_id AND r.section_id = g.section_id
   AND r.grading_period = g.grading_period AND r.school_year = g.school_year
  JOIN procurements.sms_schools s ON s.id = r.school_id
 GROUP BY 1 HAVING count(*) FILTER (WHERE b.grade >= 75 AND g.grade < 75) > 0
 ORDER BY pct_stop DESC;

-- 4. Sanity: nothing should be outside 60-100 after transmutation.
SELECT count(*) FILTER (WHERE g.grade > 100) AS above_100,
       count(*) FILTER (WHERE g.grade < 60)  AS below_60,
       min(g.grade) AS min_grade, max(g.grade) AS max_grade
  FROM procurements.sms_grades_pre_matatag_backup b
  JOIN procurements.sms_grades g ON g.id = b.id;

-- ============================================================================
-- ROLLBACK, IF YOU WANT THE OLD GRADES BACK WHILE THIS IS SETTLED
-- ============================================================================
--   UPDATE procurements.sms_class_records SET grading_scheme = 'legacy'
--    WHERE school_year >= '2026-2027';
--   UPDATE procurements.sms_grades g
--      SET grade = b.grade, remarks = b.remarks
--     FROM procurements.sms_grades_pre_matatag_backup b
--    WHERE b.id = g.id;
-- Restores all 29,071 grades exactly. Run both statements together.
-- ============================================================================
