-- ============================================================================
-- Migration 234: the promotion GPA counts every section of the learner's year
-- ============================================================================
--
-- APPLY AFTER 153 (the body replaced here) and 183 (correct_enrollment).
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
--
-- A learner moved to another section of the same grade during the year —
-- Enrollment → Change section, which is 183's `correct_enrollment` — keeps the
-- quarters encoded in the earlier section there: grades are keyed
-- (student, subject, section, period, school year) and 183 deliberately moves
-- nothing. `students_gpa_for_grade` (128 → 153), which places and promotes,
-- averaged only the grades in the enrollment's CURRENT section, so a learner
-- moved in the third quarter was promoted on Q3–Q4 alone. The report card,
-- SF9, grade slip and grades matrix read the same way in the app and are fixed
-- beside this (lib/utils/learnerYearRecords.ts).
--
-- ---------------------------------------------------------------------------
-- The rule (identical to lib/utils/learnerYearRecords.ts)
-- ---------------------------------------------------------------------------
--
-- For Kindergarten to Grade 10 (and SNED), grades are read from every section
-- of the SAME school, school year and grade level as the enrollment's section,
-- one per (subject, grading period):
--   * un-encoded zeros are dropped first (153 already excluded them), so an
--     encoded grade anywhere beats a 0;
--   * the enrollment's own section wins a clash; otherwise the lowest section
--     id. Never an average of the two.
-- Never another school — an in-system transferee's origin grades stay behind
-- the record-request flow (invariant 8). Never another grade level — a learner
-- corrected out of a mis-clicked Promote must not carry the wrong grade's rows.
--
-- Grades 11–12 are UNCHANGED (`g.section_id = src.section_id`, as in 153).
-- An SHS learner holds one enrollment per semester and this function reads the
-- latest; widening it would start counting the other semester's subjects and
-- move existing placements, which is a separate decision.
--
-- MAPEH bucketing, the `is_madrasah` exclusion and `grade > 0` are 153's,
-- verbatim. Every column read from sms_sections is cast per 157.
--
-- ---------------------------------------------------------------------------
-- Blast radius
-- ---------------------------------------------------------------------------
--
-- One function replaced, same signature (plain CREATE OR REPLACE, grants kept
-- and re-stated). No table, column, policy or trigger; no DML. A learner who
-- never changed section gets exactly the GPA they get today — the only rows
-- added are ones in a sibling section for a (subject, period) the current
-- section does not hold.
--
-- Before applying, compare the live body with 153's (they must match):
--   SELECT pg_get_functiondef(
--     'procurements.students_gpa_for_grade(bigint[],integer,text,bigint)'::regprocedure);
--
-- Learners whose GPA can move (K–10, grades in a section other than their
-- enrollment's, same school / year / grade level):
--   SELECT count(DISTINCT g.student_id)
--   FROM procurements.sms_grades g
--   JOIN procurements.sms_sections sg ON sg.id = g.section_id
--   JOIN procurements.sms_enrollments e
--     ON e.student_id = g.student_id AND e.school_year = g.school_year
--    AND e.status = 'approved' AND e.grade_level < 11
--   JOIN procurements.sms_sections se ON se.id = e.section_id
--   WHERE g.section_id <> e.section_id AND g.grade > 0
--     AND sg.school_id = se.school_id
--     AND sg.grade_level::INTEGER = se.grade_level::INTEGER;
--
-- Reversible by re-running the CREATE OR REPLACE in 153_mapeh_component.sql.
--
-- Tests: supabase/tests/234_section_change_gpa.sql
-- ============================================================================

SET search_path TO procurements, public;

CREATE OR REPLACE FUNCTION procurements.students_gpa_for_grade(
  p_student_ids BIGINT[],
  p_grade_level INTEGER,
  p_school_year TEXT DEFAULT NULL,
  p_school_id   BIGINT DEFAULT NULL
)
RETURNS TABLE (student_id BIGINT, gpa NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT ids.sid, avg_row.value
  FROM unnest(COALESCE(p_student_ids, ARRAY[]::BIGINT[])) AS ids(sid)
  -- The enrollment that grade level was taken in …
  LEFT JOIN LATERAL (
    SELECT e.section_id, e.school_year, e.school_id
    FROM procurements.sms_enrollments e
    WHERE e.student_id = ids.sid
      AND e.grade_level = p_grade_level
      AND e.status = 'approved'
      AND (p_school_year IS NULL OR e.school_year = p_school_year)
      AND (p_school_id IS NULL OR e.school_id = p_school_id)
    ORDER BY e.school_year DESC, e.created_at DESC
    LIMIT 1
  ) src ON TRUE
  -- … and its average, excluding MEP/ALS subjects and un-encoded zeros, with
  -- the MAPEH components folded into one value per quarter so the learning
  -- area weighs the same as any other subject.
  LEFT JOIN LATERAL (
    SELECT ROUND(AVG(collapsed.grade)::numeric, 2) AS value
    FROM (
      SELECT AVG(picked.grade) AS grade
      FROM (
        -- One grade per (subject, period) across the year's sections — the
        -- enrollment's own section first, then the lowest section id (234).
        SELECT DISTINCT ON (g.subject_id, g.grading_period)
               g.subject_id, g.grading_period, g.grade, s.mapeh_component
        FROM procurements.sms_grades g
        JOIN procurements.sms_subjects s ON s.id = g.subject_id
        JOIN procurements.sms_sections sec ON sec.id = g.section_id
        WHERE g.student_id  = ids.sid
          AND g.school_year = src.school_year
          AND COALESCE(s.is_madrasah, false) = false
          AND g.grade > 0
          AND (
            g.section_id = src.section_id
            OR (
              p_grade_level < 11
              AND sec.school_id::BIGINT         = src.school_id
              AND sec.school_year::TEXT         = src.school_year
              AND sec.grade_level::INTEGER      = p_grade_level
            )
          )
        ORDER BY g.subject_id, g.grading_period,
                 (g.section_id = src.section_id) DESC, g.section_id ASC
      ) picked
      GROUP BY
        picked.grading_period,
        -- One bucket for all tagged components, one per subject otherwise.
        CASE WHEN picked.mapeh_component IS NOT NULL
             THEN 'mapeh'
             ELSE 'subj:' || picked.subject_id::text END
    ) collapsed
  ) avg_row ON TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION procurements.students_gpa_for_grade IS
  'Average grade per learner for a given grade level, excluding madrasah/ALS subjects and un-encoded (0) grades, with MAPEH components collapsed to one value per quarter so the learning area counts once. K-10: grades from every section of the same school, school year and grade level, one per subject and period, the enrollment''s own section winning (234). The single source of truth for section placement — both the enrollment wizard and Auto Enroll go through it.';

GRANT EXECUTE ON FUNCTION procurements.students_gpa_for_grade(BIGINT[], INTEGER, TEXT, BIGINT)
  TO authenticated;
