-- Migration 221 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/221_sbfp_switch.sql
-- Everything runs in one transaction that is rolled back at the end.
\set ON_ERROR_STOP 1
BEGIN;
SET search_path TO procurements, public;

CREATE SCHEMA tst;
GRANT USAGE ON SCHEMA tst TO authenticated, anon, service_role;
CREATE TABLE tst.ids (name TEXT PRIMARY KEY, id BIGINT, uid UUID);
GRANT SELECT ON tst.ids TO authenticated, service_role;
CREATE FUNCTION tst.id(p TEXT) RETURNS BIGINT LANGUAGE sql STABLE AS
  $$ SELECT id FROM tst.ids WHERE name = p $$;
CREATE FUNCTION tst.uid(p TEXT) RETURNS UUID LANGUAGE sql STABLE AS
  $$ SELECT uid FROM tst.ids WHERE name = p $$;
CREATE FUNCTION tst.claims(p_uid UUID, p_role TEXT DEFAULT 'authenticated') RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
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
CREATE FUNCTION tst.expect_count(p_sql TEXT, p_n BIGINT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE c BIGINT;
BEGIN
  EXECUTE p_sql INTO c;
  IF c IS DISTINCT FROM p_n THEN
    RAISE EXCEPTION 'FAIL expected %, got % for: %', p_n, c, p_sql;
  END IF;
  RAISE NOTICE 'ok  = %: %', c, left(p_sql, 90);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tst TO authenticated, anon, service_role;

-- ---------------------------------------------------------------- fixtures --
UPDATE sms_sbfp_settings SET is_enabled = TRUE;

INSERT INTO tst.ids (name, uid) VALUES
  ('sa',  '00000000-0000-4000-8000-000000000221'),
  ('div', '00000000-0000-4000-8000-0000000002d2'),
  ('tA',  '00000000-0000-4000-8000-0000000002e5');
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@221.test', 'authenticated', 'authenticated' FROM tst.ids;
INSERT INTO tst.ids (name, id) SELECT 'schoolA', min(id) FROM sms_schools;

WITH u(name, type, school) AS (VALUES
  ('sa', 'super admin', 'schoolA'), ('div', 'division_admin', NULL), ('tA', 'teacher', 'schoolA'))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT 'User ' || u.name, u.name || '@221.test', u.type, tst.id(u.school), tst.uid(u.name), true
FROM u;
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;

-- A programme, a learner and a beneficiary, written with no JWT (maintenance).
INSERT INTO sms_sbfp_programs (school_id, school_year) VALUES (tst.id('schoolA'), '2099-2100');
INSERT INTO tst.ids (name, id) SELECT 'prog', id FROM sms_sbfp_programs WHERE school_year = '2099-2100';
INSERT INTO sms_students (lrn, first_name, last_name, date_of_birth, gender)
VALUES ('221000000001', 'Test', 'Learner', '2015-01-01', 'male');
INSERT INTO tst.ids (name, id) SELECT 'stu', id FROM sms_students WHERE lrn = '221000000001';
INSERT INTO sms_sbfp_beneficiaries (program_id, student_id) VALUES (tst.id('prog'), tst.id('stu'));

-- ------------------------------------------------------------- the switch --
-- Default is ON, and a missing row reads as ON.
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_sbfp_settings WHERE is_enabled$$, 1);

SET LOCAL ROLE anon;
SELECT tst.expect_error($$SELECT procurements.sbfp_set_enabled(false)$$, 'permission denied');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT tst.claims(tst.uid('tA'));
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_sbfp_settings$$, 1);
SELECT tst.expect_error($$SELECT procurements.sbfp_set_enabled(false)$$, 'Only a super admin');
SELECT tst.claims(tst.uid('div'));
SELECT tst.expect_error($$SELECT procurements.sbfp_set_enabled(false)$$, 'Only a super admin');
SELECT tst.expect_error($$UPDATE procurements.sms_sbfp_settings SET is_enabled = false$$, 'permission denied');
SELECT tst.claims(tst.uid('sa'));
SELECT procurements.sbfp_set_enabled(false);
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_sbfp_settings WHERE NOT is_enabled AND updated_by = tst.id('sa')$$, 1);
RESET ROLE;

-- ------------------------------------------------------- while it is off --
-- Every SBFP data table carries the guard.
SELECT tst.expect_count($$
  SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'procurements' AND c.relkind = 'r'
     AND c.relname LIKE 'sms\_sbfp\_%' AND c.relname <> 'sms_sbfp_settings'
     AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgname = 'sbfp_assert_enabled')$$, 0);

-- Direct writes from a signed-in request are refused, even a super admin's,
-- and even a statement that would touch no row.
SELECT tst.claims(tst.uid('sa'));
SELECT tst.expect_error($$UPDATE procurements.sms_sbfp_programs SET district = 'x' WHERE id = tst.id('prog')$$, 'turned off');
SELECT tst.expect_error($$DELETE FROM procurements.sms_sbfp_beneficiaries WHERE false$$, 'turned off');
SELECT tst.expect_error($$INSERT INTO procurements.sms_sbfp_feedback (program_id, concern) VALUES (tst.id('prog'), 'x')$$, 'turned off');
SELECT tst.claims(tst.uid('tA'), 'anon');
SELECT tst.expect_error($$DELETE FROM procurements.sms_sbfp_kitchens WHERE false$$, 'turned off');

-- Reads are untouched.
SELECT tst.claims(tst.uid('sa'));
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_sbfp_beneficiaries WHERE program_id = tst.id('prog')$$, 1);

-- An FK cascade from outside SBFP is not refused: deleting the learner still
-- removes their beneficiary row.
DELETE FROM sms_students WHERE id = tst.id('stu');
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_sbfp_beneficiaries WHERE program_id = tst.id('prog')$$, 0);

-- service_role and maintenance sessions are not refused.
SELECT tst.claims(NULL, 'service_role');
UPDATE sms_sbfp_programs SET district = 'svc' WHERE id = tst.id('prog');
SELECT set_config('request.jwt.claims', '', true);
UPDATE sms_sbfp_programs SET district = 'maint' WHERE id = tst.id('prog');

-- ------------------------------------------------------ back on, resumes --
SET LOCAL ROLE authenticated;
SELECT tst.claims(tst.uid('sa'));
SELECT procurements.sbfp_set_enabled(true);
RESET ROLE;
SELECT tst.claims(tst.uid('sa'));
UPDATE sms_sbfp_programs SET district = 'back' WHERE id = tst.id('prog');
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_sbfp_programs WHERE district = 'back'$$, 1);

\echo 'ALL 221 CHECKS PASSED'
ROLLBACK;
