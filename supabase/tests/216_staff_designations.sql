-- Migration 216 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/216_region_account.sql
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
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tst TO authenticated;


-- ---------------------------------------------------------------- fixtures --
INSERT INTO tst.ids (name, uid) VALUES
  ('h', '00000000-0000-4000-8000-0000000216a1'),
  ('t', '00000000-0000-4000-8000-0000000216a2'),
  ('g', '00000000-0000-4000-8000-0000000216a3');
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@216.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id) SELECT 's1', min(id) FROM sms_schools;
INSERT INTO tst.ids (name, id) SELECT 's2', min(id) FROM sms_schools WHERE id <> tst.id('s1');

WITH u(name, type) AS (VALUES ('h','school_head'), ('t','teacher'), ('g','security_guard'))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@216.test', u.type, tst.id('s1'), tst.uid(u.name), true FROM u;
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;

INSERT INTO sms_user_schools (user_id, school_id)
SELECT x.uid_, x.sid FROM (VALUES
  (tst.id('h'), tst.id('s1')), (tst.id('t'), tst.id('s1')),
  (tst.id('t'), tst.id('s2')), (tst.id('g'), tst.id('s1'))) AS x(uid_, sid)
WHERE NOT EXISTS (SELECT 1 FROM sms_user_schools s WHERE s.user_id = x.uid_ AND s.school_id = x.sid);

INSERT INTO sms_subjects (name, code, school_id, grade_level) VALUES ('Designation Test Subject', 'DTS216', tst.id('s1'), 5);
INSERT INTO tst.ids (name, id) SELECT 'x', id FROM sms_subjects WHERE code = 'DTS216' AND school_id = tst.id('s1');

-- ------------------------------------------------------------- head writes --
SELECT tst.claims(tst.uid('h'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(format(
  $$ INSERT INTO sms_staff_designations (user_id, school_id, designation) VALUES (%s, %s, 'department_head') $$,
  tst.id('t'), tst.id('s1')), 1);
SELECT tst.expect_rows(format(
  $$ INSERT INTO sms_department_head_subjects (user_id, subject_id) VALUES (%s, %s) $$,
  tst.id('t'), tst.id('x')), 1);
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_staff_designations (user_id, school_id, designation) VALUES (%s, %s, 'grade_level_coordinator') $$,
  tst.id('t'), tst.id('s1')), 'check');
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_staff_designations (user_id, school_id, designation) VALUES (%s, %s, 'aral_coordinator') $$,
  tst.id('g'), tst.id('s1')), 'cannot be designated');
RESET ROLE;

-- ---------------------------------------------------------------- teacher --
SELECT tst.claims(tst.uid('t'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_staff_designations (user_id, school_id, designation) VALUES (%s, %s, 'reading_coordinator') $$,
  tst.id('t'), tst.id('s1')), 'row-level security');
SELECT tst.expect_count(format($$ SELECT sms_has_designation('department_head', %s)::int $$, tst.id('s1')), 1);
SELECT tst.expect_count(format($$ SELECT sms_heads_subject(%s)::int $$, tst.id('x')), 1);
SELECT tst.expect_count(format($$ SELECT sms_has_designation('aral_coordinator', %s)::int $$, tst.id('s1')), 0);
RESET ROLE;

-- Switched to another school, the designation at S1 stops counting.
SELECT set_config('request.jwt.claims', '', true);
UPDATE sms_users SET school_id = tst.id('s2') WHERE id = tst.id('t');
SELECT tst.claims(tst.uid('t'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count(format($$ SELECT sms_has_designation('department_head', %s)::int $$, tst.id('s1')), 0);
SELECT tst.expect_count(format($$ SELECT sms_heads_subject(%s)::int $$, tst.id('x')), 0);
RESET ROLE;

-- ---------------------------------------------------- delete cascades links --
SELECT tst.claims(tst.uid('h'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(format(
  $$ DELETE FROM sms_staff_designations WHERE user_id = %s AND designation = 'department_head' $$,
  tst.id('t')), 1);
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_department_head_subjects WHERE user_id = %s $$, tst.id('t')), 0);
RESET ROLE;

ROLLBACK;
