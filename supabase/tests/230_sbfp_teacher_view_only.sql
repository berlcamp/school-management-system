-- Migration 230 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/230_sbfp_teacher_view_only.sql
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
CREATE FUNCTION tst.refused(p_sql TEXT, p_like TEXT DEFAULT 'row-level security') RETURNS VOID
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
-- An UPDATE or DELETE that RLS filters away raises nothing: it touches 0 rows.
CREATE FUNCTION tst.rows(p_sql TEXT, p_want INT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> p_want THEN
    RAISE EXCEPTION 'FAIL expected % rows, got % for: %', p_want, n, p_sql;
  END IF;
  RAISE NOTICE 'ok  % rows: %', n, left(p_sql, 70);
END $$;
CREATE FUNCTION tst.count(p_sql TEXT, p_want BIGINT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE n BIGINT;
BEGIN
  EXECUTE p_sql INTO n;
  IF n IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'FAIL expected %, got % for: %', p_want, n, p_sql;
  END IF;
  RAISE NOTICE 'ok  %: %', n, left(p_sql, 70);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tst TO authenticated;

-- ---------------------------------------------------------------- fixtures --
INSERT INTO tst.ids (name, uid) VALUES
  ('head',  '00000000-0000-4000-8000-0000000230a1'),
  ('t1',    '00000000-0000-4000-8000-0000000230a2'),
  ('t2',    '00000000-0000-4000-8000-0000000230a3'),
  ('vol',   '00000000-0000-4000-8000-0000000230a4'),
  ('focal', '00000000-0000-4000-8000-0000000230a5'),
  ('coord', '00000000-0000-4000-8000-0000000230a6'),
  ('tB',    '00000000-0000-4000-8000-0000000230b1');
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@230.test', 'authenticated', 'authenticated' FROM tst.ids;
INSERT INTO tst.ids (name, id)
SELECT 'schoolA', min(id) FROM sms_schools
UNION ALL
SELECT 'schoolB', (SELECT id FROM sms_schools ORDER BY id OFFSET 1 LIMIT 1);

WITH u(name, type, school) AS (VALUES
  ('head', 'school_head', 'schoolA'), ('t1', 'teacher', 'schoolA'),
  ('t2', 'teacher', 'schoolA'), ('vol', 'volunteer_teacher', 'schoolA'),
  ('focal', 'teacher', 'schoolA'), ('coord', 'teacher', 'schoolA'),
  ('tB', 'teacher', 'schoolB'))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@230.test', u.type, tst.id(u.school), tst.uid(u.name), true FROM u;
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;

INSERT INTO sms_user_schools (user_id, school_id)
SELECT id, school_id FROM sms_users WHERE email LIKE '%@230.test'
ON CONFLICT DO NOTHING;
INSERT INTO sms_staff_designations (user_id, school_id, designation)
VALUES (tst.id('coord'), tst.id('schoolA'), 'sbfp_coordinator');

INSERT INTO sms_sections (name, grade_level, school_year, school_id, is_active)
VALUES ('SBFP-230', 3, '2098-2099', tst.id('schoolA'), true);
INSERT INTO tst.ids (name, id) SELECT 'sec', id FROM sms_sections WHERE name = 'SBFP-230';
INSERT INTO sms_students (lrn, first_name, last_name, date_of_birth, gender, school_id)
VALUES ('230000000001', 'Uno', 'Test', '2017-01-01', 'male', tst.id('schoolA')),
       ('230000000002', 'Dos', 'Test', '2017-02-01', 'female', tst.id('schoolA'));
INSERT INTO tst.ids (name, id)
SELECT CASE lrn WHEN '230000000001' THEN 'st1' ELSE 'st2' END, id
  FROM sms_students WHERE lrn IN ('230000000001', '230000000002');

SELECT tst.claims(tst.uid('head'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_programs (school_id, school_year, focal_person_id)
VALUES (tst.id('schoolA'), '2098-2099', tst.id('focal'));
RESET ROLE;
INSERT INTO tst.ids (name, id)
SELECT 'prog', id FROM sms_sbfp_programs WHERE school_id = tst.id('schoolA') AND school_year = '2098-2099';

-- A beneficiary a teacher encoded before 230: created_by is stamped from the
-- signed-in user, and the superuser session here passes RLS.
SELECT tst.claims(tst.uid('t1'));
INSERT INTO sms_sbfp_beneficiaries (program_id, student_id, section_id)
VALUES (tst.id('prog'), tst.id('st1'), tst.id('sec'));
INSERT INTO tst.ids (name, id)
SELECT 'ben', id FROM sms_sbfp_beneficiaries WHERE program_id = tst.id('prog');
INSERT INTO sms_sbfp_measurements (beneficiary_id, period, weight_kg) VALUES (tst.id('ben'), 'baseline', 18);
INSERT INTO sms_sbfp_feedback (program_id, concern) VALUES (tst.id('prog'), 'Earlier concern');
INSERT INTO sms_sbfp_kitchen_logs (program_id) VALUES (tst.id('prog'));
SELECT tst.count($$ SELECT count(*) FROM sms_sbfp_kitchen_logs WHERE created_by = tst.id('t1') $$, 1);

-- -------------------------------------------------- a teacher reads it all ---
-- t2 encoded none of these, and 210 would have shown them nothing.
SELECT tst.claims(tst.uid('t2'));
SET LOCAL ROLE authenticated;
SELECT tst.count($$ SELECT count(*) FROM sms_sbfp_beneficiaries WHERE id = tst.id('ben') $$, 1);
SELECT tst.count($$ SELECT count(*) FROM sms_sbfp_measurements WHERE beneficiary_id = tst.id('ben') $$, 1);
RESET ROLE;
SELECT tst.claims(tst.uid('vol'));
SET LOCAL ROLE authenticated;
SELECT tst.count($$ SELECT count(*) FROM sms_sbfp_beneficiaries WHERE id = tst.id('ben') $$, 1);
RESET ROLE;
-- A teacher of another school reads no learner.
SELECT tst.claims(tst.uid('tB'));
SET LOCAL ROLE authenticated;
SELECT tst.count($$ SELECT count(*) FROM sms_sbfp_beneficiaries WHERE id = tst.id('ben') $$, 0);
SELECT tst.count($$ SELECT count(*) FROM sms_sbfp_measurements WHERE beneficiary_id = tst.id('ben') $$, 0);
RESET ROLE;

-- ---------------------------------------------- and writes nothing, even own --
SELECT tst.claims(tst.uid('t1'));
SET LOCAL ROLE authenticated;
SELECT tst.refused(format($$ INSERT INTO sms_sbfp_programs (school_id, school_year) VALUES (%s, '2097-2098') $$, tst.id('schoolA')));
SELECT tst.rows($$ UPDATE sms_sbfp_programs SET district = 'x' WHERE id = tst.id('prog') $$, 0);
SELECT tst.refused(format($$ INSERT INTO sms_sbfp_beneficiaries (program_id, student_id, section_id) VALUES (%s, %s, %s) $$, tst.id('prog'), tst.id('st2'), tst.id('sec')));
SELECT tst.rows($$ UPDATE sms_sbfp_beneficiaries SET classification = 'primary' WHERE id = tst.id('ben') $$, 0);
SELECT tst.rows($$ DELETE FROM sms_sbfp_beneficiaries WHERE id = tst.id('ben') $$, 0);
SELECT tst.refused(format($$ INSERT INTO sms_sbfp_measurements (beneficiary_id, period) VALUES (%s, 'midline') $$, tst.id('ben')));
SELECT tst.rows($$ UPDATE sms_sbfp_measurements SET weight_kg = 99 WHERE beneficiary_id = tst.id('ben') $$, 0);
SELECT tst.refused(format($$ INSERT INTO sms_sbfp_feeding_days (program_id, feeding_date) VALUES (%s, '2098-07-03') $$, tst.id('prog')));
SELECT tst.refused(format($$ INSERT INTO sms_sbfp_feeding_records (beneficiary_id, feeding_date, code) VALUES (%s, '2098-07-03', 'H') $$, tst.id('ben')));
SELECT tst.refused(format($$ INSERT INTO sms_sbfp_deliveries (program_id, component, grade_level) VALUES (%s, 'nfp', 3) $$, tst.id('prog')));
SELECT tst.refused(format($$ INSERT INTO sms_sbfp_feedback (program_id, concern) VALUES (%s, 'x') $$, tst.id('prog')));
SELECT tst.rows($$ UPDATE sms_sbfp_feedback SET status = 'resolved' WHERE concern = 'Earlier concern' $$, 0);
SELECT tst.refused(format($$ INSERT INTO sms_sbfp_kitchen_logs (program_id) VALUES (%s) $$, tst.id('prog')));
SELECT tst.rows($$ UPDATE sms_sbfp_kitchen_logs SET remarks = 'x' $$, 0);
SELECT tst.rows($$ DELETE FROM sms_sbfp_kitchen_logs $$, 0);
SELECT tst.refused(format($$ INSERT INTO sms_sbfp_dispatch_logs (program_id) VALUES (%s) $$, tst.id('prog')));
SELECT tst.refused(format($$ INSERT INTO sms_sbfp_receiving_logs (program_id) VALUES (%s) $$, tst.id('prog')));
RESET ROLE;

-- ------------------------------------------ except a Hot Meals evaluation ---
SELECT tst.claims(tst.uid('t1'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_quality_responses (program_id, beneficiary_id, answers)
VALUES (tst.id('prog'), tst.id('ben'), '{}');
SELECT tst.rows($$ UPDATE sms_sbfp_quality_responses SET answers = '{"1": 5}' $$, 1);
RESET ROLE;
SELECT tst.count($$ SELECT count(*) FROM sms_sbfp_quality_responses WHERE created_by = tst.id('t1') $$, 1);
SELECT tst.claims(tst.uid('vol'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_quality_responses (program_id, answers) VALUES (tst.id('prog'), '{}');
RESET ROLE;
-- A colleague's evaluation is not theirs; another school files nothing here.
SELECT tst.claims(tst.uid('t2'));
SET LOCAL ROLE authenticated;
SELECT tst.rows($$ UPDATE sms_sbfp_quality_responses SET answers = '{}' $$, 0);
SELECT tst.rows($$ DELETE FROM sms_sbfp_quality_responses $$, 0);
RESET ROLE;
SELECT tst.claims(tst.uid('tB'));
SET LOCAL ROLE authenticated;
SELECT tst.refused(format($$ INSERT INTO sms_sbfp_quality_responses (program_id) VALUES (%s) $$, tst.id('prog')));
RESET ROLE;
-- An author removes their own.
SELECT tst.claims(tst.uid('t1'));
SET LOCAL ROLE authenticated;
SELECT tst.rows($$ DELETE FROM sms_sbfp_quality_responses $$, 1);
RESET ROLE;

-- ---------------------- a teacher who manages keeps the manager's rights ---
-- The focal person and the SBFP Coordinator act as teachers here.
SELECT tst.claims(tst.uid('focal'));
SET LOCAL ROLE authenticated;
SELECT tst.rows($$ UPDATE sms_sbfp_beneficiaries SET classification = 'primary' WHERE id = tst.id('ben') $$, 1);
INSERT INTO sms_sbfp_feeding_days (program_id, feeding_date) VALUES (tst.id('prog'), '2098-07-03');
INSERT INTO sms_sbfp_feedback (program_id, concern) VALUES (tst.id('prog'), 'From focal');
RESET ROLE;
SELECT tst.claims(tst.uid('coord'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_programs (school_id, school_year) VALUES (tst.id('schoolA'), '2097-2098');
INSERT INTO sms_sbfp_beneficiaries (program_id, student_id, section_id, classification)
VALUES (tst.id('prog'), tst.id('st2'), tst.id('sec'), 'primary')
ON CONFLICT (program_id, student_id) DO UPDATE SET classification = EXCLUDED.classification;
INSERT INTO sms_sbfp_kitchen_logs (program_id) VALUES (tst.id('prog'));
RESET ROLE;
-- And the head still edits the row a teacher encoded.
SELECT tst.claims(tst.uid('head'));
SET LOCAL ROLE authenticated;
SELECT tst.rows($$ UPDATE sms_sbfp_measurements SET weight_kg = 19 WHERE beneficiary_id = tst.id('ben') $$, 1);

-- --------------------------------------------------- barangay as kitchen ---
INSERT INTO sms_sbfp_kitchen_logs (program_id, kitchen_barangay) VALUES (tst.id('prog'), 'Poblacion');
SELECT tst.refused(format($$ INSERT INTO sms_sbfp_kitchen_logs (program_id, kitchen_barangay) VALUES (%s, '  ') $$, tst.id('prog')), 'barangay_check');
SELECT tst.refused(format(
  $$ INSERT INTO sms_sbfp_kitchen_logs (program_id, kitchen_id, kitchen_barangay)
     SELECT %s, id, 'Poblacion' FROM sms_sbfp_kitchens LIMIT 1 $$, tst.id('prog')), 'barangay_check');
RESET ROLE;

-- ------------------------------------------------------------- grants ------
SELECT tst.count($$ SELECT count(*) FROM information_schema.routine_privileges
  WHERE routine_schema = 'procurements' AND grantee IN ('anon', 'PUBLIC')
    AND routine_name IN ('sbfp_can_file_quality', 'sbfp_can_edit_quality') $$, 0);

\echo 'ALL 230 ASSERTIONS PASSED'
ROLLBACK;
