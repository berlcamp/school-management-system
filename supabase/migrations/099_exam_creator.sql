-- ============================================================================
-- EXAM CREATOR — build an actual exam from a Table of Specification (TOS).
--
-- A TOS defines N items, each mapped to a competency + Bloom cognitive level.
-- An exam realises a TOS into real questions. Multiple named versions (e.g.
-- Set A / Set B) may be built from one TOS.
--
-- Authoring mirrors the TOS sharing model: `school_id` is NULLABLE.
--   * school_id IS NULL -> DIVISION-authored, visible to ALL teachers.
--   * school_id set      -> TEACHER-authored, private to `created_by`.
--
-- Question types: multiple_choice, true_false, modified_true_false, matching,
-- short_answer, completion, essay. A single question may span several TOS
-- item numbers (item_count) — e.g. a matching block or multi-blank completion.
--
--   sms_exams             one version per row (tos_id + version_label)
--   sms_exam_questions    one per question (carries item_number + item_count)
--   sms_exam_options      MC choices AND matching Column-B responses
--   sms_exam_subitems     matching Column-A premises / completion blanks
--
-- Correct answers live on the rows (option.is_correct, subitem.correct_answer,
-- question.answer_key) so the Item Analysis module can score per item. RLS is
-- permissive `authenticated`; scoping is enforced in the app layer.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. EXAMS (one version built from a TOS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_exams (
  id BIGSERIAL PRIMARY KEY,
  tos_id BIGINT NOT NULL REFERENCES procurements.sms_tos(id) ON DELETE CASCADE,
  version_label TEXT NOT NULL DEFAULT 'Set A',  -- e.g. "Set A" / "Set B"
  title TEXT,                                    -- optional; else derived from the TOS
  instructions TEXT,                             -- general test directions
  school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE, -- NULL = division (shared)
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_exams IS
  'An exam version built from a TOS. school_id NULL = division-authored (shared); set = teacher-private.';

CREATE INDEX IF NOT EXISTS idx_sms_exams_tos        ON procurements.sms_exams(tos_id);
CREATE INDEX IF NOT EXISTS idx_sms_exams_school     ON procurements.sms_exams(school_id);
CREATE INDEX IF NOT EXISTS idx_sms_exams_created_by ON procurements.sms_exams(created_by);

CREATE TRIGGER update_sms_exams_updated_at
  BEFORE UPDATE ON procurements.sms_exams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. EXAM QUESTIONS (one per question; may span several item numbers)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_exam_questions (
  id BIGSERIAL PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES procurements.sms_exams(id) ON DELETE CASCADE,
  tos_item_id BIGINT REFERENCES procurements.sms_tos_items(id) ON DELETE SET NULL, -- first TOS item covered
  item_number INTEGER NOT NULL,                  -- starting exam item number
  item_count INTEGER NOT NULL DEFAULT 1 CHECK (item_count >= 1), -- items covered (matching/completion)
  question_type TEXT NOT NULL DEFAULT 'multiple_choice' CHECK (question_type IN (
    'multiple_choice', 'true_false', 'modified_true_false',
    'matching', 'short_answer', 'completion', 'essay'
  )),
  question_text TEXT,
  answer_key TEXT,                               -- TF / modified TF / identification / essay notes
  points NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (points >= 0),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_exam_questions IS
  'One exam question; item_count > 1 for grouped types (matching / multi-blank completion).';

CREATE INDEX IF NOT EXISTS idx_sms_exam_questions_exam
  ON procurements.sms_exam_questions(exam_id, position);
CREATE INDEX IF NOT EXISTS idx_sms_exam_questions_tos_item
  ON procurements.sms_exam_questions(tos_item_id);

CREATE TRIGGER update_sms_exam_questions_updated_at
  BEFORE UPDATE ON procurements.sms_exam_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. EXAM OPTIONS (MC choices + matching Column-B responses)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_exam_options (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES procurements.sms_exam_questions(id) ON DELETE CASCADE,
  label TEXT,                                    -- A / B / C … (display letter)
  choice_text TEXT,
  is_correct BOOLEAN NOT NULL DEFAULT false,     -- MC: the correct choice
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_exam_options IS
  'Choices for multiple-choice questions and the Column-B response pool for matching questions.';

CREATE INDEX IF NOT EXISTS idx_sms_exam_options_question
  ON procurements.sms_exam_options(question_id, position);

CREATE TRIGGER update_sms_exam_options_updated_at
  BEFORE UPDATE ON procurements.sms_exam_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. EXAM SUBITEMS (matching Column-A premises / completion blanks)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_exam_subitems (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES procurements.sms_exam_questions(id) ON DELETE CASCADE,
  prompt_text TEXT,                              -- Column-A premise / blank label
  correct_answer TEXT,                           -- matching: correct Column-B label; completion: answer
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurements.sms_exam_subitems IS
  'Sub-parts of a grouped question: matching premises (Column A) or completion blanks.';

CREATE INDEX IF NOT EXISTS idx_sms_exam_subitems_question
  ON procurements.sms_exam_subitems(question_id, position);

CREATE TRIGGER update_sms_exam_subitems_updated_at
  BEFORE UPDATE ON procurements.sms_exam_subitems
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. RLS + GRANTS (permissive; scoping enforced in the app layer)
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_exams          ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_exam_options   ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_exam_subitems  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sms_exams', 'sms_exam_questions', 'sms_exam_options', 'sms_exam_subitems'
  ] LOOP
    EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
  END LOOP;
END $$;
