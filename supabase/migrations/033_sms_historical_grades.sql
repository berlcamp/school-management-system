-- ============================================================================
-- SMS_HISTORICAL_GRADES TABLE
-- ============================================================================
-- Stores manually encoded historical academic records for SF10 generation.
-- Used for grade levels where no system-generated grades exist (e.g., prior
-- years/schools before SMS deployment). Denormalized to avoid FK violations
-- on schools, subjects, sections, and teachers that don't exist in the system.
-- ============================================================================

SET search_path TO procurements, public;

CREATE TABLE IF NOT EXISTS procurements.sms_historical_grades (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL,
  grade_level INTEGER NOT NULL CHECK (grade_level >= 0 AND grade_level <= 12),
  school_year TEXT NOT NULL,
  section_name TEXT,
  school_name TEXT,
  school_id_code TEXT,
  district TEXT,
  division TEXT,
  region TEXT,
  adviser_name TEXT,
  semester INTEGER,
  track TEXT,
  strand TEXT,
  grades JSONB NOT NULL DEFAULT '{}'::jsonb,
  general_average NUMERIC(5,2),
  encoded_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One record per grade level per student; for SHS (11-12), per semester
  UNIQUE(student_id, grade_level, semester),

  -- SHS (11-12) must have semester 1 or 2; K-10 must have null semester
  CHECK (
    (grade_level >= 11 AND semester IN (1, 2))
    OR (grade_level < 11 AND semester IS NULL)
  )
);

-- Use a unique index with COALESCE for the null-safe unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_historical_grades_unique
  ON procurements.sms_historical_grades(student_id, grade_level, COALESCE(semester, 0));

CREATE INDEX IF NOT EXISTS idx_sms_historical_grades_student ON procurements.sms_historical_grades(student_id);
CREATE INDEX IF NOT EXISTS idx_sms_historical_grades_school ON procurements.sms_historical_grades(school_id);

CREATE TRIGGER update_sms_historical_grades_updated_at
  BEFORE UPDATE ON procurements.sms_historical_grades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE procurements.sms_historical_grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Historical grades viewable by authenticated users"
  ON procurements.sms_historical_grades FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Historical grades insertable by authenticated users"
  ON procurements.sms_historical_grades FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Historical grades updatable by authenticated users"
  ON procurements.sms_historical_grades FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Historical grades deletable by authenticated users"
  ON procurements.sms_historical_grades FOR DELETE
  USING (auth.role() = 'authenticated');

COMMENT ON TABLE procurements.sms_historical_grades IS 'Manually encoded historical academic records for SF10 generation';
