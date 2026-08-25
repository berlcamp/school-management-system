-- ============================================================================
-- 157. Grade Level Teachers: division-wide scope, and the result-type fix
-- ============================================================================
--
-- Two changes to 156's function, in one migration because they land on the
-- same object and 156 is only days old.
--
-- ---------------------------------------------------------------------------
-- 1. THE ERROR: "structure of query does not match function result type"
-- ---------------------------------------------------------------------------
-- 156's RETURNS TABLE declared each column the type the MIGRATION FILES say
-- the underlying column is. Postgres compares the query's actual output types
-- to that declaration exactly — `character varying` is not `text`, `integer`
-- is not `bigint` — and raises at CALL time, not at CREATE time, which is why
-- the function was created cleanly and only failed when a school was picked.
--
-- The live schema and the files therefore disagree somewhere along that row.
-- That is the 116 lesson again (every FK into `sms_subjects` carried a delete
-- rule the files never declared), and invariant 11 already records one such
-- drift. A column created through the Supabase table editor lands as
-- `character varying`, and `ARRAY(SELECT sec.name …)` over one yields
-- `character varying[]`, which is not `text[]`.
--
-- Rather than guess which column, EVERY returned column is now cast to its
-- declared type: no-ops wherever the files were right, and immunity to the
-- whole class of drift. `sec.grade_level::INTEGER` additionally absorbs grade
-- level being stored as text on this database — 017 and 035 both wrote their
-- CHECKs as `(grade_level::integer)`, a cast nobody writes against a column
-- that is already an integer.
--
-- To see which column had drifted (read-only, safe to run, nothing depends on
-- the answer — this migration already handles every case):
--
--   SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'procurements'
--     AND (table_name, column_name) IN (
--       ('sms_users','id'), ('sms_users','name'), ('sms_users','type'),
--       ('sms_users','position'), ('sms_users','learning_area'),
--       ('sms_users','gender'), ('sms_users','employee_id'),
--       ('sms_users','is_active'), ('sms_schools','name'),
--       ('sms_sections','name'), ('sms_sections','grade_level'),
--       ('sms_subjects','name'))
--   ORDER BY table_name, column_name;
--
-- ---------------------------------------------------------------------------
-- 2. ALL SCHOOLS: `p_school_id` NULL is now the whole division
-- ---------------------------------------------------------------------------
-- "Who teaches Grade 5 at this school" and "who teaches Grade 5 in this
-- division" are the same question at two scopes, and the SDO asks the second
-- one as often as the first — a district-wide training batch is drawn from
-- every school at once. NULL = division-wide follows 106/118/125's convention
-- for exactly this, so the report needed no second function.
--
-- The roster therefore gains `school_id` / `school_name` as its first two
-- columns; at a single school they are constant and the page hides them.
-- Only ACTIVE schools are included, matching 071's summaries.
--
-- The guard splits with the scope: division-wide is division work, so NULL
-- admits only division_admin / super admin / division_type. A single school
-- still additionally admits that school's own staff and its 134 assignees, so
-- the same function can back a school-level view later without being widened.
--
-- ---------------------------------------------------------------------------
-- WHY THIS DROPS AND RE-CREATES RATHER THAN REPLACING
-- ---------------------------------------------------------------------------
-- ⚠ `CREATE OR REPLACE FUNCTION` cannot change a function's result type, and
-- adding the two school columns changes it. So the DROP below is required.
--
-- It affects EXACTLY ONE object: `division_grade_level_teachers(BIGINT, TEXT,
-- INTEGER)`, created by 156 and re-created in full four lines later in this
-- same file. It holds no data. Nothing else in the schema depends on it — no
-- view, no trigger, no other function, no policy references it; its only
-- caller is the SDO report page, over PostgREST. No other overload of the name
-- exists, and the argument types are written out so this cannot match one if
-- a future migration adds it.
--
-- Beyond that DROP: no table, column, policy, trigger or DML. Read-only.
-- ============================================================================

SET search_path TO procurements, public;

DROP FUNCTION IF EXISTS procurements.division_grade_level_teachers(BIGINT, TEXT, INTEGER);

CREATE FUNCTION procurements.division_grade_level_teachers(
  p_school_id BIGINT DEFAULT NULL,      -- NULL = every active school (118)
  p_school_year TEXT DEFAULT NULL,
  p_grade_level INTEGER DEFAULT NULL    -- NULL = every grade level
)
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
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
  ) INTO v_is_division;

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
$$;

COMMENT ON FUNCTION procurements.division_grade_level_teachers(BIGINT, TEXT, INTEGER) IS
  'Roster of the teachers assigned to a grade level, for one school year, '
  'derived from section advisorship and subject schedules. p_school_id NULL = '
  'every active school (division office only); p_grade_level NULL = every '
  'grade. A roster, not a DepEd personnel count: it includes any role holding '
  'an assignment (volunteer teachers, a teaching school head), unlike '
  '071/112/118 which count the literal type = ''teacher''. Every returned '
  'column is cast to its declared type (157) — the live schema and the '
  'migration files disagree on at least one of them.';

GRANT EXECUTE ON FUNCTION procurements.division_grade_level_teachers(BIGINT, TEXT, INTEGER) TO authenticated;
