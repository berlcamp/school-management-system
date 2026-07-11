-- ============================================================================
-- ITEM ANALYSIS with MPS — record exam results per section and analyse items.
--
-- After a section takes an exam (from the Exam Creator), the teacher records
-- which auto-scorable items each learner got right. From that the app computes:
--   * per-item difficulty index (p) and discrimination index (D) -> retain /
--     revise / reject verdict
--   * each learner's score and the class Mean Percentage Score (MPS) + mastery.
--
--   sms_exam_results          one per exam + section + school year
--   sms_exam_result_students  one per learner; correct_items = item numbers right
--
-- Records carry school_id; scoping is enforced in the app layer. Essays and
-- other non-auto-scorable items are excluded from the analysis (app layer).
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. EXAM RESULTS (one administration of an exam by a section)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_exam_results (
  id BIGSERIAL PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES procurements.sms_exams(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  teacher_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  date_administered DATE,
  total_items INTEGER NOT NULL DEFAULT 0,  -- auto-scorable item count (snapshot)
  mps NUMERIC(5,2),                        -- computed Mean Percentage Score
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, section_id, school_year)
);

COMMENT ON TABLE procurements.sms_exam_results IS
  'One exam administration per section/school-year; MPS + item analysis computed in the app.';

CREATE INDEX IF NOT EXISTS idx_sms_exam_results_exam    ON procurements.sms_exam_results(exam_id);
CREATE INDEX IF NOT EXISTS idx_sms_exam_results_section ON procurements.sms_exam_results(section_id);
CREATE INDEX IF NOT EXISTS idx_sms_exam_results_school  ON procurements.sms_exam_results(school_id);
CREATE INDEX IF NOT EXISTS idx_sms_exam_results_sy      ON procurements.sms_exam_results(school_year);

CREATE TRIGGER update_sms_exam_results_updated_at
  BEFORE UPDATE ON procurements.sms_exam_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. EXAM RESULT STUDENTS (one per learner; correct_items = item numbers right)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_exam_result_students (
  id BIGSERIAL PRIMARY KEY,
  result_id BIGINT NOT NULL REFERENCES procurements.sms_exam_results(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  correct_items INTEGER[] NOT NULL DEFAULT '{}',  -- item numbers the learner got correct
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (result_id, student_id)
);

COMMENT ON TABLE procurements.sms_exam_result_students IS
  'Per-learner exam result; correct_items holds the item numbers answered correctly.';

CREATE INDEX IF NOT EXISTS idx_sms_exam_result_students_result
  ON procurements.sms_exam_result_students(result_id);

CREATE TRIGGER update_sms_exam_result_students_updated_at
  BEFORE UPDATE ON procurements.sms_exam_result_students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. RLS + GRANTS (permissive; scoping enforced in the app layer)
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_exam_results         ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_exam_result_students ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_exam_results', 'sms_exam_result_students'
  ] LOOP
    EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
  END LOOP;
END $$;
