-- ============================================================================
-- SCHOOL REPORT CARD (SRC)
-- ============================================================================
-- The annual school-level accountability document a school head publishes to
-- stakeholders and has certified by four signatories. NOT the learner's report
-- card (SF9) — that is lib/pdf/generateReportCard.ts and sms_report_card_*.
--
-- Sixteen sections (I–XVI). Six are derivable from live data, ten are not
-- (professional development, funding, awards, SBM, CFSS, participation, and
-- the toilet/seat facility counts, which the system does not model).
--
-- DESIGN — every section is user-inputtable; autofill is a convenience:
--   * The SRC is signed and published. If a section were recomputed at render
--     time, a grade edited in a later school year would silently alter a
--     document already certified. So content is SNAPSHOT into this table at
--     entry time and never re-derived. src_autofill() only PREFILLS a draft.
--   * School heads reconcile SRC figures against official BOSY/EOSY snapshots,
--     which routinely disagree with live operational data. They must be able
--     to override every derived number.
--   * Back-filling past school years works even where live data is absent.
-- This mirrors the sms_division_report_submissions module (migration 072):
--   header + draft/submitted/locked + *_autofill RPC.
--
-- STORAGE — hybrid, deliberately:
--   * sms_src_submissions holds the scalar indicators as TYPED COLUMNS, so the
--     division can compare SBM level / dropout rate / ratios ACROSS schools.
--   * sms_src_sections holds each section's tabular body + narrative as JSONB,
--     typed in TypeScript as a map on section_key (types/index.ts). These are
--     display-only and their shape follows the DepEd template, which changes;
--     JSONB keeps template revisions from being a migration every time.
--
-- DERIVED, NOT STORED: the SBM level ('2.20' -> Level II, Maturing) is banded
-- in the app layer from sbm_rating, the same way CRLA reading profiles are
-- (DO 83 s. 2012: 0.50–1.49 Level I, 1.50–2.49 Level II, 2.50–3.00 Level III).
-- The CFSS interpretation ('33' -> Outstanding) is deliberately NOT derived:
-- the official point thresholds are not known to this codebase, and inventing
-- bands would put a fabricated DepEd standard on a signed document. It is
-- stored as typed-in text alongside the points.
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- 1. sms_src_submissions (header)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_src_submissions (
  id BIGSERIAL PRIMARY KEY,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'locked')),

  -- Governance indicators (SRC sections X, XI) — typed for division roll-up.
  -- SBM is scored 0.00–3.00; the Level (I/II/III) is derived, not stored.
  sbm_rating NUMERIC(4, 2) CHECK (sbm_rating >= 0 AND sbm_rating <= 3),
  cfss_points INT CHECK (cfss_points >= 0),
  cfss_interpretation TEXT,

  -- Finance (section V). MOOE is the headline figure; the partner and
  -- stakeholder-contribution tables live in the section payload.
  mooe_amount NUMERIC(14, 2) CHECK (mooe_amount >= 0),

  -- Access/quality headline rates (sections VII, VIII), as percentages.
  dropout_rate NUMERIC(5, 2) CHECK (dropout_rate >= 0 AND dropout_rate <= 100),
  promotion_rate NUMERIC(5, 2) CHECK (promotion_rate >= 0 AND promotion_rate <= 100),

  -- Denominators for the four ratio sections (XIII–XVI). teacher_count and
  -- classroom_count are autofilled; toilet_count and seat_count have no
  -- source in this system and are always typed in.
  teacher_count INT CHECK (teacher_count >= 0),
  classroom_count INT CHECK (classroom_count >= 0),
  toilet_count INT CHECK (toilet_count >= 0),
  seat_count INT CHECK (seat_count >= 0),

  -- [{ role, name, title }] — school head, teacher rep, GPTA president, SSG
  -- president. Only the school head is derivable (sms_school_settings).
  signatories JSONB NOT NULL DEFAULT '[]'::jsonb,

  submitted_at TIMESTAMPTZ,
  submitted_by_user_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (school_id, school_year)
);

COMMENT ON TABLE procurements.sms_src_submissions IS
  'School Report Card header: one per (school, school_year). Scalar indicators typed for division roll-up; section bodies in sms_src_sections.';

CREATE INDEX IF NOT EXISTS idx_src_submissions_school_year
  ON procurements.sms_src_submissions (school_year);
CREATE INDEX IF NOT EXISTS idx_src_submissions_school
  ON procurements.sms_src_submissions (school_id);

DROP TRIGGER IF EXISTS update_sms_src_submissions_updated_at
  ON procurements.sms_src_submissions;
CREATE TRIGGER update_sms_src_submissions_updated_at
  BEFORE UPDATE ON procurements.sms_src_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2. sms_src_sections (body — one row per SRC section)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_src_sections (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL
    REFERENCES procurements.sms_src_submissions(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL CHECK (section_key IN (
    'enrollment',                 -- I
    'health',                     -- II
    'materials',                  -- III
    'professional_development',   -- IV
    'funding',                    -- V
    'awards',                     -- VI
    'dropouts',                   -- VII
    'promotion',                  -- VIII
    'academic_performance',       -- IX
    'sbm',                        -- X
    'cfss',                       -- XI
    'stakeholder_participation',  -- XII
    'learner_teacher',            -- XIII
    'learner_classroom',          -- XIV
    'learner_toilet',             -- XV
    'learner_seat'                -- XVI
  )),
  -- Every section carries an analysis paragraph in the DepEd template,
  -- including the autofilled ones ("From 2019, the number of enrollees...").
  narrative TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (submission_id, section_key)
);

COMMENT ON COLUMN procurements.sms_src_sections.payload IS
  'Section body. Shape varies by section_key; typed in TS as SrcSectionPayloadMap (types/index.ts).';

CREATE INDEX IF NOT EXISTS idx_src_sections_submission
  ON procurements.sms_src_sections (submission_id);

DROP TRIGGER IF EXISTS update_sms_src_sections_updated_at
  ON procurements.sms_src_sections;
CREATE TRIGGER update_sms_src_sections_updated_at
  BEFORE UPDATE ON procurements.sms_src_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3. RLS
-- ============================================================================
-- Readable by any authenticated user (the SRC is a published document).
-- Writable by the owning school's staff while not locked; division admins
-- always. Mirrors can_write_submission from migration 072/095.
-- ============================================================================
ALTER TABLE procurements.sms_src_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_src_sections ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION procurements.can_write_src(p_submission_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM procurements.sms_src_submissions s
    JOIN procurements.sms_users u ON u.user_id = auth.uid()
    WHERE s.id = p_submission_id
      AND u.is_active
      AND (
        u.type IN ('division_admin', 'division_type')
        OR (
          u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
          AND u.school_id = s.school_id
          AND s.status <> 'locked'
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION procurements.can_write_src(BIGINT) TO authenticated;

DROP POLICY IF EXISTS "src_submissions_select" ON procurements.sms_src_submissions;
CREATE POLICY "src_submissions_select"
  ON procurements.sms_src_submissions FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT cannot call can_write_src (no row id yet): gate on the target school.
DROP POLICY IF EXISTS "src_submissions_insert" ON procurements.sms_src_submissions;
CREATE POLICY "src_submissions_insert"
  ON procurements.sms_src_submissions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin', 'division_type')
          OR (
            u.type IN ('school_head', 'assistant_school_head', 'admin', 'registrar')
            AND u.school_id = sms_src_submissions.school_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "src_submissions_update" ON procurements.sms_src_submissions;
CREATE POLICY "src_submissions_update"
  ON procurements.sms_src_submissions FOR UPDATE
  USING (procurements.can_write_src(id))
  WITH CHECK (procurements.can_write_src(id));

-- Only division admins may delete a published SRC.
DROP POLICY IF EXISTS "src_submissions_delete" ON procurements.sms_src_submissions;
CREATE POLICY "src_submissions_delete"
  ON procurements.sms_src_submissions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND u.type IN ('division_admin', 'division_type')
    )
  );

DROP POLICY IF EXISTS "src_sections_select" ON procurements.sms_src_sections;
CREATE POLICY "src_sections_select"
  ON procurements.sms_src_sections FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "src_sections_write" ON procurements.sms_src_sections;
CREATE POLICY "src_sections_write"
  ON procurements.sms_src_sections FOR ALL
  USING (procurements.can_write_src(submission_id))
  WITH CHECK (procurements.can_write_src(submission_id));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON procurements.sms_src_submissions TO authenticated;
GRANT USAGE, SELECT
  ON SEQUENCE procurements.sms_src_submissions_id_seq TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON procurements.sms_src_sections TO authenticated;
GRANT USAGE, SELECT
  ON SEQUENCE procurements.sms_src_sections_id_seq TO authenticated;

-- ============================================================================
-- 4. RPC: src_autofill
-- ============================================================================
-- Returns live figures for the six derivable sections as one JSONB document,
-- shaped to match the section payloads. PREFILL ONLY — the caller writes these
-- into a draft, where they can be edited. Nothing here is authoritative.
--
-- Scoping follows migration 109: enrollment counts come from
-- sms_enrollments.school_id (where the learner actually is that year), never
-- sms_students.school_id, which diverges for transferees. Lifecycle filters
-- use enrollment_status, not status (which is the approval flag).
--
-- NOT autofilled, and why:
--   * materials / PD / funding / awards / SBM / CFSS / participation — no
--     source tables; typed in by the school head.
--   * toilet_count / seat_count — sms_rooms models neither. sms_rooms.capacity
--     is a room's seating capacity, which is a proxy for seat INVENTORY, not
--     the same thing; deliberately not passed off as the real count.
--   * semester on academic_performance — sms_grades and sms_sections carry no
--     semester column, so SHS 1st/2nd-sem subject splits come back NULL and
--     are set by hand. Immaterial for elementary/JHS schools.
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.src_autofill(
  p_school_id BIGINT,
  p_school_year TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_enrollment      JSONB;
  v_health          JSONB;
  v_performance     JSONB;
  v_teacher_count   INT;
  v_classroom_count INT;
  v_total_enrolled  INT;
  v_dropped         INT;
  v_promoted        INT;
  v_dropout_rate    NUMERIC(5, 2);
  v_promotion_rate  NUMERIC(5, 2);
  v_lt_rows         JSONB;
  v_lc_rows         JSONB;
BEGIN
  -- Section I — enrollment by grade level, semester and sex.
  SELECT COALESCE(jsonb_agg(r ORDER BY r.grade_level, r.semester NULLS FIRST), '[]'::jsonb)
    INTO v_enrollment
    FROM (
      SELECT
        p_school_year                                       AS school_year,
        e.grade_level                                       AS grade_level,
        e.semester                                          AS semester,
        COUNT(*) FILTER (WHERE st.gender = 'male')::int     AS male,
        COUNT(*) FILTER (WHERE st.gender = 'female')::int   AS female
      FROM procurements.sms_enrollments e
      JOIN procurements.sms_students st ON st.id = e.student_id
      WHERE e.school_id = p_school_id
        AND e.school_year = p_school_year
        AND e.enrollment_status IN
          ('active', 'completed', 'promoted', 'retained', 'graduated')
      GROUP BY e.grade_level, e.semester
    ) r;

  -- Section II — BMI-for-age and height-for-age bands by grade level and sex.
  -- Scoped through the section the measurement was taken in (sms_learner_health
  -- has no school_id); that section is at the school the learner attends.
  SELECT COALESCE(jsonb_agg(r ORDER BY r.band_type, r.grade_level, r.sex), '[]'::jsonb)
    INTO v_health
    FROM (
      SELECT
        sec.grade_level        AS grade_level,
        st.gender              AS sex,
        'bmi'                  AS band_type,
        lh.nutritional_status  AS band,
        COUNT(*)::int          AS count
      FROM procurements.sms_learner_health lh
      JOIN procurements.sms_sections sec ON sec.id = lh.section_id
      JOIN procurements.sms_students st  ON st.id = lh.student_id
      WHERE sec.school_id = p_school_id
        AND lh.school_year = p_school_year
        AND lh.nutritional_status IS NOT NULL
      GROUP BY sec.grade_level, st.gender, lh.nutritional_status

      UNION ALL

      SELECT
        sec.grade_level     AS grade_level,
        st.gender           AS sex,
        'hfa'               AS band_type,
        lh.height_for_age   AS band,
        COUNT(*)::int       AS count
      FROM procurements.sms_learner_health lh
      JOIN procurements.sms_sections sec ON sec.id = lh.section_id
      JOIN procurements.sms_students st  ON st.id = lh.student_id
      WHERE sec.school_id = p_school_id
        AND lh.school_year = p_school_year
        AND lh.height_for_age IS NOT NULL
      GROUP BY sec.grade_level, st.gender, lh.height_for_age
    ) r;

  -- Section IX — general average per learning area, across grading periods.
  SELECT COALESCE(jsonb_agg(r ORDER BY r.grade_level, r.subject), '[]'::jsonb)
    INTO v_performance
    FROM (
      SELECT
        sec.grade_level                        AS grade_level,
        NULL::int                              AS semester,
        sub.name                               AS subject,
        ROUND(AVG(g.grade), 2)                 AS general_average
      FROM procurements.sms_grades g
      JOIN procurements.sms_sections sec ON sec.id = g.section_id
      JOIN procurements.sms_subjects sub ON sub.id = g.subject_id
      WHERE sec.school_id = p_school_id
        AND g.school_year = p_school_year
      GROUP BY sec.grade_level, sub.name
    ) r;

  -- Sections VII & VIII — dropout and promotion rates over BOSY enrollment.
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE e.enrollment_status = 'dropped')::int,
    COUNT(*) FILTER (WHERE e.enrollment_status IN ('promoted', 'graduated'))::int
  INTO v_total_enrolled, v_dropped, v_promoted
  FROM procurements.sms_enrollments e
  WHERE e.school_id = p_school_id
    AND e.school_year = p_school_year
    AND e.enrollment_status IN
      ('active', 'completed', 'promoted', 'retained', 'graduated', 'dropped');

  IF v_total_enrolled > 0 THEN
    v_dropout_rate   := ROUND((v_dropped::numeric  / v_total_enrolled) * 100, 2);
    v_promotion_rate := ROUND((v_promoted::numeric / v_total_enrolled) * 100, 2);
  END IF;

  -- Sections XIII & XIV — ratio denominators.
  -- Teachers are counted by type, not staff_category_code: the latter (added
  -- in migration 071 for the non-teaching breakdown) is NULL on rows predating
  -- it, so counting by it would undercount.
  SELECT COUNT(*)::int
    INTO v_teacher_count
    FROM procurements.sms_users u
   WHERE u.school_id = p_school_id
     AND u.is_active
     AND u.type = 'teacher';

  SELECT COUNT(*)::int
    INTO v_classroom_count
    FROM procurements.sms_rooms r
   WHERE r.school_id = p_school_id
     AND r.is_active
     AND r.room_type = 'classroom';

  -- Per-grade learner counts drive the ratio tables; units are school-wide.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'grade_level', t.grade_level,
             'learners',    t.learners,
             'units',       v_teacher_count
           ) ORDER BY t.grade_level), '[]'::jsonb)
    INTO v_lt_rows
    FROM (
      SELECT e.grade_level, COUNT(*)::int AS learners
        FROM procurements.sms_enrollments e
       WHERE e.school_id = p_school_id
         AND e.school_year = p_school_year
         AND e.enrollment_status IN
           ('active', 'completed', 'promoted', 'retained', 'graduated')
       GROUP BY e.grade_level
    ) t;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'grade_level', t.grade_level,
             'learners',    t.learners,
             'units',       v_classroom_count
           ) ORDER BY t.grade_level), '[]'::jsonb)
    INTO v_lc_rows
    FROM (
      SELECT e.grade_level, COUNT(*)::int AS learners
        FROM procurements.sms_enrollments e
       WHERE e.school_id = p_school_id
         AND e.school_year = p_school_year
         AND e.enrollment_status IN
           ('active', 'completed', 'promoted', 'retained', 'graduated')
       GROUP BY e.grade_level
    ) t;

  RETURN jsonb_build_object(
    'enrollment',           jsonb_build_object('rows', v_enrollment),
    'health',               jsonb_build_object('rows', v_health),
    'academic_performance', jsonb_build_object('rows', v_performance),
    'dropouts', jsonb_build_object(
      'rows', jsonb_build_array(jsonb_build_object(
        'school_year', p_school_year,
        'frequency',   v_dropped,
        'percentage',  v_dropout_rate
      )),
      'causes', '[]'::jsonb
    ),
    'promotion', jsonb_build_object(
      'rows', jsonb_build_array(jsonb_build_object(
        'school_year', p_school_year,
        'frequency',   v_promoted,
        'percentage',  v_promotion_rate
      ))
    ),
    'learner_teacher',   jsonb_build_object('rows', v_lt_rows),
    'learner_classroom', jsonb_build_object('rows', v_lc_rows),
    'indicators', jsonb_build_object(
      'teacher_count',   v_teacher_count,
      'classroom_count', v_classroom_count,
      'dropout_rate',    v_dropout_rate,
      'promotion_rate',  v_promotion_rate
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION procurements.src_autofill(BIGINT, TEXT) TO authenticated;
