-- ============================================================================
-- 195 — Division competency catalogue, Least Learned Competencies, and the
--       QA-reviewed Question Bank
--
-- Spec: docs/superpowers/specs/2026-10-01-division-question-bank-design.md
--
-- The DepEd flow this implements:
--   1. A QA-authorized teacher sees the Least Learned Competencies (LLC) of a
--      learning area + grade, pooled from every Summative Test result in the
--      division (Term Exams never count).
--   2. They write questions for those competencies; each is QA-reviewed and,
--      once approved, is in the Question Bank.
--   3. A division exam item is taken from the bank or written new.
--   4. QA reviews the questionnaire as a whole (194, unchanged in its rules).
--
-- Pooling across teachers needs to know that two TOS name the SAME
-- competency, so every TOS now picks its learning area and competencies from a
-- division catalogue (sms_learning_areas / sms_competency_catalogue). The
-- picked text and LC code are COPIED onto sms_tos_competencies, so a printed
-- TOS still reads its own row (the 112/121/152 snapshot rule).
--
-- Nothing existing is rewritten: new tables, nullable columns, no backfill, no
-- DML. 194's functions are replaced with identical signatures.
--
-- OPERATIONAL PREREQUISITE: once this is applied, saving any TOS (new, or an
-- edit to an existing one) is refused until the catalogue holds that TOS's
-- learning area and competencies. Import the catalogue (Division Office →
-- Competency Catalogue → Import) IMMEDIATELY after applying.
--
-- Before applying to production (the user's job — never an agent's), these
-- read-only counts are what the migration must leave unchanged:
--   SELECT count(*) FROM procurements.sms_tos;
--   SELECT count(*) FROM procurements.sms_tos_competencies;
--   SELECT count(*) FROM procurements.sms_exam_questions;
--   SELECT count(*) FROM procurements.sms_exam_review_events;
-- (section 12 carries the post-apply grant check)
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. Catalogue tables. No DELETE policy anywhere: entries are retired
--    (is_active = false), never removed, and ON DELETE RESTRICT protects every
--    TOS and bank question pointing at one (the 116 lesson).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_learning_areas (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL CHECK (btrim(name) <> ''),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_learning_areas_name
  ON procurements.sms_learning_areas (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS procurements.sms_competency_catalogue (
  id               BIGSERIAL PRIMARY KEY,
  learning_area_id BIGINT NOT NULL
                     REFERENCES procurements.sms_learning_areas(id) ON DELETE RESTRICT,
  grade_level      INTEGER NOT NULL CHECK (grade_level BETWEEN 0 AND 12),
  lc_code          TEXT NOT NULL CHECK (lc_code <> ''),
  competency_text  TEXT NOT NULL CHECK (btrim(competency_text) <> ''),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_by       BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (learning_area_id, grade_level, lc_code)
);
CREATE INDEX IF NOT EXISTS idx_sms_competency_catalogue_pick
  ON procurements.sms_competency_catalogue (learning_area_id, grade_level, is_active);

DROP TRIGGER IF EXISTS update_sms_learning_areas_updated_at ON procurements.sms_learning_areas;
CREATE TRIGGER update_sms_learning_areas_updated_at
  BEFORE UPDATE ON procurements.sms_learning_areas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_sms_competency_catalogue_updated_at ON procurements.sms_competency_catalogue;
CREATE TRIGGER update_sms_competency_catalogue_updated_at
  BEFORE UPDATE ON procurements.sms_competency_catalogue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- LC codes are the human key: stored trimmed, upper-cased, without spaces, so
-- " m5ns-ia-1 " and "M5NS-IA-1" are one entry. Mirrors normalizeLcCode() in
-- lib/utils/questionBank.ts.
CREATE OR REPLACE FUNCTION procurements.catalogue_normalize()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.lc_code := upper(regexp_replace(COALESCE(NEW.lc_code, ''), '\s+', '', 'g'));
  NEW.competency_text := btrim(regexp_replace(NEW.competency_text, '\s+', ' ', 'g'));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sms_competency_catalogue_normalize ON procurements.sms_competency_catalogue;
CREATE TRIGGER sms_competency_catalogue_normalize
  BEFORE INSERT OR UPDATE ON procurements.sms_competency_catalogue
  FOR EACH ROW EXECUTE FUNCTION procurements.catalogue_normalize();

-- ----------------------------------------------------------------------------
-- 2. Links on existing tables (nullable, nothing backfilled)
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_tos
  ADD COLUMN IF NOT EXISTS learning_area_id BIGINT
    REFERENCES procurements.sms_learning_areas(id) ON DELETE RESTRICT;
ALTER TABLE procurements.sms_tos_competencies
  ADD COLUMN IF NOT EXISTS catalogue_competency_id BIGINT
    REFERENCES procurements.sms_competency_catalogue(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_sms_tos_learning_area
  ON procurements.sms_tos (learning_area_id, grade_level, school_year);
CREATE INDEX IF NOT EXISTS idx_sms_tos_competencies_catalogue
  ON procurements.sms_tos_competencies (catalogue_competency_id);

-- ----------------------------------------------------------------------------
-- 3. Catalogue access and the TOS guards
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.can_manage_catalogue()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT procurements.is_exam_oversight() OR procurements.is_exam_qa();
$$;

ALTER TABLE procurements.sms_learning_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_competency_catalogue ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON procurements.sms_learning_areas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON procurements.sms_competency_catalogue TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_learning_areas_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_competency_catalogue_id_seq TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_learning_areas', 'sms_competency_catalogue'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: select" ON procurements.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: insert" ON procurements.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: update" ON procurements.%1$I', t);
    -- Every TOS builder reads the catalogue.
    EXECUTE format($p$CREATE POLICY "%1$s: select" ON procurements.%1$I
      FOR SELECT TO authenticated USING (true)$p$, t);
    EXECUTE format($p$CREATE POLICY "%1$s: insert" ON procurements.%1$I
      FOR INSERT TO authenticated WITH CHECK (procurements.can_manage_catalogue())$p$, t);
    EXECUTE format($p$CREATE POLICY "%1$s: update" ON procurements.%1$I
      FOR UPDATE TO authenticated
      USING (procurements.can_manage_catalogue())
      WITH CHECK (procurements.can_manage_catalogue())$p$, t);
    -- No DELETE policy, deliberately.
  END LOOP;
END $$;

-- A TOS must name a catalogue learning area whenever its content is written.
-- An UPDATE that touches only bookkeeping columns — archive (is_active), the
-- review workflow (194), or an FK's ON DELETE SET NULL (created_by,
-- reviewed_by, subject_id — the only three on sms_tos) — is never checked.
-- An archived TOS, and an approved division TOS, are never re-checked at all
-- (spec R3): archived/approved rows stay exactly as they were.
CREATE OR REPLACE FUNCTION procurements.tos_guard_catalogue()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_skip   CONSTANT TEXT[] := ARRAY['is_active', 'updated_at', 'review_status',
    'submitted_at', 'reviewed_by', 'reviewed_at', 'review_comment', 'created_by', 'subject_id'];
  v_name   TEXT;
  v_active BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - v_skip) = (to_jsonb(OLD) - v_skip) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.is_active = false
     OR (OLD.school_id IS NULL AND OLD.review_status = 'approved')) THEN
    RETURN NEW;
  END IF;
  IF NEW.learning_area_id IS NULL THEN
    RAISE EXCEPTION 'Choose a learning area from the competency catalogue.';
  END IF;
  SELECT a.name, a.is_active INTO v_name, v_active
  FROM procurements.sms_learning_areas a WHERE a.id = NEW.learning_area_id;
  IF (TG_OP = 'INSERT' OR NEW.learning_area_id IS DISTINCT FROM OLD.learning_area_id)
     AND NOT v_active THEN
    RAISE EXCEPTION 'The learning area "%" has been retired.', v_name;
  END IF;
  NEW.subject_name := v_name;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sms_tos_guard_catalogue ON procurements.sms_tos;
CREATE TRIGGER sms_tos_guard_catalogue
  BEFORE INSERT OR UPDATE ON procurements.sms_tos
  FOR EACH ROW EXECUTE FUNCTION procurements.tos_guard_catalogue();

-- Each competency row must point at a catalogue entry of its TOS's learning
-- area and grade. The entry's text and LC code are copied over the client's.
CREATE OR REPLACE FUNCTION procurements.tos_competency_guard_catalogue()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  c       RECORD;
  v_area  BIGINT;
  v_grade INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'updated_at') = (to_jsonb(OLD) - 'updated_at') THEN
    RETURN NEW;
  END IF;
  -- An archived TOS or an approved division TOS is never re-checked (spec R3).
  IF EXISTS (SELECT 1 FROM procurements.sms_tos t WHERE t.id = NEW.tos_id
             AND (t.is_active = false OR (t.school_id IS NULL AND t.review_status = 'approved'))) THEN
    RETURN NEW;
  END IF;
  IF NEW.catalogue_competency_id IS NULL THEN
    RAISE EXCEPTION 'Pick each competency from the competency catalogue.';
  END IF;
  SELECT * INTO c FROM procurements.sms_competency_catalogue WHERE id = NEW.catalogue_competency_id;
  SELECT t.learning_area_id, t.grade_level INTO v_area, v_grade
  FROM procurements.sms_tos t WHERE t.id = NEW.tos_id;
  IF c.learning_area_id IS DISTINCT FROM v_area OR c.grade_level IS DISTINCT FROM v_grade THEN
    RAISE EXCEPTION 'Competency % is not in this TOS''s learning area and grade.', c.lc_code;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.catalogue_competency_id IS DISTINCT FROM OLD.catalogue_competency_id)
     AND NOT c.is_active THEN
    RAISE EXCEPTION 'Competency % has been retired from the catalogue.', c.lc_code;
  END IF;
  NEW.competency_text := c.competency_text;
  NEW.lc_code := c.lc_code;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sms_tos_competencies_guard_catalogue ON procurements.sms_tos_competencies;
CREATE TRIGGER sms_tos_competencies_guard_catalogue
  BEFORE INSERT OR UPDATE ON procurements.sms_tos_competencies
  FOR EACH ROW EXECUTE FUNCTION procurements.tos_competency_guard_catalogue();

-- ----------------------------------------------------------------------------
-- 4. Least Learned Competencies. Pooled across EVERY Summative Test result in
--    the division — private, school-wide and division exams alike — which RLS
--    hides from any one caller, so the readers are SECURITY DEFINER and only
--    aggregates leave them (the 193 pattern). Term Exam results never count.
--    Archived TOS / exams still count: their results are real learner data.
--
--    Per catalogue competency: MPS = correct responses / (items x learners),
--    lib/utils/itemAnalysis.ts's formula, pooled. Scorable items are the
--    exam's non-essay authored questions (expanded by item_count), or — for a
--    paper exam keyed directly (132) — its keyed answer-key items.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.llc_count()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 3 $$;

CREATE OR REPLACE FUNCTION procurements.can_view_llc()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT procurements.is_division_author() OR procurements.is_exam_qa()
      OR procurements.is_exam_oversight();
$$;

CREATE OR REPLACE FUNCTION procurements.llc_pooled_stats(
  p_learning_area_id BIGINT, p_grade_level INTEGER, p_school_year TEXT)
RETURNS TABLE (catalogue_competency_id BIGINT, correct BIGINT, total BIGINT,
               mps NUMERIC, learners BIGINT, sections BIGINT, schools BIGINT,
               results BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  WITH res AS (
    SELECT r.id AS result_id, r.exam_id, r.section_id, r.school_id
    FROM procurements.sms_exam_results r
    JOIN procurements.sms_exams e ON e.id = r.exam_id
    JOIN procurements.sms_tos t ON t.id = e.tos_id
    WHERE r.school_year = p_school_year
      AND t.exam_type = 'Summative Test'
      AND t.learning_area_id = p_learning_area_id
      AND t.grade_level = p_grade_level
  ),
  q_items AS (
    SELECT q.exam_id, q.item_number + g.k AS item_number
    FROM procurements.sms_exam_questions q
    CROSS JOIN LATERAL generate_series(0, GREATEST(q.item_count, 1) - 1) AS g(k)
    WHERE q.exam_id IN (SELECT exam_id FROM res) AND q.question_type <> 'essay'
  ),
  k_items AS (
    SELECT k.exam_id, k.item_number
    FROM procurements.sms_exam_answer_keys k
    WHERE k.exam_id IN (SELECT exam_id FROM res)
      AND NULLIF(btrim(k.correct_answer), '') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM q_items qi WHERE qi.exam_id = k.exam_id)
  ),
  items AS (SELECT * FROM q_items UNION SELECT * FROM k_items),
  per_comp AS (
    SELECT i.exam_id, c.catalogue_competency_id,
           array_agg(DISTINCT i.item_number) AS item_numbers
    FROM items i
    JOIN procurements.sms_exams e ON e.id = i.exam_id
    JOIN procurements.sms_tos_items ti ON ti.tos_id = e.tos_id AND ti.item_number = i.item_number
    JOIN procurements.sms_tos_competencies c ON c.id = ti.competency_id
    JOIN procurements.sms_competency_catalogue cat ON cat.id = c.catalogue_competency_id
    WHERE cat.learning_area_id = p_learning_area_id AND cat.grade_level = p_grade_level
    GROUP BY i.exam_id, c.catalogue_competency_id
  ),
  learner_rows AS (
    SELECT res.result_id, res.section_id, res.school_id, s.student_id,
           pc.catalogue_competency_id,
           cardinality(pc.item_numbers) AS n,
           (SELECT count(*) FROM unnest(pc.item_numbers) it
            WHERE it = ANY (s.correct_items)) AS ok
    FROM res
    JOIN procurements.sms_exam_result_students s ON s.result_id = res.result_id
    JOIN per_comp pc ON pc.exam_id = res.exam_id
  )
  SELECT lr.catalogue_competency_id,
         sum(lr.ok)::BIGINT,
         sum(lr.n)::BIGINT,
         round(sum(lr.ok)::NUMERIC * 100 / NULLIF(sum(lr.n), 0), 2),
         count(DISTINCT lr.student_id)::BIGINT,
         count(DISTINCT lr.section_id)::BIGINT,
         count(DISTINCT lr.school_id)::BIGINT,
         count(DISTINCT lr.result_id)::BIGINT
  FROM learner_rows lr
  GROUP BY lr.catalogue_competency_id
  HAVING sum(lr.n) > 0;
$$;

-- The cut: every competency whose MPS is at or below the llc_count()-th
-- lowest (ties at the cut kept); fewer than llc_count() returns them all.
-- Mirrors llcCut() in lib/utils/questionBank.ts.
CREATE OR REPLACE FUNCTION procurements.llc_competency_ids(
  p_learning_area_id BIGINT, p_grade_level INTEGER, p_school_year TEXT)
RETURNS SETOF BIGINT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  WITH s AS (
    SELECT * FROM procurements.llc_pooled_stats(p_learning_area_id, p_grade_level, p_school_year)
  ), cut AS (
    SELECT s.mps FROM s ORDER BY s.mps ASC OFFSET procurements.llc_count() - 1 LIMIT 1
  )
  SELECT s.catalogue_competency_id FROM s
  WHERE NOT EXISTS (SELECT 1 FROM cut) OR s.mps <= (SELECT cut.mps FROM cut);
$$;

CREATE OR REPLACE FUNCTION procurements.division_llc(
  p_learning_area_id BIGINT, p_grade_level INTEGER, p_school_year TEXT)
RETURNS TABLE (catalogue_competency_id BIGINT, lc_code TEXT, competency_text TEXT,
               mps NUMERIC, learners BIGINT, sections BIGINT, schools BIGINT,
               results BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
BEGIN
  IF NOT procurements.can_view_llc() THEN
    RAISE EXCEPTION 'You are not allowed to view the Least Learned Competencies.';
  END IF;
  RETURN QUERY
  SELECT s.catalogue_competency_id, cat.lc_code, cat.competency_text, s.mps,
         s.learners, s.sections, s.schools, s.results
  FROM procurements.llc_pooled_stats(p_learning_area_id, p_grade_level, p_school_year) s
  JOIN procurements.sms_competency_catalogue cat ON cat.id = s.catalogue_competency_id
  WHERE s.catalogue_competency_id IN (
    SELECT procurements.llc_competency_ids(p_learning_area_id, p_grade_level, p_school_year))
  ORDER BY s.mps ASC, cat.lc_code;
END;
$$;

CREATE OR REPLACE FUNCTION procurements.division_llc_coverage(
  p_learning_area_id BIGINT, p_grade_level INTEGER, p_school_year TEXT)
RETURNS TABLE (results BIGINT, schools BIGINT, learners BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
BEGIN
  IF NOT procurements.can_view_llc() THEN
    RAISE EXCEPTION 'You are not allowed to view the Least Learned Competencies.';
  END IF;
  RETURN QUERY
  SELECT count(DISTINCT r.id)::BIGINT, count(DISTINCT r.school_id)::BIGINT,
         count(DISTINCT s.student_id)::BIGINT
  FROM procurements.sms_exam_results r
  JOIN procurements.sms_exams e ON e.id = r.exam_id
  JOIN procurements.sms_tos t ON t.id = e.tos_id
  LEFT JOIN procurements.sms_exam_result_students s ON s.result_id = r.id
  WHERE r.school_year = p_school_year
    AND t.exam_type = 'Summative Test'
    AND t.learning_area_id = p_learning_area_id
    AND t.grade_level = p_grade_level;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  procurements.llc_pooled_stats(BIGINT, INTEGER, TEXT),
  procurements.llc_competency_ids(BIGINT, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Bank tables. A bank question belongs to a catalogue competency, carries
--    its own cognitive level (set by the author, correctable by QA), and the
--    school year of the LLC list it was written from. Review columns are 194's.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_exam_bank_questions (
  id                      BIGSERIAL PRIMARY KEY,
  catalogue_competency_id BIGINT NOT NULL
                            REFERENCES procurements.sms_competency_catalogue(id) ON DELETE RESTRICT,
  cognitive_level         TEXT NOT NULL CHECK (cognitive_level IN (
                            'remembering', 'understanding', 'applying',
                            'analyzing', 'evaluating', 'creating')),
  source_llc_school_year  TEXT NOT NULL,
  question_type           TEXT NOT NULL CHECK (question_type IN (
                            'multiple_choice', 'true_false', 'modified_true_false',
                            'matching', 'short_answer', 'completion', 'essay')),
  question_text           TEXT,
  answer_key              TEXT,
  image_path              TEXT,
  image_name              TEXT,
  created_by              BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  review_status           TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN (
                            'draft', 'submitted', 'under_review', 'approved', 'rejected')),
  submitted_at            TIMESTAMPTZ,
  reviewed_by             BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  reviewed_at             TIMESTAMPTZ,
  review_comment          TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_exam_bank_questions_pick
  ON procurements.sms_exam_bank_questions (catalogue_competency_id, review_status, cognitive_level);
CREATE INDEX IF NOT EXISTS idx_sms_exam_bank_questions_author
  ON procurements.sms_exam_bank_questions (created_by);

CREATE TABLE IF NOT EXISTS procurements.sms_exam_bank_options (
  id          BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL
                REFERENCES procurements.sms_exam_bank_questions(id) ON DELETE CASCADE,
  label       TEXT,
  choice_text TEXT,
  is_correct  BOOLEAN NOT NULL DEFAULT false,
  position    INTEGER NOT NULL DEFAULT 0,
  image_path  TEXT,
  image_name  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_exam_bank_options_question
  ON procurements.sms_exam_bank_options (question_id, position);

DROP TRIGGER IF EXISTS update_sms_exam_bank_questions_updated_at ON procurements.sms_exam_bank_questions;
CREATE TRIGGER update_sms_exam_bank_questions_updated_at
  BEFORE UPDATE ON procurements.sms_exam_bank_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_sms_exam_bank_options_updated_at ON procurements.sms_exam_bank_options;
CREATE TRIGGER update_sms_exam_bank_options_updated_at
  BEFORE UPDATE ON procurements.sms_exam_bank_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 6. Rules in one place each, and the access helpers. Three separate
--    decisions — contribute, browse, review — each its own helper even where
--    two coincide today.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.bank_supported_types()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['multiple_choice', 'true_false']::TEXT[];
$$;

CREATE OR REPLACE FUNCTION procurements.can_contribute_bank()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT procurements.is_division_author();
$$;

CREATE OR REPLACE FUNCTION procurements.can_browse_bank()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT procurements.is_division_author() OR procurements.is_exam_qa()
      OR procurements.is_exam_oversight();
$$;

CREATE OR REPLACE FUNCTION procurements.can_review_bank()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT procurements.is_exam_qa();
$$;

CREATE OR REPLACE FUNCTION procurements.can_edit_bank_question(p_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_exam_bank_questions b
    WHERE b.id = p_id
      AND b.created_by = procurements.exam_me_id()
      AND b.review_status IN ('draft', 'rejected')
      AND procurements.can_contribute_bank());
$$;

-- The answer-sheet letter a bank question scores on: the correct option's
-- letter by position for MC, A (True) / B (False) for TF — the rule
-- deriveAnswerKeyFromQuestions() in lib/utils/examAnswerKey.ts applies.
CREATE OR REPLACE FUNCTION procurements.bank_expected_key(p_bank_id BIGINT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT CASE b.question_type
    WHEN 'true_false' THEN CASE b.answer_key WHEN 'True' THEN 'A' WHEN 'False' THEN 'B' END
    WHEN 'multiple_choice' THEN (
      SELECT chr(64 + o.rn::INT) FROM (
        SELECT op.is_correct, row_number() OVER (ORDER BY op.position, op.id) AS rn
        FROM procurements.sms_exam_bank_options op WHERE op.question_id = b.id) o
      WHERE o.is_correct LIMIT 1)
  END
  FROM procurements.sms_exam_bank_questions b WHERE b.id = p_bank_id;
$$;
REVOKE EXECUTE ON FUNCTION procurements.bank_expected_key(BIGINT) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. Guard + RLS. Insert always lands as draft; review fields move only inside
--    194's workflow flag; the competency, LLC year and author are immutable
--    (author → NULL admitted for the FK's ON DELETE SET NULL, per 194). A
--    question can only be STARTED for a competency on the current LLC list.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.bank_guard_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_area  BIGINT;
  v_grade INTEGER;
BEGIN
  NEW.question_text := NULLIF(btrim(NEW.question_text), '');
  NEW.image_path := NULLIF(btrim(NEW.image_path), '');
  NEW.answer_key := NULLIF(btrim(NEW.answer_key), '');
  IF NEW.question_type = 'true_false' THEN
    NEW.answer_key := CASE
      WHEN lower(NEW.answer_key) LIKE 'true%' THEN 'True'
      WHEN lower(NEW.answer_key) LIKE 'false%' THEN 'False' END;
  END IF;

  IF current_setting('sms.exam_review', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.review_status := 'draft';
    NEW.submitted_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_comment := NULL;
    IF NOT (NEW.question_type = ANY (procurements.bank_supported_types())) THEN
      RAISE EXCEPTION 'This question type is not accepted in the Question Bank yet.';
    END IF;
    SELECT c.learning_area_id, c.grade_level INTO v_area, v_grade
    FROM procurements.sms_competency_catalogue c WHERE c.id = NEW.catalogue_competency_id;
    IF NOT EXISTS (
      SELECT 1 FROM procurements.llc_competency_ids(v_area, v_grade, NEW.source_llc_school_year) x
      WHERE x = NEW.catalogue_competency_id) THEN
      RAISE EXCEPTION 'Questions can only be started for a competency on the Least Learned list for %.',
        NEW.source_llc_school_year;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL THEN
    RAISE EXCEPTION 'The author of a Question Bank question cannot be changed.';
  END IF;
  IF NEW.catalogue_competency_id IS DISTINCT FROM OLD.catalogue_competency_id
     OR NEW.source_llc_school_year IS DISTINCT FROM OLD.source_llc_school_year THEN
    RAISE EXCEPTION 'The competency of a Question Bank question cannot be changed; write a new question.';
  END IF;
  IF NEW.review_status  IS DISTINCT FROM OLD.review_status
  OR NEW.submitted_at   IS DISTINCT FROM OLD.submitted_at
  OR (NEW.reviewed_by   IS DISTINCT FROM OLD.reviewed_by AND NEW.reviewed_by IS NOT NULL)
  OR NEW.reviewed_at    IS DISTINCT FROM OLD.reviewed_at
  OR NEW.review_comment IS DISTINCT FROM OLD.review_comment THEN
    RAISE EXCEPTION 'Review status changes only through the QA review workflow.';
  END IF;
  -- Once submitted, the level is QA's to correct (bank_question_set_level,
  -- which runs inside the workflow flag and so never reaches this line).
  IF NEW.cognitive_level IS DISTINCT FROM OLD.cognitive_level
     AND OLD.review_status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'The cognitive level of a submitted question changes only through QA review.';
  END IF;
  IF NEW.question_type IS DISTINCT FROM OLD.question_type
     AND NOT (NEW.question_type = ANY (procurements.bank_supported_types())) THEN
    RAISE EXCEPTION 'This question type is not accepted in the Question Bank yet.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sms_exam_bank_questions_guard ON procurements.sms_exam_bank_questions;
CREATE TRIGGER sms_exam_bank_questions_guard
  BEFORE INSERT OR UPDATE ON procurements.sms_exam_bank_questions
  FOR EACH ROW EXECUTE FUNCTION procurements.bank_guard_fields();

ALTER TABLE procurements.sms_exam_bank_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_exam_bank_options ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_exam_bank_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_exam_bank_options TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_exam_bank_questions_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_exam_bank_options_id_seq TO authenticated;

DROP POLICY IF EXISTS "sms_exam_bank_questions: select" ON procurements.sms_exam_bank_questions;
DROP POLICY IF EXISTS "sms_exam_bank_questions: insert" ON procurements.sms_exam_bank_questions;
DROP POLICY IF EXISTS "sms_exam_bank_questions: update" ON procurements.sms_exam_bank_questions;
DROP POLICY IF EXISTS "sms_exam_bank_questions: delete" ON procurements.sms_exam_bank_questions;
CREATE POLICY "sms_exam_bank_questions: select" ON procurements.sms_exam_bank_questions
  FOR SELECT TO authenticated
  USING (created_by = procurements.exam_me_id()
         OR procurements.can_review_bank()
         OR procurements.is_exam_oversight()
         OR (review_status = 'approved' AND procurements.can_browse_bank()));
CREATE POLICY "sms_exam_bank_questions: insert" ON procurements.sms_exam_bank_questions
  FOR INSERT TO authenticated
  WITH CHECK (procurements.can_contribute_bank() AND created_by = procurements.exam_me_id());
CREATE POLICY "sms_exam_bank_questions: update" ON procurements.sms_exam_bank_questions
  FOR UPDATE TO authenticated
  USING (procurements.can_edit_bank_question(id))
  WITH CHECK (procurements.can_edit_bank_question(id));
CREATE POLICY "sms_exam_bank_questions: delete" ON procurements.sms_exam_bank_questions
  FOR DELETE TO authenticated
  USING (procurements.can_edit_bank_question(id)
         AND NOT procurements.exam_has_approve_event('question', id));

DROP POLICY IF EXISTS "sms_exam_bank_options: select" ON procurements.sms_exam_bank_options;
DROP POLICY IF EXISTS "sms_exam_bank_options: insert" ON procurements.sms_exam_bank_options;
DROP POLICY IF EXISTS "sms_exam_bank_options: update" ON procurements.sms_exam_bank_options;
DROP POLICY IF EXISTS "sms_exam_bank_options: delete" ON procurements.sms_exam_bank_options;
CREATE POLICY "sms_exam_bank_options: select" ON procurements.sms_exam_bank_options
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM procurements.sms_exam_bank_questions b
                 WHERE b.id = sms_exam_bank_options.question_id));
CREATE POLICY "sms_exam_bank_options: insert" ON procurements.sms_exam_bank_options
  FOR INSERT TO authenticated WITH CHECK (procurements.can_edit_bank_question(question_id));
CREATE POLICY "sms_exam_bank_options: update" ON procurements.sms_exam_bank_options
  FOR UPDATE TO authenticated
  USING (procurements.can_edit_bank_question(question_id))
  WITH CHECK (procurements.can_edit_bank_question(question_id));
CREATE POLICY "sms_exam_bank_options: delete" ON procurements.sms_exam_bank_options
  FOR DELETE TO authenticated USING (procurements.can_edit_bank_question(question_id));

-- ----------------------------------------------------------------------------
-- 8. 194's workflow learns the entity 'question'. Same signatures, so
--    CREATE OR REPLACE; 194's file is untouched. exam_review_start / _decide /
--    _withdraw / _transition need no change: is_exam_qa() is can_review_bank()
--    today and the bank table carries every column the transition writes.
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_exam_review_events
  DROP CONSTRAINT IF EXISTS sms_exam_review_events_entity_type_check;
ALTER TABLE procurements.sms_exam_review_events
  ADD CONSTRAINT sms_exam_review_events_entity_type_check
  CHECK (entity_type IN ('tos', 'exam', 'author', 'question'));
ALTER TABLE procurements.sms_exam_review_events
  DROP CONSTRAINT IF EXISTS sms_exam_review_events_action_check;
ALTER TABLE procurements.sms_exam_review_events
  ADD CONSTRAINT sms_exam_review_events_action_check
  CHECK (action IN ('authorize', 'revoke', 'submit', 'withdraw', 'start_review',
                    'approve', 'reject', 'reopen', 'set_level'));

DROP POLICY IF EXISTS "sms_exam_review_events: select" ON procurements.sms_exam_review_events;
CREATE POLICY "sms_exam_review_events: select" ON procurements.sms_exam_review_events
  FOR SELECT TO authenticated
  USING (
    procurements.is_exam_qa() OR procurements.is_exam_oversight()
    OR (entity_type = 'tos' AND EXISTS (
          SELECT 1 FROM procurements.sms_tos t
          WHERE t.id = entity_id AND t.created_by = procurements.exam_me_id()))
    OR (entity_type = 'exam' AND EXISTS (
          SELECT 1 FROM procurements.sms_exams e
          WHERE e.id = entity_id AND e.created_by = procurements.exam_me_id()))
    OR (entity_type = 'author' AND EXISTS (
          SELECT 1 FROM procurements.sms_exam_qa_authors a
          WHERE a.id = entity_id AND a.user_id = procurements.exam_me_id()))
    OR (entity_type = 'question' AND EXISTS (
          SELECT 1 FROM procurements.sms_exam_bank_questions b
          WHERE b.id = entity_id AND b.created_by = procurements.exam_me_id())));

CREATE OR REPLACE FUNCTION procurements.exam_review_table(p_entity TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_entity = 'tos' THEN RETURN 'sms_tos'; END IF;
  IF p_entity = 'exam' THEN RETURN 'sms_exams'; END IF;
  IF p_entity = 'question' THEN RETURN 'sms_exam_bank_questions'; END IF;
  RAISE EXCEPTION 'Unknown review item "%".', p_entity;
END;
$$;

-- Bank rows have no school_id: they are always division rows.
CREATE OR REPLACE FUNCTION procurements.exam_review_load(
  p_entity TEXT, p_id BIGINT,
  OUT o_status TEXT, OUT o_created_by BIGINT, OUT o_tos_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_school BIGINT;
  v_found  INT;
BEGIN
  EXECUTE format(
    'SELECT review_status, created_by, %s, %s FROM procurements.%I WHERE id = $1 FOR UPDATE',
    CASE p_entity WHEN 'question' THEN 'NULL::BIGINT' ELSE 'school_id' END,
    CASE p_entity WHEN 'exam' THEN 'tos_id' ELSE 'NULL::BIGINT' END,
    procurements.exam_review_table(p_entity))
  INTO o_status, o_created_by, v_school, o_tos_id
  USING p_id;
  GET DIAGNOSTICS v_found = ROW_COUNT;

  IF v_found = 0 THEN
    RAISE EXCEPTION 'That item does not exist.';
  END IF;
  IF v_school IS NOT NULL THEN
    RAISE EXCEPTION 'Only Division TOS and exams go through QA review.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_review_submit(p_entity TEXT, p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  r     RECORD;
  b     RECORD;
  v_bad TEXT;
  v_n   INTEGER;
BEGIN
  SELECT * INTO r FROM procurements.exam_review_load(p_entity, p_id);

  IF r.o_created_by IS DISTINCT FROM procurements.exam_me_id() THEN
    RAISE EXCEPTION 'Only the author can submit this for review.';
  END IF;
  IF p_entity = 'question' THEN
    IF NOT procurements.can_contribute_bank() THEN
      RAISE EXCEPTION 'You are not currently authorized to write Question Bank questions.';
    END IF;
  ELSIF NOT procurements.is_division_author() THEN
    RAISE EXCEPTION 'You are not currently authorized to write Division TOS or exams.';
  END IF;
  IF r.o_status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Only a draft or returned item can be submitted (this one is %).', r.o_status;
  END IF;

  IF p_entity = 'tos' THEN
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_tos_competencies c WHERE c.tos_id = p_id) THEN
      RAISE EXCEPTION 'Add at least one competency before submitting.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_tos t
                   WHERE t.id = p_id AND t.learning_area_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Choose a learning area from the competency catalogue before submitting.';
    END IF;
    SELECT c.competency_text INTO v_bad FROM procurements.sms_tos_competencies c
    WHERE c.tos_id = p_id AND c.catalogue_competency_id IS NULL
    ORDER BY c.position LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Competency "%" is not linked to the competency catalogue.', v_bad;
    END IF;
  ELSIF p_entity = 'exam' THEN
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_tos t
                   WHERE t.id = r.o_tos_id AND t.school_id IS NULL
                     AND t.review_status = 'approved') THEN
      RAISE EXCEPTION 'This exam''s TOS is not an approved Division TOS.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_exam_questions q WHERE q.exam_id = p_id) THEN
      RAISE EXCEPTION 'Add at least one question before submitting.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_exam_answer_keys k WHERE k.exam_id = p_id) THEN
      RAISE EXCEPTION 'Set the answer key before submitting.';
    END IF;
    -- (section 10 adds the bank-item checks here)
  ELSE
    SELECT * INTO b FROM procurements.sms_exam_bank_questions WHERE id = p_id;
    IF NOT (b.question_type = ANY (procurements.bank_supported_types())) THEN
      RAISE EXCEPTION 'This question type is not accepted in the Question Bank yet.';
    END IF;
    IF b.question_text IS NULL AND b.image_path IS NULL THEN
      RAISE EXCEPTION 'Write the question (or add a figure) before submitting.';
    END IF;
    IF b.question_type = 'multiple_choice' THEN
      SELECT count(*) INTO v_n FROM procurements.sms_exam_bank_options o WHERE o.question_id = p_id;
      IF v_n < 2 OR v_n > 5 THEN
        RAISE EXCEPTION 'A multiple-choice question needs 2 to 5 choices.';
      END IF;
      IF (SELECT count(*) FROM procurements.sms_exam_bank_options o
          WHERE o.question_id = p_id AND o.is_correct) <> 1 THEN
        RAISE EXCEPTION 'Mark exactly one choice as correct.';
      END IF;
      IF EXISTS (SELECT 1 FROM procurements.sms_exam_bank_options o
                 WHERE o.question_id = p_id
                   AND NULLIF(btrim(o.choice_text), '') IS NULL
                   AND NULLIF(btrim(o.image_path), '') IS NULL) THEN
        RAISE EXCEPTION 'Every choice needs text or a figure.';
      END IF;
    ELSIF b.answer_key IS NULL OR b.answer_key NOT IN ('True', 'False') THEN
      RAISE EXCEPTION 'Choose True or False as the answer.';
    END IF;
  END IF;

  PERFORM procurements.exam_review_transition(
    p_entity, p_id, 'submit', r.o_status, 'submitted', NULL, r.o_created_by);
END;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_review_reopen(
  p_entity TEXT, p_id BIGINT, p_comment TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  r RECORD;
  v_comment TEXT := NULLIF(btrim(p_comment), '');
BEGIN
  IF NOT procurements.is_exam_qa() THEN
    RAISE EXCEPTION 'Only a QA reviewer may reopen Division TOS and exams.';
  END IF;
  SELECT * INTO r FROM procurements.exam_review_load(p_entity, p_id);
  IF r.o_status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved item can be reopened.';
  END IF;
  IF v_comment IS NULL THEN
    RAISE EXCEPTION 'A reason is required to reopen an item.';
  END IF;
  IF NOT procurements.exam_has_approve_event(p_entity, p_id) THEN
    RAISE EXCEPTION 'This item predates QA review and has no author who can edit it; create a new one instead.';
  END IF;
  IF p_entity = 'exam' AND EXISTS (
       SELECT 1 FROM procurements.sms_exam_results x WHERE x.exam_id = p_id) THEN
    RAISE EXCEPTION 'Results have already been recorded against this exam; create a new set instead.';
  END IF;
  IF p_entity = 'tos' AND EXISTS (
       SELECT 1 FROM procurements.sms_exams e WHERE e.tos_id = p_id) THEN
    RAISE EXCEPTION 'An exam has been built on this TOS; create a new TOS instead.';
  END IF;
  -- Nested, not AND-ed: plpgsql plans an IF condition whole, so the column
  -- (section 9) is only referenced on the question path.
  IF p_entity = 'question' THEN
    IF EXISTS (SELECT 1 FROM procurements.sms_exam_questions q
               WHERE q.source_bank_question_id = p_id) THEN
      RAISE EXCEPTION 'This question is used in an exam; write a new question instead.';
    END IF;
  END IF;

  PERFORM procurements.exam_review_transition(
    p_entity, p_id, 'reopen', r.o_status, 'draft', v_comment, r.o_created_by);
END;
$$;

-- QA corrects the cognitive level while reviewing; audited as set_level.
CREATE OR REPLACE FUNCTION procurements.bank_question_set_level(p_id BIGINT, p_level TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  r     RECORD;
  v_old TEXT;
BEGIN
  IF NOT procurements.can_review_bank() THEN
    RAISE EXCEPTION 'Only a QA reviewer may change a question''s cognitive level.';
  END IF;
  IF p_level NOT IN ('remembering', 'understanding', 'applying',
                     'analyzing', 'evaluating', 'creating') THEN
    RAISE EXCEPTION 'Unknown cognitive level "%".', p_level;
  END IF;
  SELECT * INTO r FROM procurements.exam_review_load('question', p_id);
  IF r.o_created_by = procurements.exam_me_id() THEN
    RAISE EXCEPTION 'You cannot review your own submission.';
  END IF;
  IF r.o_status <> 'under_review' THEN
    RAISE EXCEPTION 'Start the review before changing the cognitive level.';
  END IF;
  SELECT b.cognitive_level INTO v_old FROM procurements.sms_exam_bank_questions b WHERE b.id = p_id;
  IF v_old = p_level THEN
    RETURN;
  END IF;

  PERFORM set_config('sms.exam_review', 'on', true);
  UPDATE procurements.sms_exam_bank_questions
     SET cognitive_level = p_level, updated_at = NOW()
   WHERE id = p_id;
  INSERT INTO procurements.sms_exam_review_events
    (entity_type, entity_id, actor_id, action, from_status, to_status, comment)
  VALUES ('question', p_id, procurements.exam_me_id(), 'set_level',
          r.o_status, r.o_status, v_old || ' → ' || p_level);
  PERFORM set_config('sms.exam_review', 'off', true);
END;
$$;

-- (sections 9–12 follow in later tasks)
