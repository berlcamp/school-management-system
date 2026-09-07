/* ==========================================================================
   THE 35 COHORT-B PASS-TO-FAIL CASES  (READ-ONLY, one result set)

   Cohort B should not be able to produce a pass-to-fail at all. Before 177 it
   posted ROUND(Initial); for that to reach 75 the Initial must be 74.5 or
   more, and 74.5 transmutes to 79. So 35 is either a real defect or the
   stored "before" grade was never ROUND of the CURRENT scores.

   The second is likely: on the clone, every single posted grade already
   disagreed with a fresh recompute under its own scheme, because teachers edit
   scores after posting and the grade is not recomputed until someone posts
   again. If a score was LOWERED after the original post, the stored grade can
   be 75+ while today's Initial is below 70.

   VERDICT ROW tells you which:
     stale posting          the old grade did not match today's scores. Not a
                            177 defect. The learner's grade was already wrong
                            before any of this and 177 corrected it.
     DEFECT, INVESTIGATE    the old grade did match, so transmutation itself
                            moved a passing learner to failing in a cohort
                            where that is impossible. Roll back.
   ========================================================================== */
WITH b AS (
  SELECT bk.grade AS before_grade,
         g.grade  AS after_grade,
         r.id AS rec_id,
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
         END AS initial_now
    FROM procurements.sms_grades_pre_matatag_backup bk
    JOIN procurements.sms_grades g ON g.id = bk.id
    JOIN procurements.sms_class_records r
      ON r.subject_id = g.subject_id AND r.section_id = g.section_id
     AND r.grading_period = g.grading_period AND r.school_year = g.school_year
   WHERE r.use_transmutation = false
     AND bk.grade >= 75 AND g.grade < 75
)
SELECT CASE WHEN before_grade = ROUND(initial_now)
            THEN 'DEFECT, INVESTIGATE'
            ELSE 'stale posting (scores changed after the original post)'
       END AS verdict,
       count(*) AS learners,
       min(before_grade) AS min_before,
       max(before_grade) AS max_before,
       round(min(initial_now),2) AS min_initial_now,
       round(max(initial_now),2) AS max_initial_now,
       round(avg(before_grade - ROUND(initial_now)),1) AS avg_drift
  FROM b
 GROUP BY 1;
