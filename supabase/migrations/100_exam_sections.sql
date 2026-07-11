-- ============================================================================
-- EXAM SECTIONS — per-question-type directions for a grouped exam.
--
-- An exam is printed in parts grouped by question type (I. Multiple Choice,
-- II. True/False, …). Each part carries its own directions/instructions, stored
-- here (one row per type present in the exam). Ordering is by `position`.
-- ============================================================================

SET search_path TO procurements, public;

CREATE TABLE IF NOT EXISTS procurements.sms_exam_sections (
  id BIGSERIAL PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES procurements.sms_exams(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL CHECK (question_type IN (
    'multiple_choice', 'true_false', 'modified_true_false',
    'matching', 'short_answer', 'completion', 'essay'
  )),
  instructions TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, question_type)
);

COMMENT ON TABLE procurements.sms_exam_sections IS
  'Directions per question-type group for a grouped/printed exam.';

CREATE INDEX IF NOT EXISTS idx_sms_exam_sections_exam
  ON procurements.sms_exam_sections(exam_id, position);

CREATE TRIGGER update_sms_exam_sections_updated_at
  BEFORE UPDATE ON procurements.sms_exam_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE procurements.sms_exam_sections ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT := 'sms_exam_sections';
BEGIN
  EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
  EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
  EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
  EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
END $$;
