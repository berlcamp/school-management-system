-- Migration 194 scenario test. LOCAL DATABASE ONLY.
--   psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql
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

-- Impersonate: call, then `SET LOCAL ROLE authenticated;` in the script.
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
    RAISE EXCEPTION 'FAIL expected error like "%" but got "%" for: %',
      p_like, SQLERRM, p_sql;
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

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tst TO authenticated;

-- ---------------------------------------------------------------- fixtures --
-- Two real schools from the clone; users are created here and rolled back.
-- If Task 0 found sms_users.user_id has an FK to auth.users, the auth rows
-- below satisfy it. Add any further NOT NULL sms_users column Task 0 listed.
INSERT INTO tst.ids (name, uid) VALUES
  ('qa1', '00000000-0000-4000-8000-0000000000a1'),
  ('qa2', '00000000-0000-4000-8000-0000000000a2'),
  ('t1',  '00000000-0000-4000-8000-0000000000b1'),
  ('t2',  '00000000-0000-4000-8000-0000000000b2'),
  ('mt',  '00000000-0000-4000-8000-0000000000b3'),
  ('do',  '00000000-0000-4000-8000-0000000000c1'),
  ('head','00000000-0000-4000-8000-0000000000c2');

INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@194.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id)
SELECT 'schoolA', min(id) FROM sms_schools
UNION ALL
SELECT 'schoolB', (SELECT id FROM sms_schools ORDER BY id OFFSET 1 LIMIT 1);

WITH u(name, type, school) AS (VALUES
  ('qa1', 'qa', NULL), ('qa2', 'qa', NULL),
  ('t1', 'teacher', 'schoolA'), ('t2', 'teacher', 'schoolB'),
  ('mt', 'teacher', 'schoolA'),
  ('do', 'division_type', NULL), ('head', 'school_head', 'schoolA'))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@194.test', u.type, tst.id(u.school), tst.uid(u.name), true
FROM u;

UPDATE tst.ids i SET id = s.id
FROM sms_users s WHERE s.user_id = i.uid;

-- 163: the active (type, school) pair is always in sms_user_roles; mt also
-- holds qa at school A (the multi-role reviewer).
INSERT INTO sms_user_roles (user_id, role, school_id)
SELECT s.id, s.type, s.school_id FROM sms_users s
WHERE s.user_id IN (SELECT uid FROM tst.ids WHERE uid IS NOT NULL)
ON CONFLICT DO NOTHING;
INSERT INTO sms_user_roles (user_id, role, school_id)
VALUES (tst.id('mt'), 'qa', tst.id('schoolA'));

-- ------------------------------------------------------------- task 1 ------
SELECT tst.expect_count(
  $$ SELECT count(*) FROM sms_users WHERE type = 'qa' $$, 2);
SELECT tst.expect_count(
  $$ SELECT count(*) FROM sms_tos WHERE school_id IS NULL AND review_status IS DISTINCT FROM 'approved' $$, 0);
SELECT tst.expect_count(
  $$ SELECT count(*) FROM sms_exams WHERE school_id IS NULL AND review_status IS DISTINCT FROM 'approved' $$, 0);
SELECT tst.expect_count(
  $$ SELECT count(*) FROM sms_tos WHERE school_id IS NOT NULL AND review_status IS NOT NULL $$, 0);
SELECT tst.expect_count(
  $$ SELECT count(*) FROM sms_exams WHERE school_id IS NOT NULL AND review_status IS NOT NULL $$, 0);
SELECT set_config('sms.exam_review', 'on', true);
SELECT tst.expect_error(
  $$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, review_status)
     VALUES ('X', 5, '2026-2027', 1, NULL, NULL) $$,
  'review_status_tier');
SELECT tst.expect_error(
  $$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, review_status)
     VALUES ('X', 5, '2026-2027', 1, $$ || tst.id('schoolA') || $$, 'draft') $$,
  'review_status_tier');
SELECT tst.expect_error(
  $$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, review_status)
     VALUES ('X', 5, '2026-2027', 1, NULL, 'published') $$,
  'review_status');
SELECT set_config('sms.exam_review', 'off', true);

-- ------------------------------------------------------------- task 2 ------
-- t1 is authorized directly here; Task 4 replaces this with exam_qa_authorize.
INSERT INTO sms_exam_qa_authors (user_id, authorized_by) VALUES (tst.id('t1'), tst.id('qa1'));
INSERT INTO sms_exam_qa_authors (user_id, authorized_by) VALUES (tst.id('mt'), tst.id('qa1'));

-- unauthorized teacher cannot create a division TOS
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by)
     VALUES ('Science', 5, '2026-2027', 1, NULL, $$ || tst.id('t2') || $$) $$,
  'row-level security');
-- … but their private TOS still works exactly as before
SELECT tst.expect_rows(
  $$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by)
     VALUES ('Private', 5, '2026-2027', 1, $$ || tst.id('schoolB') || $$, $$ || tst.id('t2') || $$) $$, 1);
RESET ROLE;

-- division office can no longer create one
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by)
     VALUES ('Science', 5, '2026-2027', 1, NULL, $$ || tst.id('do') || $$) $$,
  'row-level security');
RESET ROLE;

-- authorized teacher can; an attempt to insert it pre-approved lands as draft
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(
  $$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by, review_status, title)
     VALUES ('Science', 5, '2026-2027', 1, NULL, $$ || tst.id('t1') || $$, 'approved', 'T1 DIV TOS') $$, 1);
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'tos1', id FROM sms_tos WHERE title = 'T1 DIV TOS';
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos WHERE id = $$ || tst.id('tos1') || $$ AND review_status = 'draft' $$, 1);

-- the author cannot write review fields or move the row between levels
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ UPDATE sms_tos SET review_status = 'approved' WHERE id = $$ || tst.id('tos1'),
  'QA review workflow');
SELECT tst.expect_error(
  $$ UPDATE sms_tos SET school_id = $$ || tst.id('schoolA') || $$ WHERE id = $$ || tst.id('tos1'),
  'division level');
SELECT tst.expect_rows($$ UPDATE sms_tos SET title = 'T1 DIV TOS v2' WHERE id = $$ || tst.id('tos1'), 1);
RESET ROLE;

-- visibility: other teacher 0, QA 1, division office 1
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos WHERE id = $$ || tst.id('tos1'), 0);
RESET ROLE;
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos WHERE id = $$ || tst.id('tos1'), 1);
RESET ROLE;
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos WHERE id = $$ || tst.id('tos1'), 1);
RESET ROLE;

-- exams cannot be built on an unapproved division TOS, even a personal one
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ INSERT INTO sms_exams (tos_id, school_id, created_by) VALUES
     ($$ || tst.id('tos1') || $$, $$ || tst.id('schoolA') || $$, $$ || tst.id('t1') || $$) $$,
  'not been approved');
RESET ROLE;

-- approve tos1 out-of-band (Task 4 adds the real function)
SELECT set_config('sms.exam_review', 'on', true);
UPDATE sms_tos SET review_status = 'approved' WHERE id = tst.id('tos1');
SELECT set_config('sms.exam_review', 'off', true);

-- a division exam on it is allowed and lands as draft
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(
  $$ INSERT INTO sms_exams (tos_id, school_id, created_by, title) VALUES
     ($$ || tst.id('tos1') || $$, NULL, $$ || tst.id('t1') || $$, 'T1 DIV EXAM') $$, 1);
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'exam1', id FROM sms_exams WHERE title = 'T1 DIV EXAM';

-- a division exam on a PRIVATE TOS is refused
INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by, title)
VALUES ('Science', 5, '2026-2027', 1, tst.id('schoolA'), tst.id('t1'), 'T1 PRIVATE TOS');
INSERT INTO tst.ids (name, id) SELECT 'ptos1', id FROM sms_tos WHERE title = 'T1 PRIVATE TOS';
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ INSERT INTO sms_exams (tos_id, school_id, created_by) VALUES
     ($$ || tst.id('ptos1') || $$, NULL, $$ || tst.id('t1') || $$) $$,
  'approved Division TOS');
RESET ROLE;

-- results cannot be recorded against an unapproved division exam
SELECT tst.expect_error(
  $$ INSERT INTO sms_exam_results (exam_id, section_id, school_id, school_year)
     VALUES ($$ || tst.id('exam1') || $$,
             (SELECT id FROM sms_sections WHERE school_id = $$ || tst.id('schoolA') || $$ LIMIT 1),
             $$ || tst.id('schoolA') || $$, '2026-2027') $$,
  'not been approved');

-- (later tasks append their sections above this line)

ROLLBACK;
