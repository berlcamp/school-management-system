-- ============================================================================
-- 201 — Transfer-in counts include learners from schools outside the system
-- ============================================================================
-- Migration 200 gave a learner arriving from a school outside the system
-- (a private school, another division) `sms_enrollments.transfer_in_school_name`,
-- the twin of 066's `origin_school_id`. Every transfer-in COUNT still read
-- `origin_school_id IS NOT NULL` alone, so those learners were badged
-- "Transferee" on the section page and annotated "Transferred in from X" on
-- SF1/SF2 while SF4, SF2's summary box and the division enrollment report
-- counted them as nothing.
--
-- The rule is now the one `isTransferee()` in lib/utils/transferIn.ts
-- applies:
--
--   origin_school_id IS NOT NULL OR transfer_in_school_name IS NOT NULL
--
-- and the COUNT now agrees with SF2 on a second point: a learner who
-- transferred in and then out again in the same year is counted on the
-- transfer_out line only (SF2 already did this; SF4 and these functions
-- counted them on both). SF4 also counted a Senior High transferee once
-- per semester row; `countTransfersIn()` counts each learner once, as
-- these functions' DISTINCT already did.
--
-- Three objects carry the old rule in SQL, and 148's header requires their
-- definitions to match generateSf4.ts (changed in the same commit):
--
-- 1. `division_enrollment_actual` — 148's body verbatim except the
--    'transfer_in' CASE branch. Same signature, plain CREATE OR REPLACE.
-- 2. `division_enrollment_sections` — 165's body verbatim except the same
--    branch, so a drilled-down grade still sums to its row (165's rule).
--    Still SECURITY INVOKER.
-- 3. `reporting.v_report_enrollment` — 166's view verbatim except
--    `is_transfer_in` (same rule) and `origin_school_name`, which now falls
--    back to the typed name so the Report Generator shows where an
--    out-of-system transferee came from. Same column names, types and order,
--    so CREATE OR REPLACE VIEW keeps its grants and dependants.
--
-- Requires migration 200 (the column). Changes no rows. The transfer_in
-- count moves for enrolments carrying `transfer_in_school_name` (none before
-- 200), and DROPS for a learner who transferred in and later out in the same
-- year — they now appear on transfer_out alone. `is_transfer_in` on the view
-- stays a per-enrolment fact and is not affected by that second rule.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. division_enrollment_actual (148)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.division_enrollment_actual(
  p_school_year TEXT,
  p_semester    SMALLINT DEFAULT NULL,
  p_school_type TEXT     DEFAULT NULL,
  p_category    TEXT     DEFAULT 'enrollment'
)
RETURNS TABLE (
  school_id   BIGINT,
  school_name TEXT,
  school_type TEXT,
  grade_level INT,
  male        INT,
  female      INT,
  total       INT,
  status      TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = procurements, public
AS $$
  WITH params AS (
    SELECT
      (SPLIT_PART(p_school_year, '-', 1)::INT - 1)::TEXT
        || '-' || SPLIT_PART(p_school_year, '-', 1) AS prev_sy
  ),
  scoped AS (
    SELECT
      s.id   AS school_id,
      s.name AS school_name,
      s.school_type,
      COALESCE(sub.status, 'missing') AS status
    FROM procurements.sms_schools s
    LEFT JOIN procurements.sms_division_report_submissions sub
      ON sub.school_id = s.id
      AND sub.school_year = p_school_year
      AND sub.report_type = 'enrollment'
      AND (
        (p_semester IS NULL AND sub.semester IS NULL)
        OR sub.semester = p_semester
      )
    WHERE s.is_active
      AND (p_school_type IS NULL OR s.school_type = p_school_type)
  ),
  -- Every category except repeater is a predicate on this year's rows.
  -- DISTINCT collapses an SHS learner's two semester rows into one head.
  picked AS (
    SELECT DISTINCT e.school_id, e.grade_level, e.student_id, st.gender
    FROM procurements.sms_enrollments e
    JOIN procurements.sms_students st ON st.id = e.student_id
    WHERE e.school_year = p_school_year
      AND e.school_id IS NOT NULL
      AND (p_semester IS NULL OR e.semester = p_semester)
      AND CASE p_category
            WHEN 'enrollment' THEN e.enrollment_status IN (
              'active', 'completed', 'promoted', 'retained', 'graduated'
            )
            -- 201: a school outside the system counts too (isTransferee()),
            -- and a learner who has since transferred out is counted on
            -- transfer_out only — SF2's and SF4's rule (countTransfersIn).
            WHEN 'transfer_in'  THEN (e.origin_school_id IS NOT NULL
                                      OR e.transfer_in_school_name IS NOT NULL)
              AND NOT EXISTS (
                SELECT 1 FROM procurements.sms_enrollments o
                 WHERE o.student_id  = e.student_id
                   AND o.school_id   = e.school_id
                   AND o.school_year = e.school_year
                   AND (p_semester IS NULL OR o.semester = p_semester)
                   AND o.enrollment_status = 'transferred_out'
              )
            WHEN 'transfer_out' THEN e.enrollment_status = 'transferred_out'
            WHEN 'dropout'      THEN e.enrollment_status = 'dropped'
            WHEN 'promotee'     THEN e.enrollment_status = 'promoted'
            WHEN 'fourps'       THEN st.is_4ps AND e.enrollment_status IN (
              'active', 'completed', 'promoted', 'retained', 'graduated'
            )
            WHEN 'balik_aral'   THEN e.is_balik_aral AND e.enrollment_status IN (
              'active', 'completed', 'promoted', 'retained', 'graduated'
            )
            ELSE FALSE
          END
  ),
  -- Repeater needs last year's roll, so it cannot be a predicate on one row.
  repeaters AS (
    SELECT DISTINCT cur.school_id, cur.grade_level, cur.student_id, cur.gender
    FROM (
      SELECT DISTINCT e.school_id, e.grade_level, e.student_id, st.gender
      FROM procurements.sms_enrollments e
      JOIN procurements.sms_students st ON st.id = e.student_id
      WHERE p_category = 'repeater'
        AND e.school_year = p_school_year
        AND e.school_id IS NOT NULL
        AND (p_semester IS NULL OR e.semester = p_semester)
        AND e.enrollment_status IN (
          'active', 'completed', 'promoted', 'retained', 'graduated'
        )
    ) cur
    JOIN (
      SELECT DISTINCT e.school_id, e.grade_level, e.student_id
      FROM procurements.sms_enrollments e, params
      WHERE p_category = 'repeater'
        AND e.school_year = params.prev_sy
        AND e.school_id IS NOT NULL
    ) prev
      ON  prev.student_id  = cur.student_id
      AND prev.grade_level = cur.grade_level
      AND prev.school_id   = cur.school_id
  ),
  selected AS (
    SELECT p.school_id, p.grade_level, p.gender
    FROM picked p
    WHERE p_category <> 'repeater'
    UNION ALL
    SELECT r.school_id, r.grade_level, r.gender
    FROM repeaters r
    WHERE p_category = 'repeater'
  ),
  agg AS (
    SELECT
      sel.school_id,
      sel.grade_level,
      COUNT(*) FILTER (WHERE sel.gender = 'male')::int   AS male,
      COUNT(*) FILTER (WHERE sel.gender = 'female')::int AS female
    FROM selected sel
    GROUP BY sel.school_id, sel.grade_level
  )
  SELECT
    sc.school_id,
    sc.school_name,
    sc.school_type,
    -- -99 is 072's "this school has no rows" sentinel; the UI skips it.
    COALESCE(agg.grade_level, -99)                    AS grade_level,
    COALESCE(agg.male, 0)                             AS male,
    COALESCE(agg.female, 0)                           AS female,
    COALESCE(agg.male, 0) + COALESCE(agg.female, 0)   AS total,
    sc.status
  FROM scoped sc
  LEFT JOIN agg ON agg.school_id = sc.school_id
  -- Ordinal, not the name: `grade_level` is also a RETURNS TABLE parameter.
  ORDER BY sc.school_name, 4;
$$;

GRANT EXECUTE ON FUNCTION
  procurements.division_enrollment_actual(TEXT, SMALLINT, TEXT, TEXT)
  TO authenticated;

COMMENT ON FUNCTION
  procurements.division_enrollment_actual(TEXT, SMALLINT, TEXT, TEXT) IS
  'Live per-school/per-grade counts by sex for the derivable division report '
  'categories: enrollment, transfer_in, transfer_out, dropout, promotee, '
  'repeater, fourps, balik_aral. Definitions match generateSf4.ts (transfer_in '
  'includes out-of-system transferees, migration 201), except '
  'repeater (migration 118), fourps (sms_students.is_4ps, 114) and balik_aral '
  '(sms_enrollments.is_balik_aral, 148). Only per-modality figures have no '
  'operational source and remain school-submitted.';

-- ---------------------------------------------------------------------------
-- 2. division_enrollment_sections (165)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.division_enrollment_sections(
  p_school_id   BIGINT,
  p_school_year TEXT,
  p_semester    SMALLINT DEFAULT NULL,
  p_grade_level INT      DEFAULT NULL,
  p_category    TEXT     DEFAULT 'enrollment'
)
RETURNS TABLE (
  section_id   BIGINT,
  section_name TEXT,
  grade_level  INT,
  adviser_name TEXT,
  male         INT,
  female       INT,
  total        INT
)
LANGUAGE sql
STABLE
SET search_path = procurements, public
AS $$
  WITH params AS (
    SELECT
      (SPLIT_PART(p_school_year, '-', 1)::INT - 1)::TEXT
        || '-' || SPLIT_PART(p_school_year, '-', 1) AS prev_sy
  ),
  -- Every category except repeater is a predicate on this year's rows.
  picked AS (
    SELECT DISTINCT ON (e.grade_level, e.student_id)
      e.grade_level, e.student_id, e.section_id, st.gender
    FROM procurements.sms_enrollments e
    JOIN procurements.sms_students st ON st.id = e.student_id
    WHERE e.school_year = p_school_year
      AND e.school_id = p_school_id
      AND (p_grade_level IS NULL OR e.grade_level = p_grade_level)
      AND (p_semester IS NULL OR e.semester = p_semester)
      AND CASE p_category
            WHEN 'enrollment' THEN e.enrollment_status IN (
              'active', 'completed', 'promoted', 'retained', 'graduated'
            )
            -- 201: a school outside the system counts too (isTransferee()),
            -- and a learner who has since transferred out is counted on
            -- transfer_out only — SF2's and SF4's rule (countTransfersIn).
            WHEN 'transfer_in'  THEN (e.origin_school_id IS NOT NULL
                                      OR e.transfer_in_school_name IS NOT NULL)
              AND NOT EXISTS (
                SELECT 1 FROM procurements.sms_enrollments o
                 WHERE o.student_id  = e.student_id
                   AND o.school_id   = e.school_id
                   AND o.school_year = e.school_year
                   AND (p_semester IS NULL OR o.semester = p_semester)
                   AND o.enrollment_status = 'transferred_out'
              )
            WHEN 'transfer_out' THEN e.enrollment_status = 'transferred_out'
            WHEN 'dropout'      THEN e.enrollment_status = 'dropped'
            WHEN 'promotee'     THEN e.enrollment_status = 'promoted'
            WHEN 'fourps'       THEN st.is_4ps AND e.enrollment_status IN (
              'active', 'completed', 'promoted', 'retained', 'graduated'
            )
            WHEN 'balik_aral'   THEN e.is_balik_aral AND e.enrollment_status IN (
              'active', 'completed', 'promoted', 'retained', 'graduated'
            )
            ELSE FALSE
          END
    ORDER BY e.grade_level, e.student_id, e.semester DESC NULLS LAST, e.id DESC
  ),
  -- Repeater needs last year's roll, so it cannot be a predicate on one row.
  repeaters AS (
    SELECT cur.grade_level, cur.student_id, cur.section_id, cur.gender
    FROM (
      SELECT DISTINCT ON (e.grade_level, e.student_id)
        e.grade_level, e.student_id, e.section_id, st.gender
      FROM procurements.sms_enrollments e
      JOIN procurements.sms_students st ON st.id = e.student_id
      WHERE p_category = 'repeater'
        AND e.school_year = p_school_year
        AND e.school_id = p_school_id
        AND (p_grade_level IS NULL OR e.grade_level = p_grade_level)
        AND (p_semester IS NULL OR e.semester = p_semester)
        AND e.enrollment_status IN (
          'active', 'completed', 'promoted', 'retained', 'graduated'
        )
      ORDER BY e.grade_level, e.student_id, e.semester DESC NULLS LAST, e.id DESC
    ) cur
    WHERE EXISTS (
      SELECT 1
      FROM procurements.sms_enrollments prev, params
      WHERE p_category = 'repeater'
        AND prev.school_year  = params.prev_sy
        AND prev.school_id    = p_school_id
        AND prev.student_id   = cur.student_id
        AND prev.grade_level  = cur.grade_level
    )
  ),
  selected AS (
    SELECT p.grade_level, p.section_id, p.gender
    FROM picked p
    WHERE p_category <> 'repeater'
    UNION ALL
    SELECT r.grade_level, r.section_id, r.gender
    FROM repeaters r
    WHERE p_category = 'repeater'
  ),
  agg AS (
    SELECT
      sel.section_id,
      sel.grade_level,
      COUNT(*) FILTER (WHERE sel.gender = 'male')::int   AS male,
      COUNT(*) FILTER (WHERE sel.gender = 'female')::int AS female
    FROM selected sel
    GROUP BY sel.section_id, sel.grade_level
  )
  -- Every column cast to its declared type: the live schema and the migration
  -- files are known to disagree on TEXT vs character varying, and a RETURNS
  -- TABLE mismatch only raises at CALL time (the 157 lesson).
  SELECT
    agg.section_id::BIGINT,
    COALESCE(sec.name, 'Unknown section')::TEXT,
    agg.grade_level::INT,
    u.name::TEXT,
    agg.male::INT,
    agg.female::INT,
    (agg.male + agg.female)::INT
  FROM agg
  LEFT JOIN procurements.sms_sections sec ON sec.id = agg.section_id
  LEFT JOIN procurements.sms_users u ON u.id = sec.section_adviser_id
  -- Ordinal, not the name: `grade_level` is also a RETURNS TABLE parameter.
  ORDER BY 3, 2;
$$;

GRANT EXECUTE ON FUNCTION
  procurements.division_enrollment_sections(BIGINT, TEXT, SMALLINT, INT, TEXT)
  TO authenticated;

COMMENT ON FUNCTION
  procurements.division_enrollment_sections(BIGINT, TEXT, SMALLINT, INT, TEXT) IS
  'Section-level breakdown behind one grade level of the division enrollment '
  'report. Category definitions are identical to division_enrollment_actual '
  '(migrations 144/147/148); each learner is counted once per grade level and '
  'attributed to their latest section, so sections always sum to the grade row.';

-- ---------------------------------------------------------------------------
-- 3. reporting.v_report_enrollment (166)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW reporting.v_report_enrollment
WITH (security_invoker = true) AS
SELECT
  e.id::BIGINT                                                 AS enrollment_id,
  e.student_id::BIGINT                                         AS student_id,
  e.school_id::BIGINT                                          AS school_id,
  sc.name::TEXT                                                AS school_name,
  sc.district::TEXT                                            AS district,
  e.school_year::TEXT                                          AS school_year,
  e.semester::INTEGER                                          AS semester,
  e.grade_level::INTEGER                                       AS grade_level,
  sec.name::TEXT                                               AS section_name,
  sec.section_type::TEXT                                       AS section_type,
  sec.strand::TEXT                                             AS strand,
  st.lrn::TEXT                                                 AS lrn,
  TRIM(BOTH ' ' FROM
    COALESCE(st.last_name, '') || ', ' || COALESCE(st.first_name, '') ||
    COALESCE(' ' || NULLIF(st.middle_name, ''), '') ||
    COALESCE(' ' || NULLIF(st.suffix, ''), ''))::TEXT          AS full_name,
  st.gender::TEXT                                              AS sex,
  st.date_of_birth::DATE                                       AS date_of_birth,
  -- Age as of 1 June of the school year opening, which is the age every DepEd
  -- form reports. NULL rather than an error when school_year is malformed.
  (date_part('year', age(
     make_date(NULLIF(substring(e.school_year FROM '^\d{4}'), '')::INTEGER, 6, 1),
     st.date_of_birth)))::INTEGER                              AS age_at_sy_start,
  e.status::TEXT                                               AS status,
  e.enrollment_status::TEXT                                    AS enrollment_status,
  e.enrollment_date::DATE                                      AS enrollment_date,
  COALESCE(e.is_balik_aral, FALSE)::BOOLEAN                     AS is_balik_aral,
  -- 201: a school outside the system counts too, and names itself.
  (e.origin_school_id IS NOT NULL
   OR e.transfer_in_school_name IS NOT NULL)::BOOLEAN           AS is_transfer_in,
  COALESCE(osc.name, e.transfer_in_school_name)::TEXT          AS origin_school_name,
  dsc.name::TEXT                                               AS transfer_destination_school_name,
  e.transfer_date::DATE                                        AS transfer_date,
  e.date_dropped::DATE                                         AS date_dropped,
  COALESCE(st.is_4ps, FALSE)::BOOLEAN                           AS is_4ps,
  procurements.is_ip_learner(st.ip_ethnic_group)::BOOLEAN       AS is_ip,
  e.remarks::TEXT                                              AS remarks
FROM procurements.sms_enrollments e
JOIN      procurements.sms_students st  ON st.id = e.student_id
LEFT JOIN procurements.sms_schools sc   ON sc.id = e.school_id
LEFT JOIN procurements.sms_schools osc  ON osc.id = e.origin_school_id
LEFT JOIN procurements.sms_schools dsc  ON dsc.id = e.transfer_destination_school_id
LEFT JOIN procurements.sms_sections sec ON sec.id = e.section_id;

COMMENT ON VIEW reporting.v_report_enrollment IS
  'Report Generator dataset `enrollment`: one row per sms_enrollments record '
  '(student x school year x semester), pre-joined to student, school, section '
  'and the origin/destination schools of a transfer. Reachable only through '
  'procurements.division_report_run (166).';
