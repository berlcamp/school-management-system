-- ============================================================================
-- DIVISION REPORTS: SUBMISSIONS + ENROLLMENT ROWS
-- ============================================================================
-- Phase 2: submission-based enrollment reporting.
--   * sms_division_report_submissions — header (school × SY × semester × report_type)
--   * sms_report_enrollment_rows      — per (grade_level, category, modality) detail
--   * RLS: schools write their own rows; division_admin unrestricted;
--          locked rows only mutable by division_admin.
--   * RPCs:
--       - division_enrollment_summary  — aggregated per-school totals
--       - enrollment_autofill          — prefills draft rows from live data
--       - submit_enrollment_report     — upserts detail rows + marks submitted
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- 1. sms_division_report_submissions (header)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_division_report_submissions (
  id BIGSERIAL PRIMARY KEY,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  semester SMALLINT,
  report_type TEXT NOT NULL CHECK (report_type IN (
    'enrollment','track_strand','shs_specialization','teaching_specialization'
  )),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','locked')),
  submitted_at TIMESTAMPTZ,
  submitted_by_user_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique per (school, SY, semester, type); semester may be NULL so use COALESCE.
CREATE UNIQUE INDEX IF NOT EXISTS uq_division_report_submissions_natural
  ON procurements.sms_division_report_submissions
  (school_id, school_year, COALESCE(semester, 0), report_type);

CREATE INDEX IF NOT EXISTS idx_submissions_school_year_sem_type
  ON procurements.sms_division_report_submissions (school_year, semester, report_type);

CREATE INDEX IF NOT EXISTS idx_submissions_school
  ON procurements.sms_division_report_submissions (school_id);

DROP TRIGGER IF EXISTS update_sms_division_report_submissions_updated_at
  ON procurements.sms_division_report_submissions;
CREATE TRIGGER update_sms_division_report_submissions_updated_at
  BEFORE UPDATE ON procurements.sms_division_report_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE procurements.sms_division_report_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "submissions_select"
  ON procurements.sms_division_report_submissions;
CREATE POLICY "submissions_select"
  ON procurements.sms_division_report_submissions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "submissions_insert"
  ON procurements.sms_division_report_submissions;
CREATE POLICY "submissions_insert"
  ON procurements.sms_division_report_submissions FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin','division_type')
          OR (
            u.type IN ('school_head','admin','registrar')
            AND u.school_id = sms_division_report_submissions.school_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "submissions_update"
  ON procurements.sms_division_report_submissions;
CREATE POLICY "submissions_update"
  ON procurements.sms_division_report_submissions FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND (
          u.type IN ('division_admin','division_type')
          OR (
            u.type IN ('school_head','admin','registrar')
            AND u.school_id = sms_division_report_submissions.school_id
            AND sms_division_report_submissions.status <> 'locked'
          )
        )
    )
  );

DROP POLICY IF EXISTS "submissions_delete"
  ON procurements.sms_division_report_submissions;
CREATE POLICY "submissions_delete"
  ON procurements.sms_division_report_submissions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.is_active
        AND u.type IN ('division_admin','division_type')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON procurements.sms_division_report_submissions TO authenticated;
GRANT USAGE, SELECT
  ON SEQUENCE procurements.sms_division_report_submissions_id_seq TO authenticated;

-- ============================================================================
-- 2. sms_report_enrollment_rows (detail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_report_enrollment_rows (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL
    REFERENCES procurements.sms_division_report_submissions(id) ON DELETE CASCADE,
  grade_level INT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'enrollment','transfer_in','transfer_out','dropout','promotee','repeater','balik_aral','fourps'
  )),
  modality TEXT NOT NULL CHECK (modality IN (
    'face_to_face','blended','modular','online','all'
  )),
  male INT NOT NULL DEFAULT 0 CHECK (male >= 0),
  female INT NOT NULL DEFAULT 0 CHECK (female >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, grade_level, category, modality)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_rows_submission
  ON procurements.sms_report_enrollment_rows (submission_id);

CREATE INDEX IF NOT EXISTS idx_enrollment_rows_submission_cat_mod
  ON procurements.sms_report_enrollment_rows (submission_id, category, modality);

ALTER TABLE procurements.sms_report_enrollment_rows ENABLE ROW LEVEL SECURITY;

-- Helper: check if caller can write to a submission_id
CREATE OR REPLACE FUNCTION procurements.can_write_submission(p_submission_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM procurements.sms_division_report_submissions s
    JOIN procurements.sms_users u ON u.user_id = auth.uid()
    WHERE s.id = p_submission_id
      AND u.is_active
      AND (
        u.type IN ('division_admin','division_type')
        OR (
          u.type IN ('school_head','admin','registrar')
          AND u.school_id = s.school_id
          AND s.status <> 'locked'
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION procurements.can_write_submission(BIGINT) TO authenticated;

DROP POLICY IF EXISTS "enrollment_rows_select"
  ON procurements.sms_report_enrollment_rows;
CREATE POLICY "enrollment_rows_select"
  ON procurements.sms_report_enrollment_rows FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "enrollment_rows_write"
  ON procurements.sms_report_enrollment_rows;
CREATE POLICY "enrollment_rows_write"
  ON procurements.sms_report_enrollment_rows FOR ALL
  USING (procurements.can_write_submission(submission_id))
  WITH CHECK (procurements.can_write_submission(submission_id));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON procurements.sms_report_enrollment_rows TO authenticated;
GRANT USAGE, SELECT
  ON SEQUENCE procurements.sms_report_enrollment_rows_id_seq TO authenticated;

-- ============================================================================
-- 3. RPC: enrollment_autofill
--    Returns live counts from sms_enrollments for the given
--    (school_id, school_year, semester), grouped by grade level and gender.
--    Schools use this to prefill the submission draft.
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.enrollment_autofill(
  p_school_id BIGINT,
  p_school_year TEXT,
  p_semester SMALLINT
)
RETURNS TABLE (
  grade_level INT,
  male INT,
  female INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT
    e.grade_level,
    COUNT(*) FILTER (WHERE s.gender = 'male')::int  AS male,
    COUNT(*) FILTER (WHERE s.gender = 'female')::int AS female
  FROM procurements.sms_enrollments e
  JOIN procurements.sms_students s ON s.id = e.student_id
  WHERE e.school_id = p_school_id
    AND e.school_year = p_school_year
    AND (
      (p_semester IS NULL AND e.semester IS NULL)
      OR e.semester = p_semester
    )
    AND e.enrollment_status IN (
      'active','completed','promoted','retained','graduated'
    )
  GROUP BY e.grade_level
  ORDER BY e.grade_level;
$$;

GRANT EXECUTE ON FUNCTION procurements.enrollment_autofill(BIGINT, TEXT, SMALLINT)
  TO authenticated;

-- ============================================================================
-- 4. RPC: division_enrollment_summary
--    One row per (school, grade_level) for the given (SY, semester, category, modality).
--    Returns male/female/total columns so the UI can pivot or render grade totals.
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.division_enrollment_summary(
  p_school_year TEXT,
  p_semester SMALLINT DEFAULT NULL,
  p_category TEXT DEFAULT 'enrollment',
  p_modality TEXT DEFAULT 'all',
  p_school_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
  grade_level INT,
  male INT,
  female INT,
  total INT,
  status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  WITH latest AS (
    SELECT
      s.id AS school_id,
      s.name AS school_name,
      s.school_type,
      sub.id AS submission_id,
      sub.status
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
      AND (p_school_type IS NULL OR s.school_type = p_school_type)
  )
  SELECT
    latest.school_id,
    latest.school_name,
    COALESCE(r.grade_level, -99) AS grade_level,
    COALESCE(SUM(r.male)::int, 0) AS male,
    COALESCE(SUM(r.female)::int, 0) AS female,
    COALESCE(SUM(r.male + r.female)::int, 0) AS total,
    COALESCE(latest.status, 'missing') AS status
  FROM latest
  LEFT JOIN procurements.sms_report_enrollment_rows r
    ON r.submission_id = latest.submission_id
    AND r.category = p_category
    AND r.modality = p_modality
  GROUP BY latest.school_id, latest.school_name, r.grade_level, latest.status
  ORDER BY latest.school_name, grade_level;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_enrollment_summary(TEXT, SMALLINT, TEXT, TEXT, TEXT)
  TO authenticated;

-- ============================================================================
-- 5. RPC: upsert_enrollment_rows
--    Replaces all detail rows of a given (category, modality) for a submission.
--    Called by the entry form on Save. The caller must already have write access
--    (enforced by enrollment_rows_write policy via can_write_submission).
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.upsert_enrollment_rows(
  p_submission_id BIGINT,
  p_category TEXT,
  p_modality TEXT,
  p_rows JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = procurements, public
AS $$
DECLARE
  r JSONB;
BEGIN
  -- Remove existing rows for this (category, modality)
  DELETE FROM procurements.sms_report_enrollment_rows
  WHERE submission_id = p_submission_id
    AND category = p_category
    AND modality = p_modality;

  -- Insert new rows; ignore rows where both male and female are 0.
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF COALESCE((r->>'male')::int, 0) > 0
       OR COALESCE((r->>'female')::int, 0) > 0 THEN
      INSERT INTO procurements.sms_report_enrollment_rows
        (submission_id, grade_level, category, modality, male, female)
      VALUES (
        p_submission_id,
        (r->>'grade_level')::int,
        p_category,
        p_modality,
        COALESCE((r->>'male')::int, 0),
        COALESCE((r->>'female')::int, 0)
      );
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION procurements.upsert_enrollment_rows(BIGINT, TEXT, TEXT, JSONB)
  TO authenticated;

COMMENT ON TABLE procurements.sms_division_report_submissions IS
  'Per-school submission header (one row per SY × semester × report_type)';
COMMENT ON TABLE procurements.sms_report_enrollment_rows IS
  'Enrollment submission detail: counts by (grade_level, category, modality)';
