-- Migration 219 scenario test. LOCAL DATABASE ONLY.
--   psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/219_learning_area_groups.sql
-- Runs as the connecting superuser (the rules under test are triggers and
-- SECURITY DEFINER readers, which apply to every role). Everything runs in
-- one transaction that is rolled back at the end.
\set ON_ERROR_STOP 1
BEGIN;
SET search_path TO procurements, public;

CREATE SCHEMA tst;
CREATE TABLE tst.ids (name TEXT PRIMARY KEY, id BIGINT);
CREATE FUNCTION tst.id(p TEXT) RETURNS BIGINT LANGUAGE sql STABLE AS
  $$ SELECT id FROM tst.ids WHERE name = p $$;
CREATE FUNCTION tst.expect_error(p_sql TEXT, p_like TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%' || p_like || '%' THEN
      RAISE NOTICE 'ok  refused: %', SQLERRM;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL expected error like "%" but got "%" for: %', p_like, SQLERRM, p_sql;
  END;
  RAISE EXCEPTION 'FAIL expected error like "%" but it succeeded: %', p_like, p_sql;
END $$;
CREATE FUNCTION tst.expect_count(p_sql TEXT, p_n NUMERIC) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE c NUMERIC;
BEGIN
  EXECUTE p_sql INTO c;
  IF c IS DISTINCT FROM p_n THEN
    RAISE EXCEPTION 'FAIL expected %, got % for: %', p_n, c, p_sql;
  END IF;
  RAISE NOTICE 'ok  = %: %', c, left(p_sql, 90);
END $$;

-- ---------------------------------------------------------------- fixtures --
-- Own group + two members + an outsider, so the test does not depend on 219's seed.
INSERT INTO sms_learning_areas (name, is_group) VALUES ('T219 Group', true);
INSERT INTO tst.ids SELECT 'grp', id FROM sms_learning_areas WHERE name = 'T219 Group';
INSERT INTO sms_learning_areas (name, group_id) VALUES
  ('T219 ICT', tst.id('grp')), ('T219 AFA', tst.id('grp'));
INSERT INTO sms_learning_areas (name) VALUES ('T219 Math');
INSERT INTO tst.ids SELECT 'ict', id FROM sms_learning_areas WHERE name = 'T219 ICT';
INSERT INTO tst.ids SELECT 'afa', id FROM sms_learning_areas WHERE name = 'T219 AFA';
INSERT INTO tst.ids SELECT 'math', id FROM sms_learning_areas WHERE name = 'T219 Math';

INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text) VALUES
  (tst.id('ict'), 6, 'G6-001', 'T219 ICT one'),
  (tst.id('afa'), 6, 'G6-001', 'T219 AFA one'),
  (tst.id('ict'), 7, 'G7-001', 'T219 ICT grade 7'),
  (tst.id('math'), 6, 'G6-001', 'T219 Math one');
INSERT INTO tst.ids SELECT 'c_ict', id FROM sms_competency_catalogue WHERE competency_text = 'T219 ICT one';
INSERT INTO tst.ids SELECT 'c_afa', id FROM sms_competency_catalogue WHERE competency_text = 'T219 AFA one';
INSERT INTO tst.ids SELECT 'c_ict7', id FROM sms_competency_catalogue WHERE competency_text = 'T219 ICT grade 7';
INSERT INTO tst.ids SELECT 'c_math', id FROM sms_competency_catalogue WHERE competency_text = 'T219 Math one';

-- A school with a section and two enrolled learners.
INSERT INTO tst.ids SELECT 'sec', s.id FROM sms_sections s
  WHERE EXISTS (SELECT 1 FROM sms_enrollments e WHERE e.section_id = s.id)
  ORDER BY s.id LIMIT 1;
INSERT INTO tst.ids SELECT 'school', school_id FROM sms_sections WHERE id = tst.id('sec');
INSERT INTO tst.ids SELECT 'L' || row_number() OVER (ORDER BY student_id), student_id
  FROM (SELECT DISTINCT student_id FROM sms_enrollments WHERE section_id = tst.id('sec')
        ORDER BY student_id LIMIT 2) x;

-- ------------------------------------------------------------ area shape --
SELECT tst.expect_error($$ INSERT INTO sms_learning_areas (name, group_id) VALUES ('T219 bad', tst.id('math')) $$,
  'only be placed in a group');
SELECT tst.expect_error($$ UPDATE sms_learning_areas SET group_id = tst.id('grp') WHERE id = tst.id('grp') $$,
  'group_shape');
SELECT tst.expect_error($$ INSERT INTO sms_learning_areas (name, is_group, group_id) VALUES ('T219 nested', true, tst.id('grp')) $$,
  'group_shape');
SELECT tst.expect_error($$ UPDATE sms_learning_areas SET is_group = false WHERE id = tst.id('grp') $$,
  'Take the learning areas out');
SELECT tst.expect_error($$ UPDATE sms_learning_areas SET is_group = true WHERE id = tst.id('math') $$,
  'cannot become a group');
SELECT tst.expect_error($$ INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
  VALUES (tst.id('grp'), 6, 'G6-009', 'on a group') $$, 'holds no competencies');
SELECT tst.expect_error($$ UPDATE sms_competency_catalogue SET learning_area_id = tst.id('grp') WHERE id = tst.id('c_math') $$,
  'holds no competencies');

-- ------------------------------------------------------------ TOS guard --
INSERT INTO sms_tos (learning_area_id, subject_name, grade_level, school_year, grading_period, school_id, title, exam_type)
VALUES (tst.id('grp'), 'x', 6, '2026-2027', 1, tst.id('school'), 'T219 TOS group', 'Summative Test 1'),
       (tst.id('ict'), 'x', 6, '2026-2027', 1, tst.id('school'), 'T219 TOS ict', 'Summative Test 1');
INSERT INTO tst.ids SELECT 'tosG', id FROM sms_tos WHERE title = 'T219 TOS group';
INSERT INTO tst.ids SELECT 'tosI', id FROM sms_tos WHERE title = 'T219 TOS ict';
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos WHERE id = tst.id('tosG') AND subject_name = 'T219 Group' $$, 1);

-- A group TOS takes entries from both members at its grade
INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, position)
VALUES (tst.id('tosG'), tst.id('c_ict'), 'x', 0), (tst.id('tosG'), tst.id('c_afa'), 'x', 1);
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos_competencies WHERE tos_id = tst.id('tosG') AND lc_code = 'G6-001' $$, 2);
-- ... but not another grade, nor an area outside the group
SELECT tst.expect_error($$ INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, position)
  VALUES (tst.id('tosG'), tst.id('c_ict7'), 'x', 2) $$, 'not in this TOS');
SELECT tst.expect_error($$ INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, position)
  VALUES (tst.id('tosG'), tst.id('c_math'), 'x', 2) $$, 'not in this TOS');
-- A member-area TOS is unchanged: its own entries only, never its sibling's
INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, position)
VALUES (tst.id('tosI'), tst.id('c_ict'), 'x', 0);
SELECT tst.expect_error($$ INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, position)
  VALUES (tst.id('tosI'), tst.id('c_afa'), 'x', 1) $$, 'not in this TOS');

-- ------------------------------------------------------------------ LLC --
-- Group TOS: item 1 = ICT, item 2 = AFA. L1 gets item 1 only, L2 gets both.
INSERT INTO sms_tos_items (tos_id, competency_id, item_number, cognitive_level)
SELECT tos_id, id, position + 1, 'remembering' FROM sms_tos_competencies WHERE tos_id = tst.id('tosG');
INSERT INTO sms_exams (tos_id, school_id, title) VALUES (tst.id('tosG'), tst.id('school'), 'T219 EXAM');
INSERT INTO tst.ids SELECT 'ex', id FROM sms_exams WHERE title = 'T219 EXAM';
INSERT INTO sms_exam_answer_keys (exam_id, item_number, correct_answer) VALUES (tst.id('ex'), 1, 'A'), (tst.id('ex'), 2, 'B');
INSERT INTO sms_exam_results (exam_id, section_id, school_id, school_year)
VALUES (tst.id('ex'), tst.id('sec'), tst.id('school'), '2026-2027');
INSERT INTO sms_exam_result_students (result_id, student_id, correct_items)
SELECT r.id, tst.id(v.l), v.items::INTEGER[]
FROM sms_exam_results r, (VALUES ('L1', '{1}'), ('L2', '{1,2}')) v(l, items)
WHERE r.exam_id = tst.id('ex');

-- Each member's LLC sees the group exam, scored on its own items only
SELECT tst.expect_count($$ SELECT mps FROM llc_pooled_stats(tst.id('ict'), 6, '2026-2027') WHERE catalogue_competency_id = tst.id('c_ict') $$, 100.00);
SELECT tst.expect_count($$ SELECT mps FROM llc_pooled_stats(tst.id('afa'), 6, '2026-2027') WHERE catalogue_competency_id = tst.id('c_afa') $$, 50.00);
SELECT tst.expect_count($$ SELECT count(*) FROM llc_pooled_stats(tst.id('afa'), 6, '2026-2027') $$, 1);
-- An area with no competency on the group TOS is untouched by it
SELECT tst.expect_count($$ SELECT count(*) FROM llc_pooled_stats(tst.id('math'), 6, '2026-2027') $$, 0);

ROLLBACK;
