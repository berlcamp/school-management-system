-- Migration 195 scenario test. LOCAL DATABASE ONLY.
--   psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/195_question_bank.sql
-- Everything runs in one transaction that is rolled back at the end.
\set ON_ERROR_STOP 1
BEGIN;
SET search_path TO procurements, public;

CREATE SCHEMA tst;
GRANT USAGE ON SCHEMA tst TO authenticated;
CREATE TABLE tst.ids (name TEXT PRIMARY KEY, id BIGINT, uid UUID);
GRANT SELECT ON tst.ids TO authenticated;
CREATE FUNCTION tst.id(p TEXT) RETURNS BIGINT LANGUAGE sql STABLE AS
  $$ SELECT id FROM tst.ids WHERE name = p $$;
CREATE FUNCTION tst.uid(p TEXT) RETURNS UUID LANGUAGE sql STABLE AS
  $$ SELECT uid FROM tst.ids WHERE name = p $$;
CREATE FUNCTION tst.claims(p_uid UUID) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
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
CREATE FUNCTION tst.expect_rows(p_sql TEXT, p_n INT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> p_n THEN
    RAISE EXCEPTION 'FAIL expected % row(s), got % for: %', p_n, n, p_sql;
  END IF;
  RAISE NOTICE 'ok  % row(s): %', n, left(p_sql, 80);
END $$;
CREATE FUNCTION tst.expect_count(p_sql TEXT, p_n BIGINT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE c BIGINT;
BEGIN
  EXECUTE p_sql INTO c;
  IF c IS DISTINCT FROM p_n THEN
    RAISE EXCEPTION 'FAIL expected %, got % for: %', p_n, c, p_sql;
  END IF;
  RAISE NOTICE 'ok  = %: %', c, left(p_sql, 80);
END $$;
CREATE FUNCTION tst.expect_no_delete(p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL delete removed % row(s): %', n, p_sql; END IF;
    RAISE NOTICE 'ok  delete is a no-op: %', left(p_sql, 80);
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok  delete refused: %', SQLERRM;
  END;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tst TO authenticated;

-- ---------------------------------------------------------------- fixtures --
INSERT INTO tst.ids (name, uid) VALUES
  ('qa1', '00000000-0000-4000-8000-0000000195a1'),
  ('t1',  '00000000-0000-4000-8000-0000000195b1'),
  ('t2',  '00000000-0000-4000-8000-0000000195b2'),
  ('mt',  '00000000-0000-4000-8000-0000000195b3'),
  ('do',  '00000000-0000-4000-8000-0000000195c1');
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@195.test', 'authenticated', 'authenticated' FROM tst.ids;

-- Two schools that both have sections (results need a section).
INSERT INTO tst.ids (name, id)
SELECT 'schoolA', min(school_id) FROM sms_sections
UNION ALL
SELECT 'schoolB', (SELECT DISTINCT school_id FROM sms_sections
                   WHERE school_id > (SELECT min(school_id) FROM sms_sections)
                   ORDER BY school_id LIMIT 1);

WITH u(name, type, school) AS (VALUES
  ('qa1', 'qa', NULL), ('t1', 'teacher', 'schoolA'), ('t2', 'teacher', 'schoolB'),
  ('mt', 'teacher', 'schoolA'), ('do', 'division_type', NULL))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@195.test', u.type, tst.id(u.school), tst.uid(u.name), true FROM u;
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;
INSERT INTO sms_user_roles (user_id, role, school_id)
SELECT s.id, s.type, s.school_id FROM sms_users s
WHERE s.user_id IN (SELECT uid FROM tst.ids WHERE uid IS NOT NULL)
ON CONFLICT DO NOTHING;
INSERT INTO sms_user_roles (user_id, role, school_id) VALUES (tst.id('mt'), 'qa', tst.id('schoolA'));

-- t1 and mt are QA-authorized authors (194's RPC).
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_qa_authorize(tst.id('t1'));
SELECT procurements.exam_qa_authorize(tst.id('mt'));
RESET ROLE;

-- ------------------------------------------------------------- task 1 ------
-- (task sections are appended above the final marker)

-- catalogue writes: division office and QA yes, teacher no, nobody deletes
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ INSERT INTO sms_learning_areas (name) VALUES ('T195 Nope') $$, 'row-level security');
RESET ROLE;
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT tst.expect_rows($$ INSERT INTO sms_learning_areas (name) VALUES ('T195 Math') $$, 1);
SELECT tst.expect_rows($$ INSERT INTO sms_learning_areas (name) VALUES ('T195 Other') $$, 1);
SELECT tst.expect_error($$ INSERT INTO sms_learning_areas (name) VALUES ('  t195 math ') $$, 'uq_sms_learning_areas_name');
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'la', id FROM sms_learning_areas WHERE name = 'T195 Math';
INSERT INTO tst.ids (name, id) SELECT 'laOther', id FROM sms_learning_areas WHERE name = 'T195 Other';

SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
-- LC codes are normalized: trimmed, upper-cased, inner spaces removed
SELECT tst.expect_rows($$ INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
  VALUES (tst.id('la'), 5, ' m5ns-ia-1 ', 'Competency one'),
         (tst.id('la'), 5, 'M5NS-Ib-2', 'Competency two'),
         (tst.id('la'), 5, 'M5NS-Ic-3', 'Competency three'),
         (tst.id('la'), 5, 'M5NS-Id-4', 'Competency four'),
         (tst.id('la'), 5, 'M5NS-Ie-5', 'Competency five'),
         (tst.id('la'), 5, 'M5NS-If-6', 'Old competency') $$, 6);
SELECT tst.expect_count($$ SELECT count(*) FROM sms_competency_catalogue WHERE lc_code = 'M5NS-IA-1' $$, 1);
SELECT tst.expect_error($$ INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
  VALUES (tst.id('la'), 5, 'm5ns-ia-1', 'dup') $$, 'duplicate key');
-- SNED (-1) is a catalogue grade; -2 and 13 are not
SELECT tst.expect_rows($$ INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
  VALUES (tst.id('laOther'), -1, 'SNED-1', 'A SNED competency') $$, 1);
SELECT tst.expect_error($$ INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
  VALUES (tst.id('laOther'), -2, 'SNED-2', 'x') $$, 'grade_level_check');
SELECT tst.expect_error($$ INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
  VALUES (tst.id('laOther'), 13, 'G13', 'x') $$, 'grade_level_check');
SELECT tst.expect_no_delete($$ DELETE FROM sms_competency_catalogue WHERE lc_code = 'M5NS-IF-6' $$);
SELECT tst.expect_no_delete($$ DELETE FROM sms_learning_areas WHERE id = $$ || tst.id('laOther'));
RESET ROLE;
INSERT INTO tst.ids (name, id)
SELECT v.n, c.id FROM sms_competency_catalogue c
JOIN (VALUES ('c1','M5NS-IA-1'),('c2','M5NS-IB-2'),('c3','M5NS-IC-3'),
             ('c4','M5NS-ID-4'),('c5','M5NS-IE-5'),('cOld','M5NS-IF-6')) v(n, code)
  ON v.code = c.lc_code AND c.learning_area_id = tst.id('la');

-- a new TOS must name a learning area; subject_name is copied from it
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by)
  VALUES ('Free text', 5, '2026-2027', 1, tst.id('schoolA'), tst.id('t1')) $$, 'learning area');
SELECT tst.expect_rows($$ INSERT INTO sms_tos (learning_area_id, subject_name, grade_level, school_year, grading_period, school_id, created_by, title, exam_type)
  VALUES (tst.id('la'), 'ignored', 5, '2026-2027', 1, tst.id('schoolA'), tst.id('t1'), 'T195 TOS A', 'Summative Test') $$, 1);
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'tosA', id FROM sms_tos WHERE title = 'T195 TOS A';
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos WHERE id = tst.id('tosA') AND subject_name = 'T195 Math' $$, 1);

-- competencies must be picked from the catalogue, matching area + grade
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ INSERT INTO sms_tos_competencies (tos_id, competency_text) VALUES (tst.id('tosA'), 'typed') $$, 'competency catalogue');
SELECT tst.expect_rows($$ INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, lc_code, position)
  VALUES (tst.id('tosA'), tst.id('c1'), 'client text ignored', 'X', 0) $$, 1);
RESET ROLE;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos_competencies WHERE tos_id = tst.id('tosA')
  AND competency_text = 'Competency one' AND lc_code = 'M5NS-IA-1' $$, 1);

-- wrong grade refused
INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
VALUES (tst.id('la'), 6, 'M6-1', 'Grade six competency');
SELECT tst.expect_error($$ INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text)
  VALUES (tst.id('tosA'), (SELECT id FROM sms_competency_catalogue WHERE lc_code = 'M6-1'), 'x') $$,
  'not in this TOS');

-- a retired entry cannot be picked, but a row already holding it re-saves
INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, position)
VALUES (tst.id('tosA'), tst.id('cOld'), 'x', 9);
UPDATE sms_competency_catalogue SET is_active = false WHERE id = tst.id('cOld');
SELECT tst.expect_rows($$ UPDATE sms_tos_competencies SET no_of_days = 2 WHERE catalogue_competency_id = tst.id('cOld') $$, 1);
SELECT tst.expect_error($$ INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text)
  VALUES (tst.id('tosA'), tst.id('cOld'), 'x') $$, 'retired');
DELETE FROM sms_tos_competencies WHERE catalogue_competency_id = tst.id('cOld');

-- a pre-195 TOS (no learning area) is never re-checked on archive or author deletion
ALTER TABLE sms_tos DISABLE TRIGGER sms_tos_guard_catalogue;  -- simulate a row saved before 195's triggers existed
INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by, title)
VALUES ('Legacy', 5, '2025-2026', 1, tst.id('schoolA'), tst.id('t1'), 'T195 LEGACY');
ALTER TABLE sms_tos ENABLE TRIGGER sms_tos_guard_catalogue;
INSERT INTO tst.ids (name, id) SELECT 'legacy', id FROM sms_tos WHERE title = 'T195 LEGACY';
-- editing an active legacy TOS requires the catalogue
SELECT tst.expect_error($$ UPDATE sms_tos SET title = 'edited' WHERE id = tst.id('legacy') $$, 'learning area');
SELECT tst.expect_rows($$ UPDATE sms_tos SET is_active = false WHERE id = tst.id('legacy') $$, 1);
-- reactivating (with an edit) an archived TOS that lacks a learning area is refused (the archive skip needs OLD and NEW archived)
SELECT tst.expect_error($$ UPDATE sms_tos SET is_active = true, title = 'back' WHERE id = tst.id('legacy') $$, 'learning area');
SELECT tst.expect_rows($$ UPDATE sms_tos SET created_by = NULL WHERE id = tst.id('legacy') $$, 1);


-- FK SET NULL on subject_id (116) must not be blocked by the guard
INSERT INTO sms_subjects (name, code, grade_level, school_id)
SELECT 'T195 Subj', 'T195S', 5, tst.id('schoolA')
WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sms_subjects' AND column_name='code');
INSERT INTO tst.ids (name, id) SELECT 'subj', id FROM sms_subjects WHERE name = 'T195 Subj';
ALTER TABLE sms_tos DISABLE TRIGGER sms_tos_guard_catalogue;
INSERT INTO sms_tos (subject_name, subject_id, grade_level, school_year, grading_period, school_id, created_by, title)
VALUES ('Legacy2', tst.id('subj'), 5, '2025-2026', 1, tst.id('schoolA'), tst.id('t1'), 'T195 LEGACY2');
INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by, title, is_active)
VALUES ('Archived', 5, '2025-2026', 1, tst.id('schoolA'), tst.id('t1'), 'T195 ARCHIVED', false);
INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, title, review_status)
VALUES ('Approved', 5, '2025-2026', 1, NULL, 'T195 APPROVED', 'approved');
ALTER TABLE sms_tos ENABLE TRIGGER sms_tos_guard_catalogue;
SELECT set_config('sms.exam_review', 'on', true);
UPDATE sms_tos SET review_status = 'approved' WHERE title = 'T195 APPROVED';
SELECT set_config('sms.exam_review', 'off', true);
INSERT INTO tst.ids (name, id) SELECT 'legacy2', id FROM sms_tos WHERE title = 'T195 LEGACY2';
INSERT INTO tst.ids (name, id) SELECT 'archived', id FROM sms_tos WHERE title = 'T195 ARCHIVED';
INSERT INTO tst.ids (name, id) SELECT 'approved', id FROM sms_tos WHERE title = 'T195 APPROVED';
SELECT tst.expect_rows($$ DELETE FROM sms_subjects WHERE id = $$ || tst.id('subj'), 1);
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos WHERE id = tst.id('legacy2') AND subject_id IS NULL $$, 1);
-- archived TOS: content edit and competency write are not re-checked
SELECT tst.expect_rows($$ UPDATE sms_tos SET title = 'T195 ARCHIVED 2', grade_level = 6 WHERE id = tst.id('archived') $$, 1);
SELECT tst.expect_rows($$ INSERT INTO sms_tos_competencies (tos_id, competency_text) VALUES ($$ || tst.id('archived') || $$, 'typed') $$, 1);
-- approved division TOS: likewise
SELECT tst.expect_rows($$ UPDATE sms_tos SET title = 'T195 APPROVED 2' WHERE id = tst.id('approved') $$, 1);
SELECT tst.expect_rows($$ INSERT INTO sms_tos_competencies (tos_id, competency_text) VALUES ($$ || tst.id('approved') || $$, 'typed') $$, 1);

-- ------------------------------------------------------------- task 2 ------
-- tosA (from task 1) gets four items; build tosB (school B) and tosT (Term Exam)
DELETE FROM sms_tos_competencies WHERE tos_id = tst.id('tosA');
INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, position)
SELECT tst.id('tosA'), tst.id(n), 'x', p FROM (VALUES ('c1',0),('c2',1),('c3',2),('c4',3)) v(n,p);
INSERT INTO sms_tos (learning_area_id, subject_name, grade_level, school_year, grading_period, school_id, created_by, title, exam_type)
VALUES (tst.id('la'), 'x', 5, '2026-2027', 1, tst.id('schoolB'), tst.id('t2'), 'T195 TOS B', 'Summative Test'),
       (tst.id('la'), 'x', 5, '2026-2027', 1, tst.id('schoolA'), tst.id('t1'), 'T195 TOS T', 'Term Exam');
INSERT INTO tst.ids (name, id) SELECT 'tosB', id FROM sms_tos WHERE title = 'T195 TOS B';
INSERT INTO tst.ids (name, id) SELECT 'tosT', id FROM sms_tos WHERE title = 'T195 TOS T';
INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, position)
SELECT tst.id(t), tst.id(n), 'x', p FROM (VALUES ('tosB','c1',0),('tosB','c2',1),('tosB','c5',2),('tosT','c1',0)) v(t,n,p);
-- items: item k -> the k-th competency by position
INSERT INTO sms_tos_items (tos_id, competency_id, item_number, cognitive_level)
SELECT c.tos_id, c.id, c.position + 1, CASE WHEN c.position = 3 THEN 'applying' ELSE 'remembering' END
FROM sms_tos_competencies c WHERE c.tos_id IN (tst.id('tosA'), tst.id('tosB'), tst.id('tosT'));

-- exams + MC questions + results
INSERT INTO sms_exams (tos_id, school_id, created_by, title)
VALUES (tst.id('tosA'), tst.id('schoolA'), tst.id('t1'), 'T195 EXAM A'),
       (tst.id('tosB'), tst.id('schoolB'), tst.id('t2'), 'T195 EXAM B'),
       (tst.id('tosT'), tst.id('schoolA'), tst.id('t1'), 'T195 EXAM T');
INSERT INTO tst.ids (name, id) SELECT 'exA', id FROM sms_exams WHERE title = 'T195 EXAM A';
INSERT INTO tst.ids (name, id) SELECT 'exB', id FROM sms_exams WHERE title = 'T195 EXAM B';
INSERT INTO tst.ids (name, id) SELECT 'exT', id FROM sms_exams WHERE title = 'T195 EXAM T';
INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, position)
SELECT tst.id(e), k, 'multiple_choice', 'Q' || k, k
FROM (VALUES ('exA',4),('exB',3),('exT',1)) v(e,n), generate_series(1, n) k;

INSERT INTO tst.ids (name, id)
SELECT 'L' || row_number() OVER (ORDER BY id), id FROM (SELECT id FROM sms_students ORDER BY id LIMIT 4) s;
INSERT INTO sms_exam_results (exam_id, section_id, school_id, school_year)
VALUES (tst.id('exA'), (SELECT id FROM sms_sections WHERE school_id = tst.id('schoolA') ORDER BY id LIMIT 1), tst.id('schoolA'), '2026-2027'),
       (tst.id('exB'), (SELECT id FROM sms_sections WHERE school_id = tst.id('schoolB') ORDER BY id LIMIT 1), tst.id('schoolB'), '2026-2027'),
       (tst.id('exT'), (SELECT id FROM sms_sections WHERE school_id = tst.id('schoolA') ORDER BY id LIMIT 1), tst.id('schoolA'), '2026-2027');
INSERT INTO sms_exam_result_students (result_id, student_id, correct_items)
SELECT r.id, tst.id(v.l), v.items::INTEGER[]
FROM (VALUES ('exA','L1','{1,2,3}'),('exA','L2','{1}'),
             ('exB','L3','{1}'),('exB','L4','{1,2,3}'),
             ('exT','L1','{}')) v(e,l,items)
JOIN sms_exam_results r ON r.exam_id = tst.id(v.e);

-- Term Exam exclusion: three more learners miss the one Term Exam item. Counted, c1 would be
-- 4/8 = 50% (tied at the cut, a 5th row); excluded it is 4/4 = 100%.
INSERT INTO sms_exam_result_students (result_id, student_id, correct_items)
SELECT r.id, tst.id(l), '{}'::INTEGER[] FROM sms_exam_results r, (VALUES ('L2'),('L3'),('L4')) v(l)
WHERE r.exam_id = tst.id('exT');
-- unmapped item: tosA item 5 points at a competency with NULL catalogue link; L1 answers it right
ALTER TABLE sms_tos_competencies DISABLE TRIGGER sms_tos_competencies_guard_catalogue;
INSERT INTO sms_tos_competencies (tos_id, competency_text, position) VALUES (tst.id('tosA'), 'unmapped', 4);
ALTER TABLE sms_tos_competencies ENABLE TRIGGER sms_tos_competencies_guard_catalogue;
INSERT INTO sms_tos_items (tos_id, competency_id, item_number, cognitive_level)
SELECT tos_id, id, 5, 'remembering' FROM sms_tos_competencies WHERE tos_id = tst.id('tosA') AND competency_text = 'unmapped';
INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, position)
VALUES (tst.id('exA'), 5, 'multiple_choice', 'Q5', 5);
UPDATE sms_exam_result_students SET correct_items = '{1,2,3,5}'
WHERE student_id = tst.id('L1') AND result_id = (SELECT id FROM sms_exam_results WHERE exam_id = tst.id('exA'));
-- as owner: pooled stats see exactly the 5 mapped competencies; c1 is 4/4 with the Term Exam out
SELECT tst.expect_count($$ SELECT count(*) FROM procurements.llc_pooled_stats(tst.id('la'), 5, '2026-2027') $$, 5);
SELECT tst.expect_count($$ SELECT (mps * 100)::BIGINT FROM procurements.llc_pooled_stats(tst.id('la'), 5, '2026-2027')
  WHERE catalogue_competency_id = tst.id('c1') $$, 10000);
SELECT tst.expect_count($$ SELECT total FROM procurements.llc_pooled_stats(tst.id('la'), 5, '2026-2027')
  WHERE catalogue_competency_id = tst.id('c1') $$, 4);

-- t2 (unauthorized) may not call it; t1 (authorized), QA and division office may
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT * FROM procurements.division_llc(tst.id('la'), 5, '2026-2027') $$, 'not allowed');
RESET ROLE;
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
-- c4, c2, c3, c5 — the tie at the cut is kept; c1 (100%) and the Term Exam are out
SELECT tst.expect_count($$ SELECT count(*) FROM procurements.division_llc(tst.id('la'), 5, '2026-2027') $$, 4);
SELECT tst.expect_count($$ SELECT count(*) FROM procurements.division_llc(tst.id('la'), 5, '2026-2027')
  WHERE catalogue_competency_id = tst.id('c1') $$, 0);
SELECT tst.expect_count($$ SELECT (mps * 100)::BIGINT FROM procurements.division_llc(tst.id('la'), 5, '2026-2027')
  WHERE catalogue_competency_id = tst.id('c4') $$, 0);
SELECT tst.expect_count($$ SELECT (mps * 100)::BIGINT FROM procurements.division_llc(tst.id('la'), 5, '2026-2027')
  WHERE catalogue_competency_id = tst.id('c2') $$, 5000);
-- c5 exists only in t2's PRIVATE exam at the other school: private results count
SELECT tst.expect_count($$ SELECT schools FROM procurements.division_llc(tst.id('la'), 5, '2026-2027')
  WHERE catalogue_competency_id = tst.id('c5') $$, 1);
SELECT tst.expect_count($$ SELECT schools FROM procurements.division_llc(tst.id('la'), 5, '2026-2027')
  WHERE catalogue_competency_id = tst.id('c2') $$, 2);
-- coverage: 2 summative results, 2 schools, 4 learners
SELECT tst.expect_count($$ SELECT results * 100 + schools * 10 + learners FROM procurements.division_llc_coverage(tst.id('la'), 5, '2026-2027') $$, 224);
-- no results for that area / grade / year: empty, not an error
SELECT tst.expect_count($$ SELECT count(*) FROM procurements.division_llc(tst.id('la'), 6, '2026-2027') $$, 0);
SELECT tst.expect_count($$ SELECT count(*) FROM procurements.division_llc(tst.id('laOther'), 5, '2026-2027') $$, 0);
RESET ROLE;
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM procurements.division_llc(tst.id('la'), 5, '2026-2027') $$, 4);
-- the internal pieces are not callable by a signed-in user
SELECT tst.expect_error($$ SELECT * FROM procurements.llc_pooled_stats(1, 5, '2026-2027') $$, 'permission denied');
SELECT tst.expect_error($$ SELECT * FROM procurements.llc_competency_ids(1, 5, '2026-2027') $$, 'permission denied');
RESET ROLE;

-- a retired competency drops out of the LLC list and takes no new bank question
UPDATE sms_competency_catalogue SET is_active = false WHERE id = tst.id('c5');
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM procurements.division_llc(tst.id('la'), 5, '2026-2027') $$, 3);
SELECT tst.expect_count($$ SELECT count(*) FROM procurements.division_llc(tst.id('la'), 5, '2026-2027')
  WHERE catalogue_competency_id = tst.id('c5') $$, 0);
SELECT tst.expect_error($$ INSERT INTO sms_exam_bank_questions
  (catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, created_by)
  VALUES (tst.id('c5'), 'remembering', '2026-2027', 'multiple_choice', 'Q', tst.id('t1')) $$, 'retired');
RESET ROLE;
UPDATE sms_competency_catalogue SET is_active = true WHERE id = tst.id('c5');

-- ------------------------------------------------------------- task 3 ------
-- LLC for la / grade 5 / 2026-2027 is {c4, c2, c3, c5} (task 2).
-- unauthorized teacher cannot write a bank question
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ INSERT INTO sms_exam_bank_questions
  (catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, created_by)
  VALUES (tst.id('c4'), 'remembering', '2026-2027', 'multiple_choice', 'Q', tst.id('t2')) $$, 'not currently authorized');
RESET ROLE;

SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
-- off the list (c1 = 100%) refused; on the list allowed and lands as draft
SELECT tst.expect_error($$ INSERT INTO sms_exam_bank_questions
  (catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, created_by)
  VALUES (tst.id('c1'), 'remembering', '2026-2027', 'multiple_choice', 'Q', tst.id('t1')) $$, 'Least Learned');
SELECT tst.expect_error($$ INSERT INTO sms_exam_bank_questions
  (catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, created_by)
  VALUES (tst.id('c4'), 'remembering', '2026-2027', 'essay', 'Q', tst.id('t1')) $$, 'not accepted in the Question Bank');
SELECT tst.expect_rows($$ INSERT INTO sms_exam_bank_questions
  (catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, created_by, review_status)
  VALUES (tst.id('c4'), 'applying', '2026-2027', 'multiple_choice', '  What is 2 + 2?  ', tst.id('t1'), 'approved') $$, 1);
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'bq1', id FROM sms_exam_bank_questions WHERE question_text = 'What is 2 + 2?';
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_bank_questions WHERE id = tst.id('bq1') AND review_status = 'draft' $$, 1);

-- submit rules: needs 2-5 options with exactly one correct
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('question', tst.id('bq1')) $$, '2 to 5 choices');
INSERT INTO sms_exam_bank_options (question_id, label, choice_text, is_correct, position)
VALUES (tst.id('bq1'), 'A', '3', false, 0), (tst.id('bq1'), 'B', '4', false, 1), (tst.id('bq1'), 'C', '5', false, 2);
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('question', tst.id('bq1')) $$, 'exactly one');
UPDATE sms_exam_bank_options SET is_correct = true WHERE question_id = tst.id('bq1') AND label = 'B';
SELECT procurements.exam_review_submit('question', tst.id('bq1'));
-- frozen while submitted
SELECT tst.expect_rows($$ UPDATE sms_exam_bank_questions SET question_text = 'x' WHERE id = tst.id('bq1') $$, 0);
RESET ROLE;
-- even past RLS (as postgres), review fields move only inside the workflow
SELECT tst.expect_error($$ UPDATE sms_exam_bank_questions SET review_status = 'approved' WHERE id = tst.id('bq1') $$, 'QA review workflow');
-- and the cognitive level is frozen once submitted (QA corrects it only through bank_question_set_level)
SELECT tst.expect_error($$ UPDATE sms_exam_bank_questions SET cognitive_level = 'creating' WHERE id = tst.id('bq1') $$, 'cognitive level');

-- other authors cannot see a pending question; QA and the division office can
SELECT tst.claims(tst.uid('mt')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_bank_questions WHERE id = tst.id('bq1') $$, 0);
RESET ROLE;
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_bank_questions WHERE id = tst.id('bq1') $$, 1);
SELECT tst.expect_error($$ SELECT procurements.exam_review_start('question', tst.id('bq1')) $$, 'Only a QA reviewer');
RESET ROLE;

-- QA: start, correct the level (audited), approve
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.bank_question_set_level(tst.id('bq1'), 'analyzing') $$, 'Start the review');
SELECT procurements.exam_review_start('question', tst.id('bq1'));
SELECT tst.expect_error($$ SELECT procurements.bank_question_set_level(tst.id('bq1'), 'thinking') $$, 'Unknown cognitive level');
SELECT procurements.bank_question_set_level(tst.id('bq1'), 'remembering');
SELECT procurements.exam_review_decide('question', tst.id('bq1'), 'approve', NULL);
RESET ROLE;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_bank_questions WHERE id = tst.id('bq1')
  AND review_status = 'approved' AND cognitive_level = 'remembering' $$, 1);
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_review_events WHERE entity_type = 'question'
  AND entity_id = tst.id('bq1') AND action = 'set_level' AND comment = 'applying → remembering' $$, 1);

-- approved: another authorized author can now see it; its author still cannot edit it
SELECT tst.claims(tst.uid('mt')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_bank_questions WHERE id = tst.id('bq1') $$, 1);
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_bank_options WHERE question_id = tst.id('bq1') $$, 3);
RESET ROLE;
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_rows($$ UPDATE sms_exam_bank_options SET choice_text = 'x' WHERE question_id = tst.id('bq1') $$, 0);
RESET ROLE;

-- self-review refused even after switching to the QA role: mt writes a TF question
SELECT tst.claims(tst.uid('mt')); SET LOCAL ROLE authenticated;
INSERT INTO sms_exam_bank_questions (catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, answer_key, created_by)
VALUES (tst.id('c2'), 'remembering', '2026-2027', 'true_false', 'The sun is a star.', 'False: ', tst.id('mt'));
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'bqTF', id FROM sms_exam_bank_questions WHERE question_text = 'The sun is a star.';
-- the TF answer is normalized to True / False
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_bank_questions WHERE id = tst.id('bqTF') AND answer_key = 'False' $$, 1);
SELECT tst.claims(tst.uid('mt')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_review_submit('question', tst.id('bqTF'));
SELECT procurements.sms_switch_active_role('qa');
SELECT tst.expect_error($$ SELECT procurements.exam_review_start('question', tst.id('bqTF')) $$, 'your own submission');
SELECT procurements.sms_switch_active_role('teacher');
RESET ROLE;

-- return with a reason, then approve
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_review_decide('question', tst.id('bqTF'), 'reject', '') $$, 'reason is required');
SELECT procurements.exam_review_decide('question', tst.id('bqTF'), 'reject', 'Ambiguous wording');
RESET ROLE;
SELECT tst.claims(tst.uid('mt')); SET LOCAL ROLE authenticated;
SELECT tst.expect_rows($$ UPDATE sms_exam_bank_questions SET question_text = 'The Sun is a star.', answer_key = 'True' WHERE id = tst.id('bqTF') $$, 1);
SELECT procurements.exam_review_submit('question', tst.id('bqTF'));
RESET ROLE;
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_review_decide('question', tst.id('bqTF'), 'approve', NULL);
RESET ROLE;

-- the competency of a question never changes
SELECT tst.expect_error($$ UPDATE sms_exam_bank_questions SET catalogue_competency_id = tst.id('c3') WHERE id = tst.id('bqTF') $$, 'cannot be changed');

-- a draft whose competency later drops off the list can still be submitted
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
INSERT INTO sms_exam_bank_questions (catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, answer_key, created_by)
VALUES (tst.id('c5'), 'remembering', '2026-2027', 'true_false', 'Late draft', 'True', tst.id('t1'));
-- while still a draft, its author may change the cognitive level
SELECT tst.expect_rows($$ UPDATE sms_exam_bank_questions SET cognitive_level = 'understanding' WHERE question_text = 'Late draft' $$, 1);
RESET ROLE;
UPDATE sms_exam_result_students SET correct_items = '{1,2,3}' WHERE student_id = tst.id('L3');  -- c5 now 100%
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_review_submit('question', (SELECT id FROM sms_exam_bank_questions WHERE question_text = 'Late draft'));
RESET ROLE;
UPDATE sms_exam_result_students SET correct_items = '{1}' WHERE student_id = tst.id('L3');  -- restore task 2's figures

-- the internal key helper is not callable by a signed-in user
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.bank_expected_key(1) $$, 'permission denied');
RESET ROLE;

-- ------------------------------------------------------------- task 4 ------
-- A Division TOS (approved out-of-band) with item 1 -> c4 (applying),
-- item 2 -> c2 (remembering), and a draft division exam on it.
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
INSERT INTO sms_tos (learning_area_id, subject_name, grade_level, school_year, grading_period, school_id, created_by, title, exam_type)
VALUES (tst.id('la'), 'x', 5, '2026-2027', 1, NULL, tst.id('t1'), 'T195 DIV TOS', 'Summative Test');
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'dtos', id FROM sms_tos WHERE title = 'T195 DIV TOS';
INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, position)
VALUES (tst.id('dtos'), tst.id('c4'), 'x', 0), (tst.id('dtos'), tst.id('c2'), 'x', 1);
INSERT INTO sms_tos_items (tos_id, competency_id, item_number, cognitive_level)
SELECT c.tos_id, c.id, c.position + 1, CASE c.position WHEN 0 THEN 'applying' ELSE 'remembering' END
FROM sms_tos_competencies c WHERE c.tos_id = tst.id('dtos');
SELECT set_config('sms.exam_review', 'on', true);
UPDATE sms_tos SET review_status = 'approved' WHERE id = tst.id('dtos');
SELECT set_config('sms.exam_review', 'off', true);
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
INSERT INTO sms_exams (tos_id, school_id, created_by, title) VALUES (tst.id('dtos'), NULL, tst.id('t1'), 'T195 DIV EXAM');
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'dexam', id FROM sms_exams WHERE title = 'T195 DIV EXAM';

-- bq1: competency c4, level 'remembering' (QA corrected), approved; correct option is B ('4')
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
-- a copy that differs from the bank question is refused
SELECT tst.expect_error($$ INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, position, source_bank_question_id)
  VALUES (tst.id('dexam'), 1, 'multiple_choice', 'What is 2 + 3?', 0, tst.id('bq1')) $$, 'cannot be edited inside the exam');
-- item 2 is c2: wrong competency
SELECT tst.expect_error($$ INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, position, source_bank_question_id)
  VALUES (tst.id('dexam'), 2, 'multiple_choice', 'What is 2 + 2?', 0, tst.id('bq1')) $$, 'different competency');
-- item 1 is c4 at 'applying'; bq1 is 'remembering': refused without the override …
SELECT tst.expect_error($$ INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, position, source_bank_question_id)
  VALUES (tst.id('dexam'), 1, 'multiple_choice', 'What is 2 + 2?', 0, tst.id('bq1')) $$, 'cognitive level');
-- … accepted with it
SELECT tst.expect_rows($$ INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, position, source_bank_question_id, bank_level_override)
  VALUES (tst.id('dexam'), 1, 'multiple_choice', 'What is 2 + 2?', 0, tst.id('bq1'), true) $$, 1);
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'eq1', id FROM sms_exam_questions WHERE exam_id = tst.id('dexam') AND item_number = 1;

SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
-- options must equal the bank's, position by position
SELECT tst.expect_error($$ INSERT INTO sms_exam_options (question_id, label, choice_text, is_correct, position)
  VALUES (tst.id('eq1'), 'A', '3', true, 0) $$, 'choices');
INSERT INTO sms_exam_options (question_id, label, choice_text, is_correct, position)
VALUES (tst.id('eq1'), 'A', '3', false, 0), (tst.id('eq1'), 'B', '4', true, 1);
-- item 2: bqTF (c2, remembering) matches exactly; the override flag is cleared
INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, answer_key, position, source_bank_question_id, bank_level_override)
VALUES (tst.id('dexam'), 2, 'true_false', 'The Sun is a star.', 'True', 1, tst.id('bqTF'), true);
RESET ROLE;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_questions WHERE exam_id = tst.id('dexam') AND item_number = 2 AND NOT bank_level_override $$, 1);

-- submit: only 2 of bq1's 3 choices copied -> refused; then the key must match
INSERT INTO sms_exam_answer_keys (exam_id, item_number, correct_answer, choice_count)
VALUES (tst.id('dexam'), 1, 'B', 3), (tst.id('dexam'), 2, 'A', 2);
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('exam', tst.id('dexam')) $$, 'Item 1: its choices');
INSERT INTO sms_exam_options (question_id, label, choice_text, is_correct, position) VALUES (tst.id('eq1'), 'C', '5', false, 2);
UPDATE sms_exam_answer_keys SET correct_answer = 'C' WHERE exam_id = tst.id('dexam') AND item_number = 1;
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('exam', tst.id('dexam')) $$, 'Item 1: the answer key');
UPDATE sms_exam_answer_keys SET correct_answer = 'B' WHERE exam_id = tst.id('dexam') AND item_number = 1;

-- fix round 1: submit re-checks the whole copy, not just the per-row writes.
-- (a) duplicate rows with the right count (A, A, B for A, B, C) are refused
DELETE FROM sms_exam_options WHERE question_id = tst.id('eq1');
INSERT INTO sms_exam_options (question_id, label, choice_text, is_correct, position)
VALUES (tst.id('eq1'), 'A', '3', false, 0), (tst.id('eq1'), 'A', '3', false, 0), (tst.id('eq1'), 'B', '4', true, 1);
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('exam', tst.id('dexam')) $$, 'Item 1: its choices');
DELETE FROM sms_exam_options WHERE question_id = tst.id('eq1');
INSERT INTO sms_exam_options (question_id, label, choice_text, is_correct, position)
VALUES (tst.id('eq1'), 'A', '3', false, 0), (tst.id('eq1'), 'B', '4', true, 1), (tst.id('eq1'), 'C', '5', false, 2);
-- (b) options written while unlinked, then the question linked: refused
UPDATE sms_exam_questions SET source_bank_question_id = NULL WHERE exam_id = tst.id('dexam') AND item_number = 2;
INSERT INTO sms_exam_options (question_id, label, choice_text, is_correct, position)
SELECT id, 'A', 'smuggled', true, 0 FROM sms_exam_questions WHERE exam_id = tst.id('dexam') AND item_number = 2;
UPDATE sms_exam_questions SET source_bank_question_id = tst.id('bqTF') WHERE exam_id = tst.id('dexam') AND item_number = 2;
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('exam', tst.id('dexam')) $$, 'Item 2: its choices');
DELETE FROM sms_exam_options WHERE question_id = (SELECT id FROM sms_exam_questions WHERE exam_id = tst.id('dexam') AND item_number = 2);
-- (d) renumbering a bank item onto another competency's slot is refused, naming the slot
SELECT tst.expect_error($$ UPDATE sms_exam_questions SET item_number = 2 WHERE id = tst.id('eq1') $$,
  'Item 2: this Question Bank question is for a different competency');
RESET ROLE;
-- (c) the exam moved onto another approved Division TOS: dtosC puts c2 at
--     item 1 (competency mismatch); dtosL keeps c4 at item 1 but makes item 2
--     (c2) 'applying' where bqTF is 'remembering' with no override.
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
INSERT INTO sms_tos (learning_area_id, subject_name, grade_level, school_year, grading_period, school_id, created_by, title, exam_type)
VALUES (tst.id('la'), 'x', 5, '2026-2027', 1, NULL, tst.id('t1'), 'T195 DIV TOS C', 'Summative Test'),
       (tst.id('la'), 'x', 5, '2026-2027', 1, NULL, tst.id('t1'), 'T195 DIV TOS L', 'Summative Test');
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'dtosC', id FROM sms_tos WHERE title = 'T195 DIV TOS C';
INSERT INTO tst.ids (name, id) SELECT 'dtosL', id FROM sms_tos WHERE title = 'T195 DIV TOS L';
INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, position)
VALUES (tst.id('dtosC'), tst.id('c2'), 'x', 0), (tst.id('dtosC'), tst.id('c4'), 'x', 1),
       (tst.id('dtosL'), tst.id('c4'), 'x', 0), (tst.id('dtosL'), tst.id('c2'), 'x', 1);
INSERT INTO sms_tos_items (tos_id, competency_id, item_number, cognitive_level)
SELECT c.tos_id, c.id, c.position + 1,
       CASE WHEN c.tos_id = tst.id('dtosL') THEN 'applying' ELSE 'remembering' END
FROM sms_tos_competencies c WHERE c.tos_id IN (tst.id('dtosC'), tst.id('dtosL'));
SELECT set_config('sms.exam_review', 'on', true);
UPDATE sms_tos SET review_status = 'approved' WHERE id IN (tst.id('dtosC'), tst.id('dtosL'));
SELECT set_config('sms.exam_review', 'off', true);
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_rows($$ UPDATE sms_exams SET tos_id = tst.id('dtosC') WHERE id = tst.id('dexam') $$, 1);
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('exam', tst.id('dexam')) $$,
  'Item 1: this Question Bank question is for a different competency');
SELECT tst.expect_rows($$ UPDATE sms_exams SET tos_id = tst.id('dtosL') WHERE id = tst.id('dexam') $$, 1);
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('exam', tst.id('dexam')) $$,
  'Item 2: the question''s cognitive level (remembering) differs from the TOS item (applying)');
SELECT tst.expect_rows($$ UPDATE sms_exams SET tos_id = tst.id('dtos') WHERE id = tst.id('dexam') $$, 1);

SELECT procurements.exam_review_submit('exam', tst.id('dexam'));
RESET ROLE;

-- a bank question in use cannot be reopened
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_review_reopen('question', tst.id('bq1'), 'fix') $$, 'used in an exam');
RESET ROLE;

-- bank items are division-only: a private exam cannot link one
SELECT tst.expect_error($$ INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, position, source_bank_question_id)
  VALUES (tst.id('exA'), 9, 'true_false', 'The Sun is a star.', 9, tst.id('bqTF')) $$, 'Division exam');

-- an unapproved bank question cannot be linked
SELECT tst.expect_error($$ INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, answer_key, position, source_bank_question_id)
  VALUES (tst.id('dexam'), 3, 'true_false', 'Late draft', 'True', 2,
          (SELECT id FROM sms_exam_bank_questions WHERE question_text = 'Late draft')) $$, 'approved Question Bank');

-- an exam question without a bank link behaves exactly as before
SELECT tst.expect_rows($$ INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, position, bank_level_override)
  VALUES (tst.id('exA'), 9, 'essay', 'Explain.', 9, true) $$, 1);
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_questions WHERE exam_id = tst.id('exA') AND item_number = 9 AND NOT bank_level_override $$, 1);

-- grants: helpers and RPCs callable by a signed-in user, internals not
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.bank_guard_fields() $$, 'permission denied');
SELECT procurements.can_view_llc();
SELECT procurements.bank_supported_types();
RESET ROLE;
SELECT tst.expect_count($$ SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'procurements' AND p.proname = 'division_llc'
    AND has_function_privilege('anon', p.oid, 'EXECUTE') $$, 0);

-- ------------------------------------------------------- task 4 hardening --
-- (1) An unauthorized writer is refused before the LLC check, so the error
--     never reveals whether a competency is on the Least Learned list.
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ INSERT INTO sms_exam_bank_questions
  (catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, created_by)
  VALUES (tst.id('c1'), 'remembering', '2026-2027', 'multiple_choice', 'Q', tst.id('t2')) $$, 'not currently authorized');
RESET ROLE;

-- (2) A multiple-choice draft switched to true/false keeps its old choices:
--     submit refuses it until they are removed.
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
INSERT INTO sms_exam_bank_questions (catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, created_by)
VALUES (tst.id('c4'), 'remembering', '2026-2027', 'multiple_choice', 'Switch me', tst.id('t1'));
INSERT INTO sms_exam_bank_options (question_id, label, choice_text, is_correct, position)
SELECT id, 'A', 'yes', true, 0 FROM sms_exam_bank_questions WHERE question_text = 'Switch me'
UNION ALL SELECT id, 'B', 'no', false, 1 FROM sms_exam_bank_questions WHERE question_text = 'Switch me';
UPDATE sms_exam_bank_questions SET question_type = 'true_false', answer_key = 'True' WHERE question_text = 'Switch me';
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('question',
  (SELECT id FROM sms_exam_bank_questions WHERE question_text = 'Switch me')) $$, 'has no choices');
DELETE FROM sms_exam_bank_options WHERE question_id = (SELECT id FROM sms_exam_bank_questions WHERE question_text = 'Switch me');
SELECT procurements.exam_review_submit('question', (SELECT id FROM sms_exam_bank_questions WHERE question_text = 'Switch me'));
RESET ROLE;

-- (3) Grants, read off the ACLs: internal and trigger functions are callable
--     by neither anon nor authenticated (nor PUBLIC, which has_function_privilege
--     folds in); helpers and RPCs by authenticated only.
SELECT tst.expect_count($$ SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'procurements' AND p.proname IN (
    'catalogue_normalize', 'tos_guard_catalogue', 'tos_competency_guard_catalogue',
    'llc_pooled_stats', 'llc_competency_ids', 'bank_guard_fields',
    'bank_expected_key', 'exam_guard_bank_link', 'exam_guard_bank_option')
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE') $$, 9);
SELECT tst.expect_count($$ SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'procurements' AND p.proname IN (
    'can_manage_catalogue', 'llc_count', 'can_view_llc', 'division_llc',
    'division_llc_coverage', 'bank_supported_types', 'can_contribute_bank',
    'can_browse_bank', 'can_review_bank', 'can_edit_bank_question',
    'bank_question_set_level')
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') $$, 11);
-- and no bare PUBLIC entry on any of the twenty
SELECT tst.expect_count($$ SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
  LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE n.nspname = 'procurements' AND a.grantee = 0 AND p.proname IN (
    'catalogue_normalize', 'tos_guard_catalogue', 'tos_competency_guard_catalogue',
    'llc_pooled_stats', 'llc_competency_ids', 'bank_guard_fields',
    'bank_expected_key', 'exam_guard_bank_link', 'exam_guard_bank_option',
    'can_manage_catalogue', 'llc_count', 'can_view_llc', 'division_llc',
    'division_llc_coverage', 'bank_supported_types', 'can_contribute_bank',
    'can_browse_bank', 'can_review_bank', 'can_edit_bank_question',
    'bank_question_set_level') $$, 0);

-- (4) An approved bank question no exam uses can be reopened.
INSERT INTO tst.ids (name, id) SELECT 'bqSw', id FROM sms_exam_bank_questions WHERE question_text = 'Switch me';
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_review_start('question', tst.id('bqSw'));
SELECT procurements.exam_review_decide('question', tst.id('bqSw'), 'approve', NULL);
SELECT procurements.exam_review_reopen('question', tst.id('bqSw'), 'fix the wording');
RESET ROLE;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_bank_questions WHERE id = tst.id('bqSw') AND review_status = 'draft' $$, 1);

-- (later tasks append their sections above this line)

ROLLBACK;
