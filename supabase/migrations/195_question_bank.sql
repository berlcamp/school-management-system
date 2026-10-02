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

-- (sections 5–12 follow in later tasks)
