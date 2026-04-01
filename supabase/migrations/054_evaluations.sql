-- ============================================================================
-- EVALUATIONS (Teacher & Principal evaluation system)
-- ============================================================================

SET search_path TO procurements, public;

-- Evaluation questionnaire metadata
CREATE TABLE IF NOT EXISTS procurements.sms_evaluations (
  id BIGSERIAL PRIMARY KEY,
  school_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  school_year TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('student_to_teacher', 'teacher_to_principal')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_evaluations IS 'Evaluation questionnaires — student-to-teacher or teacher-to-principal';

CREATE INDEX idx_evaluations_school_id ON procurements.sms_evaluations(school_id);
CREATE INDEX idx_evaluations_school_year ON procurements.sms_evaluations(school_year);
CREATE INDEX idx_evaluations_type ON procurements.sms_evaluations(type);
CREATE INDEX idx_evaluations_active ON procurements.sms_evaluations(is_active) WHERE is_active = true;

CREATE TRIGGER update_sms_evaluations_updated_at
  BEFORE UPDATE ON procurements.sms_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Evaluation questions (ordered)
CREATE TABLE IF NOT EXISTS procurements.sms_evaluation_questions (
  id BIGSERIAL PRIMARY KEY,
  evaluation_id BIGINT NOT NULL REFERENCES procurements.sms_evaluations(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  order_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_evaluation_questions IS 'Questions belonging to an evaluation questionnaire';

CREATE INDEX idx_eval_questions_evaluation ON procurements.sms_evaluation_questions(evaluation_id);

CREATE TRIGGER update_sms_evaluation_questions_updated_at
  BEFORE UPDATE ON procurements.sms_evaluation_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Evaluation responses (one row per question per respondent per evaluatee)
CREATE TABLE IF NOT EXISTS procurements.sms_evaluation_responses (
  id BIGSERIAL PRIMARY KEY,
  evaluation_id BIGINT NOT NULL REFERENCES procurements.sms_evaluations(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES procurements.sms_evaluation_questions(id) ON DELETE CASCADE,
  respondent_type TEXT NOT NULL CHECK (respondent_type IN ('student', 'teacher')),
  respondent_id BIGINT NOT NULL,
  evaluatee_id BIGINT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  school_year TEXT NOT NULL,
  school_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_evaluation_responses IS 'Individual rating responses — respondent_id is polymorphic (student or user)';

CREATE INDEX idx_eval_responses_evaluation ON procurements.sms_evaluation_responses(evaluation_id);
CREATE INDEX idx_eval_responses_question ON procurements.sms_evaluation_responses(question_id);
CREATE INDEX idx_eval_responses_respondent ON procurements.sms_evaluation_responses(respondent_type, respondent_id);
CREATE INDEX idx_eval_responses_evaluatee ON procurements.sms_evaluation_responses(evaluatee_id);
CREATE INDEX idx_eval_responses_school ON procurements.sms_evaluation_responses(school_id);

-- Prevent duplicate submissions
CREATE UNIQUE INDEX idx_eval_responses_unique
  ON procurements.sms_evaluation_responses(evaluation_id, question_id, respondent_type, respondent_id, evaluatee_id);

CREATE TRIGGER update_sms_evaluation_responses_updated_at
  BEFORE UPDATE ON procurements.sms_evaluation_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE procurements.sms_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_evaluation_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_evaluation_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Evaluations viewable by authenticated" ON procurements.sms_evaluations FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Evaluations insertable by authenticated" ON procurements.sms_evaluations FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Evaluations updatable by authenticated" ON procurements.sms_evaluations FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Evaluations deletable by authenticated" ON procurements.sms_evaluations FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Eval questions viewable by authenticated" ON procurements.sms_evaluation_questions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Eval questions insertable by authenticated" ON procurements.sms_evaluation_questions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Eval questions updatable by authenticated" ON procurements.sms_evaluation_questions FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Eval questions deletable by authenticated" ON procurements.sms_evaluation_questions FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Eval responses viewable by authenticated" ON procurements.sms_evaluation_responses FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Eval responses insertable by authenticated" ON procurements.sms_evaluation_responses FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_evaluations TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_evaluations_id_seq TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_evaluation_questions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_evaluation_questions_id_seq TO authenticated;
GRANT SELECT, INSERT ON procurements.sms_evaluation_responses TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_evaluation_responses_id_seq TO authenticated;
