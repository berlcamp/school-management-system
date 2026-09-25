-- ============================================================================
-- 193. division_absenteeism — absences by section, grade level, school, sex
-- ============================================================================
--
-- WHY
-- ---
-- The division office is asked how many learners are missing class, and where:
-- which sections, which grade levels, which schools, boys or girls. Every
-- absence is already recorded in `sms_attendance` (019/044), but the only
-- surfaces that read it are one section at a time (the attendance grid, SF2)
-- or one learner at a time (the report card). This returns one row per section
-- with male/female figures; the page sums sections up to grade level, school
-- and division, so every level of the report is the same numbers added up.
--
-- WHY AN RPC AND NOT A CLIENT QUERY
-- ---------------------------------
-- A division-wide school year is hundreds of thousands of attendance rows —
-- far past what a client can page through. The aggregation has to happen here.
--
-- THE COUNTING RULES ARE SF2'S, COPIED — not new ones
-- ---------------------------------------------------
-- `lib/utils/attendanceScoring.ts` + `lib/utils/schoolCalendar.ts` (125) are
-- the rules the attendance grid, SF2 and the report card share. This repeats
-- them in SQL, beside them, so a school's SF2 and the division's view of it
-- cannot disagree:
--   * A session is held when a `class_day` entry covers it, else when the date
--     is Mon–Fri and no blocking entry (holiday / no_class / suspension)
--     covers it. Entries are the school's own plus division-wide (NULL
--     school_id) ones for the school year — `fetchSchoolCalendar`'s scope.
--   * A day's weight is 0.5 per session held.
--   * No saved row = present (an adviser records absences only).
--   * A NULL session flag reads as not attended (`am_present ?? false`).
--   * A learner is ABSENT only when they sat none of the sessions held, and
--     then for the day's whole weight. Missing one of two sessions is tardy
--     and counts as PRESENT (d48bfa3), so it is not an absence here either.
--   * A row on a date the calendar closes counts for nothing — it is ignored,
--     not deleted, exactly as 125 treats it.
-- If any of those rules changes in TypeScript it must change here too.
--
-- CLASS DAYS are counted per school, from the later of `p_date_from` and the
-- school-year start to the earlier of `p_date_to`, the school-year end and
-- TODAY — a day not yet held has no absences and must not dilute the rate
-- (the `schoolDaysHeldThrough` rule).
--
-- WHO IS COUNTED
-- --------------
-- The enrolment category of 144/147/148/165: enrollment_status in active,
-- completed, promoted, retained, graduated. A learner who dropped or
-- transferred out is not on the roll, so neither their enrolment nor their
-- absences are counted — matching the Enrollment report's figure. One learner
-- is one head per section; an SHS learner who changed section between
-- semesters is counted in each section they sat in, since each section
-- recorded its own attendance for them.
--
-- CHRONICALLY ABSENT = absent on at least 10% of the school's class days in
-- the period (and at least one day). Returned per sex beside the plain count
-- of learners with any absence at all.
--
-- SECURITY DEFINER, WITH AN EXPLICIT GUARD (the 156/157 pattern)
-- --------------------------------------------------------------
-- Written first as SECURITY INVOKER, per 165. On the local clone the
-- division-wide year took ~2.5 MINUTES as an authenticated division admin
-- against ~2 s as the owner: the RLS policies on sms_attendance /
-- sms_enrollments (has_record_access, 066) are evaluated per row, and a
-- division year is every attendance row in the division. So the rows are read
-- with the owner's rights and the access decision is made once, up front, by
-- the same guard as 157: division-wide (p_school_id NULL) admits only
-- division_admin / super admin / division_type; one school additionally admits
-- that school's own staff and its 134 assignees. Only aggregates leave the
-- function — counts per section, never a learner.
--
-- Additive: one new read-only function. No table, column, policy, trigger or
-- existing function is touched, and no DML runs.
-- ============================================================================

CREATE OR REPLACE FUNCTION procurements.division_absenteeism(
  p_school_id   BIGINT,
  p_school_year TEXT,
  p_date_from   DATE DEFAULT NULL,
  p_date_to     DATE DEFAULT NULL
)
RETURNS TABLE (
  school_id       BIGINT,
  school_name     TEXT,
  section_id      BIGINT,
  section_name    TEXT,
  grade_level     INT,
  adviser_name    TEXT,
  class_days      NUMERIC,
  enrolled_male   INT,
  enrolled_female INT,
  absentees_male  INT,
  absentees_female INT,
  chronic_male    INT,
  chronic_female  INT,
  days_absent_male   NUMERIC,
  days_absent_female NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
-- Output columns of a RETURNS TABLE are plpgsql variables; this makes a bare
-- column name in the query below resolve to the column, never to them.
#variable_conflict use_column
DECLARE
  v_is_division BOOLEAN;
BEGIN
  IF p_school_year IS NULL OR p_school_year !~ '^\d{4}-\d{4}$' THEN
    RAISE EXCEPTION 'A school year (YYYY-YYYY) is required.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_users u
    WHERE u.user_id = auth.uid()
      AND u.type IN ('division_admin', 'super admin', 'division_type')
  ) INTO v_is_division;

  IF p_school_id IS NULL THEN
    -- Division-wide is division work.
    IF NOT v_is_division THEN
      RAISE EXCEPTION 'Only the division office may read every school''s absenteeism.';
    END IF;
  ELSIF NOT v_is_division THEN
    -- One school: its own staff and its assignees (134) may read it too.
    IF NOT EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND (
          u.school_id = p_school_id
          OR EXISTS (
            SELECT 1 FROM procurements.sms_user_schools us
            WHERE us.user_id = u.id AND us.school_id = p_school_id
          )
        )
    ) THEN
      RAISE EXCEPTION 'You may not read the absenteeism of this school.';
    END IF;
  END IF;

  RETURN QUERY
  WITH params AS (
    SELECT
      GREATEST(
        COALESCE(p_date_from, '1900-01-01'::DATE),
        MAKE_DATE(SPLIT_PART(p_school_year, '-', 1)::INT, 6, 1)
      ) AS d_from,
      LEAST(
        COALESCE(p_date_to, '2999-12-31'::DATE),
        MAKE_DATE(SPLIT_PART(p_school_year, '-', 2)::INT, 5, 31),
        CURRENT_DATE
      ) AS d_to
  ),
  schools AS (
    SELECT sc.id, sc.name
    FROM procurements.sms_schools sc
    WHERE sc.is_active
      AND (p_school_id IS NULL OR sc.id = p_school_id)
  ),
  cal AS (
    SELECT c.school_id, c.start_date, c.end_date, c.day_type, c.period
    FROM procurements.sms_school_calendar_days c
    WHERE c.school_year = p_school_year
  ),
  -- Every (school, date) in the window with the sessions held — resolveDay().
  days AS (
    SELECT
      s.id AS school_id,
      d::DATE AS day,
      (
        EXISTS (
          SELECT 1 FROM cal
          WHERE (cal.school_id IS NULL OR cal.school_id = s.id)
            AND d::DATE BETWEEN cal.start_date AND cal.end_date
            AND cal.period IN ('whole', 'am') AND cal.day_type = 'class_day'
        )
        OR (
          EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
          AND NOT EXISTS (
            SELECT 1 FROM cal
            WHERE (cal.school_id IS NULL OR cal.school_id = s.id)
              AND d::DATE BETWEEN cal.start_date AND cal.end_date
              AND cal.period IN ('whole', 'am') AND cal.day_type <> 'class_day'
          )
        )
      ) AS am,
      (
        EXISTS (
          SELECT 1 FROM cal
          WHERE (cal.school_id IS NULL OR cal.school_id = s.id)
            AND d::DATE BETWEEN cal.start_date AND cal.end_date
            AND cal.period IN ('whole', 'pm') AND cal.day_type = 'class_day'
        )
        OR (
          EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
          AND NOT EXISTS (
            SELECT 1 FROM cal
            WHERE (cal.school_id IS NULL OR cal.school_id = s.id)
              AND d::DATE BETWEEN cal.start_date AND cal.end_date
              AND cal.period IN ('whole', 'pm') AND cal.day_type <> 'class_day'
          )
        )
      ) AS pm
    FROM schools s, params p,
         GENERATE_SERIES(p.d_from, p.d_to, INTERVAL '1 day') d
  ),
  school_days AS (
    SELECT
      days.school_id,
      SUM((CASE WHEN days.am THEN 0.5 ELSE 0 END)
        + (CASE WHEN days.pm THEN 0.5 ELSE 0 END))::NUMERIC AS class_days
    FROM days
    GROUP BY days.school_id
  ),
  roster AS (
    SELECT DISTINCT e.section_id, e.student_id, sec.school_id, st.gender
    FROM procurements.sms_enrollments e
    JOIN procurements.sms_sections sec ON sec.id = e.section_id
    JOIN schools s ON s.id = sec.school_id
    JOIN procurements.sms_students st ON st.id = e.student_id
    WHERE e.school_year = p_school_year
      AND e.enrollment_status IN (
        'active', 'completed', 'promoted', 'retained', 'graduated'
      )
  ),
  -- Only rows with a missed session can be an absence; a fully present row
  -- (and a missing row) scores zero, so they are never read.
  absences AS (
    SELECT
      r.section_id,
      r.student_id,
      SUM(
        CASE
          WHEN (dy.am AND COALESCE(a.am_present, FALSE))
            OR (dy.pm AND COALESCE(a.pm_present, FALSE)) THEN 0
          ELSE (CASE WHEN dy.am THEN 0.5 ELSE 0 END)
             + (CASE WHEN dy.pm THEN 0.5 ELSE 0 END)
        END
      )::NUMERIC AS days_absent
    FROM roster r
    JOIN procurements.sms_attendance a
      ON a.student_id = r.student_id AND a.section_id = r.section_id
    JOIN days dy ON dy.school_id = r.school_id AND dy.day = a.date
    WHERE a.school_year = p_school_year
      AND (a.am_present IS DISTINCT FROM TRUE OR a.pm_present IS DISTINCT FROM TRUE)
    GROUP BY r.section_id, r.student_id
  ),
  learners AS (
    SELECT
      r.section_id,
      r.school_id,
      r.gender,
      COALESCE(ab.days_absent, 0) AS days_absent,
      COALESCE(sd.class_days, 0) AS class_days
    FROM roster r
    LEFT JOIN absences ab
      ON ab.section_id = r.section_id AND ab.student_id = r.student_id
    LEFT JOIN school_days sd ON sd.school_id = r.school_id
  ),
  agg AS (
    SELECT
      l.section_id,
      l.school_id,
      MAX(l.class_days) AS class_days,
      COUNT(*) FILTER (WHERE l.gender = 'male')   AS enrolled_male,
      COUNT(*) FILTER (WHERE l.gender = 'female') AS enrolled_female,
      COUNT(*) FILTER (WHERE l.gender = 'male'   AND l.days_absent > 0) AS absentees_male,
      COUNT(*) FILTER (WHERE l.gender = 'female' AND l.days_absent > 0) AS absentees_female,
      COUNT(*) FILTER (WHERE l.gender = 'male'   AND l.days_absent > 0
                         AND l.days_absent >= 0.1 * l.class_days) AS chronic_male,
      COUNT(*) FILTER (WHERE l.gender = 'female' AND l.days_absent > 0
                         AND l.days_absent >= 0.1 * l.class_days) AS chronic_female,
      COALESCE(SUM(l.days_absent) FILTER (WHERE l.gender = 'male'), 0)   AS days_absent_male,
      COALESCE(SUM(l.days_absent) FILTER (WHERE l.gender = 'female'), 0) AS days_absent_female
    FROM learners l
    GROUP BY l.section_id, l.school_id
  )
  -- Every column cast to its declared type (the 157 lesson).
  SELECT
    agg.school_id::BIGINT,
    s.name::TEXT,
    agg.section_id::BIGINT,
    COALESCE(sec.name, 'Unknown section')::TEXT,
    sec.grade_level::INT,
    u.name::TEXT,
    agg.class_days::NUMERIC,
    agg.enrolled_male::INT,
    agg.enrolled_female::INT,
    agg.absentees_male::INT,
    agg.absentees_female::INT,
    agg.chronic_male::INT,
    agg.chronic_female::INT,
    agg.days_absent_male::NUMERIC,
    agg.days_absent_female::NUMERIC
  FROM agg
  JOIN schools s ON s.id = agg.school_id
  LEFT JOIN procurements.sms_sections sec ON sec.id = agg.section_id
  LEFT JOIN procurements.sms_users u ON u.id = sec.section_adviser_id
  ORDER BY 2, 5, 4;
END;
$$;

GRANT EXECUTE ON FUNCTION
  procurements.division_absenteeism(BIGINT, TEXT, DATE, DATE)
  TO authenticated;

COMMENT ON FUNCTION
  procurements.division_absenteeism(BIGINT, TEXT, DATE, DATE) IS
  'Absences per section by sex for one school (or the division, p_school_id '
  'NULL) over a date window, scored on the SF2 rules of attendanceScoring.ts '
  'and schoolCalendar.ts (migration 125). Sections sum to grade level, school '
  'and division in the client.';
