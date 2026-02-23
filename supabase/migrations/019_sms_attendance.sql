-- ============================================================================
-- SMS_ATTENDANCE TABLE
-- ============================================================================
-- Daily attendance records for SF2 (Learner's Daily Class Attendance).
-- One row per student per section per date.
-- ============================================================================

SET search_path TO procurements, public;

CREATE TABLE IF NOT EXISTS procurements.sms_attendance (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'tardy')),
  recorded_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, section_id, date)
);

CREATE INDEX IF NOT EXISTS idx_sms_attendance_section_date ON procurements.sms_attendance(section_id, date);
CREATE INDEX IF NOT EXISTS idx_sms_attendance_student_section_year ON procurements.sms_attendance(student_id, section_id, school_year);
CREATE INDEX IF NOT EXISTS idx_sms_attendance_school_date ON procurements.sms_attendance(school_id, date);

CREATE TRIGGER update_sms_attendance_updated_at
  BEFORE UPDATE ON procurements.sms_attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE procurements.sms_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attendance is viewable by authenticated users"
  ON procurements.sms_attendance FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Attendance is insertable by authenticated users"
  ON procurements.sms_attendance FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Attendance is updatable by authenticated users"
  ON procurements.sms_attendance FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Attendance is deletable by authenticated users"
  ON procurements.sms_attendance FOR DELETE
  USING (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_attendance TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_attendance_id_seq TO authenticated;

COMMENT ON TABLE procurements.sms_attendance IS 'Daily attendance records for SF2 (Learner''s Daily Class Attendance)';
