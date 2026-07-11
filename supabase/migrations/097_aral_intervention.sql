-- ============================================================================
-- ARAL — Intervention Program (DepEd)
--
-- ARAL is a remediation program that helps learners catch up on foundational
-- subjects. It reuses the diagnostic RESULTS already recorded by the Assessments
-- module (CRLA, Phil-IRI, RMA, PABASA): learners whose reading/mastery level
-- falls in a program's priority/secondary target range are enrolled into an
-- ARAL program and tracked until they exit.
--
-- Programs:
--   reading      Grades 1-3   CRLA   · Grades 4-10 Phil-IRI · Grades 11-12 PABASA
--   mathematics  Grades 1-10  RMA
--   science      Grades 3-10  cross-tab: Phil-IRI (Frustration) ∩ RMA (Intervention)
--   summer       Grades 1-10  learners still Priority/Secondary in Reading/Math at EoSY
--
-- One flat table (no materials/tasks — nothing is authored here; eligibility is
-- read from the assessment records). Records carry school_id; scoping is enforced
-- in the app layer (matching every assessment table — RLS is `authenticated`).
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- ARAL ENROLLMENTS (one per learner per program per school year)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_aral_enrollments (
  id BIGSERIAL PRIMARY KEY,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  section_id BIGINT REFERENCES procurements.sms_sections(id) ON DELETE SET NULL,
  grade_level INTEGER NOT NULL,
  school_year TEXT NOT NULL,
  program TEXT NOT NULL CHECK (program IN ('reading', 'mathematics', 'science', 'summer')),
  tier TEXT NOT NULL CHECK (tier IN ('priority', 'secondary')),
  source_assessment TEXT CHECK (
    source_assessment IN ('crla', 'philiri', 'rma', 'pabasa', 'cross_tab', 'manual')
  ),
  source_level TEXT,                              -- e.g. 'Frustration', 'Intervention'
  suggested_start_grade INTEGER,                  -- reading intervention entry grade
  basis_phase TEXT CHECK (basis_phase IN ('BoSY', 'MoSY', 'EoSY')),
  status TEXT NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('enrolled', 'ongoing', 'completed', 'dropped')),
  pre_note TEXT,                                  -- baseline note at entry
  post_note TEXT,                                 -- exit / outcome note
  exited_at TIMESTAMPTZ,
  teacher_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,   -- adviser
  enrolled_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, program, school_year)
);

COMMENT ON TABLE procurements.sms_aral_enrollments IS
  'ARAL intervention roster; one learner per program per school year, sourced from assessment results.';

CREATE INDEX IF NOT EXISTS idx_sms_aral_enrollments_school
  ON procurements.sms_aral_enrollments(school_id, school_year, program);
CREATE INDEX IF NOT EXISTS idx_sms_aral_enrollments_section
  ON procurements.sms_aral_enrollments(section_id);
CREATE INDEX IF NOT EXISTS idx_sms_aral_enrollments_student
  ON procurements.sms_aral_enrollments(student_id);

CREATE TRIGGER update_sms_aral_enrollments_updated_at
  BEFORE UPDATE ON procurements.sms_aral_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- RLS + GRANTS (scoping enforced in the app layer)
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_aral_enrollments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_aral_enrollments'] LOOP
    EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
  END LOOP;
END $$;
