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

-- (later tasks append their sections above this line)

ROLLBACK;
