-- ============================================================================
-- 206 — One population rule for every enrollment headcount
-- ============================================================================
-- A user reported that the division dashboard's enrollment figures disagree
-- with the other dashboards and reports. They do, for two reasons in SQL
-- (a third, the dashboard's Enrollment Status card, is a client change in
-- the same commit):
--
-- (a) APPROVAL. `sms_enrollments.status` is the approval flag and
--     `enrollment_status` the lifecycle (109's trap). The school dashboard,
--     SF4 and `kpi_enrollment_facts` (118) count `status = 'approved'` only;
--     `public_enrollment_counts` (141/142, the division dashboard and the
--     landing pages), `division_enrollment_actual` (148/201),
--     `division_enrollment_sections` (165/201) and `enrollment_autofill`
--     (072/143) never checked it, so a pending or rejected enrolment was a
--     learner on the division's figures and on nobody else's.
--
-- (b) TEST SCHOOLS. `division_enrollment_actual` listed schools 9 and 10,
--     which the dashboard and the landing pages drop from every aggregate
--     (TEST_SCHOOL_IDS in lib/constants/landing.ts, 142's rule).
--
-- The rule is now, everywhere: approved, on the roll
-- (ENROLLED_LIFECYCLE_STATUSES), active school, test schools out of
-- division-wide aggregates.
--
-- Objects:
-- 1. `public_enrollment_counts(TEXT, BIGINT)` — 142's body verbatim
--    except (a).
-- 2. `division_enrollment_actual` — 201's body verbatim except (a), (b).
-- 3. `division_enrollment_sections` — 201's body verbatim except (a), so a
--    drilled-down grade still sums to its row (165's rule). Still
--    SECURITY INVOKER.
-- 4. `enrollment_autofill` — 143's body verbatim except (a).
--
-- All four keep their signature and result type, so each is a plain
-- CREATE OR REPLACE and keeps its grants.
--
-- Male + female is the whole roll: `sms_students_gender_check` admits only
-- 'male' and 'female' and the column is NOT NULL, so no learner falls
-- outside the sex split.
--
-- Changes no rows. Figures move only where (a) or (b) applies; to see by
-- how much before applying, run (read-only):
--
--   SELECT status, count(*) FROM procurements.sms_enrollments
--    WHERE school_year = '2026-2027' GROUP BY status;
--
-- Rows other than status 'approved' are what moves, plus the test schools'
-- rows leaving the division enrollment report.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. public_enrollment_counts — approved only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.public_enrollment_counts(
  p_school_year TEXT,
  p_school_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  school_id BIGINT,
  grade_level INT,
  male INT,
  female INT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = procurements, public
AS $$
  -- DISTINCT collapses an SHS learner's two semester rows into one head.
  WITH learners AS (
    SELECT DISTINCT
      e.school_id,
      e.grade_level,
      e.student_id,
      st.gender
    FROM procurements.sms_enrollments e
    JOIN procurements.sms_students st ON st.id = e.student_id
    WHERE e.school_year = p_school_year
      AND e.school_id IS NOT NULL
      AND e.status = 'approved'
      AND e.enrollment_status IN (
        'active', 'completed', 'promoted', 'retained', 'graduated'
      )
  )
  SELECT
    l.school_id,
    l.grade_level,
    COUNT(*) FILTER (WHERE l.gender = 'male')::int   AS male,
    COUNT(*) FILTER (WHERE l.gender = 'female')::int AS female
  FROM learners l
  JOIN procurements.sms_schools s ON s.id = l.school_id
  WHERE s.is_active
    -- Named school: return it, whatever it is.
    AND (p_school_id IS NULL OR s.id = p_school_id)
    -- No school named: this is an aggregate, so the test schools stay out.
    AND (p_school_id IS NOT NULL OR s.id NOT IN (9, 10))
  GROUP BY l.school_id, l.grade_level
  ORDER BY l.school_id, l.grade_level;
$$;

COMMENT ON FUNCTION procurements.public_enrollment_counts(TEXT, BIGINT) IS
  'Per-school, per-grade learner counts by sex for the public landing pages '
  'and the division dashboard. Approved enrolments on the roll '
  '(enrollment_status), SHS semester rows collapsed, inactive schools '
  'excluded; test schools excluded only when p_school_id is NULL (206).';


-- ---------------------------------------------------------------------------
-- 2. division_enrollment_actual — approved only, no test schools
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
      -- 206: a division-wide aggregate, so the test schools stay out (142).
      AND s.id NOT IN (9, 10)
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
      AND e.status = 'approved'
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
                   AND o.status      = 'approved'
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
        AND e.status = 'approved'
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
        AND e.status = 'approved'
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


-- ---------------------------------------------------------------------------
-- 3. division_enrollment_sections — approved only
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
      AND e.status = 'approved'
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
                   AND o.status      = 'approved'
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
        AND e.status = 'approved'
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
        AND prev.status       = 'approved'
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


-- ---------------------------------------------------------------------------
-- 4. enrollment_autofill — approved only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.enrollment_autofill(
  p_school_id   BIGINT,
  p_school_year TEXT,
  p_semester    SMALLINT
)
RETURNS TABLE (grade_level INT, male INT, female INT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  -- DISTINCT collapses an SHS learner's two semester rows into one head.
  WITH learners AS (
    SELECT DISTINCT
      e.grade_level,
      e.student_id,
      s.gender
    FROM procurements.sms_enrollments e
    JOIN procurements.sms_students s ON s.id = e.student_id
    WHERE e.school_id = p_school_id
      AND e.school_year = p_school_year
      AND e.status = 'approved'
      AND (p_semester IS NULL OR e.semester = p_semester)
      AND e.enrollment_status IN (
        'active', 'completed', 'promoted', 'retained', 'graduated'
      )
  )
  SELECT
    l.grade_level,
    COUNT(*) FILTER (WHERE l.gender = 'male')::int   AS male,
    COUNT(*) FILTER (WHERE l.gender = 'female')::int AS female
  FROM learners l
  GROUP BY l.grade_level
  ORDER BY l.grade_level;
$$;
