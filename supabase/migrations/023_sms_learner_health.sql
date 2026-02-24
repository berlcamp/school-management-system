-- ============================================================================
-- SMS_LEARNER_HEALTH TABLE
-- ============================================================================
-- Learner basic health and nutrition records for DepEd School Form 8 (SF8).
-- One record per learner per section per school year.
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- SMS_LEARNER_HEALTH TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_learner_health (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  height_cm NUMERIC(5,2),
  weight_kg NUMERIC(5,2),
  nutritional_status TEXT CHECK (nutritional_status IN ('underweight', 'normal', 'overweight', 'obese')),
  height_for_age TEXT CHECK (height_for_age IN ('severely_stunted', 'stunted', 'normal', 'tall')),
  remarks TEXT,
  measured_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, section_id, school_year)
);

CREATE INDEX IF NOT EXISTS idx_sms_learner_health_student ON procurements.sms_learner_health(student_id);
CREATE INDEX IF NOT EXISTS idx_sms_learner_health_section ON procurements.sms_learner_health(section_id);
CREATE INDEX IF NOT EXISTS idx_sms_learner_health_school_year ON procurements.sms_learner_health(school_year);

CREATE TRIGGER update_sms_learner_health_updated_at
  BEFORE UPDATE ON procurements.sms_learner_health
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE procurements.sms_learner_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Learner health is viewable by authenticated users"
  ON procurements.sms_learner_health FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Learner health is insertable by authenticated users"
  ON procurements.sms_learner_health FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Learner health is updatable by authenticated users"
  ON procurements.sms_learner_health FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Learner health is deletable by authenticated users"
  ON procurements.sms_learner_health FOR DELETE
  USING (auth.role() = 'authenticated');

COMMENT ON TABLE procurements.sms_learner_health IS 'Learner basic health and nutrition records for DepEd SF8';
