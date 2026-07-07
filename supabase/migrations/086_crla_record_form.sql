-- ============================================================================
-- CRLA — PART 2 RECORD FORM (Reading Fluency & Comprehension)
--
-- The CRLA-M "Record Form" (Part 2) is a graded story broken into passage lines,
-- each with a word count and optionally a comprehension question + answer key.
-- The section adviser records, per learner: per-line miscues, a ✓/✗/N/A mark for
-- each question, a fluency Observation level (1-4), and written notes.
--
-- Division admins author the record forms (a standalone settings CRUD, so a
-- grade+language can have several stories). Materials are DIVISION-LEVEL (no
-- school_id); records carry school_id. App-layer scoping (mirrors the rest of
-- the assessments feature).
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. RECORD FORMS (authored by division admin; one story per grade + language)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_crla_record_forms (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,                            -- e.g. "English Reading Fluency and Comprehension – Grade 3"
  grade_level INTEGER NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('English', 'Filipino', 'Mother Tongue')),
  story_title TEXT,                              -- e.g. "STORY 1 – PARA THE PARROT"
  instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_crla_record_forms IS
  'Division-authored CRLA Part 2 record form (graded story) per grade + language.';

CREATE INDEX IF NOT EXISTS idx_sms_crla_rf_grade_lang
  ON procurements.sms_crla_record_forms(grade_level, language);

CREATE TRIGGER update_sms_crla_record_forms_updated_at
  BEFORE UPDATE ON procurements.sms_crla_record_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. RECORD FORM LINES (passage broken into lines; some carry a question)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_crla_record_form_lines (
  id BIGSERIAL PRIMARY KEY,
  record_form_id BIGINT NOT NULL REFERENCES procurements.sms_crla_record_forms(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  line_text TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  question TEXT,                                  -- NULL = no comprehension question on this line
  answer_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_crla_record_form_lines IS
  'Passage lines of a CRLA record form; word count + optional comprehension question.';

CREATE INDEX IF NOT EXISTS idx_sms_crla_rf_lines_form
  ON procurements.sms_crla_record_form_lines(record_form_id, position);

CREATE TRIGGER update_sms_crla_record_form_lines_updated_at
  BEFORE UPDATE ON procurements.sms_crla_record_form_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. RECORD FORM OBSERVATIONS (the Level 1-4 fluency rubric, editable text)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_crla_record_form_observations (
  id BIGSERIAL PRIMARY KEY,
  record_form_id BIGINT NOT NULL REFERENCES procurements.sms_crla_record_forms(id) ON DELETE CASCADE,
  level_no INTEGER NOT NULL CHECK (level_no BETWEEN 1 AND 4),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (record_form_id, level_no)
);

COMMENT ON TABLE procurements.sms_crla_record_form_observations IS
  'Fluency observation rubric (Level 1-4) descriptions for a CRLA record form.';

CREATE TRIGGER update_sms_crla_record_form_observations_updated_at
  BEFORE UPDATE ON procurements.sms_crla_record_form_observations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. RECORD FORM RECORDS (one per learner per phase per school year)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_crla_record_form_records (
  id BIGSERIAL PRIMARY KEY,
  record_form_id BIGINT NOT NULL REFERENCES procurements.sms_crla_record_forms(id) ON DELETE CASCADE,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  teacher_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  phase TEXT NOT NULL CHECK (phase IN ('BoSY', 'MoSY', 'EoSY')),
  school_year TEXT NOT NULL,
  date_assessed DATE,
  total_miscues NUMERIC(7,2),
  comprehension_correct INTEGER,
  comprehension_total INTEGER,
  observation_level INTEGER CHECK (observation_level IS NULL OR observation_level BETWEEN 1 AND 4),
  observations_notes TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (record_form_id, student_id, phase, school_year)
);

COMMENT ON TABLE procurements.sms_crla_record_form_records IS
  'Per-learner CRLA Part 2 result for one phase/school-year; totals + observation level.';

CREATE INDEX IF NOT EXISTS idx_sms_crla_rf_records_school   ON procurements.sms_crla_record_form_records(school_id);
CREATE INDEX IF NOT EXISTS idx_sms_crla_rf_records_section  ON procurements.sms_crla_record_form_records(section_id);
CREATE INDEX IF NOT EXISTS idx_sms_crla_rf_records_student  ON procurements.sms_crla_record_form_records(student_id);
CREATE INDEX IF NOT EXISTS idx_sms_crla_rf_records_sy_phase ON procurements.sms_crla_record_form_records(school_year, phase);

CREATE TRIGGER update_sms_crla_record_form_records_updated_at
  BEFORE UPDATE ON procurements.sms_crla_record_form_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. RECORD FORM LINE SCORES (per learner per line: miscues + ✓/✗/N/A)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_crla_record_form_line_scores (
  id BIGSERIAL PRIMARY KEY,
  record_id BIGINT NOT NULL REFERENCES procurements.sms_crla_record_form_records(id) ON DELETE CASCADE,
  line_id BIGINT NOT NULL REFERENCES procurements.sms_crla_record_form_lines(id) ON DELETE CASCADE,
  miscues NUMERIC(7,2) CHECK (miscues IS NULL OR miscues >= 0),
  answer_status TEXT CHECK (answer_status IS NULL OR answer_status IN ('correct', 'wrong', 'na')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (record_id, line_id)
);

COMMENT ON TABLE procurements.sms_crla_record_form_line_scores IS
  'Per-learner per-line miscues and comprehension mark on a CRLA record form.';

CREATE INDEX IF NOT EXISTS idx_sms_crla_rf_line_scores_record ON procurements.sms_crla_record_form_line_scores(record_id);
CREATE INDEX IF NOT EXISTS idx_sms_crla_rf_line_scores_line   ON procurements.sms_crla_record_form_line_scores(line_id);

CREATE TRIGGER update_sms_crla_record_form_line_scores_updated_at
  BEFORE UPDATE ON procurements.sms_crla_record_form_line_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 6. RLS + GRANTS (scoping enforced in the app layer)
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_crla_record_forms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_crla_record_form_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_crla_record_form_observations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_crla_record_form_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_crla_record_form_line_scores   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_crla_record_forms', 'sms_crla_record_form_lines',
    'sms_crla_record_form_observations', 'sms_crla_record_form_records',
    'sms_crla_record_form_line_scores'
  ] LOOP
    EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
  END LOOP;
END $$;
