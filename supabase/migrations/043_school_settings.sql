-- ============================================================================
-- SCHOOL SETTINGS TABLE
-- ============================================================================
-- Per-school system settings. Single row per school stores the config.
-- All authenticated users can read; authenticated users can update.
-- ============================================================================

CREATE TABLE IF NOT EXISTS procurements.sms_school_settings (
  id BIGSERIAL PRIMARY KEY,
  school_id TEXT,
  allow_edit_previous_school_year BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed a default global row (school_id = NULL) if table is empty
INSERT INTO procurements.sms_school_settings (school_id, allow_edit_previous_school_year)
SELECT NULL, false
WHERE NOT EXISTS (SELECT 1 FROM procurements.sms_school_settings LIMIT 1);

-- Updated_at trigger
CREATE TRIGGER update_sms_school_settings_updated_at
  BEFORE UPDATE ON procurements.sms_school_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE procurements.sms_school_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School settings are viewable by authenticated users"
  ON procurements.sms_school_settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "School settings are updatable by authenticated users"
  ON procurements.sms_school_settings FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "School settings are insertable by authenticated users"
  ON procurements.sms_school_settings FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

COMMENT ON TABLE procurements.sms_school_settings IS 'Per-school system settings (e.g. editing controls for previous school years)';

-- Grant permissions for authenticated users
GRANT SELECT, INSERT, UPDATE ON procurements.sms_school_settings TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_school_settings_id_seq TO authenticated;
