-- ============================================================================
-- DIVISION ADMIN SCHEMA
-- ============================================================================
-- Adds division_admin user type and sms_schools table for DepEd division office.
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- ADD division_admin TO sms_users TYPE
-- ============================================================================
ALTER TABLE procurements.sms_users DROP CONSTRAINT IF EXISTS sms_users_type_check;
ALTER TABLE procurements.sms_users ADD CONSTRAINT sms_users_type_check
  CHECK (type IN ('school_head', 'teacher', 'registrar', 'admin', 'super admin', 'division_admin'));

-- ============================================================================
-- SMS_SCHOOLS TABLE (DepEd basic school fields)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_schools (
  id BIGSERIAL PRIMARY KEY,
  division_id TEXT NOT NULL,
  school_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  school_type TEXT,
  address TEXT,
  district TEXT,
  region TEXT,
  municipality_city TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_schools_division_id ON procurements.sms_schools(division_id);
CREATE INDEX IF NOT EXISTS idx_sms_schools_school_id ON procurements.sms_schools(school_id);
CREATE INDEX IF NOT EXISTS idx_sms_schools_is_active ON procurements.sms_schools(is_active) WHERE is_active = true;

CREATE TRIGGER update_sms_schools_updated_at
  BEFORE UPDATE ON procurements.sms_schools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- RLS FOR sms_schools
-- ============================================================================
ALTER TABLE procurements.sms_schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Schools are viewable by authenticated users"
  ON procurements.sms_schools FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Schools are insertable by authenticated users"
  ON procurements.sms_schools FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Schools are updatable by authenticated users"
  ON procurements.sms_schools FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Schools are deletable by authenticated users"
  ON procurements.sms_schools FOR DELETE
  USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_schools TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_schools_id_seq TO authenticated;

COMMENT ON TABLE procurements.sms_schools IS 'DepEd schools within a division';
