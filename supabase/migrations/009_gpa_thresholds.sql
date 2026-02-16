-- ============================================================================
-- GPA THRESHOLDS TABLE
-- ============================================================================
-- School-wide GPA thresholds for section type suggestions during enrollment.
-- Single row (id=1) stores the config. All authenticated users can read;
-- authenticated users can update.
-- ============================================================================

CREATE TABLE IF NOT EXISTS procurements.sms_gpa_thresholds (
  id BIGSERIAL PRIMARY KEY,
  homogeneous_fast_learner_min NUMERIC(5,2) NOT NULL DEFAULT 90 CHECK (homogeneous_fast_learner_min >= 0 AND homogeneous_fast_learner_min <= 100),
  homogeneous_crack_section_max NUMERIC(5,2) NOT NULL DEFAULT 75 CHECK (homogeneous_crack_section_max >= 0 AND homogeneous_crack_section_max <= 100),
  heterogeneous_enabled BOOLEAN NOT NULL DEFAULT true,
  homogeneous_random_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default row if table is empty
INSERT INTO procurements.sms_gpa_thresholds (homogeneous_fast_learner_min, homogeneous_crack_section_max, heterogeneous_enabled, homogeneous_random_enabled)
SELECT 90, 75, true, true
WHERE NOT EXISTS (SELECT 1 FROM procurements.sms_gpa_thresholds LIMIT 1);

-- Updated_at trigger
CREATE TRIGGER update_sms_gpa_thresholds_updated_at
  BEFORE UPDATE ON procurements.sms_gpa_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE procurements.sms_gpa_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GPA thresholds are viewable by authenticated users"
  ON procurements.sms_gpa_thresholds FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "GPA thresholds are updatable by authenticated users"
  ON procurements.sms_gpa_thresholds FOR UPDATE
  USING (auth.role() = 'authenticated');

-- No INSERT/DELETE for regular users - admins could add if needed, but we only use row id=1
CREATE POLICY "GPA thresholds are insertable by authenticated users"
  ON procurements.sms_gpa_thresholds FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

COMMENT ON TABLE procurements.sms_gpa_thresholds IS 'School-wide GPA thresholds for section type suggestions during enrollment';

-- Grant permissions for authenticated users
GRANT SELECT, INSERT, UPDATE ON procurements.sms_gpa_thresholds TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_gpa_thresholds_id_seq TO authenticated;
