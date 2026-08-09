-- ============================================================================
-- Migration 132: exam answer keys + scanned answer sheets
-- ============================================================================
--
-- APPLY AFTER 101 (it extends sms_exam_result_students).
--
-- ---------------------------------------------------------------------------
-- What this adds
-- ---------------------------------------------------------------------------
--
-- The Examinations module can already author a TOS (096), realise it as an exam
-- (099/100) and analyse item difficulty from results (101). What it could not do
-- is get those results in without a teacher hand-ticking a checkbox grid, one
-- learner at a time, for every item.
--
-- This migration backs a scan pipeline:
--
--   1. ANSWER KEY   — a flat item_number -> correct_answer key per exam.
--   2. ANSWER SHEET — a pre-printed OMR bubble sheet per learner (no storage:
--                     the sheet is derived from the key + the roster, and the
--                     learner is identified by a bubble-encoded ID block).
--   3. SCAN         — the decoded sheet is stored as the learner's raw answers.
--   4. ANALYSIS     — 101's computations run unchanged off correct_items.
--
-- ---------------------------------------------------------------------------
-- Why the key is its own table and not just the authored questions
-- ---------------------------------------------------------------------------
--
-- 099 already stores correct answers on the questions (sms_exam_options.is_correct
-- and sms_exam_questions.answer_key). That is the right home for an exam typed
-- into the Exam Builder, and the app pulls from it to prefill this table.
--
-- It cannot be the only home. The common case in a school is an exam that exists
-- on paper — photocopied, inherited, downloaded — where the teacher wants to scan
-- answer sheets without first transcribing 50 questions and their choices into the
-- builder. A key of 50 letters takes a minute; the questions take an afternoon.
-- So the key is stored flat, keyed by item number, and prefilling from the
-- authored questions is a convenience, not the mechanism.
--
-- The key also pins what the sheet must look like: `choice_count` is how many
-- bubbles that row gets printed with (a True/False item gets 2, not 4), and it is
-- read back by the decoder. Changing it after sheets are printed invalidates the
-- printed sheets, not the stored scans — scans keep their own answers.
--
-- ---------------------------------------------------------------------------
-- Why answers[] sits beside correct_items and does not replace it
-- ---------------------------------------------------------------------------
--
-- 101 stores `correct_items INTEGER[]` — which item numbers a learner got right.
-- That is everything the difficulty/discrimination/MPS maths needs, and every
-- existing row has it, so it stays the input to the analysis.
--
-- It cannot answer "which wrong choice did they pick?", which is the question a
-- distractor analysis is made of, and it cannot reproduce a marked-up result slip
-- showing the learner their own answer beside the key. So scans additionally store
-- the raw response per item in `answers`, positionally: answers[i] is the response
-- to item i. An empty string is a blank, '?' is a multi-mark the teacher left
-- unresolved. Rows encoded by hand keep an empty array and lose nothing they had.
--
-- Nothing is destroyed and nothing is backfilled: existing hand-encoded results
-- keep working exactly as before.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. ANSWER KEYS (one row per exam per item number)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_exam_answer_keys (
  id BIGSERIAL PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES procurements.sms_exams(id) ON DELETE CASCADE,
  item_number INTEGER NOT NULL CHECK (item_number >= 1),
  -- The response that scores. For a bubbled item this is a choice letter
  -- ('A'..'E'); free TEXT rather than a CHECK so a future sheet style (numeric
  -- responses, TRUE/FALSE spelled out) does not need a migration, per the 119
  -- precedent. NULL = the item has no key yet and is not scored.
  correct_answer TEXT,
  -- How many bubbles this item is printed with, and how many the decoder reads.
  choice_count INTEGER NOT NULL DEFAULT 4 CHECK (choice_count BETWEEN 2 AND 5),
  points NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (points >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, item_number)
);

COMMENT ON TABLE procurements.sms_exam_answer_keys IS
  'Flat answer key for an exam: one row per item number. Prefilled from the authored questions when they exist, typed directly when they do not.';
COMMENT ON COLUMN procurements.sms_exam_answer_keys.choice_count IS
  'Bubbles printed and read for this item (2-5). Governs the answer sheet layout and the decoder.';

CREATE INDEX IF NOT EXISTS idx_sms_exam_answer_keys_exam
  ON procurements.sms_exam_answer_keys(exam_id, item_number);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_sms_exam_answer_keys_updated_at'
  ) THEN
    CREATE TRIGGER update_sms_exam_answer_keys_updated_at
      BEFORE UPDATE ON procurements.sms_exam_answer_keys
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. RAW RESPONSES ON THE PER-LEARNER RESULT ROW (additive)
-- ----------------------------------------------------------------------------
-- answers[i] = the learner's response to item i. '' = blank, '?' = unresolved
-- multi-mark. Empty array = hand-encoded (pre-132) row; correct_items still rules.
ALTER TABLE procurements.sms_exam_result_students
  ADD COLUMN IF NOT EXISTS answers TEXT[] NOT NULL DEFAULT '{}';

-- 'manual' = ticked in the item-analysis grid, 'scan' = decoded from a sheet.
ALTER TABLE procurements.sms_exam_result_students
  ADD COLUMN IF NOT EXISTS scan_source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE procurements.sms_exam_result_students
  ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sms_exam_result_students_scan_source_check'
      AND conrelid = 'procurements.sms_exam_result_students'::regclass
  ) THEN
    ALTER TABLE procurements.sms_exam_result_students
      ADD CONSTRAINT sms_exam_result_students_scan_source_check
      CHECK (scan_source IN ('manual', 'scan'));
  END IF;
END $$;

COMMENT ON COLUMN procurements.sms_exam_result_students.answers IS
  'Raw response per item, positionally (answers[i] -> item i). Empty string = blank, ? = unresolved multi-mark. Empty array = hand-encoded row.';

-- ----------------------------------------------------------------------------
-- 3. RLS + GRANTS (permissive authenticated; scoping enforced in the app layer,
--    matching 099/100/101 for this module)
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_exam_answer_keys ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT := 'sms_exam_answer_keys';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'procurements' AND tablename = t
  ) THEN
    EXECUTE format('CREATE POLICY "%1$s: select" ON procurements.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: insert" ON procurements.%1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: update" ON procurements.%1$s FOR UPDATE USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('CREATE POLICY "%1$s: delete" ON procurements.%1$s FOR DELETE USING (auth.role() = ''authenticated'')', t);
  END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.%1$s TO authenticated', t);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE procurements.%1$s_id_seq TO authenticated', t);
END $$;
