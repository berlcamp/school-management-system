-- 199 — TOS exam type: Summative Test 1, Summative Test 2, Term Exam
--
-- The TOS builder offered two exam types, "Term Exam" and "Summative Test".
-- A term carries two summative tests and one term exam, so the options are now
-- "Summative Test 1", "Summative Test 2" and "Term Exam"
-- (lib/constants/examinations.ts). `sms_tos.exam_type` is free TEXT (096), so
-- the column needs no change and NO ROW IS REWRITTEN: a TOS saved as
-- "Summative Test" keeps that value, and the builder still shows it as an extra
-- option when that row is edited.
--
-- What does need changing is 195's Least Learned Competencies, which pools
-- results by the literal `t.exam_type = 'Summative Test'`. Without this a
-- result recorded against a "Summative Test 1" / "Summative Test 2" TOS would
-- silently drop out of the LLC list, and with it the competencies a QA-
-- authorized teacher may write bank questions for. Both readers now accept all
-- three summative values, old and new — mirrored by SUMMATIVE_EXAM_TYPES in
-- lib/constants/examinations.ts. Term Exam results still never count.
--
-- Two functions replaced with the same signatures and bodies apart from that
-- predicate (plain CREATE OR REPLACE; ownership, SECURITY DEFINER and 195's
-- REVOKEs carry over — the REVOKE is repeated below anyway). No table, column,
-- policy, trigger or DML. Requires 195.

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
    AND t.learning_area_id = p_learning_area_id
    AND t.grade_level = p_grade_level;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  procurements.llc_pooled_stats(BIGINT, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
