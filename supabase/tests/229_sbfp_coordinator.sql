-- Migration 229 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/229_sbfp_coordinator.sql
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
CREATE FUNCTION tst.expect(p_sql TEXT, p_want BOOLEAN) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE r BOOLEAN;
BEGIN
  EXECUTE p_sql INTO r;
  IF r IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'FAIL expected %, got % for: %', p_want, r, p_sql;
  END IF;
  RAISE NOTICE 'ok  %: %', r, left(p_sql, 80);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tst TO authenticated;

-- ---------------------------------------------------------------- fixtures --
INSERT INTO tst.ids (name, uid) VALUES
  ('coord',     '00000000-0000-4000-8000-0000000229a1'),  -- registrar + designation
  ('registrar', '00000000-0000-4000-8000-0000000229a2'),  -- registrar, none
  ('teacher',   '00000000-0000-4000-8000-0000000229a3');  -- teacher, none

INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@229.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id)
SELECT 'schoolA', min(id) FROM sms_schools
UNION ALL
SELECT 'schoolB', (SELECT id FROM sms_schools ORDER BY id OFFSET 1 LIMIT 1);

WITH u(name, type) AS (VALUES ('coord', 'registrar'), ('registrar', 'registrar'), ('teacher', 'teacher'))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@229.test', u.type, tst.id('schoolA'), tst.uid(u.name), true FROM u;
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;

INSERT INTO sms_user_schools (user_id, school_id)
VALUES (tst.id('coord'), tst.id('schoolB'))
ON CONFLICT DO NOTHING;

INSERT INTO sms_staff_designations (user_id, school_id, designation)
VALUES (tst.id('coord'), tst.id('schoolA'), 'sbfp_coordinator');

-- Anything outside the list is still refused.
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_staff_designations (user_id, school_id, designation) VALUES (%s, %s, 'nope') $$,
  tst.id('teacher'), tst.id('schoolA')), 'designation_check');

INSERT INTO sms_sections (name, grade_level, school_year, school_id, is_active)
VALUES ('SBFP-229', 3, '2099-2100', tst.id('schoolA'), true);
INSERT INTO tst.ids (name, id) SELECT 'sec', id FROM sms_sections WHERE name = 'SBFP-229';
INSERT INTO sms_students (lrn, first_name, last_name, date_of_birth, gender, school_id)
VALUES ('229000000001', 'Uno', 'Test', '2017-01-01', 'male', tst.id('schoolA'));
INSERT INTO tst.ids (name, id) SELECT 'st1', id FROM sms_students WHERE lrn = '229000000001';

-- --------------------------------------------- without the designation ---
SELECT tst.claims(tst.uid('registrar'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_programs (school_id, school_year) VALUES (%s, '2099-2100') $$,
  tst.id('schoolA')), 'row-level security');
RESET ROLE;

-- ------------------------------------------------ opens and runs it ---
SELECT tst.claims(tst.uid('coord'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_programs (school_id, school_year) VALUES (tst.id('schoolA'), '2099-2100');
RESET ROLE;
INSERT INTO tst.ids (name, id)
SELECT 'prog', id FROM sms_sbfp_programs WHERE school_id = tst.id('schoolA') AND school_year = '2099-2100';
-- Set with no signed-in user: the guard refuses this for the coordinator, below.
SELECT set_config('request.jwt.claims', '', true);
UPDATE sms_sbfp_programs SET focal_person_id = tst.id('teacher') WHERE id = tst.id('prog');
SELECT tst.claims(tst.uid('coord'));

SET LOCAL ROLE authenticated;
SELECT tst.expect(format($$ SELECT sbfp_can_manage(%s) $$, tst.id('prog')), true);
UPDATE sms_sbfp_programs SET feeding_start_date = '2099-07-01' WHERE id = tst.id('prog');
INSERT INTO sms_sbfp_beneficiaries (program_id, student_id, section_id)
VALUES (tst.id('prog'), tst.id('st1'), tst.id('sec'));
INSERT INTO sms_sbfp_feeding_days (program_id, feeding_date) VALUES (tst.id('prog'), '2099-07-01');
INSERT INTO sms_sbfp_feedback (program_id, received_on, concern)
VALUES (tst.id('prog'), '2099-07-01', 'Late delivery');

-- A manager's limits stay: no handing on the focal role, no deleting the programme.
SELECT tst.expect_error(format(
  $$ UPDATE sms_sbfp_programs SET focal_person_id = %s WHERE id = %s $$,
  tst.id('coord'), tst.id('prog')), 'may change the feeding focal person');
DELETE FROM sms_sbfp_programs WHERE id = tst.id('prog');
SELECT tst.expect(format($$ SELECT EXISTS (SELECT 1 FROM sms_sbfp_programs WHERE id = %s) $$, tst.id('prog')), true);
RESET ROLE;

-- ------------------------------------- sees a colleague's beneficiary ---
INSERT INTO sms_students (lrn, first_name, last_name, date_of_birth, gender, school_id)
VALUES ('229000000002', 'Dos', 'Test', '2017-02-01', 'female', tst.id('schoolA'));
-- created_by is stamped from the signed-in user, so the teacher encodes it.
SELECT tst.claims(tst.uid('teacher'));
INSERT INTO sms_sbfp_beneficiaries (program_id, student_id, section_id)
SELECT tst.id('prog'), id, tst.id('sec') FROM sms_students WHERE lrn = '229000000002';
SELECT tst.claims(tst.uid('coord'));
SET LOCAL ROLE authenticated;
SELECT tst.expect(format($$ SELECT count(*) = 2 FROM sms_sbfp_beneficiaries WHERE program_id = %s $$, tst.id('prog')), true);
RESET ROLE;

-- ------------------------------------ the designation is per active school ---
SELECT set_config('request.jwt.claims', '', true);
UPDATE sms_users SET school_id = tst.id('schoolB') WHERE id = tst.id('coord');
SELECT tst.claims(tst.uid('coord'));
SET LOCAL ROLE authenticated;
SELECT tst.expect(format($$ SELECT sbfp_can_manage(%s) $$, tst.id('prog')), false);
SELECT tst.expect(format($$ SELECT sbfp_can_open(%s) $$, tst.id('schoolB')), false);
RESET ROLE;

-- ---------------------------------------------------- removing it ---
SELECT set_config('request.jwt.claims', '', true);
UPDATE sms_users SET school_id = tst.id('schoolA') WHERE id = tst.id('coord');
DELETE FROM sms_staff_designations WHERE user_id = tst.id('coord');
SELECT tst.claims(tst.uid('coord'));
SET LOCAL ROLE authenticated;
SELECT tst.expect(format($$ SELECT sbfp_can_manage(%s) $$, tst.id('prog')), false);
RESET ROLE;

-- -------------------------------------------------- an ordinary teacher ---
-- Unchanged: not the focal person's rights by mere membership.
SELECT set_config('request.jwt.claims', '', true);
UPDATE sms_sbfp_programs SET focal_person_id = NULL WHERE id = tst.id('prog');
SELECT tst.claims(tst.uid('teacher'));
SET LOCAL ROLE authenticated;
SELECT tst.expect(format($$ SELECT sbfp_can_manage(%s) $$, tst.id('prog')), false);
RESET ROLE;

\echo 229 tests passed
ROLLBACK;
