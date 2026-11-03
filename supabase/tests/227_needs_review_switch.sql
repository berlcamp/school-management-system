-- Migration 227 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/227_needs_review_switch.sql
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
  ('sa',    '00000000-0000-4000-8000-000000002271'),
  ('div',   '00000000-0000-4000-8000-000000002272'),
  ('head',  '00000000-0000-4000-8000-000000002273'),
  ('adm',   '00000000-0000-4000-8000-000000002274'),
  ('teach', '00000000-0000-4000-8000-000000002275'),
  ('asst',  '00000000-0000-4000-8000-000000002276');
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@227.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id)
SELECT 'school', id FROM sms_schools WHERE is_active AND id NOT IN (9, 10) ORDER BY id LIMIT 1;

WITH u(name, type, school) AS (VALUES
  ('sa', 'super admin', NULL), ('div', 'division_admin', NULL),
  ('head', 'school_head', 'school'), ('adm', 'admin', 'school'),
  ('teach', 'teacher', 'school'), ('asst', 'assistant_school_head', 'school')),
ins AS (
  INSERT INTO sms_users (name, email, type, school_id, is_active, user_id)
  SELECT u.name, u.name || '@227.test', u.type, tst.id(u.school), true, tst.uid(u.name) FROM u
  RETURNING id, name
)
INSERT INTO tst.ids (name, id) SELECT 'u_' || name, id FROM ins;

SET LOCAL ROLE authenticated;

-- ------------------------------------------------------------- default on --
SELECT tst.expect_count('SELECT count(*) FROM sms_needs_review_settings WHERE is_enabled', 1);

-- Division: every active school, test schools out (226 unchanged).
SELECT tst.claims(tst.uid('div'));
SELECT tst.expect_count(
  'SELECT count(*) FROM division_needs_review(''2099-2100'')',
  (SELECT count(*) FROM sms_schools WHERE is_active AND id NOT IN (9, 10)));

-- School head and admin: exactly their own school.
SELECT tst.claims(tst.uid('head'));
SELECT tst.expect_count('SELECT count(*) FROM division_needs_review(''2099-2100'')', 1);
SELECT tst.expect_count('SELECT school_id FROM division_needs_review(''2099-2100'')', tst.id('school'));
SELECT tst.claims(tst.uid('adm'));
SELECT tst.expect_count('SELECT school_id FROM division_needs_review(''2099-2100'')', tst.id('school'));

-- Teacher and assistant school head: refused.
SELECT tst.claims(tst.uid('teach'));
SELECT tst.expect_error('SELECT * FROM division_needs_review(''2099-2100'')', 'may view Needs Review');
SELECT tst.claims(tst.uid('asst'));
SELECT tst.expect_error('SELECT * FROM division_needs_review(''2099-2100'')', 'may view Needs Review');

-- ------------------------------------------------------------------ switch --
SELECT tst.claims(tst.uid('div'));
SELECT tst.expect_error('SELECT needs_review_set_enabled(false)', 'Only a super admin');
SELECT tst.claims(tst.uid('head'));
SELECT tst.expect_error('SELECT needs_review_set_enabled(false)', 'Only a super admin');
SELECT tst.expect_error('UPDATE sms_needs_review_settings SET is_enabled = false', 'permission denied');

SELECT tst.claims(tst.uid('sa'));
SELECT needs_review_set_enabled(false);
SELECT tst.expect_count('SELECT count(*) FROM sms_needs_review_settings WHERE NOT is_enabled', 1);

-- Off: everyone refused except the super admin.
SELECT tst.claims(tst.uid('div'));
SELECT tst.expect_error('SELECT * FROM division_needs_review(''2099-2100'')', 'turned off');
SELECT tst.claims(tst.uid('head'));
SELECT tst.expect_error('SELECT * FROM division_needs_review(''2099-2100'')', 'turned off');
SELECT tst.claims(tst.uid('sa'));
SELECT tst.expect_count(
  'SELECT count(*) FROM division_needs_review(''2099-2100'')',
  (SELECT count(*) FROM sms_schools WHERE is_active AND id NOT IN (9, 10)));

-- Back on.
SELECT needs_review_set_enabled(true);
SELECT tst.claims(tst.uid('head'));
SELECT tst.expect_count('SELECT count(*) FROM division_needs_review(''2099-2100'')', 1);

RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'ALL 227 CHECKS PASSED'; END $$;
ROLLBACK;
