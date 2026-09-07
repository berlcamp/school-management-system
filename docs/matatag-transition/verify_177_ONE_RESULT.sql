/* ==========================================================================
   VERIFY 177's PASS-TO-FAIL COUNT  (READ-ONLY, one single result set)

   The Supabase SQL editor displays only the LAST statement's output, so this
   returns everything as one table. Read it top to bottom.

   WHAT MUST BE TRUE. Only the table-swap cohort can produce a pass-to-fail:
   a record that never transmuted posts ROUND(Initial), which only reaches 75
   when Initial is 74.5 or more, and that transmutes to 79 or more. So every
   pass-to-fail must be a use_transmutation = TRUE record with an Initial
   Grade of 60.00 to 69.99.

   Section 1 rows tagged EXPECTED should hold essentially all of them.
   Section 2 should show stop_passing only against use_transmutation = true.
   Anything else means stop and roll back.
   ========================================================================== */
WITH moved AS (
  SELECT b.grade AS before_grade,
         g.grade AS after_grade,
         r.use_transmutation,
         r.school_id,
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
)
SELECT * FROM (
  SELECT 1 AS sort_a,
         '1. INITIAL GRADE BAND of learners who stopped passing' AS section,
         CASE WHEN initial >= 70 THEN 'd. 70.00 and above   UNEXPECTED'
              WHEN initial >= 60 THEN 'c. 60.00 to 69.99    EXPECTED'
              WHEN initial >= 40 THEN 'b. 40.00 to 59.99    UNEXPECTED'
              ELSE                    'a. below 40.00       UNEXPECTED' END AS bucket,
         count(*)::text AS stop_passing,
         ''::text       AS start_passing,
         round(100.0*count(*)/sum(count(*)) OVER (), 1)::text AS pct
    FROM moved WHERE before_grade >= 75 AND after_grade < 75
   GROUP BY 2, 3

  UNION ALL
  SELECT 2,
         '2. COHORT',
         CASE WHEN use_transmutation THEN 'A. use_transmutation = true  (table swap)'
                                     ELSE 'B. use_transmutation = false (newly transmuted)' END,
         count(*) FILTER (WHERE before_grade >= 75 AND after_grade <  75)::text,
         count(*) FILTER (WHERE before_grade <  75 AND after_grade >= 75)::text,
         count(*)::text
    FROM moved GROUP BY 2, 3

  UNION ALL
  SELECT 3,
         '3. BY SCHOOL (worst first)',
         s.name,
         count(*) FILTER (WHERE before_grade >= 75 AND after_grade <  75)::text,
         count(*) FILTER (WHERE before_grade <  75 AND after_grade >= 75)::text,
         round(100.0*count(*) FILTER (WHERE before_grade >= 75 AND after_grade < 75)
               / NULLIF(count(*),0), 1)::text
    FROM moved JOIN procurements.sms_schools s ON s.id = moved.school_id
   GROUP BY 2, 3
  HAVING count(*) FILTER (WHERE before_grade >= 75 AND after_grade < 75) > 0
) x
ORDER BY sort_a,
         CASE WHEN sort_a = 3 THEN -(NULLIF(pct,'')::numeric) ELSE 0 END,
         bucket;
