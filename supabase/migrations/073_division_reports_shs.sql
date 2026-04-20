-- ============================================================================
-- DIVISION REPORTS: SHS (TRACK & STRAND, SPECIALIZATION)
-- ============================================================================
-- Phase 3 — SHS submission-based reports. Reuses:
--   * sms_division_report_submissions header (report_type = 'track_strand' or 'shs_specialization')
--   * procurements.can_write_submission(BIGINT) RLS helper from migration 072
-- Adds two detail tables + indexes + RLS + 4 RPCs.
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- 1. sms_report_track_strand_rows
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_report_track_strand_rows (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL
    REFERENCES procurements.sms_division_report_submissions(id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN (
    'academic','tvl','sports','arts_design'
  )),
  strand TEXT NOT NULL,
  grade_level INT NOT NULL CHECK (grade_level IN (11, 12)),
  male INT NOT NULL DEFAULT 0 CHECK (male >= 0),
  female INT NOT NULL DEFAULT 0 CHECK (female >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, track, strand, grade_level)
);

CREATE INDEX IF NOT EXISTS idx_track_strand_rows_submission
  ON procurements.sms_report_track_strand_rows (submission_id);

ALTER TABLE procurements.sms_report_track_strand_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "track_strand_select"
  ON procurements.sms_report_track_strand_rows;
CREATE POLICY "track_strand_select"
  ON procurements.sms_report_track_strand_rows FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "track_strand_write"
  ON procurements.sms_report_track_strand_rows;
CREATE POLICY "track_strand_write"
  ON procurements.sms_report_track_strand_rows FOR ALL
  USING (procurements.can_write_submission(submission_id))
  WITH CHECK (procurements.can_write_submission(submission_id));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON procurements.sms_report_track_strand_rows TO authenticated;
GRANT USAGE, SELECT
  ON SEQUENCE procurements.sms_report_track_strand_rows_id_seq TO authenticated;

-- ============================================================================
-- 2. sms_report_shs_specialization_rows
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_report_shs_specialization_rows (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL
    REFERENCES procurements.sms_division_report_submissions(id) ON DELETE CASCADE,
  strand TEXT NOT NULL,
  specialization TEXT NOT NULL,
  grade_level INT NOT NULL CHECK (grade_level IN (11, 12)),
  male INT NOT NULL DEFAULT 0 CHECK (male >= 0),
  female INT NOT NULL DEFAULT 0 CHECK (female >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, strand, specialization, grade_level)
);

CREATE INDEX IF NOT EXISTS idx_shs_spec_rows_submission
  ON procurements.sms_report_shs_specialization_rows (submission_id);

ALTER TABLE procurements.sms_report_shs_specialization_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shs_spec_select"
  ON procurements.sms_report_shs_specialization_rows;
CREATE POLICY "shs_spec_select"
  ON procurements.sms_report_shs_specialization_rows FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "shs_spec_write"
  ON procurements.sms_report_shs_specialization_rows;
CREATE POLICY "shs_spec_write"
  ON procurements.sms_report_shs_specialization_rows FOR ALL
  USING (procurements.can_write_submission(submission_id))
  WITH CHECK (procurements.can_write_submission(submission_id));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON procurements.sms_report_shs_specialization_rows TO authenticated;
GRANT USAGE, SELECT
  ON SEQUENCE procurements.sms_report_shs_specialization_rows_id_seq TO authenticated;

-- ============================================================================
-- 3. RPC: upsert_track_strand_rows
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.upsert_track_strand_rows(
  p_submission_id BIGINT,
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
  DELETE FROM procurements.sms_report_track_strand_rows
  WHERE submission_id = p_submission_id;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF COALESCE((r->>'male')::int, 0) > 0
       OR COALESCE((r->>'female')::int, 0) > 0 THEN
      INSERT INTO procurements.sms_report_track_strand_rows
        (submission_id, track, strand, grade_level, male, female)
      VALUES (
        p_submission_id,
        r->>'track',
        r->>'strand',
        (r->>'grade_level')::int,
        COALESCE((r->>'male')::int, 0),
        COALESCE((r->>'female')::int, 0)
      );
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION procurements.upsert_track_strand_rows(BIGINT, JSONB)
  TO authenticated;

-- ============================================================================
-- 4. RPC: upsert_shs_specialization_rows
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.upsert_shs_specialization_rows(
  p_submission_id BIGINT,
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
  DELETE FROM procurements.sms_report_shs_specialization_rows
  WHERE submission_id = p_submission_id;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF COALESCE((r->>'male')::int, 0) > 0
       OR COALESCE((r->>'female')::int, 0) > 0 THEN
      INSERT INTO procurements.sms_report_shs_specialization_rows
        (submission_id, strand, specialization, grade_level, male, female)
      VALUES (
        p_submission_id,
        r->>'strand',
        r->>'specialization',
        (r->>'grade_level')::int,
        COALESCE((r->>'male')::int, 0),
        COALESCE((r->>'female')::int, 0)
      );
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION procurements.upsert_shs_specialization_rows(BIGINT, JSONB)
  TO authenticated;

-- ============================================================================
-- 5. RPC: division_track_strand_summary
--    One row per (school, track, strand) for the given (SY, semester).
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.division_track_strand_summary(
  p_school_year TEXT,
  p_semester SMALLINT,
  p_grade_level INT DEFAULT NULL
)
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
  track TEXT,
  strand TEXT,
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
      sub.id AS submission_id,
      sub.status
    FROM procurements.sms_schools s
    LEFT JOIN procurements.sms_division_report_submissions sub
      ON sub.school_id = s.id
      AND sub.school_year = p_school_year
      AND sub.semester = p_semester
      AND sub.report_type = 'track_strand'
    WHERE s.is_active
  )
  SELECT
    latest.school_id,
    latest.school_name,
    COALESCE(r.track, '') AS track,
    COALESCE(r.strand, '') AS strand,
    COALESCE(r.grade_level, 0) AS grade_level,
    COALESCE(r.male, 0) AS male,
    COALESCE(r.female, 0) AS female,
    COALESCE(r.male, 0) + COALESCE(r.female, 0) AS total,
    COALESCE(latest.status, 'missing') AS status
  FROM latest
  LEFT JOIN procurements.sms_report_track_strand_rows r
    ON r.submission_id = latest.submission_id
    AND (p_grade_level IS NULL OR r.grade_level = p_grade_level)
  ORDER BY latest.school_name, track, strand, grade_level;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_track_strand_summary(TEXT, SMALLINT, INT)
  TO authenticated;

-- ============================================================================
-- 6. RPC: division_shs_specialization_summary
-- ============================================================================
CREATE OR REPLACE FUNCTION procurements.division_shs_specialization_summary(
  p_school_year TEXT,
  p_semester SMALLINT,
  p_grade_level INT DEFAULT NULL,
  p_strand TEXT DEFAULT NULL
)
RETURNS TABLE (
  school_id BIGINT,
  school_name TEXT,
  strand TEXT,
  specialization TEXT,
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
      sub.id AS submission_id,
      sub.status
    FROM procurements.sms_schools s
    LEFT JOIN procurements.sms_division_report_submissions sub
      ON sub.school_id = s.id
      AND sub.school_year = p_school_year
      AND sub.semester = p_semester
      AND sub.report_type = 'shs_specialization'
    WHERE s.is_active
  )
  SELECT
    latest.school_id,
    latest.school_name,
    COALESCE(r.strand, '') AS strand,
    COALESCE(r.specialization, '') AS specialization,
    COALESCE(r.grade_level, 0) AS grade_level,
    COALESCE(r.male, 0) AS male,
    COALESCE(r.female, 0) AS female,
    COALESCE(r.male, 0) + COALESCE(r.female, 0) AS total,
    COALESCE(latest.status, 'missing') AS status
  FROM latest
  LEFT JOIN procurements.sms_report_shs_specialization_rows r
    ON r.submission_id = latest.submission_id
    AND (p_grade_level IS NULL OR r.grade_level = p_grade_level)
    AND (p_strand IS NULL OR r.strand = p_strand)
  ORDER BY latest.school_name, strand, specialization, grade_level;
$$;

GRANT EXECUTE ON FUNCTION procurements.division_shs_specialization_summary(TEXT, SMALLINT, INT, TEXT)
  TO authenticated;

COMMENT ON TABLE procurements.sms_report_track_strand_rows IS
  'Track & Strand submission detail: SHS learners by track, strand, grade level';
COMMENT ON TABLE procurements.sms_report_shs_specialization_rows IS
  'SHS Specialization submission detail: learners by strand, specialization, grade level';
