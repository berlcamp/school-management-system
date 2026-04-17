-- ============================================================================
-- MPS (Mean Percentage Score)
-- Teachers manually enter one MPS value per subject/section/quarter/school-year.
-- Reports slice by subject, section, and quarter with mastery-level bands.
-- ============================================================================

SET search_path TO procurements, public;

CREATE TABLE IF NOT EXISTS procurements.sms_mps (
  id BIGSERIAL PRIMARY KEY,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  subject_id BIGINT NOT NULL REFERENCES procurements.sms_subjects(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  grade_level INTEGER NOT NULL,
  school_year TEXT NOT NULL,
  grading_period INTEGER NOT NULL CHECK (grading_period BETWEEN 1 AND 4),
  mps NUMERIC(5,2) NOT NULL CHECK (mps >= 0 AND mps <= 100),
  teacher_id BIGINT NOT NULL REFERENCES procurements.sms_users(id) ON DELETE RESTRICT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subject_id, section_id, grading_period, school_year)
);

COMMENT ON TABLE procurements.sms_mps IS 'Mean Percentage Score per subject/section/quarter/school-year (DepEd).';

CREATE INDEX idx_sms_mps_school     ON procurements.sms_mps(school_id);
CREATE INDEX idx_sms_mps_subject    ON procurements.sms_mps(subject_id);
CREATE INDEX idx_sms_mps_section    ON procurements.sms_mps(section_id);
CREATE INDEX idx_sms_mps_sy_quarter ON procurements.sms_mps(school_year, grading_period);
CREATE INDEX idx_sms_mps_teacher    ON procurements.sms_mps(teacher_id);

CREATE TRIGGER update_sms_mps_updated_at
  BEFORE UPDATE ON procurements.sms_mps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE procurements.sms_mps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MPS viewable by authenticated"
  ON procurements.sms_mps FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "MPS insertable by authenticated"
  ON procurements.sms_mps FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "MPS updatable by authenticated"
  ON procurements.sms_mps FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "MPS deletable by authenticated"
  ON procurements.sms_mps FOR DELETE USING (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_mps TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_mps_id_seq TO authenticated;
