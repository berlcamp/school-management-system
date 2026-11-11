-- Migration 233 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/233_sbfp_dispatch_barangay_kitchen.sql
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
CREATE FUNCTION tst.refused(p_sql TEXT, p_like TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%' || p_like || '%' THEN
      RAISE NOTICE 'ok  refused: %', left(p_sql, 70);
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL expected "%" but got "%" for: %', p_like, SQLERRM, p_sql;
  END;
  RAISE EXCEPTION 'FAIL expected "%" but it succeeded: %', p_like, p_sql;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tst TO authenticated;

-- ---------------------------------------------------------------- fixtures --
INSERT INTO tst.ids (name, uid) VALUES ('head', '00000000-0000-4000-8000-0000000233a1');
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@233.test', 'authenticated', 'authenticated' FROM tst.ids;
INSERT INTO tst.ids (name, id) SELECT 'school', min(id) FROM sms_schools;
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
VALUES ('head', 'head@233.test', 'school_head', tst.id('school'), tst.uid('head'), true);
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;
INSERT INTO sms_user_schools (user_id, school_id)
VALUES (tst.id('head'), tst.id('school')) ON CONFLICT DO NOTHING;

SELECT tst.claims(tst.uid('head'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_programs (school_id, school_year) VALUES (tst.id('school'), '2098-2099');
RESET ROLE;
INSERT INTO tst.ids (name, id)
SELECT 'prog', id FROM sms_sbfp_programs WHERE school_id = tst.id('school') AND school_year = '2098-2099';

-- ------------------------------------------- dispatch: barangay as kitchen ---
SELECT tst.claims(tst.uid('head'));
SET LOCAL ROLE authenticated;
-- A barangay, a centralized kitchen, and at school site all save.
INSERT INTO sms_sbfp_dispatch_logs (program_id, kitchen_barangay) VALUES (tst.id('prog'), 'Poblacion');
INSERT INTO sms_sbfp_dispatch_logs (program_id, kitchen_id)
  SELECT tst.id('prog'), id FROM sms_sbfp_kitchens LIMIT 1;
INSERT INTO sms_sbfp_dispatch_logs (program_id) VALUES (tst.id('prog'));
-- A blank barangay, and a barangay beside a kitchen, are refused.
SELECT tst.refused(format($$ INSERT INTO sms_sbfp_dispatch_logs (program_id, kitchen_barangay) VALUES (%s, '  ') $$, tst.id('prog')), 'barangay_check');
SELECT tst.refused(format(
  $$ INSERT INTO sms_sbfp_dispatch_logs (program_id, kitchen_id, kitchen_barangay)
     SELECT %s, id, 'Poblacion' FROM sms_sbfp_kitchens LIMIT 1 $$, tst.id('prog')), 'barangay_check');
-- Editing an entry from a barangay to a kitchen clears the barangay in the same write.
UPDATE sms_sbfp_dispatch_logs
   SET kitchen_id = (SELECT id FROM sms_sbfp_kitchens LIMIT 1), kitchen_barangay = NULL
 WHERE program_id = tst.id('prog') AND kitchen_barangay = 'Poblacion';
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM procurements.sms_sbfp_dispatch_logs
       WHERE program_id = (SELECT id FROM tst.ids WHERE name = 'prog')) <> 3 THEN
    RAISE EXCEPTION 'FAIL expected 3 dispatch logs';
  END IF;
END $$;

\echo 'ALL 233 ASSERTIONS PASSED'
ROLLBACK;
