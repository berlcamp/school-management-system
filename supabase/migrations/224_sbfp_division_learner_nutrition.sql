-- =============================================================================
-- 224 — SBFP dashboard: the whole division's nutritional status, beside the
--       beneficiaries'
-- =============================================================================
-- The "Nutritional status of beneficiaries" card on /sbfp-viewer (222) shows
-- only the feeding programme's own weighings. Read alone, "38% Wasted" says
-- nothing: the beneficiaries were picked BECAUSE they were wasted. The figure
-- it needs beside it is every learner the division weighed — Learner Health
-- (023 → 111 → 188), the SF8 readings.
--
-- `sbfp_division_learner_nutrition(sy)` returns the same row shape as 222's
-- `sbfp_division_nutrition`, so the client reuses one normaliser and one
-- distribution function for both bars. Rules:
--   * periods are Learner Health's two (188): `baseline` and `endline`. There
--     is no midline in Learner Health, so that bar has no comparison;
--   * one reading per learner per period — `DISTINCT ON (student_id,
--     measurement_period)`, latest `measured_at` first — because 188's key is
--     (student, section, school year, period) and a learner moved between
--     sections can carry a reading in each;
--   * the school is the SECTION's school; active schools only and the test
--     schools (9, 10) left out, per 206's rule for a division aggregate —
--     exactly the scope of 222's two functions;
--   * every weighed learner counts, beneficiaries included: the comparison is
--     "the division", not "the division minus the programme".
--
-- SECURITY DEFINER behind 222's `sbfp_assert_division_reader` (super admin,
-- division_admin, division_type, sbfp_viewer), the 193 lesson: Learner Health
-- is readable by `authenticated` already, but the division-wide year is
-- thousands of rows, past PostgREST's row cap. **Only counts leave the
-- function.**
--
-- Requires 222. One new read-only function; no table, column, policy, trigger
-- or DML.
-- =============================================================================

SET search_path TO procurements, public;

CREATE OR REPLACE FUNCTION procurements.sbfp_division_learner_nutrition(p_school_year TEXT)
RETURNS TABLE (
  school_id          BIGINT,
  period             TEXT,
  grade_level        INTEGER,
  sex                TEXT,
  nutritional_status TEXT,
  height_for_age     TEXT,
  learners           BIGINT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
BEGIN
  PERFORM procurements.sbfp_assert_division_reader();

  RETURN QUERY
  WITH readings AS (
    SELECT DISTINCT ON (h.student_id, h.measurement_period)
           sec.school_id,
           h.measurement_period,
           sec.grade_level,
           h.student_id,
           h.nutritional_status,
           h.height_for_age
      FROM sms_learner_health h
      JOIN sms_sections sec ON sec.id = h.section_id
      JOIN sms_schools s    ON s.id = sec.school_id
     WHERE h.school_year = p_school_year
       AND s.is_active
       AND s.id NOT IN (9, 10)
     ORDER BY h.student_id, h.measurement_period,
              h.measured_at DESC NULLS LAST, h.updated_at DESC
  )
  SELECT r.school_id::BIGINT,
         r.measurement_period::TEXT,
         r.grade_level::INTEGER,
         CASE lower(trim(COALESCE(st.gender, '')))
           WHEN 'male' THEN 'male' WHEN 'm' THEN 'male'
           WHEN 'female' THEN 'female' WHEN 'f' THEN 'female'
           ELSE 'unspecified'
         END,
         r.nutritional_status::TEXT,
         r.height_for_age::TEXT,
         count(*)::BIGINT
    FROM readings r
    LEFT JOIN sms_students st ON st.id = r.student_id
   GROUP BY 1, 2, 3, 4, 5, 6;
END;
$$;

REVOKE ALL ON FUNCTION procurements.sbfp_division_learner_nutrition(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sbfp_division_learner_nutrition(TEXT) TO authenticated;
