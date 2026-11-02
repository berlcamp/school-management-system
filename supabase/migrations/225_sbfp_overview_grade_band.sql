-- =============================================================================
-- 225 — SBFP division overview: filter by grade band
-- =============================================================================
-- The /sbfp-viewer dashboard (222) gains a grade-band filter: Kindergarten &
-- Grade 1, Elementary (K-G6), JHS (G7-10), SHS (G11-12). The bands live in
-- `SBFP_GRADE_BANDS` (lib/utils/sbfpOverview.ts); the database only ever sees
-- the list of grade levels.
--
-- The nutrition card needs nothing here: 222's `sbfp_division_nutrition` and
-- 224's `sbfp_division_learner_nutrition` already return `grade_level`, so the
-- client filters those rows. The headline tiles, the activity cards and the
-- schools table come from `sbfp_division_overview`, which sums per school and
-- cannot be filtered after the fact — so it takes the grade levels.
--
-- `sbfp_division_overview(p_school_year, p_grade_levels INTEGER[] DEFAULT NULL)`
-- * NULL = every grade level, which is 222's output exactly, column for column.
-- * A beneficiary's grade is their SECTION's grade (as 222's nutrition read);
--   a beneficiary with no section is left out once a band is chosen.
-- * Narrowed by the band: beneficiaries, sex, primary / secondary, milk
--   participants, weighings, wasted at baseline, rehabilitated, days present
--   (via the beneficiary), and deliveries / packs (a delivery's own
--   `grade_level`, 209/220).
-- * NOT narrowed, because they are not recorded per grade: feeding days (the
--   programme's calendar — still the right multiplier for the band's
--   beneficiaries), hot meal deliveries and servings (220 allows a hot-meals
--   delivery without a grade level), feedback and the four monitoring logs.
--   The page labels those cards "all grade levels" while a band is on.
-- * New last column `has_grade_band`: the school has an active section in the
--   school year at one of the grade levels (TRUE for every school when NULL),
--   so the page can drop, say, every elementary school from an SHS view while
--   keeping a JHS-SHS school that has not fed anybody yet.
--
-- ⚠ **DROP and re-create**: `CREATE OR REPLACE` cannot add a parameter
-- without leaving the one-argument version beside it (an ambiguous overload
-- once the new one has a DEFAULT), nor add a result column — the 157/223
-- precedent. One function, created by 222, holding no data; no view, trigger,
-- policy or function depends on it, only the dashboard page calls it, and it
-- is re-created in the same file with 222's grants. The body is 222's,
-- verified identical to the live definition on the local clone, plus the
-- band predicates. No table, column, policy, trigger or DML.
-- Requires 222 and 220. Tests: supabase/tests/225_sbfp_overview_grade_band.sql
-- =============================================================================

SET search_path TO procurements, public;

DROP FUNCTION IF EXISTS procurements.sbfp_division_overview(TEXT);

CREATE FUNCTION procurements.sbfp_division_overview(
  p_school_year  TEXT,
  p_grade_levels INTEGER[] DEFAULT NULL
)
RETURNS TABLE (
  school_id            BIGINT,
  school_name          TEXT,
  district             TEXT,
  program_id           BIGINT,
  is_last_mile_school  BOOLEAN,
  feeding_start_date   DATE,
  feeding_end_date     DATE,
  beneficiaries        BIGINT,
  male                 BIGINT,
  female               BIGINT,
  primary_count        BIGINT,
  secondary_count      BIGINT,
  milk_participants    BIGINT,
  baseline_weighed     BIGINT,
  midline_weighed      BIGINT,
  endline_weighed      BIGINT,
  wasted_at_baseline   BIGINT,
  rehabilitated        BIGINT,
  feeding_days         BIGINT,
  days_present         BIGINT,
  deliveries           BIGINT,
  packs_new            BIGINT,
  packs_replacement    BIGINT,
  packs_rejected       BIGINT,
  hot_meal_deliveries  BIGINT,
  servings_new         BIGINT,
  servings_replacement BIGINT,
  servings_rejected    BIGINT,
  feedback_open        BIGINT,
  feedback_in_progress BIGINT,
  feedback_resolved    BIGINT,
  kitchen_logs         BIGINT,
  dispatch_logs        BIGINT,
  receiving_logs       BIGINT,
  quality_evaluations  BIGINT,
  has_grade_band       BOOLEAN
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
BEGIN
  PERFORM procurements.sbfp_assert_division_reader();

  RETURN QUERY
  WITH sch AS (
    SELECT s.id, s.name::TEXT AS name, s.district::TEXT AS district
      FROM sms_schools s
     WHERE s.is_active
       AND s.id NOT IN (9, 10)
  ),
  band_sch AS (
    SELECT DISTINCT sec.school_id
      FROM sms_sections sec
     WHERE sec.school_year = p_school_year
       AND sec.is_active
       AND sec.grade_level = ANY (p_grade_levels)
  ),
  prog AS (
    SELECT p.* FROM sms_sbfp_programs p
     WHERE p.school_year = p_school_year
  ),
  ben AS (
    SELECT b.id, b.program_id, b.classification, b.milk_tolerance,
           lower(trim(COALESCE(st.gender, ''))) AS g
      FROM sms_sbfp_beneficiaries b
      JOIN prog ON prog.id = b.program_id
      LEFT JOIN sms_students st ON st.id = b.student_id
      LEFT JOIN sms_sections bsec ON bsec.id = b.section_id
     WHERE p_grade_levels IS NULL
        OR bsec.grade_level = ANY (p_grade_levels)
  ),
  meas AS (
    SELECT m.beneficiary_id,
           bool_or(m.period = 'baseline') AS has_base,
           bool_or(m.period = 'midline')  AS has_mid,
           bool_or(m.period = 'endline')  AS has_end,
           bool_or(m.period = 'baseline' AND m.nutritional_status IN ('severely_wasted', 'wasted')) AS base_wasted,
           bool_or(m.period = 'endline'  AND m.nutritional_status IN ('normal', 'overweight', 'obese')) AS end_ok
      FROM sms_sbfp_measurements m
      JOIN ben ON ben.id = m.beneficiary_id
     GROUP BY m.beneficiary_id
  ),
  ben_agg AS (
    SELECT ben.program_id,
           count(*)                                                        AS n,
           count(*) FILTER (WHERE ben.g IN ('male', 'm'))                  AS male,
           count(*) FILTER (WHERE ben.g IN ('female', 'f'))                AS female,
           count(*) FILTER (WHERE ben.classification = 'primary')          AS prim,
           count(*) FILTER (WHERE ben.classification = 'secondary')        AS sec,
           count(*) FILTER (WHERE ben.milk_tolerance IN ('none', 'intolerant_willing')) AS milk,
           count(*) FILTER (WHERE meas.has_base)                           AS base,
           count(*) FILTER (WHERE meas.has_mid)                            AS mid,
           count(*) FILTER (WHERE meas.has_end)                            AS endl,
           count(*) FILTER (WHERE meas.base_wasted)                        AS wasted,
           count(*) FILTER (WHERE meas.base_wasted AND meas.end_ok)        AS rehab
      FROM ben
      LEFT JOIN meas ON meas.beneficiary_id = ben.id
     GROUP BY ben.program_id
  ),
  days AS (
    SELECT d.program_id, count(*) AS n
      FROM sms_sbfp_feeding_days d JOIN prog ON prog.id = d.program_id
     GROUP BY d.program_id
  ),
  present AS (
    SELECT ben.program_id, count(*) AS n
      FROM sms_sbfp_feeding_records r
      JOIN ben ON ben.id = r.beneficiary_id
      JOIN sms_sbfp_feeding_days d
        ON d.program_id = ben.program_id AND d.feeding_date = r.feeding_date
     WHERE r.code IS NOT NULL AND r.code <> 'A'
     GROUP BY ben.program_id
  ),
  deliv AS (
    SELECT dl.program_id,
           count(*)                                              AS n,
           COALESCE(sum(dl.packs_new), 0)                        AS pn,
           COALESCE(sum(dl.packs_replacement), 0)                AS pr,
           COALESCE(sum(dl.packs_rejected), 0)                   AS pj
      FROM sms_sbfp_deliveries dl JOIN prog ON prog.id = dl.program_id
     WHERE p_grade_levels IS NULL
        OR dl.grade_level = ANY (p_grade_levels)
     GROUP BY dl.program_id
  ),
  hot AS (
    SELECT dl.program_id, count(*) AS n
      FROM sms_sbfp_deliveries dl JOIN prog ON prog.id = dl.program_id
     WHERE dl.component = 'hot_meals'
     GROUP BY dl.program_id
  ),
  meals AS (
    SELECT dl.program_id,
           COALESCE(sum(ml.servings) FILTER (WHERE ml.kind = 'new'), 0)         AS sn,
           COALESCE(sum(ml.servings) FILTER (WHERE ml.kind = 'replacement'), 0) AS sr,
           COALESCE(sum(ml.servings) FILTER (WHERE ml.kind = 'rejected'), 0)    AS sj
      FROM sms_sbfp_delivery_meals ml
      JOIN sms_sbfp_deliveries dl ON dl.id = ml.delivery_id
      JOIN prog ON prog.id = dl.program_id
     GROUP BY dl.program_id
  ),
  fb AS (
    SELECT f.program_id,
           count(*) FILTER (WHERE f.status = 'open')        AS o,
           count(*) FILTER (WHERE f.status = 'in_progress') AS ip,
           count(*) FILTER (WHERE f.status = 'resolved')    AS r
      FROM sms_sbfp_feedback f JOIN prog ON prog.id = f.program_id
     GROUP BY f.program_id
  ),
  kl AS (SELECT x.program_id, count(*) AS n FROM sms_sbfp_kitchen_logs x   JOIN prog ON prog.id = x.program_id GROUP BY x.program_id),
  dsl AS (SELECT x.program_id, count(*) AS n FROM sms_sbfp_dispatch_logs x  JOIN prog ON prog.id = x.program_id GROUP BY x.program_id),
  rl AS (SELECT x.program_id, count(*) AS n FROM sms_sbfp_receiving_logs x JOIN prog ON prog.id = x.program_id GROUP BY x.program_id),
  ql AS (SELECT x.program_id, count(*) AS n FROM sms_sbfp_quality_responses x JOIN prog ON prog.id = x.program_id GROUP BY x.program_id)
  SELECT sch.id,
         sch.name,
         sch.district,
         prog.id,
         prog.is_last_mile_school,
         prog.feeding_start_date,
         prog.feeding_end_date,
         COALESCE(ben_agg.n, 0)::BIGINT,
         COALESCE(ben_agg.male, 0)::BIGINT,
         COALESCE(ben_agg.female, 0)::BIGINT,
         COALESCE(ben_agg.prim, 0)::BIGINT,
         COALESCE(ben_agg.sec, 0)::BIGINT,
         COALESCE(ben_agg.milk, 0)::BIGINT,
         COALESCE(ben_agg.base, 0)::BIGINT,
         COALESCE(ben_agg.mid, 0)::BIGINT,
         COALESCE(ben_agg.endl, 0)::BIGINT,
         COALESCE(ben_agg.wasted, 0)::BIGINT,
         COALESCE(ben_agg.rehab, 0)::BIGINT,
         COALESCE(days.n, 0)::BIGINT,
         COALESCE(present.n, 0)::BIGINT,
         COALESCE(deliv.n, 0)::BIGINT,
         COALESCE(deliv.pn, 0)::BIGINT,
         COALESCE(deliv.pr, 0)::BIGINT,
         COALESCE(deliv.pj, 0)::BIGINT,
         COALESCE(hot.n, 0)::BIGINT,
         COALESCE(meals.sn, 0)::BIGINT,
         COALESCE(meals.sr, 0)::BIGINT,
         COALESCE(meals.sj, 0)::BIGINT,
         COALESCE(fb.o, 0)::BIGINT,
         COALESCE(fb.ip, 0)::BIGINT,
         COALESCE(fb.r, 0)::BIGINT,
         COALESCE(kl.n, 0)::BIGINT,
         COALESCE(dsl.n, 0)::BIGINT,
         COALESCE(rl.n, 0)::BIGINT,
         COALESCE(ql.n, 0)::BIGINT,
         (p_grade_levels IS NULL OR band_sch.school_id IS NOT NULL)
    FROM sch
    LEFT JOIN band_sch ON band_sch.school_id = sch.id
    LEFT JOIN prog    ON prog.school_id = sch.id
    LEFT JOIN ben_agg ON ben_agg.program_id = prog.id
    LEFT JOIN days    ON days.program_id = prog.id
    LEFT JOIN present ON present.program_id = prog.id
    LEFT JOIN deliv   ON deliv.program_id = prog.id
    LEFT JOIN hot     ON hot.program_id = prog.id
    LEFT JOIN meals   ON meals.program_id = prog.id
    LEFT JOIN fb      ON fb.program_id = prog.id
    LEFT JOIN kl      ON kl.program_id = prog.id
    LEFT JOIN dsl     ON dsl.program_id = prog.id
    LEFT JOIN rl      ON rl.program_id = prog.id
    LEFT JOIN ql      ON ql.program_id = prog.id
   ORDER BY sch.name;
END;
$$;

REVOKE ALL ON FUNCTION procurements.sbfp_division_overview(TEXT, INTEGER[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sbfp_division_overview(TEXT, INTEGER[]) TO authenticated;
