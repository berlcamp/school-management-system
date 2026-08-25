-- ============================================================================
-- 156. Grade Level Teachers — one division report, one read-only RPC
-- ============================================================================
--
-- WHY
-- ---
-- The SDO is routinely asked "who teaches Grade 5 at <school>?" — for a
-- district meeting, a training batch, a Learning Action Cell roster. Nothing
-- in the system answers it. 071's Teaching Personnel report is a bare
-- headcount per school; 146's Teaching Specialization is a headcount per
-- learning area; neither can name a person, and neither knows a grade level
-- at all, because `sms_users` carries no grade level and never will — a
-- teacher's grade is a property of the WORK they are assigned, not of the
-- personnel record.
--
-- So the grade level is derived from the assignment, in the only two places
-- the system records one:
--
--   * ADVISORY  — `sms_sections.section_adviser_id`, whose row carries the
--                 grade level directly.
--   * TEACHING  — `sms_subject_schedules.teacher_id`, whose section carries
--                 it. One row per time block (see the Schedules note in
--                 CLAUDE.md), so a subject meeting on two blocks contributes
--                 the same (teacher, grade) pair twice and is de-duplicated
--                 here rather than double-listed.
--
-- A teacher who appears in either is a teacher of that grade level. Both are
-- keyed by school year, so the answer is per school year and a past year keeps
-- reporting the staffing it actually had.
--
-- WHY IT IS DERIVED FROM THE ASSIGNMENT, NOT FROM `sms_users.type`
-- ---------------------------------------------------------------
-- The roster is whoever stands in front of that grade, which is a different
-- question from who holds a teaching plantilla item. A `volunteer_teacher`
-- (139) advising Grade 2 belongs on the Grade 2 roster; so does a school head
-- who kept one Science load. `type` is returned as a column so the printed
-- sheet can say which is which, but it is never a filter — this is a roster,
-- **not** a DepEd personnel count, and deliberately does not agree with 071 /
-- 112 / 118, which count the literal `'teacher'` for exactly the opposite
-- reason.
--
-- Inactive staff are returned too, flagged rather than dropped: a teacher
-- deactivated in October was still the adviser in June, and silently emptying
-- a past year's roster would be the worse answer. The page marks them.
--
-- WHAT THIS TOUCHES
-- -----------------
-- Nothing. One new `SECURITY DEFINER` read-only function, no table, no column,
-- no policy, no trigger, no DML. Every existing count, form and RPC is
-- untouched.
--
-- WHY SECURITY DEFINER, AND WHY IT STILL CHECKS THE CALLER
-- -------------------------------------------------------
-- A division user reads across schools, and the SELECT policies on
-- `sms_subject_schedules` (115) bind to the caller's own `school_id`, so a
-- plain invoker function would return an empty roster for every school but
-- the caller's own — this is the 138 lesson, where a per-caller RLS scan made
-- one function answer a different question per role. Definer rights fix that
-- and hand the access decision to an explicit guard, which admits:
--
--   * division_admin / super admin / division_type — the whole division;
--   * anyone assigned to the school being asked about, whether that is their
--     active school (`sms_users.school_id`) or one of their assignments
--     (`sms_user_schools`, 134) — so the same RPC can back a school-level
--     view later without being widened.
--
-- Anything else raises. `sms_users` itself is readable by every authenticated
-- user under 001's policy, so the guard is about the ASSIGNMENTS, which are
-- school-scoped data.
-- ============================================================================

SET search_path TO procurements, public;

CREATE OR REPLACE FUNCTION procurements.division_grade_level_teachers(
  p_school_id BIGINT,
  p_school_year TEXT,
  p_grade_level INTEGER DEFAULT NULL
)
RETURNS TABLE (
  grade_level INTEGER,
  teacher_id BIGINT,
  teacher_name TEXT,
  user_type TEXT,
  teacher_position TEXT,
  learning_area TEXT,
  teacher_gender TEXT,
  employee_id TEXT,
  teacher_is_active BOOLEAN,
  is_adviser BOOLEAN,
  advisory_sections TEXT[],
  subject_names TEXT[],
  section_names TEXT[],
  schedule_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
-- Output columns of a RETURNS TABLE are plpgsql variables; this makes a bare
-- column name in the query below resolve to the column, never to them.
#variable_conflict use_column
BEGIN
  IF p_school_id IS NULL THEN
    RAISE EXCEPTION 'A school is required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM procurements.sms_users u
    WHERE u.user_id = auth.uid()
      AND (
        u.type IN ('division_admin', 'super admin', 'division_type')
        OR u.school_id = p_school_id
        OR EXISTS (
          SELECT 1 FROM procurements.sms_user_schools us
          WHERE us.user_id = u.id AND us.school_id = p_school_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'You may not read the staffing of this school.';
  END IF;

  RETURN QUERY
  WITH adv AS (
    -- Advisory: the section's own grade level.
    SELECT
      sec.grade_level        AS grade_level,
      sec.section_adviser_id AS teacher_id,
      sec.name               AS section_name
    FROM procurements.sms_sections sec
    WHERE sec.school_id = p_school_id
      AND sec.school_year = p_school_year
      AND sec.is_active
      AND sec.section_adviser_id IS NOT NULL
      AND (p_grade_level IS NULL OR sec.grade_level = p_grade_level)
  ),
  sch AS (
    -- Teaching: the grade level of the section the block meets in. Scoped by
    -- the SECTION's school, not the schedule's own school_id (016) — the
    -- section is what carries the grade level being reported on.
    SELECT
      sec.grade_level    AS grade_level,
      sched.teacher_id   AS teacher_id,
      sec.name           AS section_name,
      sub.name           AS subject_name
    FROM procurements.sms_subject_schedules sched
    JOIN procurements.sms_sections sec ON sec.id = sched.section_id
    LEFT JOIN procurements.sms_subjects sub ON sub.id = sched.subject_id
    WHERE sec.school_id = p_school_id
      AND sched.school_year = p_school_year
      AND sched.teacher_id IS NOT NULL   -- NULL = a "Temporary" block (117)
      AND (p_grade_level IS NULL OR sec.grade_level = p_grade_level)
  ),
  pairs AS (
    SELECT a.grade_level, a.teacher_id FROM adv a
    UNION
    SELECT s.grade_level, s.teacher_id FROM sch s
  )
  SELECT
    p.grade_level,
    u.id AS teacher_id,
    u.name AS teacher_name,
    u.type AS user_type,
    u.position AS teacher_position,
    u.learning_area,
    u.gender AS teacher_gender,
    u.employee_id,
    u.is_active AS teacher_is_active,
    EXISTS (
      SELECT 1 FROM adv a
      WHERE a.teacher_id = p.teacher_id AND a.grade_level = p.grade_level
    ) AS is_adviser,
    ARRAY(
      SELECT DISTINCT a.section_name FROM adv a
      WHERE a.teacher_id = p.teacher_id AND a.grade_level = p.grade_level
      ORDER BY 1
    ) AS advisory_sections,
    ARRAY(
      SELECT DISTINCT s.subject_name FROM sch s
      WHERE s.teacher_id = p.teacher_id AND s.grade_level = p.grade_level
        AND s.subject_name IS NOT NULL
      ORDER BY 1
    ) AS subject_names,
    ARRAY(
      SELECT DISTINCT s.section_name FROM sch s
      WHERE s.teacher_id = p.teacher_id AND s.grade_level = p.grade_level
      ORDER BY 1
    ) AS section_names,
    (
      SELECT COUNT(*) FROM sch s
      WHERE s.teacher_id = p.teacher_id AND s.grade_level = p.grade_level
    ) AS schedule_count
  FROM pairs p
  JOIN procurements.sms_users u ON u.id = p.teacher_id
  ORDER BY p.grade_level, u.name;
END;
$$;

COMMENT ON FUNCTION procurements.division_grade_level_teachers(BIGINT, TEXT, INTEGER) IS
  'Roster of the teachers assigned to a grade level at one school for one '
  'school year, derived from section advisorship and subject schedules. '
  'A roster, not a DepEd personnel count: it includes any role holding an '
  'assignment (volunteer teachers, a teaching school head), unlike 071/112/118 '
  'which count the literal type = ''teacher''. p_grade_level NULL = every grade.';

GRANT EXECUTE ON FUNCTION procurements.division_grade_level_teachers(BIGINT, TEXT, INTEGER) TO authenticated;
