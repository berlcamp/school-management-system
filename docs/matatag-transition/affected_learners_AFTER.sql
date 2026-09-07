/* ==========================================================================
   AFFECTED LEARNERS, AFTER 177 IS APPLIED  (READ-ONLY, one result set)

   affected_learners.sql forecasts 177 BEFORE it runs, so its roster filters
   grading_scheme <> 'matatag' and returns nothing once every record is on the
   new scheme. This is the counterpart: it reads what actually happened, by
   comparing the pre-change snapshot against the grades as they now stand.

   Defaults to the learners who CROSSED THE PASS MARK, which is the list the
   schools have to act on. To list every changed grade instead, comment out the
   pass mark filter marked below.

   TO SPLIT PER SCHOOL, uncomment the school filter and set the name. Give a
   School Head only their own rows.

   CONTAINS LEARNER NAMES AND LRNs. Handle as DepEd learner records: share only
   with the school the rows belong to, and do not upload it anywhere public.
   ========================================================================== */
WITH moved AS (
  SELECT bk.grade AS before_grade,
         g.grade  AS after_grade,
         g.student_id, r.school_id, r.section_id, r.subject_id, r.teacher_id,
         r.grading_period, r.use_transmutation,
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
         END AS initial_grade
    FROM procurements.sms_grades_pre_matatag_backup bk
    JOIN procurements.sms_grades g ON g.id = bk.id
    JOIN procurements.sms_class_records r
      ON r.subject_id = g.subject_id AND r.section_id = g.section_id
     AND r.grading_period = g.grading_period AND r.school_year = g.school_year
   WHERE bk.grade IS DISTINCT FROM g.grade
)
SELECT sch.name                                     AS school,
       sec.grade_level                              AS grade_level,
       sec.name                                     AS section,
       sub.name                                     AS subject,
       u.name                                       AS teacher,
       m.grading_period                             AS term,
       st.lrn                                       AS lrn,
       st.last_name || ', ' || st.first_name
         || COALESCE(' ' || st.middle_name, '')     AS learner,
       ROUND(m.initial_grade, 2)                    AS initial_grade,
       m.before_grade                               AS grade_before,
       m.after_grade                                AS grade_after,
       m.after_grade - m.before_grade               AS change,
       CASE WHEN m.before_grade >= 75 AND m.after_grade <  75 THEN 'STOPPED PASSING'
            WHEN m.before_grade <  75 AND m.after_grade >= 75 THEN 'started passing'
            ELSE 'grade changed only' END           AS effect
  FROM moved m
  JOIN procurements.sms_students st  ON st.id  = m.student_id
  JOIN procurements.sms_sections sec ON sec.id = m.section_id
  JOIN procurements.sms_subjects sub ON sub.id = m.subject_id
  JOIN procurements.sms_schools  sch ON sch.id = m.school_id
  LEFT JOIN procurements.sms_users u ON u.id   = m.teacher_id
 WHERE ((m.before_grade >= 75 AND m.after_grade <  75)     /* pass mark filter */
     OR (m.before_grade <  75 AND m.after_grade >= 75))    /* comment out for all */
   /* AND sch.name = 'San Juan Elementary School' */
 ORDER BY sch.name, sec.grade_level, sec.name, sub.name, st.last_name, st.first_name;
