-- ============================================================================
-- REPORT CARD CORE VALUES
-- Persists observed core value ratings per student per school year for printing
-- ============================================================================

SET search_path TO procurements, public;

CREATE TABLE IF NOT EXISTS procurements.sms_report_card_core_values (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL,
  school_year TEXT NOT NULL,
  core_values JSONB NOT NULL DEFAULT '{}',
  card_design TEXT NOT NULL DEFAULT '3-fold',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, school_year)
);

COMMENT ON TABLE procurements.sms_report_card_core_values IS 'Saved core value ratings per student per school year for report card printing';

CREATE INDEX idx_rc_core_values_student ON procurements.sms_report_card_core_values(student_id);
CREATE INDEX idx_rc_core_values_school ON procurements.sms_report_card_core_values(school_id, school_year);

CREATE TRIGGER update_sms_report_card_core_values_updated_at
  BEFORE UPDATE ON procurements.sms_report_card_core_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE procurements.sms_report_card_core_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RC core values viewable by authenticated" ON procurements.sms_report_card_core_values FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "RC core values insertable by authenticated" ON procurements.sms_report_card_core_values FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "RC core values updatable by authenticated" ON procurements.sms_report_card_core_values FOR UPDATE USING (auth.role() = 'authenticated');

-- Grants
GRANT SELECT, INSERT, UPDATE ON procurements.sms_report_card_core_values TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_report_card_core_values_id_seq TO authenticated;
