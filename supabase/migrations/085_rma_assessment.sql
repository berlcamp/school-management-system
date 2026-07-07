-- ============================================================================
-- RMA — Rapid Mathematics Assessment (DepEd, Grades 1-10)
--
-- Division admins author a "material" per grade level: a set of math items
-- (grouped by domain) with an answer key, plus mastery bands. Section advisers
-- record each learner's per-item results; the TOTAL is the sum of item raw
-- scores and the MASTERY band is looked up on the PERCENTAGE of the total
-- possible score (e.g. Not Proficient ... Proficient).
--
-- Assessed up to three times a year: BoSY / MoSY / EoSY (record.phase).
-- Materials are DIVISION-LEVEL; records carry school_id. App-layer scoping.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. MATERIALS (one per grade level)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_rma_materials (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_rma_materials IS
  'Division-authored RMA instrument per grade level (Grades 1-10).';

CREATE INDEX IF NOT EXISTS idx_sms_rma_materials_grade
  ON procurements.sms_rma_materials(grade_level);

CREATE TRIGGER update_sms_rma_materials_updated_at
  BEFORE UPDATE ON procurements.sms_rma_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. ITEMS (scoresheet columns, grouped by math domain)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_rma_items (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES procurements.sms_rma_materials(id) ON DELETE CASCADE,
  item_no INTEGER NOT NULL DEFAULT 1,
  domain TEXT,
  question_text TEXT,
  correct_answer TEXT,
  max_score NUMERIC(7,2) NOT NULL DEFAULT 1 CHECK (max_score > 0),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_rma_items IS
  'RMA scoring items (per domain) belonging to a material.';

CREATE INDEX IF NOT EXISTS idx_sms_rma_items_material
  ON procurements.sms_rma_items(material_id, position);

CREATE TRIGGER update_sms_rma_items_updated_at
  BEFORE UPDATE ON procurements.sms_rma_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. BANDS (mastery bands; lookup on percentage of total possible)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_rma_bands (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES procurements.sms_rma_materials(id) ON DELETE CASCADE,
  min_score NUMERIC(6,2) NOT NULL,               -- percentage 0-100
  max_score NUMERIC(6,2) NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_rma_bands IS
  'RMA mastery bands, matched against the learner''s percentage of total score.';

CREATE INDEX IF NOT EXISTS idx_sms_rma_bands_material
  ON procurements.sms_rma_bands(material_id, position);

CREATE TRIGGER update_sms_rma_bands_updated_at
  BEFORE UPDATE ON procurements.sms_rma_bands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. RECORDS (one per learner per phase per school year)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_rma_records (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES procurements.sms_rma_materials(id) ON DELETE CASCADE,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  teacher_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  phase TEXT NOT NULL CHECK (phase IN ('BoSY', 'MoSY', 'EoSY')),
  school_year TEXT NOT NULL,
  date_assessed DATE,
  total_score NUMERIC(7,2),
  mastery_label TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (material_id, student_id, phase, school_year)
);

COMMENT ON TABLE procurements.sms_rma_records IS
  'Per-learner RMA result for one phase/school-year; total + mastery computed by the app.';

CREATE INDEX IF NOT EXISTS idx_sms_rma_records_school   ON procurements.sms_rma_records(school_id);
CREATE INDEX IF NOT EXISTS idx_sms_rma_records_section  ON procurements.sms_rma_records(section_id);
CREATE INDEX IF NOT EXISTS idx_sms_rma_records_student  ON procurements.sms_rma_records(student_id);
CREATE INDEX IF NOT EXISTS idx_sms_rma_records_sy_phase ON procurements.sms_rma_records(school_year, phase);

CREATE TRIGGER update_sms_rma_records_updated_at
  BEFORE UPDATE ON procurements.sms_rma_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. ITEM SCORES (one raw score per item per record)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_rma_item_scores (
  id BIGSERIAL PRIMARY KEY,
  record_id BIGINT NOT NULL REFERENCES procurements.sms_rma_records(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES procurements.sms_rma_items(id) ON DELETE CASCADE,
  raw_score NUMERIC(7,2) CHECK (raw_score >= 0),  -- NULL = not yet entered
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (record_id, item_id)
);

COMMENT ON TABLE procurements.sms_rma_item_scores IS
  'Raw score per learner per RMA item. NULL means not yet entered.';

CREATE INDEX IF NOT EXISTS idx_sms_rma_item_scores_record ON procurements.sms_rma_item_scores(record_id);
CREATE INDEX IF NOT EXISTS idx_sms_rma_item_scores_item   ON procurements.sms_rma_item_scores(item_id);

CREATE TRIGGER update_sms_rma_item_scores_updated_at
  BEFORE UPDATE ON procurements.sms_rma_item_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 6. RLS + GRANTS
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_rma_materials    ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_rma_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_rma_bands        ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_rma_records      ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_rma_item_scores  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_rma_materials', 'sms_rma_items', 'sms_rma_bands',
    'sms_rma_records', 'sms_rma_item_scores'
  ] LOOP
    EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
  END LOOP;
END $$;
