-- Migrations 209 + 210 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/209_sbfp.sql
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
  ('hA',    '00000000-0000-4000-8000-0000000209a1'),
  ('focal', '00000000-0000-4000-8000-0000000209a2'),
  ('advA',  '00000000-0000-4000-8000-0000000209a3'),
  ('tB',    '00000000-0000-4000-8000-0000000209b1'),
  ('div',   '00000000-0000-4000-8000-0000000209d1');

INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@209.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id)
SELECT 'schoolA', min(id) FROM sms_schools
UNION ALL
SELECT 'schoolB', (SELECT id FROM sms_schools ORDER BY id OFFSET 1 LIMIT 1);

WITH u(name, type, school) AS (VALUES
  ('hA', 'school_head', 'schoolA'), ('focal', 'teacher', 'schoolA'),
  ('advA', 'teacher', 'schoolA'), ('tB', 'teacher', 'schoolB'),
  ('div', 'division_admin', NULL))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@209.test', u.type, tst.id(u.school), tst.uid(u.name), true
FROM u;
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;

-- Two sections at school A: one advised by the focal person, one by advA.
INSERT INTO sms_sections (name, grade_level, school_year, school_id, section_adviser_id, is_active)
VALUES ('SBFP-209-F', 3, '2099-2100', tst.id('schoolA'), tst.id('focal'), true),
       ('SBFP-209-A', 3, '2099-2100', tst.id('schoolA'), tst.id('advA'), true);
INSERT INTO tst.ids (name, id)
SELECT CASE name WHEN 'SBFP-209-F' THEN 'secF' ELSE 'secA' END, id
  FROM sms_sections WHERE name IN ('SBFP-209-F', 'SBFP-209-A');

INSERT INTO sms_students (lrn, first_name, last_name, date_of_birth, gender, school_id)
VALUES ('209000000001', 'Uno', 'Test', '2017-01-01', 'male', tst.id('schoolA')),
       ('209000000002', 'Dos', 'Test', '2017-02-01', 'female', tst.id('schoolA'));
INSERT INTO tst.ids (name, id)
SELECT CASE lrn WHEN '209000000001' THEN 'st1' ELSE 'st2' END, id
  FROM sms_students WHERE lrn IN ('209000000001', '209000000002');

-- ------------------------------------------------------------ programme ---
-- A teacher at another school may not open this school's programme (210 lets
-- a teacher of THIS school open it; see the ownership section below).
SELECT tst.claims(tst.uid('tB'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_programs (school_id, school_year) VALUES (%s, '2099-2100') $$,
  tst.id('schoolA')), 'row-level security');
RESET ROLE;

-- The division office reads, but does not open one either.
SELECT tst.claims(tst.uid('div'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_programs (school_id, school_year) VALUES (%s, '2099-2100') $$,
  tst.id('schoolA')), 'row-level security');
RESET ROLE;

-- The school head opens it and designates the focal person.
SELECT tst.claims(tst.uid('hA'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_programs (school_id, school_year, focal_person_id, focal_person_name)
VALUES (tst.id('schoolA'), '2099-2100', tst.id('focal'), 'focal');
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_programs (school_id, school_year) VALUES (%s, '2099-2100') $$,
  tst.id('schoolA')), 'duplicate key');
RESET ROLE;
INSERT INTO tst.ids (name, id)
SELECT 'prog', id FROM sms_sbfp_programs WHERE school_year = '2099-2100';

-- The focal person may edit the header and the feeding days...
SELECT tst.claims(tst.uid('focal'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(format(
  $$ UPDATE sms_sbfp_programs SET feeding_start_date = '2099-07-01' WHERE id = %s $$,
  tst.id('prog')), 1);
INSERT INTO sms_sbfp_feeding_days (program_id, feeding_date)
VALUES (tst.id('prog'), '2099-07-01'), (tst.id('prog'), '2099-07-02');
-- ...but not hand the role to someone else, nor end-date before the start.
SELECT tst.expect_error(format(
  $$ UPDATE sms_sbfp_programs SET focal_person_id = %s WHERE id = %s $$,
  tst.id('advA'), tst.id('prog')), 'may change the feeding focal person');
SELECT tst.expect_error(format(
  $$ UPDATE sms_sbfp_programs SET feeding_end_date = '2099-06-01' WHERE id = %s $$,
  tst.id('prog')), 'check constraint');
RESET ROLE;

-- A teacher at another school changes nothing.
SELECT tst.claims(tst.uid('tB'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(format(
  $$ UPDATE sms_sbfp_programs SET district = 'x' WHERE id = %s $$, tst.id('prog')), 0);
SELECT tst.expect_count(format(
  $$ SELECT count(*) FROM sms_sbfp_programs WHERE id = %s $$, tst.id('prog')), 1);
RESET ROLE;

-- Nobody moves a programme to another school.
SELECT tst.claims(tst.uid('hA'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format(
  $$ UPDATE sms_sbfp_programs SET school_id = %s WHERE id = %s $$,
  tst.id('schoolB'), tst.id('prog')), 'cannot be moved');
RESET ROLE;

-- --------------------------------------------------------- beneficiaries ---
-- A teacher of another school selects nothing here.
SELECT tst.claims(tst.uid('tB'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_beneficiaries (program_id, student_id, section_id)
     VALUES (%s, %s, %s) $$, tst.id('prog'), tst.id('st2'), tst.id('secF')),
  'row-level security');
RESET ROLE;

-- A teacher of the school selects; the owner is stamped by the database, not
-- taken from the payload (210).
SELECT tst.claims(tst.uid('advA'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_beneficiaries (program_id, student_id, section_id, classification, created_by)
VALUES (tst.id('prog'), tst.id('st1'), tst.id('secA'), 'primary', tst.id('focal'));
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_beneficiaries (program_id, student_id, section_id, classification)
     VALUES (%s, %s, %s, 'tertiary') $$, tst.id('prog'), tst.id('st2'), tst.id('secA')),
  'check constraint');
-- A teacher may add a feeding day but not remove one (210).
INSERT INTO sms_sbfp_feeding_days (program_id, feeding_date) VALUES (tst.id('prog'), '2099-07-03');
SELECT tst.expect_rows(format(
  $$ DELETE FROM sms_sbfp_feeding_days WHERE program_id = %s $$, tst.id('prog')), 0);
-- Nor hand their record to someone else.
SELECT tst.expect_error(format(
  $$ UPDATE sms_sbfp_beneficiaries SET created_by = %s WHERE student_id = %s $$,
  tst.id('focal'), tst.id('st1')), 'reassign');
RESET ROLE;
SELECT tst.expect_count(format(
  $$ SELECT count(*) FROM sms_sbfp_beneficiaries WHERE student_id = %s AND created_by = %s $$,
  tst.id('st1'), tst.id('advA')), 1);
INSERT INTO tst.ids (name, id)
SELECT 'ben1', id FROM sms_sbfp_beneficiaries WHERE student_id = tst.id('st1');

-- The focal person (a manager) selects anywhere in the school.
SELECT tst.claims(tst.uid('focal'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_beneficiaries (program_id, student_id, section_id, milk_tolerance)
VALUES (tst.id('prog'), tst.id('st2'), tst.id('secA'), 'none');
SELECT tst.expect_error(format(
  $$ UPDATE sms_sbfp_beneficiaries SET program_id = program_id, student_id = %s WHERE id = %s $$,
  tst.id('st2'), tst.id('ben1')), 'cannot be moved');
RESET ROLE;

INSERT INTO tst.ids (name, id)
SELECT 'ben2', id FROM sms_sbfp_beneficiaries WHERE student_id = tst.id('st2');

-- ------------------------------------------------- ownership (migration 210) --
-- advA sees only the beneficiary they encoded; st2 (encoded by the focal
-- person, in advA's own section) is invisible and untouchable to them.
SELECT tst.claims(tst.uid('advA'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count(format(
  $$ SELECT count(*) FROM sms_sbfp_beneficiaries WHERE program_id = %s $$, tst.id('prog')), 1);
SELECT tst.expect_rows(format(
  $$ UPDATE sms_sbfp_beneficiaries SET is_dewormed = true WHERE id = %s $$, tst.id('ben2')), 0);
SELECT tst.expect_rows(format(
  $$ DELETE FROM sms_sbfp_beneficiaries WHERE id = %s $$, tst.id('ben2')), 0);
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_measurements (beneficiary_id, period, weight_kg) VALUES (%s, 'baseline', 20) $$,
  tst.id('ben2')), 'row-level security');
-- ...but is told the learner is taken, and nothing more.
SELECT tst.expect_count(format(
  $$ SELECT count(*) FROM sbfp_taken_students(%s, %s) t WHERE t = %s $$,
  tst.id('prog'), tst.id('secA'), tst.id('st2')), 1);
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_beneficiaries (program_id, student_id, section_id) VALUES (%s, %s, %s) $$,
  tst.id('prog'), tst.id('st2'), tst.id('secA')), 'duplicate key');
RESET ROLE;

-- The focal person and the division office see both.
SELECT tst.claims(tst.uid('focal'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count(format(
  $$ SELECT count(*) FROM sms_sbfp_beneficiaries WHERE program_id = %s $$, tst.id('prog')), 2);
RESET ROLE;
SELECT tst.claims(tst.uid('div'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count(format(
  $$ SELECT count(*) FROM sms_sbfp_beneficiaries WHERE program_id = %s $$, tst.id('prog')), 2);
RESET ROLE;

-- A teacher may open their own school's programme, but not name a focal person.
SELECT tst.claims(tst.uid('tB'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_programs (school_id, school_year, focal_person_id, focal_person_name)
VALUES (tst.id('schoolB'), '2099-2100', tst.id('tB'), 'tB');
SELECT tst.expect_rows(format(
  $$ UPDATE sms_sbfp_programs SET district = 'x' WHERE school_id = %s AND school_year = '2099-2100' $$,
  tst.id('schoolB')), 0);
RESET ROLE;
SELECT tst.expect_count(format(
  $$ SELECT count(*) FROM sms_sbfp_programs WHERE school_id = %s AND school_year = '2099-2100'
     AND focal_person_id IS NULL AND focal_person_name IS NULL $$, tst.id('schoolB')), 1);

-- ------------------------------------------------------------- weighings ---
-- Three periods, one row each; the adviser of the section weighs.
SELECT tst.claims(tst.uid('advA'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_measurements (beneficiary_id, period, measured_at, weight_kg, height_cm, nutritional_status, height_for_age)
VALUES (tst.id('ben1'), 'baseline', '2099-06-20', 18.5, 120, 'wasted', 'stunted'),
       (tst.id('ben1'), 'midline',  '2099-10-15', 19.2, 121.5, 'normal', 'stunted'),
       (tst.id('ben1'), 'endline',  '2100-02-20', 20.0, 123, 'normal', 'normal');
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_measurements (beneficiary_id, period) VALUES (%s, 'midline') $$,
  tst.id('ben1')), 'duplicate key');
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_measurements (beneficiary_id, period) VALUES (%s, 'quarterly') $$,
  tst.id('ben1')), 'check constraint');
SELECT tst.expect_error(format(
  $$ UPDATE sms_sbfp_measurements SET nutritional_status = 'underweight' WHERE beneficiary_id = %s AND period = 'midline' $$,
  tst.id('ben1')), 'check constraint');
SELECT tst.expect_error(format(
  $$ UPDATE sms_sbfp_measurements SET weight_kg = 0 WHERE beneficiary_id = %s AND period = 'midline' $$,
  tst.id('ben1')), 'check constraint');
RESET ROLE;

-- A teacher at another school cannot read, weigh or change them (210).
SELECT tst.claims(tst.uid('tB'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(format(
  $$ UPDATE sms_sbfp_measurements SET weight_kg = 99 WHERE beneficiary_id = %s $$,
  tst.id('ben1')), 0);
SELECT tst.expect_count(format(
  $$ SELECT count(*) FROM sms_sbfp_measurements WHERE beneficiary_id = %s $$,
  tst.id('ben1')), 0);
RESET ROLE;
SELECT tst.expect_count(format(
  $$ SELECT count(*) FROM sms_sbfp_measurements WHERE beneficiary_id = %s AND weight_kg <> 99 $$,
  tst.id('ben1')), 3);

-- --------------------------------------------------------------- feeding ---
SELECT tst.claims(tst.uid('advA'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_feeding_records (beneficiary_id, feeding_date, code)
VALUES (tst.id('ben1'), '2099-07-01', 'H+M'), (tst.id('ben1'), '2099-07-02', 'A');
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_feeding_records (beneficiary_id, feeding_date, code)
     VALUES (%s, '2099-07-03', 'X') $$, tst.id('ben1')), 'check constraint');
RESET ROLE;

-- Every legend shape is accepted; the other school's teacher writes nothing.
SELECT tst.claims(tst.uid('hA'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_feeding_records (beneficiary_id, feeding_date, code)
SELECT tst.id('ben1'), DATE '2099-08-01' + i::int, c
  FROM unnest(ARRAY['H','N','M','N+M','H2','N2','M2','H+M2','N+M2','H2+M2','N2+M2'])
       WITH ORDINALITY AS t(c, i);
RESET ROLE;

SELECT tst.claims(tst.uid('tB'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_feeding_records (beneficiary_id, feeding_date, code)
     VALUES (%s, '2099-07-05', 'H') $$, tst.id('ben1')), 'row-level security');
SELECT tst.expect_rows(format(
  $$ DELETE FROM sms_sbfp_feeding_records WHERE beneficiary_id = %s $$, tst.id('ben1')), 0);
RESET ROLE;

-- ----------------------------------------------------- contacts, deliveries --
SELECT tst.claims(tst.uid('advA'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_contacts (program_id, kind, name) VALUES (%s, 'consignee', 'x') $$,
  tst.id('prog')), 'row-level security');
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_deliveries (program_id, component, grade_level) VALUES (%s, 'milk', 3) $$,
  tst.id('prog')), 'row-level security');
RESET ROLE;

SELECT tst.claims(tst.uid('focal'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_contacts (program_id, kind, name) VALUES (tst.id('prog'), 'inspection', 'x');
INSERT INTO sms_sbfp_deliveries (program_id, component, grade_level, packs_new)
VALUES (tst.id('prog'), 'nfp', 3, 40);
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_deliveries (program_id, component, grade_level, packs_new)
     VALUES (%s, 'nfp', 3, -1) $$, tst.id('prog')), 'check constraint');
RESET ROLE;

-- -------------------------------------------------------------- cascade ----
-- Removing a beneficiary removes their weighings and feeding records with them.
SELECT tst.claims(tst.uid('advA'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(format(
  $$ DELETE FROM sms_sbfp_beneficiaries WHERE id = %s $$, tst.id('ben1')), 1);
RESET ROLE;
SELECT tst.expect_count(format(
  $$ SELECT count(*) FROM sms_sbfp_feeding_records WHERE beneficiary_id = %s $$,
  tst.id('ben1')), 0);
SELECT tst.expect_count(format(
  $$ SELECT count(*) FROM sms_sbfp_measurements WHERE beneficiary_id = %s $$,
  tst.id('ben1')), 0);

-- ------------------------------------------------------------- grants ------
SELECT tst.expect_count($$ SELECT count(*) FROM information_schema.routine_privileges
  WHERE routine_schema = 'procurements' AND grantee IN ('anon', 'PUBLIC')
    AND routine_name LIKE 'sbfp_%' $$, 0);

\echo 'ALL 209/210 ASSERTIONS PASSED'
ROLLBACK;
