-- =============================================================================
-- 214 — Region Account: a read-only viewer of the division's data
-- =============================================================================
--
-- The Regional Office asks the division for its figures — enrolment, personnel,
-- absenteeism — and until now the only way to let someone look was a
-- `division_type` login, which also authors announcements, edits the school
-- calendar and the special programs list, locks report submissions and reaches
-- every school's own modules. A Region Account is that person without any of
-- it: a division-level login (NULL `school_id`, like `division_admin` and a
-- dedicated `qa` account) whose ONLY purpose is to view the division dashboard
-- and the SDO Reports, and only the parts a super admin has switched on.
--
-- 1. `region_account` joins `sms_users_type_check`
--    (001 → … → 158 → 194 → this). Label "Region Account" lives in
--    `lib/constants/userTypes.ts`.
--
-- 2. `sms_region_account_access` — one row per dashboard section or report
--    (`item_key`, e.g. 'dashboard:enrollment-by-grade', 'report:absenteeism'),
--    with `is_enabled`. Keys are free TEXT, app-validated in
--    `lib/constants/regionAccess.ts` per the 119/132 precedent, so adding a
--    report is a constants change, not a migration. **A missing row means OFF**
--    (the 153/160 rule): nothing is visible to a Region Account on apply, and
--    a report added to the app later stays hidden until a super admin opts in.
--    Readable by any authenticated user (it is a list of switches, nothing
--    personal — the Region Account itself must read it to draw its menu);
--    written by the active `super admin` only.
--
-- 3. `region_account_may_view(key)` — TRUE when the caller is acting as a
--    Region Account (`type` is the ACTIVE role, invariant 12) and that item is
--    switched on. The one place the rule is written.
--
-- 4. The database is told, where it decides access. Most division reports and
--    the dashboard read tables that RLS already opens to `authenticated`, so
--    for those the switch is what the app offers, exactly as it is for a
--    `division_type` user today. Where the database itself refuses anyone below
--    the division office, the Region Account is admitted only while the
--    matching item is on:
--      * `division_absenteeism` (193) and `division_grade_level_teachers`
--        (156/157) — the guard line is the only change; bodies re-created from
--        the live definitions verbatim.
--      * `can_run_division_report` (167+) — the Custom Report Builder.
--      * `sms_requests` — a NEW additive SELECT policy for the dashboard's
--        Document Requests card; 129's policy is untouched.
--      * `sms_report_definitions` — a NEW additive SELECT policy so the builder
--        lists the division's shared definitions; 170's policy is untouched.
--    Switching an item off closes these again with no migration.
--
-- **Read-only.** No write policy, write RPC or guard trigger names
-- `region_account`, and none is widened here. Tables whose write policy is
-- already open to every `authenticated` user stay so for this role as for any
-- other — that is pre-existing, not introduced here; the app offers this role
-- no page that writes.
--
-- Nobody can hold the role before this is applied, so no existing account
-- changes. One CHECK replaced, one table, one helper, three functions replaced
-- (same signatures, so grants are kept), two policies added; no DML.
--
-- Tests: supabase/tests/214_region_account.sql (one transaction, rolled back).
-- =============================================================================

-- 1. The role ---------------------------------------------------------------

ALTER TABLE procurements.sms_users DROP CONSTRAINT IF EXISTS sms_users_type_check;
ALTER TABLE procurements.sms_users ADD CONSTRAINT sms_users_type_check CHECK (
  type = ANY (ARRAY[
    'school_head', 'assistant_school_head', 'teacher', 'volunteer_teacher',
    'registrar', 'admin', 'super admin', 'division_admin', 'division_type',
    'librarian', 'tutor', 'guidance_counselor', 'school_nurse', 'accounting',
    'security_guard', 'utility_worker', 'qa', 'region_account'
  ]::text[])
);

-- 2. The switches -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS procurements.sms_region_account_access (
  item_key   TEXT PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE procurements.sms_region_account_access ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON procurements.sms_region_account_access TO authenticated;

CREATE OR REPLACE FUNCTION procurements.sms_actor_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT COALESCE(
    (SELECT type = 'super admin'
       FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1),
    FALSE);
$$;

REVOKE ALL ON FUNCTION procurements.sms_actor_is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sms_actor_is_super_admin() TO authenticated;

DROP POLICY IF EXISTS region_access_select ON procurements.sms_region_account_access;
CREATE POLICY region_access_select ON procurements.sms_region_account_access
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS region_access_insert ON procurements.sms_region_account_access;
CREATE POLICY region_access_insert ON procurements.sms_region_account_access
  FOR INSERT TO authenticated
  WITH CHECK (procurements.sms_actor_is_super_admin());

DROP POLICY IF EXISTS region_access_update ON procurements.sms_region_account_access;
CREATE POLICY region_access_update ON procurements.sms_region_account_access
  FOR UPDATE TO authenticated
  USING (procurements.sms_actor_is_super_admin())
  WITH CHECK (procurements.sms_actor_is_super_admin());

DROP POLICY IF EXISTS region_access_delete ON procurements.sms_region_account_access;
CREATE POLICY region_access_delete ON procurements.sms_region_account_access
  FOR DELETE TO authenticated
  USING (procurements.sms_actor_is_super_admin());

-- 3. The rule ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.region_account_may_view(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM procurements.sms_users u
    JOIN procurements.sms_region_account_access a
      ON a.item_key = p_key AND a.is_enabled
    WHERE u.user_id = auth.uid()
      AND u.type = 'region_account'
      AND u.is_active
  );
$$;

REVOKE ALL ON FUNCTION procurements.region_account_may_view(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.region_account_may_view(TEXT) TO authenticated;

-- 4a. Custom Report Builder -------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.can_run_division_report(p_school_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'procurements', 'public'
AS $function$
DECLARE
  v_is_division BOOLEAN;
BEGIN
  -- `type` is the ACTIVE role (invariant 12), never the permitted set.
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_users u
    WHERE u.user_id = auth.uid()
      AND u.type IN ('division_admin', 'super admin', 'division_type')
  )
    -- 214: a Region Account, while the builder is switched on for it.
    OR procurements.region_account_may_view('report:builder')
  INTO v_is_division;

  IF v_is_division THEN
    RETURN TRUE;
  END IF;

  -- Division-wide is division work.
  IF p_school_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- One named school: its own staff and its 134 assignees may read it too,
  -- which is what will let /school-reports (164) reuse this RPC. Widens
  -- nothing — 041's posture already lets them read their own school's rows.
  RETURN EXISTS (
    SELECT 1 FROM procurements.sms_users u
    WHERE u.user_id = auth.uid()
      AND (
        u.school_id = p_school_id
        OR EXISTS (
          SELECT 1 FROM procurements.sms_user_schools us
          WHERE us.user_id = u.id AND us.school_id = p_school_id
        )
      )
  );
END;
$function$;

-- 4b. Absenteeism (193) — live body, guard line only ------------------------

CREATE OR REPLACE FUNCTION procurements.division_absenteeism(p_school_id bigint, p_school_year text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS TABLE(school_id bigint, school_name text, section_id bigint, section_name text, grade_level integer, adviser_name text, class_days numeric, enrolled_male integer, enrolled_female integer, absentees_male integer, absentees_female integer, chronic_male integer, chronic_female integer, days_absent_male numeric, days_absent_female numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'procurements', 'public'
AS $function$
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
  )
    -- 214: a Region Account, while this report is switched on for it.
    OR procurements.region_account_may_view('report:absenteeism') INTO v_is_division;

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
$function$

;

-- 4c. Grade Level Teachers (156/157) — live body, guard line only ----------

CREATE OR REPLACE FUNCTION procurements.division_grade_level_teachers(p_school_id bigint DEFAULT NULL::bigint, p_school_year text DEFAULT NULL::text, p_grade_level integer DEFAULT NULL::integer)
 RETURNS TABLE(school_id bigint, school_name text, grade_level integer, teacher_id bigint, teacher_name text, user_type text, teacher_position text, learning_area text, teacher_gender text, employee_id text, teacher_is_active boolean, is_adviser boolean, advisory_sections text[], subject_names text[], section_names text[], schedule_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'procurements', 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_is_division BOOLEAN;
BEGIN
  IF p_school_year IS NULL THEN
    RAISE EXCEPTION 'A school year is required.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_users u
    WHERE u.user_id = auth.uid()
      AND u.type IN ('division_admin', 'super admin', 'division_type')
  )
    -- 214: a Region Account, while this report is switched on for it.
    OR procurements.region_account_may_view('report:grade-level-teachers') INTO v_is_division;

  IF p_school_id IS NULL THEN
    -- Division-wide is division work.
    IF NOT v_is_division THEN
      RAISE EXCEPTION 'Only the division office may read every school''s staffing.';
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
      RAISE EXCEPTION 'You may not read the staffing of this school.';
    END IF;
  END IF;

  RETURN QUERY
  WITH adv AS (
    -- Advisory: the section's own grade level. Cast in the CTE rather than in
    -- the outer SELECT so `pairs` and every correlated subquery below all
    -- carry the same, declared types.
    SELECT
      sec.school_id::BIGINT           AS school_id,
      sec.grade_level::INTEGER        AS grade_level,
      sec.section_adviser_id::BIGINT  AS teacher_id,
      sec.name::TEXT                  AS section_name
    FROM procurements.sms_sections sec
    JOIN procurements.sms_schools sc ON sc.id = sec.school_id AND sc.is_active
    WHERE (p_school_id IS NULL OR sec.school_id = p_school_id)
      AND sec.school_year = p_school_year
      AND sec.is_active
      AND sec.section_adviser_id IS NOT NULL
      AND (p_grade_level IS NULL OR sec.grade_level::INTEGER = p_grade_level)
  ),
  sch AS (
    -- Teaching: the grade level of the section the block meets in. Scoped by
    -- the SECTION's school, not the schedule's own school_id (016) — the
    -- section is what carries the grade level being reported on.
    SELECT
      sec.school_id::BIGINT      AS school_id,
      sec.grade_level::INTEGER   AS grade_level,
      sched.teacher_id::BIGINT   AS teacher_id,
      sec.name::TEXT             AS section_name,
      sub.name::TEXT             AS subject_name
    FROM procurements.sms_subject_schedules sched
    JOIN procurements.sms_sections sec ON sec.id = sched.section_id
    JOIN procurements.sms_schools sc ON sc.id = sec.school_id AND sc.is_active
    LEFT JOIN procurements.sms_subjects sub ON sub.id = sched.subject_id
    WHERE (p_school_id IS NULL OR sec.school_id = p_school_id)
      AND sched.school_year = p_school_year
      AND sched.teacher_id IS NOT NULL   -- NULL = a "Temporary" block (117)
      AND (p_grade_level IS NULL OR sec.grade_level::INTEGER = p_grade_level)
  ),
  pairs AS (
    SELECT a.school_id, a.grade_level, a.teacher_id FROM adv a
    UNION
    SELECT s.school_id, s.grade_level, s.teacher_id FROM sch s
  )
  SELECT
    p.school_id::BIGINT,
    sc.name::TEXT,
    p.grade_level::INTEGER,
    u.id::BIGINT,
    u.name::TEXT,
    u.type::TEXT,
    u.position::TEXT,
    u.learning_area::TEXT,
    u.gender::TEXT,
    u.employee_id::TEXT,
    u.is_active::BOOLEAN,
    EXISTS (
      SELECT 1 FROM adv a
      WHERE a.teacher_id = p.teacher_id
        AND a.grade_level = p.grade_level
        AND a.school_id = p.school_id
    )::BOOLEAN,
    ARRAY(
      SELECT DISTINCT a.section_name FROM adv a
      WHERE a.teacher_id = p.teacher_id
        AND a.grade_level = p.grade_level
        AND a.school_id = p.school_id
      ORDER BY 1
    )::TEXT[],
    ARRAY(
      SELECT DISTINCT s.subject_name FROM sch s
      WHERE s.teacher_id = p.teacher_id
        AND s.grade_level = p.grade_level
        AND s.school_id = p.school_id
        AND s.subject_name IS NOT NULL
      ORDER BY 1
    )::TEXT[],
    ARRAY(
      SELECT DISTINCT s.section_name FROM sch s
      WHERE s.teacher_id = p.teacher_id
        AND s.grade_level = p.grade_level
        AND s.school_id = p.school_id
      ORDER BY 1
    )::TEXT[],
    (
      SELECT COUNT(*) FROM sch s
      WHERE s.teacher_id = p.teacher_id
        AND s.grade_level = p.grade_level
        AND s.school_id = p.school_id
    )::BIGINT
  FROM pairs p
  JOIN procurements.sms_users u ON u.id = p.teacher_id
  JOIN procurements.sms_schools sc ON sc.id = p.school_id
  ORDER BY p.grade_level, sc.name, u.name;
END;
$function$

;

-- 4d. Dashboard: Document Requests card -------------------------------------

DROP POLICY IF EXISTS sms_requests_region_read ON procurements.sms_requests;
CREATE POLICY sms_requests_region_read ON procurements.sms_requests
  FOR SELECT TO authenticated
  USING (procurements.region_account_may_view('dashboard:document-requests'));

-- 4e. Report Builder: the division's shared definitions ---------------------

DROP POLICY IF EXISTS "Report definitions are viewable by a region account"
  ON procurements.sms_report_definitions;
CREATE POLICY "Report definitions are viewable by a region account"
  ON procurements.sms_report_definitions
  FOR SELECT TO authenticated
  USING (
    is_division_shared
    AND procurements.region_account_may_view('report:builder')
  );
