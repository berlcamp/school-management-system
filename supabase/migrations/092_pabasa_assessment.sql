-- ============================================================================
-- PABASA — Division Pabasa Reading Program (DepEd, Grades 11-12)
--
-- A division-initiated reading program for Senior High (Grades 11 & 12). Every
-- learner is tested in BOTH Filipino and English. While the learner reads, the
-- section adviser marks a single reading-readiness LEVEL — one of
-- Average / Fast / Spontaneous — plus free-text remarks.
--
-- Unlike CRLA / Phil-IRI / RMA there is NO numeric scoring, no materials, no
-- tasks and no bands: the reading level IS the result. So this is a single flat
-- records table. Assessed three times a year (BoSY / MoSY / EoSY, shown on the
-- screens & PDF as Pretest / Midtest / Posttest). Records carry school_id;
-- scoping is enforced in the app layer, matching the other assessment modules.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- RECORDS (one per learner per language per phase per school year)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_pabasa_records (
  id BIGSERIAL PRIMARY KEY,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  teacher_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  grade_level INTEGER NOT NULL,                    -- 11 or 12; lets the division report filter without a material join
  language TEXT NOT NULL CHECK (language IN ('English', 'Filipino')),
  phase TEXT NOT NULL CHECK (phase IN ('BoSY', 'MoSY', 'EoSY')),
  school_year TEXT NOT NULL,
  reading_level TEXT CHECK (reading_level IN ('Average', 'Fast', 'Spontaneous')),  -- NULL = not yet assessed
  date_assessed DATE,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, language, phase, school_year)
);

COMMENT ON TABLE procurements.sms_pabasa_records IS
  'Per-learner PABASA reading-readiness result for one language/phase/school-year (Grades 11-12).';

CREATE INDEX IF NOT EXISTS idx_sms_pabasa_records_school   ON procurements.sms_pabasa_records(school_id);
CREATE INDEX IF NOT EXISTS idx_sms_pabasa_records_section  ON procurements.sms_pabasa_records(section_id);
CREATE INDEX IF NOT EXISTS idx_sms_pabasa_records_student  ON procurements.sms_pabasa_records(student_id);
CREATE INDEX IF NOT EXISTS idx_sms_pabasa_records_sy_phase ON procurements.sms_pabasa_records(school_year, phase);

CREATE TRIGGER update_sms_pabasa_records_updated_at
  BEFORE UPDATE ON procurements.sms_pabasa_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- RLS + GRANTS (uniform authenticated policy, matching the other assessments)
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_pabasa_records ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_pabasa_records'] LOOP
    EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
  END LOOP;
END $$;
