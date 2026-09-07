-- ============================================================================
-- MATATAG TRANSITION — LEARNERS WHOSE TERM GRADE WOULD CHANGE
-- ============================================================================
-- READ-ONLY. No INSERT, UPDATE, DELETE or DDL. Safe to run on any database.
--
-- Produces the authoritative list behind the sign-off: every learner-term whose
-- posted Term Grade would move if migration 177 were applied, and in particular
-- every one that crosses the 75 pass mark in either direction.
--
-- Run this ON THE DATABASE THAT WILL ACTUALLY BE MIGRATED, on the day the
-- decision is taken. A list drawn from a clone is indicative only: grades move
-- as teachers encode, and the sign-off has to name the learners who are really
-- affected at the moment of signing.
--
-- PREREQUISITE: migrations 173 and 178 applied (the `grading_scheme` column and
-- the workbook transmutation table). 177 must NOT be applied yet -- this
-- forecasts its effect. If 177 is already applied the query returns nothing,
-- which is itself the confirmation.
--
-- Export to CSV from psql:
--   \copy (<paste the final SELECT>) TO 'affected.csv' WITH (FORMAT csv, HEADER)
-- ============================================================================

WITH roster AS (
  -- Exactly the loop post_class_record_grades walks: enrolled, and carrying at
  -- least one score. A learner it skips keeps their existing grade and is not
  -- affected, so they must not appear here.
  SELECT r.id AS rec_id, r.school_id, r.section_id, r.subject_id, r.teacher_id,
         r.school_year, r.grading_period, r.grading_scheme, r.use_transmutation,
         r.ww_weight, r.pt_weight, r.st_weight,
         e.student_id,
         EXISTS (SELECT 1 FROM procurements.sms_class_record_blocks b
                  WHERE b.class_record_id = r.id) AS has_blocks
    FROM procurements.sms_class_records r
    JOIN procurements.sms_enrollments e
      ON e.section_id = r.section_id
     AND e.school_year = r.school_year
     AND e.status = 'approved'
     AND e.enrollment_status IN ('active','promoted','graduated','retained','completed')
   WHERE r.is_posted
     AND r.school_year >= '2026-2027'
     AND r.grading_scheme <> 'matatag'
     AND EXISTS (SELECT 1
                   FROM procurements.sms_class_record_scores s
                   JOIN procurements.sms_class_record_items i ON i.id = s.item_id
                  WHERE i.class_record_id = r.id
                    AND s.student_id = e.student_id
                    AND s.raw_score IS NOT NULL)
),
computed AS (
  SELECT ro.*,
         CASE WHEN ro.has_blocks THEN (
                SELECT COALESCE(SUM(COALESCE(
                         procurements.sms_class_record_block_ps(b.id, ro.student_id), 0)
                         * b.weight / 100.0), 0)
                  FROM procurements.sms_class_record_blocks b
                 WHERE b.class_record_id = ro.rec_id)
              ELSE
                COALESCE(procurements.sms_class_record_component_ps(ro.rec_id, ro.student_id, 'WW'), 0) * ro.ww_weight / 100.0
              + COALESCE(procurements.sms_class_record_component_ps(ro.rec_id, ro.student_id, 'PT'), 0) * ro.pt_weight / 100.0
              + COALESCE(procurements.sms_class_record_component_ps(ro.rec_id, ro.student_id, 'ST'), 0) * ro.st_weight / 100.0
         END AS initial_grade
    FROM roster ro
),
movement AS (
  SELECT c.*,
         g.grade AS grade_now,
         procurements.sms_transmute_grade_matatag(c.initial_grade) AS grade_after
    FROM computed c
    JOIN procurements.sms_grades g
      ON g.student_id     = c.student_id
     AND g.subject_id     = c.subject_id
     AND g.section_id     = c.section_id
     AND g.grading_period = c.grading_period
     AND g.school_year    = c.school_year
)
SELECT sch.name                                   AS school,
       sec.grade_level                            AS grade_level,
       sec.name                                   AS section,
       sub.name                                   AS subject,
       u.name                                     AS teacher,
       m.grading_period                           AS term,
       st.lrn                                     AS lrn,
       st.last_name || ', ' || st.first_name
         || COALESCE(' ' || st.middle_name, '')   AS learner,
       ROUND(m.initial_grade, 2)                  AS initial_grade,
       m.grade_now                                AS grade_now,
       m.grade_after                              AS grade_after,
       m.grade_after - m.grade_now                AS change,
       CASE WHEN m.grade_now >= 75 AND m.grade_after <  75 THEN 'PASS -> FAIL'
            WHEN m.grade_now <  75 AND m.grade_after >= 75 THEN 'FAIL -> PASS'
            ELSE 'no change to pass/fail' END     AS pass_fail_effect,
       CASE WHEN m.use_transmutation
            THEN 'A: table swap (DO 8 -> MATATAG)'
            ELSE 'B: transmutation switched on'  END AS cohort
  FROM movement m
  JOIN procurements.sms_students st ON st.id = m.student_id
  JOIN procurements.sms_sections sec ON sec.id = m.section_id
  JOIN procurements.sms_subjects sub ON sub.id = m.subject_id
  JOIN procurements.sms_schools  sch ON sch.id = m.school_id
  LEFT JOIN procurements.sms_users u ON u.id = m.teacher_id
 WHERE m.grade_now IS DISTINCT FROM m.grade_after
   -- For the sign-off annex, restrict to the learners who cross the pass mark:
   --   AND ((m.grade_now >= 75 AND m.grade_after < 75)
   --     OR (m.grade_now <  75 AND m.grade_after >= 75))
 ORDER BY sch.name, sec.grade_level, sec.name, sub.name, st.last_name, st.first_name;
