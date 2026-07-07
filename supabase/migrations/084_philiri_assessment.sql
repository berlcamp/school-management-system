-- ============================================================================
-- Phil-IRI — Philippine Informal Reading Inventory (DepEd, Grades 3-10)
--
-- Division admins author a "material" per grade level + language (English /
-- Filipino): a graded reading passage (with word count) and its comprehension
-- questions. Section advisers administer it per learner and record:
--   - miscues  → word-reading score % = (word_count - miscues)/word_count*100
--   - correct comprehension answers → comprehension score %
-- Reading levels (Phil-IRI Manual 2018) are derived in the app:
--   word reading:  >=97 Independent, 90-96 Instructional, <=89 Frustration
--   comprehension: >=80 Independent, 59-79 Instructional, <=58 Frustration
--   overall = the more severe (lower) of the two.
--
-- Assessed up to three times a year: BoSY / MoSY / EoSY (record.phase).
-- Materials are DIVISION-LEVEL; records carry school_id. App-layer scoping.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. MATERIALS (passage + word count, one per grade + language + set)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_philiri_materials (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('English', 'Filipino')),
  set_label TEXT,                                -- e.g. Set A / Set B (pre/post forms)
  passage_title TEXT,
  passage_text TEXT,
  word_count INTEGER NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_philiri_materials IS
  'Division-authored Phil-IRI graded passage per grade level + language (Grades 3-10).';

CREATE INDEX IF NOT EXISTS idx_sms_philiri_materials_grade_lang
  ON procurements.sms_philiri_materials(grade_level, language);

CREATE TRIGGER update_sms_philiri_materials_updated_at
  BEFORE UPDATE ON procurements.sms_philiri_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. QUESTIONS (comprehension questions for a passage)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_philiri_questions (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES procurements.sms_philiri_materials(id) ON DELETE CASCADE,
  question_no INTEGER NOT NULL DEFAULT 1,
  question_text TEXT NOT NULL,
  correct_answer TEXT,
  question_type TEXT NOT NULL DEFAULT 'literal' CHECK (question_type IN ('literal', 'inferential', 'critical')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_philiri_questions IS
  'Comprehension questions belonging to a Phil-IRI passage.';

CREATE INDEX IF NOT EXISTS idx_sms_philiri_questions_material
  ON procurements.sms_philiri_questions(material_id, position);

CREATE TRIGGER update_sms_philiri_questions_updated_at
  BEFORE UPDATE ON procurements.sms_philiri_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. RECORDS (one per learner per phase per school year)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_philiri_records (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES procurements.sms_philiri_materials(id) ON DELETE CASCADE,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  teacher_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  phase TEXT NOT NULL CHECK (phase IN ('BoSY', 'MoSY', 'EoSY')),
  school_year TEXT NOT NULL,
  date_assessed DATE,
  miscues INTEGER CHECK (miscues IS NULL OR miscues >= 0),
  word_reading_score NUMERIC(6,2),
  comprehension_score NUMERIC(6,2),
  word_reading_level TEXT,
  comprehension_level TEXT,
  overall_reading_level TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (material_id, student_id, phase, school_year)
);

COMMENT ON TABLE procurements.sms_philiri_records IS
  'Per-learner Phil-IRI result for one phase/school-year; scores + levels computed by the app.';

CREATE INDEX IF NOT EXISTS idx_sms_philiri_records_school   ON procurements.sms_philiri_records(school_id);
CREATE INDEX IF NOT EXISTS idx_sms_philiri_records_section  ON procurements.sms_philiri_records(section_id);
CREATE INDEX IF NOT EXISTS idx_sms_philiri_records_student  ON procurements.sms_philiri_records(student_id);
CREATE INDEX IF NOT EXISTS idx_sms_philiri_records_sy_phase ON procurements.sms_philiri_records(school_year, phase);

CREATE TRIGGER update_sms_philiri_records_updated_at
  BEFORE UPDATE ON procurements.sms_philiri_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. ANSWERS (per-question correctness for a record)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_philiri_answers (
  id BIGSERIAL PRIMARY KEY,
  record_id BIGINT NOT NULL REFERENCES procurements.sms_philiri_records(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES procurements.sms_philiri_questions(id) ON DELETE CASCADE,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (record_id, question_id)
);

COMMENT ON TABLE procurements.sms_philiri_answers IS
  'Whether a learner answered a given comprehension question correctly.';

CREATE INDEX IF NOT EXISTS idx_sms_philiri_answers_record   ON procurements.sms_philiri_answers(record_id);
CREATE INDEX IF NOT EXISTS idx_sms_philiri_answers_question ON procurements.sms_philiri_answers(question_id);

CREATE TRIGGER update_sms_philiri_answers_updated_at
  BEFORE UPDATE ON procurements.sms_philiri_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. RLS + GRANTS
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_philiri_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_philiri_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_philiri_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_philiri_answers   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_philiri_materials', 'sms_philiri_questions',
    'sms_philiri_records', 'sms_philiri_answers'
  ] LOOP
    EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
  END LOOP;
END $$;
