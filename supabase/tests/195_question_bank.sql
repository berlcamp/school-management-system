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
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok  delete refused: %', SQLERRM;
  END;
  RAISE NOTICE 'ok  delete is a no-op: %', left(p_sql, 80);
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
SELECT tst.expect_rows($$ UPDATE sms_tos SET is_active = false WHERE id = tst.id('legacy') $$, 1);
SELECT tst.expect_rows($$ UPDATE sms_tos SET created_by = NULL WHERE id = tst.id('legacy') $$, 1);
-- … but editing it requires the catalogue
SELECT tst.expect_error($$ UPDATE sms_tos SET title = 'edited' WHERE id = tst.id('legacy') $$, 'learning area');


-- (later tasks append their sections above this line)

ROLLBACK;
