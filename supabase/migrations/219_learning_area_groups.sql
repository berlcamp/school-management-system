-- ============================================================================
-- 219: Learning area groups (one TOS across TLE: ICT and TLE: AFA / FCS / IA)
-- ============================================================================
-- 195 tied every TOS to exactly one catalogue learning area, and its guard
-- refuses a competency from any other. The MATATAG seed (208) files TLE and
-- EPP as separate areas per strand ("TLE: ICT", "TLE: AFA / FCS / IA", the
-- Grade 9-10 specialisations, "EPP: ICT", "EPP: AFA / FCS / IA"), but a
-- school teaches TLE as one subject: AFA on Monday, ICT on Friday, one
-- summative test and one term exam covering both. So the teacher could not
-- write the TOS for the paper they actually give.
--
-- A GROUP is a learning area row with is_group = true. It holds no
-- competencies of its own; its members point at it through group_id. A TOS
-- may pick the group as its learning area and then pick competencies from
-- any member at its grade. The members stay separate areas, so:
--   * nothing in the catalogue is rewritten and no LC code changes (both
--     strands keep G6-001 ..., which is why merging them was rejected);
--   * a TOS can still pick one strand on its own;
--   * the Least Learned Competencies stay per strand (member area).
-- sms_tos needs no change: learning_area_id simply points at the group, and
-- 195's header guard copies the group's name ("TLE") into subject_name.
--
-- One level only: a group cannot be a member, a member cannot be a group.
-- Enforced by a CHECK plus triggers (cross-row rules, the 136 lesson):
--   * group_id must point at an is_group row;
--   * a row with members cannot stop being a group;
--   * a row with catalogue entries cannot become a group, and no catalogue
--     entry can be filed under a group.
--
-- Replaced, same signatures, bodies copied from the live definitions with
-- only the marked lines changed:
--   tos_competency_guard_catalogue (195): the entry's area may be the TOS's
--     area OR a member of it, when the TOS's area is a group.
--   llc_pooled_stats, division_llc_coverage (199): a result counts for a
--     member area when its TOS is that area, or its TOS holds at least one
--     competency of that area (a group TOS). Per-competency pooling was
--     already keyed on the catalogue entry's own area, so it is unchanged.
--
-- DML: creates the groups "TLE" and "EPP" and files every area named
-- "TLE: ..." / "EPP: ..." under them (only areas not already in a group).
-- If an area called "TLE" or "EPP" already exists and holds competencies it
-- is left alone and reported with a NOTICE; group it by hand afterwards.
-- No TOS, exam, result or competency row is touched.
--
-- Pre-apply check (read-only): which areas will be grouped.
--   SELECT id, name FROM procurements.sms_learning_areas
--   WHERE name ILIKE 'TLE:%' OR name ILIKE 'EPP:%' ORDER BY name;
--
-- Requires 195, 199. Tests: supabase/tests/219_learning_area_groups.sql
-- ============================================================================

ALTER TABLE procurements.sms_learning_areas
  ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE procurements.sms_learning_areas
  ADD COLUMN IF NOT EXISTS group_id BIGINT
    REFERENCES procurements.sms_learning_areas(id) ON DELETE RESTRICT;

ALTER TABLE procurements.sms_learning_areas
  DROP CONSTRAINT IF EXISTS sms_learning_areas_group_shape;
ALTER TABLE procurements.sms_learning_areas
  ADD CONSTRAINT sms_learning_areas_group_shape
  CHECK (group_id IS NULL OR (NOT is_group AND group_id <> id));

CREATE INDEX IF NOT EXISTS idx_sms_learning_areas_group
  ON procurements.sms_learning_areas (group_id) WHERE group_id IS NOT NULL;

-- ------------------------------------------------------------ area guards --
CREATE OR REPLACE FUNCTION procurements.learning_area_guard_group()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
BEGIN
  IF NEW.group_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.group_id IS DISTINCT FROM OLD.group_id)
     AND NOT EXISTS (SELECT 1 FROM procurements.sms_learning_areas g
                     WHERE g.id = NEW.group_id AND g.is_group) THEN
    RAISE EXCEPTION 'A learning area can only be placed in a group.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_group AND NOT NEW.is_group
     AND EXISTS (SELECT 1 FROM procurements.sms_learning_areas m WHERE m.group_id = NEW.id) THEN
    RAISE EXCEPTION 'Take the learning areas out of "%" before making it an ordinary learning area.', NEW.name;
  END IF;
  IF NEW.is_group AND (TG_OP = 'INSERT' OR NOT OLD.is_group)
     AND EXISTS (SELECT 1 FROM procurements.sms_competency_catalogue c WHERE c.learning_area_id = NEW.id) THEN
    RAISE EXCEPTION '"%" has competencies, so it cannot become a group.', NEW.name;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sms_learning_areas_guard_group ON procurements.sms_learning_areas;
CREATE TRIGGER sms_learning_areas_guard_group
  BEFORE INSERT OR UPDATE ON procurements.sms_learning_areas
  FOR EACH ROW EXECUTE FUNCTION procurements.learning_area_guard_group();

CREATE OR REPLACE FUNCTION procurements.catalogue_guard_not_group()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.learning_area_id IS DISTINCT FROM OLD.learning_area_id)
     AND EXISTS (SELECT 1 FROM procurements.sms_learning_areas a
                 WHERE a.id = NEW.learning_area_id AND a.is_group) THEN
    RAISE EXCEPTION 'A group holds no competencies of its own; add them to one of its learning areas.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sms_competency_catalogue_guard_not_group ON procurements.sms_competency_catalogue;
CREATE TRIGGER sms_competency_catalogue_guard_not_group
  BEFORE INSERT OR UPDATE ON procurements.sms_competency_catalogue
  FOR EACH ROW EXECUTE FUNCTION procurements.catalogue_guard_not_group();

-- ------------------------------------------- TOS competency guard (195) --
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
  -- 219: a TOS on a group takes entries from any of the group's areas.
  IF c.grade_level IS DISTINCT FROM v_grade
     OR (c.learning_area_id IS DISTINCT FROM v_area
         AND NOT EXISTS (SELECT 1 FROM procurements.sms_learning_areas a
                         WHERE a.id = c.learning_area_id AND a.group_id = v_area)) THEN
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

-- ------------------------------------------------- LLC readers (199) --
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
      AND t.exam_type IN ('Summative Test', 'Summative Test 1', 'Summative Test 2')
      -- 219: or a group TOS holding a competency of this area.
      AND (t.learning_area_id = p_learning_area_id
           OR EXISTS (SELECT 1 FROM procurements.sms_tos_competencies tc
                      JOIN procurements.sms_competency_catalogue cc ON cc.id = tc.catalogue_competency_id
                      WHERE tc.tos_id = t.id AND cc.learning_area_id = p_learning_area_id))
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
    AND t.exam_type IN ('Summative Test', 'Summative Test 1', 'Summative Test 2')
    -- 219: or a group TOS holding a competency of this area.
    AND (t.learning_area_id = p_learning_area_id
         OR EXISTS (SELECT 1 FROM procurements.sms_tos_competencies tc
                    JOIN procurements.sms_competency_catalogue cc ON cc.id = tc.catalogue_competency_id
                    WHERE tc.tos_id = t.id AND cc.learning_area_id = p_learning_area_id))
    AND t.grade_level = p_grade_level;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  procurements.llc_pooled_stats(BIGINT, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION
  procurements.learning_area_guard_group(),
  procurements.catalogue_guard_not_group()
  FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------- seed TLE / EPP groups --
DO $$
DECLARE
  g  RECORD;
  v_id BIGINT;
BEGIN
  FOR g IN SELECT * FROM (VALUES ('TLE'), ('EPP')) AS x(name) LOOP
    SELECT id INTO v_id FROM procurements.sms_learning_areas
    WHERE lower(btrim(name)) = lower(g.name);
    IF v_id IS NULL THEN
      INSERT INTO procurements.sms_learning_areas (name, is_group)
      VALUES (g.name, true) RETURNING id INTO v_id;
    ELSIF EXISTS (SELECT 1 FROM procurements.sms_competency_catalogue c WHERE c.learning_area_id = v_id) THEN
      RAISE NOTICE 'Skipped: the learning area "%" holds competencies, so it was not made a group.', g.name;
      CONTINUE;
    ELSE
      UPDATE procurements.sms_learning_areas SET is_group = true, group_id = NULL
      WHERE id = v_id AND NOT is_group;
    END IF;
    UPDATE procurements.sms_learning_areas
    SET group_id = v_id
    WHERE name ILIKE g.name || ':%' AND group_id IS NULL AND NOT is_group;
  END LOOP;
END $$;

/* Verification: the groups and their members. */
SELECT g.name AS group_name, string_agg(m.name, ' | ' ORDER BY m.name) AS members
FROM procurements.sms_learning_areas g
LEFT JOIN procurements.sms_learning_areas m ON m.group_id = g.id
WHERE g.is_group
GROUP BY g.name ORDER BY g.name;
