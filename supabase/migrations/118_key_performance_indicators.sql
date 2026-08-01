-- ============================================================================
-- KEY PERFORMANCE INDICATORS (KPI)
-- ============================================================================
-- Backs the KPI module, which implements the DepEd Memorandum of 12 October
-- 2022, "Guide in Computing Key Performance Indicators" (PS-EMISD, July 2022).
--
-- The memo splits the indicators three ways:
--   * Access     — GER, NER, GIR, NIR, Transition Rate. Every one of these
--                  divides by PSA PROJECTED POPULATION, which is published per
--                  division, not per school. The memo marks all five as NOT
--                  computable at school level for exactly that reason.
--   * Efficiency — Promotion/Graduation, Repetition, School Leaver, Cohort
--                  Survival, Completion, Coefficient of Efficiency, Years Input
--                  per Graduate, Simple Dropout. All derivable from enrollment
--                  in two consecutive school years plus repeaters and EOSY
--                  outcomes, which this system already records.
--   * Ratios     — Teacher/Classroom/Seat/Toilet-bowl-Learner, GPI, IQR.
--
-- WHAT IS STORED HERE vs DERIVED:
--   Everything the system already knows (enrollment, repeaters, promotes,
--   graduates, dropouts, teachers, classrooms) is DERIVED live by the two RPCs
--   below — nothing is snapshot, because a KPI report is a monitoring view, not
--   a signed document like the SRC (migration 112).
--   What the system cannot know is stored in sms_kpi_reference: the PSA
--   projected population, and the seat / toilet-bowl inventory. sms_rooms
--   models neither seats nor toilets (sms_rooms.capacity is a room's seating
--   capacity, a different quantity from seat INVENTORY), so those are typed in.
--
-- SCOPE: both RPCs take p_school_id, and a NULL means "every school" — the
-- division-wide roll-up. That is deliberate: the access and efficiency
-- indicators are division-level statistics in the memo, and the IQR is only
-- meaningful across schools (the memo requires at least eight).
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- 1. sms_kpi_reference — the figures the system cannot derive
-- ============================================================================
-- One row per (school, school_year). school_id NULL = the division-wide row,
-- following migration 106's convention for division- vs school-owned data.
-- Population bands mirror the memo's official school ages (RA 10533, K-6-4-2):
-- Kinder = age 5, elementary = 6-11, JHS = 12-15, SHS = 16-17.
CREATE TABLE IF NOT EXISTS procurements.sms_kpi_reference (
  id BIGSERIAL PRIMARY KEY,
  school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,

  -- PSA projected population per official school-age band. Every access
  -- indicator denominator the memo names has a column here and no other.
  population_age_5       INT CHECK (population_age_5 >= 0),
  population_age_6       INT CHECK (population_age_6 >= 0),
  population_ages_6_11   INT CHECK (population_ages_6_11 >= 0),
  population_ages_5_11   INT CHECK (population_ages_5_11 >= 0),
  population_ages_12_15  INT CHECK (population_ages_12_15 >= 0),
  population_ages_16_17  INT CHECK (population_ages_16_17 >= 0),
  population_ages_12_17  INT CHECK (population_ages_12_17 >= 0),
  population_ages_5_17   INT CHECK (population_ages_5_17 >= 0),

  -- Seat inventory. The memo's seat total is
  --   kinder seats + arm chairs + (school desks x 2) + (2-seater desks x 2),
  -- so the components are stored, never the total: the multipliers belong to
  -- the formula, and storing a pre-multiplied total would hide them.
  seats_kindergarten     INT CHECK (seats_kindergarten >= 0),
  seats_arm_chairs       INT CHECK (seats_arm_chairs >= 0),
  seats_school_desks     INT CHECK (seats_school_desks >= 0),
  seats_two_seater_desks INT CHECK (seats_two_seater_desks >= 0),

  -- Functional toilet bowls only, per the memo's wording.
  toilet_bowls_functional INT CHECK (toilet_bowls_functional >= 0),

  -- Teachers and instructional rooms ARE derivable (sms_users, sms_rooms), so
  -- these stay NULL unless a school head has to reconcile against an official
  -- personnel/building release. NULL = use the derived count.
  teacher_count_override   INT CHECK (teacher_count_override >= 0),
  classroom_count_override INT CHECK (classroom_count_override >= 0),

  notes TEXT,
  updated_by_user_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_kpi_reference IS
  'Denominators the KPI module cannot derive: PSA projected population by '
  'official school-age band, plus seat and toilet-bowl inventory. One row per '
  '(school, school_year); school_id NULL is the division-wide row.';

-- UNIQUE (school_id, school_year) cannot be a plain constraint: NULL school_id
-- would not collide with itself, allowing duplicate division rows. Two partial
-- indexes give the intended uniqueness on both branches.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_reference_school_year
  ON procurements.sms_kpi_reference (school_id, school_year)
  WHERE school_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_reference_division_year
  ON procurements.sms_kpi_reference (school_year)
  WHERE school_id IS NULL;

DROP TRIGGER IF EXISTS update_sms_kpi_reference_updated_at
  ON procurements.sms_kpi_reference;
CREATE TRIGGER update_sms_kpi_reference_updated_at
  BEFORE UPDATE ON procurements.sms_kpi_reference
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2. RLS
-- ============================================================================
-- Readable by any authenticated user (KPIs are monitoring figures every role
-- may see). Writable by the owning school's leadership, and by division admins
-- anywhere — including the division-wide row, which only they own.
--
-- 'super admin' is in the full-access branch, not the school-matched one:
-- AuthGuard swaps their school_id for the active-school override, so matching
-- on it would deny writes. Same treatment as migrations 113 and 115.
ALTER TABLE procurements.sms_kpi_reference ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kpi_reference_select" ON procurements.sms_kpi_reference;
CREATE POLICY "kpi_reference_select"
  ON procurements.sms_kpi_reference FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "kpi_reference_insert" ON procurements.sms_kpi_reference;
CREATE POLICY "kpi_reference_insert"
  ON procurements.sms_kpi_reference FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin')
            AND sms_kpi_reference.school_id IS NOT NULL
            AND u.school_id = sms_kpi_reference.school_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "kpi_reference_update" ON procurements.sms_kpi_reference;
CREATE POLICY "kpi_reference_update"
  ON procurements.sms_kpi_reference FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin')
            AND sms_kpi_reference.school_id IS NOT NULL
            AND u.school_id = sms_kpi_reference.school_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type', 'super admin')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin')
            AND sms_kpi_reference.school_id IS NOT NULL
            AND u.school_id = sms_kpi_reference.school_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "kpi_reference_delete" ON procurements.sms_kpi_reference;
CREATE POLICY "kpi_reference_delete"
  ON procurements.sms_kpi_reference FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND u.type IN ('division_admin', 'division_type', 'super admin')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON procurements.sms_kpi_reference TO authenticated;
GRANT USAGE, SELECT
  ON SEQUENCE procurements.sms_kpi_reference_id_seq TO authenticated;

-- ============================================================================
-- 3. RPC: kpi_enrollment_facts
-- ============================================================================
-- The single source of numerators for the access and efficiency indicators:
-- enrollment, repeaters and EOSY outcomes for ONE school year, broken down by
-- grade level, sex and age.
--
-- WHY BY AGE, not by pre-computed age band: NER and NIR need enrollment
-- restricted to the official school age of the LEVEL being reported, and the
-- levels overlap (Grades 1-6 uses ages 6-11 while Kinder-to-Grade-6 uses 5-11).
-- Returning the age distribution lets the caller build any band the memo names
-- without a round trip per band. Sex is returned for the same reason — the GPI
-- is defined as the female-to-male ratio of ANY indicator.
--
-- AGE REFERENCE DATE: age is counted as of 30 June of the school year's opening
-- year unless p_age_as_of overrides it. The memo cites the official school ages
-- but not the cut-off date used to apply them; 30 June is the school year
-- opening. Callers that must match an official LIS release pass their own date.
--
-- REPEATER: a learner enrolled in grade X this school year who was also
-- enrolled in grade X the previous school year, WITHIN THE SAME SCOPE. At
-- school scope that means the same school, so a learner who repeats after
-- transferring in is not counted (the previous year's row belongs to another
-- school); the division-wide scope catches those.
--
-- SEMESTERS: SHS learners hold one enrollment row per semester (migration 028).
-- Rows are collapsed to one per (learner, grade level) so Grades 11-12 are not
-- double counted; the EOSY outcome is taken from the LATEST semester, which is
-- the one carrying the year's final status.
--
-- SECURITY INVOKER: reads stay under existing RLS — this exposes nothing the
-- caller could not already select.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.kpi_enrollment_facts(
  p_school_id   BIGINT,
  p_school_year TEXT,
  p_age_as_of   DATE DEFAULT NULL
)
RETURNS TABLE (
  grade_level INT,
  sex         TEXT,
  age         INT,
  enrollment  INT,
  repeaters   INT,
  promotes    INT,
  graduates   INT,
  dropouts    INT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO procurements, public
AS $$
  WITH params AS (
    SELECT
      COALESCE(
        p_age_as_of,
        MAKE_DATE(SPLIT_PART(p_school_year, '-', 1)::INT, 6, 30)
      ) AS as_of,
      (SPLIT_PART(p_school_year, '-', 1)::INT - 1)::TEXT
        || '-' || SPLIT_PART(p_school_year, '-', 1) AS prev_sy
  ),
  -- One row per learner per grade level for the reference year. status is the
  -- APPROVAL flag; enrollment_status is the lifecycle (migration 109's trap).
  -- Every lifecycle value is kept: BOSY enrollment must include the learners
  -- who later dropped or transferred out.
  cur AS (
    SELECT
      e.student_id,
      e.grade_level::INT AS grade_level,
      (ARRAY_AGG(e.enrollment_status ORDER BY e.semester DESC NULLS LAST))[1]
        AS final_status
    FROM procurements.sms_enrollments e
    WHERE e.school_year = p_school_year
      AND e.status = 'approved'
      AND (p_school_id IS NULL OR e.school_id = p_school_id)
    GROUP BY e.student_id, e.grade_level
  ),
  prev AS (
    SELECT DISTINCT e.student_id, e.grade_level::INT AS grade_level
    FROM procurements.sms_enrollments e, params
    WHERE e.school_year = params.prev_sy
      AND e.status = 'approved'
      AND (p_school_id IS NULL OR e.school_id = p_school_id)
  ),
  facts AS (
    SELECT
      c.grade_level,
      s.gender AS sex,
      GREATEST(
        0,
        DATE_PART('year', AGE(params.as_of, s.date_of_birth))::INT
      ) AS age,
      (p.student_id IS NOT NULL) AS is_repeater,
      c.final_status
    FROM cur c
    JOIN procurements.sms_students s ON s.id = c.student_id
    CROSS JOIN params
    LEFT JOIN prev p
      ON p.student_id = c.student_id
     AND p.grade_level = c.grade_level
  )
  SELECT
    f.grade_level,
    f.sex,
    f.age,
    COUNT(*)::INT                                                   AS enrollment,
    COUNT(*) FILTER (WHERE f.is_repeater)::INT                      AS repeaters,
    -- EOSY promotes. 'completed' and 'promoted' both mean the learner finished
    -- the grade and moves up; 'graduated' is counted separately because the
    -- memo's graduation rate is a distinct indicator for Grades 6 and 12.
    COUNT(*) FILTER (
      WHERE f.final_status IN ('promoted', 'completed')
    )::INT                                                          AS promotes,
    COUNT(*) FILTER (WHERE f.final_status = 'graduated')::INT        AS graduates,
    COUNT(*) FILTER (WHERE f.final_status = 'dropped')::INT          AS dropouts
  FROM facts f
  GROUP BY f.grade_level, f.sex, f.age
  ORDER BY f.grade_level, f.sex, f.age;
$$;

COMMENT ON FUNCTION procurements.kpi_enrollment_facts(BIGINT, TEXT, DATE) IS
  'Enrollment, repeaters and EOSY outcomes for one school year by grade level, '
  'sex and age. p_school_id NULL rolls up every school. Numerators for the '
  'DepEd access and efficiency KPIs; age is as of 30 June of the opening year '
  'unless overridden.';

-- ============================================================================
-- 4. RPC: kpi_resource_facts
-- ============================================================================
-- Per-school enrollment, teacher and instructional-room counts — the ratio
-- denominators, and the input to the Inter-Quartile Ratio.
--
-- The IQR is why this returns ONE ROW PER SCHOOL rather than a scope total:
-- the memo computes it from school-level data at any level of governance, over
-- at least eight schools. Callers reporting a single school just read row one.
--
-- Teachers are counted by type, not staff_category_code — the latter is NULL on
-- rows predating migration 071, so counting by it would undercount (same
-- reasoning as src_autofill in migration 112).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.kpi_resource_facts(
  p_school_id   BIGINT,
  p_school_year TEXT
)
RETURNS TABLE (
  school_id   BIGINT,
  school_name TEXT,
  enrollment  INT,
  teachers    INT,
  classrooms  INT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO procurements, public
AS $$
  WITH scoped_schools AS (
    SELECT sc.id, sc.name
    FROM procurements.sms_schools sc
    WHERE sc.is_active
      AND (p_school_id IS NULL OR sc.id = p_school_id)
  ),
  enrolled AS (
    -- Learners are counted where they actually are that year
    -- (sms_enrollments.school_id), never sms_students.school_id, which
    -- diverges for transferees — migration 109.
    SELECT e.school_id, COUNT(DISTINCT e.student_id)::INT AS n
    FROM procurements.sms_enrollments e
    WHERE e.school_year = p_school_year
      AND e.status = 'approved'
    GROUP BY e.school_id
  ),
  staff AS (
    SELECT u.school_id, COUNT(*)::INT AS n
    FROM procurements.sms_users u
    WHERE u.is_active
      AND u.type = 'teacher'
    GROUP BY u.school_id
  ),
  rooms AS (
    SELECT r.school_id, COUNT(*)::INT AS n
    FROM procurements.sms_rooms r
    WHERE r.is_active
      AND r.room_type = 'classroom'
    GROUP BY r.school_id
  )
  SELECT
    s.id                      AS school_id,
    s.name                    AS school_name,
    COALESCE(e.n, 0)          AS enrollment,
    COALESCE(t.n, 0)          AS teachers,
    COALESCE(rm.n, 0)         AS classrooms
  FROM scoped_schools s
  LEFT JOIN enrolled e ON e.school_id = s.id
  LEFT JOIN staff    t ON t.school_id = s.id
  LEFT JOIN rooms    rm ON rm.school_id = s.id
  ORDER BY s.name;
$$;

COMMENT ON FUNCTION procurements.kpi_resource_facts(BIGINT, TEXT) IS
  'Per-school enrollment, active teachers and active classrooms for a school '
  'year. Denominators for the learner ratios and the input rows for the IQR '
  '(which needs at least eight schools). p_school_id NULL returns every school.';

GRANT EXECUTE ON FUNCTION
  procurements.kpi_enrollment_facts(BIGINT, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION
  procurements.kpi_resource_facts(BIGINT, TEXT) TO authenticated;

-- Supports the two enrollment CTEs above, which filter by school year and
-- group by school / student / grade level.
CREATE INDEX IF NOT EXISTS idx_enrollments_sy_school_grade
  ON procurements.sms_enrollments (school_year, school_id, grade_level);
