-- ============================================================================
-- Phil-IRI — Group Screening Test result as a 4-level reading profile
--
-- The screening `result` column now reports a reading level instead of the old
-- binary "For Phil-IRI" / "No Phil-IRI". Cutoffs depend on the form size:
--
--   Grades 3-6 (20-item):  0 → Non-Reader · 1-13 Frustration ·
--                          14-17 Instructional · 18-20 Independent
--   Grades 7-10 (40-item): 0 → Non-Reader · 1-27 Frustration ·
--                          28-35 Instructional · 36-40 Independent
--
-- Instructional / Independent are "for enrichment" (no full Phil-IRI needed) —
-- i.e. the old "No Phil-IRI" bucket; Non-Reader / Frustration is the old
-- "For Phil-IRI" bucket. Recompute existing screening rows from total_score and
-- the material's grade level so the division rollup keeps counting them.
-- ============================================================================

SET search_path TO procurements, public;

UPDATE procurements.sms_philiri_records r
   SET screening_result = CASE
         WHEN r.total_score <= 0 THEN 'Non-Reader'
         WHEN m.grade_level >= 7 THEN
           CASE
             WHEN r.total_score < 28 THEN 'Frustration'
             WHEN r.total_score < 36 THEN 'Instructional'
             ELSE 'Independent'
           END
         ELSE
           CASE
             WHEN r.total_score < 14 THEN 'Frustration'
             WHEN r.total_score < 18 THEN 'Instructional'
             ELSE 'Independent'
           END
       END
  FROM procurements.sms_philiri_materials m
 WHERE r.material_id = m.id
   AND r.form_type = 'screening'
   AND r.screening_result IS NOT NULL
   AND r.total_score IS NOT NULL;
