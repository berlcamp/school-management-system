-- Migration 214 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/214_region_account.sql
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

-- ---------------------------------------------------------------- fixtures --
-- Start from no switches at all, whatever manual checks left behind.
DELETE FROM sms_region_account_access;

INSERT INTO tst.ids (name, uid) VALUES
  ('sa',  '00000000-0000-4000-8000-000000000214'),
  ('reg', '00000000-0000-4000-8000-0000000002a1'),
  ('div', '00000000-0000-4000-8000-0000000002b1'),
  ('tA',  '00000000-0000-4000-8000-0000000002c1');

INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@214.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id) SELECT 'schoolA', min(id) FROM sms_schools;

WITH u(name, type, school) AS (VALUES
  ('sa', 'super admin', 'schoolA'), ('reg', 'region_account', NULL),
  ('div', 'division_type', NULL), ('tA', 'teacher', 'schoolA'))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@214.test', u.type, tst.id(u.school), tst.uid(u.name), true
FROM u;

UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;

-- Make sure the dashboard card has something to see.
SELECT tst.expect_count($$ SELECT (count(*) > 0)::int FROM sms_requests $$, 1);

-- ------------------------------------------------- only super admin writes --
SELECT tst.claims(tst.uid('div'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ INSERT INTO sms_region_account_access (item_key, is_enabled) VALUES ('report:absenteeism', true) $$,
  'row-level security');
RESET ROLE;

SELECT tst.claims(tst.uid('reg'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ INSERT INTO sms_region_account_access (item_key, is_enabled) VALUES ('report:absenteeism', true) $$,
  'row-level security');
-- Nothing is on: the elevated reads all refuse.
SELECT tst.expect_count($$ SELECT count(*) FROM sms_requests $$, 0);
SELECT tst.expect_error(
  $$ SELECT * FROM division_absenteeism(NULL, '2025-2026') $$,
  'Only the division office');
SELECT tst.expect_error(
  $$ SELECT * FROM division_grade_level_teachers(NULL, '2025-2026') $$,
  'Only the division office');
SELECT tst.expect_count($$ SELECT can_run_division_report(NULL)::int $$, 0);
RESET ROLE;

SELECT tst.claims(tst.uid('sa'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_region_account_access (item_key, is_enabled) VALUES
  ('report:absenteeism', true),
  ('report:grade-level-teachers', false),
  ('report:builder', true),
  ('dashboard:document-requests', true);
RESET ROLE;

-- ------------------------------------------------------ switched on: reads --
SELECT tst.claims(tst.uid('reg'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT (count(*) > 0)::int FROM sms_requests $$, 1);
SELECT tst.expect_count($$ SELECT (count(*) >= 0)::int FROM division_absenteeism(NULL, '2025-2026') $$, 1);
SELECT tst.expect_error(
  $$ SELECT * FROM division_grade_level_teachers(NULL, '2025-2026') $$,
  'Only the division office');
SELECT tst.expect_count($$ SELECT can_run_division_report(NULL)::int $$, 1);
SELECT tst.expect_count($$ SELECT region_account_may_view('report:absenteeism')::int $$, 1);
SELECT tst.expect_count($$ SELECT region_account_may_view('report:unknown')::int $$, 0);
RESET ROLE;

-- The switch is the Region Account's alone: a teacher gains nothing.
SELECT tst.claims(tst.uid('tA'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT region_account_may_view('report:absenteeism')::int $$, 0);
SELECT tst.expect_error(
  $$ SELECT * FROM division_absenteeism(NULL, '2025-2026') $$,
  'Only the division office');
RESET ROLE;

-- ---------------------------------------------------------- switched off --
SELECT tst.claims(tst.uid('sa'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(
  $$ UPDATE sms_region_account_access SET is_enabled = false WHERE item_key = 'dashboard:document-requests' $$, 1);
RESET ROLE;

SELECT tst.claims(tst.uid('reg'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_requests $$, 0);
RESET ROLE;

-- An inactive Region Account is shut out even with the switch on.
UPDATE sms_users SET is_active = false WHERE id = tst.id('reg');
SELECT tst.claims(tst.uid('reg'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT region_account_may_view('report:absenteeism')::int $$, 0);
RESET ROLE;

-- ------------------------------------------------------ helpers' grants --
SELECT tst.expect_count($$ SELECT has_function_privilege('anon',
  'procurements.region_account_may_view(text)', 'EXECUTE')::int $$, 0);

ROLLBACK;
