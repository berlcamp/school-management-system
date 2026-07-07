-- ============================================================================
-- CRLA — Comprehensive Rapid Literacy Assessment (DepEd, Grades 1-3)
--
-- Division admins author a "material" per grade level + language (English /
-- Filipino / Mother Tongue): the learner-sheet tasks (word/letter lists), a
-- reading-profile passage, and the reading-profile score bands.
--
-- Section advisers print the learner sheet + a roster scoresheet, administer it
-- per learner, and record raw scores per task. The learner's TOTAL is the sum
-- of task raw scores; the READING PROFILE is the band whose [min,max] contains
-- that total (e.g. 0 = Full Refresher ... 17-20 = Grade Ready).
--
-- Assessed up to three times a year: BoSY / MoSY / EoSY (record.phase).
--
-- Materials are DIVISION-LEVEL (shared, no school_id). Records carry school_id.
-- Scoping is enforced in the app layer (matching sms_grades / sms_class_record).
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. CRLA MATERIALS (authored by division admin, one per grade + language)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_crla_materials (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('English', 'Filipino', 'Mother Tongue')),
  phase TEXT CHECK (phase IS NULL OR phase IN ('BoSY', 'MoSY', 'EoSY')), -- NULL = any phase
  instructions TEXT,
  passage_title TEXT,
  passage_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_crla_materials IS
  'Division-authored CRLA instrument per grade level + language (Grades 1-3).';

CREATE INDEX IF NOT EXISTS idx_sms_crla_materials_grade_lang
  ON procurements.sms_crla_materials(grade_level, language);

CREATE TRIGGER update_sms_crla_materials_updated_at
  BEFORE UPDATE ON procurements.sms_crla_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. CRLA MATERIAL TASKS (scoresheet columns + printable learner-sheet content)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_crla_material_tasks (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES procurements.sms_crla_materials(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'words' CHECK (task_type IN ('letters', 'words', 'sentences', 'passage')),
  items TEXT,                                    -- newline/comma-separated content to print
  max_score NUMERIC(7,2) NOT NULL DEFAULT 10 CHECK (max_score > 0),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_crla_material_tasks IS
  'CRLA scoring columns; `items` holds the word/letter list printed on the learner sheet.';

CREATE INDEX IF NOT EXISTS idx_sms_crla_tasks_material
  ON procurements.sms_crla_material_tasks(material_id, position);

CREATE TRIGGER update_sms_crla_material_tasks_updated_at
  BEFORE UPDATE ON procurements.sms_crla_material_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. CRLA BANDS (reading-profile score bands; lookup on raw total)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_crla_bands (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES procurements.sms_crla_materials(id) ON DELETE CASCADE,
  min_score NUMERIC(7,2) NOT NULL,
  max_score NUMERIC(7,2) NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_crla_bands IS
  'CRLA reading-profile bands (e.g. Full/Moderate/Light Refresher, Grade Ready).';

CREATE INDEX IF NOT EXISTS idx_sms_crla_bands_material
  ON procurements.sms_crla_bands(material_id, position);

CREATE TRIGGER update_sms_crla_bands_updated_at
  BEFORE UPDATE ON procurements.sms_crla_bands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. CRLA RECORDS (one per learner per phase per school year)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_crla_records (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES procurements.sms_crla_materials(id) ON DELETE CASCADE,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  teacher_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  phase TEXT NOT NULL CHECK (phase IN ('BoSY', 'MoSY', 'EoSY')),
  school_year TEXT NOT NULL,
  date_assessed DATE,
  total_score NUMERIC(7,2),
  profile_label TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (material_id, student_id, phase, school_year)
);

COMMENT ON TABLE procurements.sms_crla_records IS
  'Per-learner CRLA result for one phase/school-year; total + reading profile computed by the app.';

CREATE INDEX IF NOT EXISTS idx_sms_crla_records_school   ON procurements.sms_crla_records(school_id);
CREATE INDEX IF NOT EXISTS idx_sms_crla_records_section  ON procurements.sms_crla_records(section_id);
CREATE INDEX IF NOT EXISTS idx_sms_crla_records_student  ON procurements.sms_crla_records(student_id);
CREATE INDEX IF NOT EXISTS idx_sms_crla_records_sy_phase ON procurements.sms_crla_records(school_year, phase);

CREATE TRIGGER update_sms_crla_records_updated_at
  BEFORE UPDATE ON procurements.sms_crla_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. CRLA RECORD SCORES (one raw score per task per record)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_crla_record_scores (
  id BIGSERIAL PRIMARY KEY,
  record_id BIGINT NOT NULL REFERENCES procurements.sms_crla_records(id) ON DELETE CASCADE,
  task_id BIGINT NOT NULL REFERENCES procurements.sms_crla_material_tasks(id) ON DELETE CASCADE,
  raw_score NUMERIC(7,2) CHECK (raw_score >= 0),  -- NULL = not yet entered
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (record_id, task_id)
);

COMMENT ON TABLE procurements.sms_crla_record_scores IS
  'Raw score per learner per CRLA task. NULL means not yet entered.';

CREATE INDEX IF NOT EXISTS idx_sms_crla_record_scores_record ON procurements.sms_crla_record_scores(record_id);
CREATE INDEX IF NOT EXISTS idx_sms_crla_record_scores_task   ON procurements.sms_crla_record_scores(task_id);

CREATE TRIGGER update_sms_crla_record_scores_updated_at
  BEFORE UPDATE ON procurements.sms_crla_record_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 6. RLS + GRANTS (scoping enforced in the app layer)
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_crla_materials       ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_crla_material_tasks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_crla_bands           ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_crla_records         ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_crla_record_scores   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_crla_materials', 'sms_crla_material_tasks', 'sms_crla_bands',
    'sms_crla_records', 'sms_crla_record_scores'
  ] LOOP
    EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
  END LOOP;
END $$;
