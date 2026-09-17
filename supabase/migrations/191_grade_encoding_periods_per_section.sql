-- ============================================================================
-- 191. Grade Monitoring counts periods per SECTION, not per school
-- ============================================================================
--
-- WHY
-- ---
-- `get_grade_encoding_status` (107, last replaced by 179) takes a single
-- `p_periods` for the whole school and cross-joins it against every subject and
-- section. The caller passes `getGradingPeriods(schoolYear).length`, which from
-- SY 2026-2027 is three.
--
-- 189 gave an old-curriculum Senior High section four semestral quarters. Grade
-- Monitoring did not follow, so a Grade 12 section was measured against three
-- periods: the second semester's second quarter (period 4) never appeared, and
-- a school head reading the page would see a subject as fully encoded while one
-- of its quarters had not been started. The denominator was wrong in the
-- school's favour, which is the worst direction for a monitoring page.
--
-- WHAT CHANGES
-- ------------
-- The period series becomes a LATERAL over the section, so each section is
-- counted against the periods IT has:
--
--   sec.shs_curriculum = 'old'  ->  4   (1-2 first semester, 3-4 second)
--   anything else               ->  p_periods, as before
--
-- `p_periods` keeps its meaning and its default for every other section, so a
-- caller that knows nothing about 189 is unaffected.
--
-- The value is read from the section's STORED curriculum and never inferred
-- from the grade level and school year (invariant 14) — the page must report
-- the same shape the class record and the card are working in, and inferring
-- here would put it a year out of step with them the moment the rollout moves.
--
-- Only the FROM clause changes. The RETURNS TABLE is untouched, so this is a
-- plain CREATE OR REPLACE and not 157's DROP-and-recreate, and every existing
-- caller keeps working — the client widens its columns off the rows it gets
-- back rather than being told in advance.
--
-- SCOPE
-- -----
-- One function replaced. No table, column, policy, trigger or DML. A school
-- with no old-curriculum section returns byte-identical rows.
-- ============================================================================

CREATE OR REPLACE FUNCTION procurements.get_grade_encoding_status(
  p_school_id   BIGINT,
  p_school_year TEXT,
  p_periods     INTEGER DEFAULT 4
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
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  WITH sched AS (
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
    -- Denominator for a subject the whole section takes.
    SELECT e.section_id, COUNT(DISTINCT e.student_id) AS n
    FROM procurements.sms_enrollments e
    WHERE e.school_year = p_school_year
      AND e.status = 'approved'
      AND e.enrollment_status IN
          ('active', 'promoted', 'graduated', 'retained', 'completed')
    GROUP BY e.section_id
  ),
  rostered AS (
    -- Denominator for a subject with selective_enrolment: only the learners
    -- actually rostered, mirroring TeacherGradeEntryTable's own split. Was
    -- keyed to is_madrasah until 179 split the roster half off.
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
    sec.grade_level::INTEGER,
    s.assigned_teachers,
    p.period AS grading_period,
    COALESCE(
      CASE WHEN subj.selective_enrolment THEN r.n ELSE en.n END, 0
    )::INTEGER AS expected_learners,
    COALESCE(e.n, 0)::INTEGER AS encoded_learners,
    COALESCE(e.encoders, ARRAY[]::TEXT[]) AS encoders,
    e.last_encoded_at
  FROM sched s
  JOIN procurements.sms_subjects subj ON subj.id = s.subject_id
  JOIN procurements.sms_sections sec  ON sec.id = s.section_id
  -- The periods this SECTION has, not the school's (migration 189).
  CROSS JOIN LATERAL generate_series(
    1,
    CASE
      WHEN sec.shs_curriculum = 'old' THEN 4
      ELSE GREATEST(COALESCE(p_periods, 4), 1)
    END
  ) AS p(period)
  LEFT JOIN enrolled en ON en.section_id = s.section_id
  LEFT JOIN rostered r
    ON r.subject_id = s.subject_id AND r.section_id = s.section_id
  LEFT JOIN encoded e
    ON e.subject_id = s.subject_id
   AND e.section_id = s.section_id
   AND e.grading_period = p.period
  WHERE subj.school_id = p_school_id
  ORDER BY sec.grade_level, sec.name, subj.name, p.period;
$$;

COMMENT ON FUNCTION procurements.get_grade_encoding_status(BIGINT, TEXT, INTEGER) IS
  'Grade encoding progress per subject/section/grading period for one school and school year. Denominator is sms_subject_schedules; a learner counts as encoded only when their grade > 0. The period count is per section: 4 for an old-curriculum SHS section (189), p_periods for every other.';

GRANT EXECUTE ON FUNCTION
  procurements.get_grade_encoding_status(BIGINT, TEXT, INTEGER)
  TO authenticated, service_role;
