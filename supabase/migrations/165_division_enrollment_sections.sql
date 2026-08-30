-- ============================================================================
-- 165. division_enrollment_sections — the third level of the enrollment report
-- ============================================================================
--
-- WHY
-- ---
-- /division/reports/enrollment expands a school into its grade levels. The next
-- question the division office asks is always the same one — *which sections*,
-- and how big are they — and the report could not answer it. That figure was
-- reachable only by opening the school's own Sections module one grade at a
-- time.
--
-- WHY AN RPC AND NOT A CLIENT QUERY
-- ---------------------------------
-- The eight categories are not obvious predicates: transfer_in is
-- `origin_school_id IS NOT NULL`, repeater needs LAST year's roll, 4Ps reads
-- the learner and not the enrolment. Migration 148's header is explicit that
-- these definitions must match generateSf4.ts so a school's own SF4 and the
-- division's view of it cannot disagree. Re-typing them in TypeScript is how
-- the drill-down starts quietly contradicting the row it expanded from, so the
-- section cut is a copy of 144/147/148's CASE, in SQL, next to them.
--
-- SECURITY INVOKER, DELIBERATELY
-- ------------------------------
-- Unlike `division_enrollment_actual`, this reads no submission table, so it
-- needs no elevated rights: sms_enrollments / sms_students / sms_sections are
-- all readable by any authenticated user (001, 041's posture), and running as
-- the caller means this function can never show more than the client query it
-- replaces would have. There is therefore no guard to get wrong (the 156/157
-- lesson, applied in the other direction). If cross-school reads are ever
-- tightened, this narrows with them rather than punching through.
--
-- SECTIONS SUM TO THEIR GRADE — the drill-down must not contradict its parent
-- ---------------------------------------------------------------------------
-- `division_enrollment_actual` collapses an SHS learner's two semester rows
-- into one head with DISTINCT. Doing that per section instead would count a
-- learner who changed section between semesters in BOTH, so the sections would
-- total more than the grade row above them. `DISTINCT ON (grade_level,
-- student_id) ... ORDER BY semester DESC` picks each learner exactly once and
-- attributes them to their LATEST section, so the two levels always agree.
-- The predicate is applied before the pick, matching 148: a learner dropped in
-- semester 1 and active in semester 2 is judged on the row the category names,
-- not on whichever row happens to sort first.
--
-- `sms_enrollments.section_id` is NOT NULL, so there is no unsectioned bucket
-- to account for.
--
-- Additive: one new read-only function. No table, column, policy, trigger or
-- existing function is touched, and no DML runs.
-- ============================================================================

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
            WHEN 'transfer_in'  THEN e.origin_school_id IS NOT NULL
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
