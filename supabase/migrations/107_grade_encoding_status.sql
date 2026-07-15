-- ============================================================================
-- GRADE ENCODING STATUS
-- ============================================================================
-- Lets school heads see which teachers have encoded grades, for which subjects
-- and sections, and how far along each grading period is.
--
-- Everything here is derived from existing tables — no new state is stored.
-- The aggregation lives in SQL because a school's sms_grades rows (learners x
-- subjects x periods) run well past the client's default row limit.
--
-- `sms_subject_schedules` is the denominator: it is the source of truth for
-- teacher <-> subject <-> section <-> school year. A subject/section with no
-- schedule row cannot be monitored here because nobody is assigned to it.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- get_grade_encoding_status
--   p_periods is 4 for quarter-based school years and 3 for MATATAG terms
--   (SY 2026-2027+); the caller decides via getGradingPeriods().
--
-- SECURITY INVOKER: reads stay subject to the existing RLS policies, so this
-- exposes nothing the caller could not already select.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.get_grade_encoding_status(
  p_school_id   BIGINT,
  p_school_year TEXT,
  p_periods     INTEGER
)
RETURNS TABLE (
  subject_id        BIGINT,
  subject_name      TEXT,
  is_madrasah       BOOLEAN,
  section_id        BIGINT,
  section_name      TEXT,
  grade_level       INTEGER,
  assigned_teachers TEXT[],
  grading_period    INTEGER,
  expected_learners INTEGER,
  encoded_learners  INTEGER,
  encoders          TEXT[],
  last_encoded_at   TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO procurements, public
AS $$
  WITH sched AS (
    -- One row per subject+section. Team-taught combinations collapse into a
    -- single row listing every assigned teacher.
    SELECT
      ss.subject_id,
      ss.section_id,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT u.name), NULL) AS assigned_teachers
    FROM procurements.sms_subject_schedules ss
    LEFT JOIN procurements.sms_users u ON u.id = ss.teacher_id
    WHERE ss.school_id = p_school_id
      AND ss.school_year = p_school_year
    GROUP BY ss.subject_id, ss.section_id
  ),
  enrolled AS (
    -- Denominator for regular subjects: everyone holding a section slot.
    SELECT e.section_id, COUNT(DISTINCT e.student_id) AS n
    FROM procurements.sms_enrollments e
    WHERE e.school_year = p_school_year
      AND e.status = 'approved'
      AND e.enrollment_status IN
          ('active', 'promoted', 'graduated', 'retained', 'completed')
    GROUP BY e.section_id
  ),
  madrasah AS (
    -- Denominator for Madrasah (MEP) subjects: only selectively enrolled
    -- learners, mirroring TeacherGradeEntryTable's own split.
    SELECT sub.subject_id, sub.section_id, COUNT(DISTINCT sub.student_id) AS n
    FROM procurements.sms_student_subjects sub
    WHERE sub.school_year = p_school_year
      AND sub.school_id = p_school_id
    GROUP BY sub.subject_id, sub.section_id
  ),
  encoded AS (
    -- `grade > 0` is what counts as encoded, not row existence: the quarter
    -- entry screen writes a 0-filled row for every learner and period on save,
    -- so COUNT(*) would report an untouched section as fully encoded. Valid
    -- DepEd grades never reach 0 (the entry input floors at 60).
    SELECT
      g.subject_id,
      g.section_id,
      g.grading_period,
      COUNT(DISTINCT g.student_id) AS n,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT u.name), NULL) AS encoders,
      MAX(g.updated_at) AS last_encoded_at
    FROM procurements.sms_grades g
    JOIN sched s
      ON s.subject_id = g.subject_id
     AND s.section_id = g.section_id
    LEFT JOIN procurements.sms_users u ON u.id = g.teacher_id
    WHERE g.school_year = p_school_year
      AND g.grade > 0
    GROUP BY g.subject_id, g.section_id, g.grading_period
  )
  SELECT
    s.subject_id,
    subj.name AS subject_name,
    subj.is_madrasah,
    s.section_id,
    sec.name AS section_name,
    sec.grade_level,
    s.assigned_teachers,
    p.period AS grading_period,
    COALESCE(
      CASE WHEN subj.is_madrasah THEN m.n ELSE en.n END, 0
    )::INTEGER AS expected_learners,
    COALESCE(e.n, 0)::INTEGER AS encoded_learners,
    COALESCE(e.encoders, ARRAY[]::TEXT[]) AS encoders,
    e.last_encoded_at
  FROM sched s
  JOIN procurements.sms_subjects subj ON subj.id = s.subject_id
  JOIN procurements.sms_sections sec  ON sec.id = s.section_id
  CROSS JOIN generate_series(1, p_periods) AS p(period)
  LEFT JOIN enrolled en ON en.section_id = s.section_id
  LEFT JOIN madrasah m
    ON m.subject_id = s.subject_id AND m.section_id = s.section_id
  LEFT JOIN encoded e
    ON e.subject_id = s.subject_id
   AND e.section_id = s.section_id
   AND e.grading_period = p.period
  ORDER BY sec.grade_level, sec.name, subj.name, p.period;
$$;

COMMENT ON FUNCTION procurements.get_grade_encoding_status(BIGINT, TEXT, INTEGER) IS
  'Grade encoding progress per subject/section/grading period for one school '
  'and school year. Denominator is sms_subject_schedules; a learner counts as '
  'encoded only when their grade > 0.';

-- Speeds up the encoded CTE, which filters sms_grades by school year and
-- groups by subject/section/period.
CREATE INDEX IF NOT EXISTS idx_grades_sy_subject_section_period
  ON procurements.sms_grades(school_year, subject_id, section_id, grading_period);

GRANT EXECUTE ON FUNCTION
  procurements.get_grade_encoding_status(BIGINT, TEXT, INTEGER) TO authenticated;
