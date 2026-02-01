-- ============================================================================
-- SECTION SUBJECTS JUNCTION TABLE
-- ============================================================================
-- This migration creates a junction table to link sections to subjects
-- Each section can have multiple subjects, and subjects can be assigned to multiple sections
-- ============================================================================

-- Set the schema to procurements
SET search_path TO procurements, public;

-- ============================================================================
-- SECTION SUBJECTS TABLE (Many-to-many: Sections ↔ Subjects)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_section_subjects (
  id BIGSERIAL PRIMARY KEY,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  subject_id BIGINT NOT NULL REFERENCES procurements.sms_subjects(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(section_id, subject_id, school_year)
);

-- Indexes for section_subjects
CREATE INDEX IF NOT EXISTS idx_section_subjects_section ON procurements.sms_section_subjects(section_id);
CREATE INDEX IF NOT EXISTS idx_section_subjects_subject ON procurements.sms_section_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_section_subjects_school_year ON procurements.sms_section_subjects(school_year);

-- Trigger for updated_at timestamp
CREATE TRIGGER update_sms_section_subjects_updated_at 
  BEFORE UPDATE ON procurements.sms_section_subjects 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE procurements.sms_section_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Section subjects are viewable by authenticated users"
  ON procurements.sms_section_subjects FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Section subjects are insertable by admins"
  ON procurements.sms_section_subjects FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Section subjects are updatable by admins"
  ON procurements.sms_section_subjects FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Section subjects are deletable by admins"
  ON procurements.sms_section_subjects FOR DELETE
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE procurements.sms_section_subjects IS 'Junction table linking sections to subjects - defines which subjects are offered in each section';
