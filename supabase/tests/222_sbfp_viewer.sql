-- Migration 222 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/222_sbfp_viewer.sql
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
UPDATE sms_sbfp_settings SET is_enabled = TRUE;

INSERT INTO tst.ids (name, uid) VALUES
  ('viewer', '00000000-0000-4000-8000-000000000222'),
  ('div',    '00000000-0000-4000-8000-0000000002d2'),
  ('tA',     '00000000-0000-4000-8000-0000000002e2');

INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@222.test', 'authenticated', 'authenticated' FROM tst.ids;

-- A real, active, non-test school with a section that has learners.
INSERT INTO tst.ids (name, id)
SELECT 'section', sec.id FROM sms_sections sec
  JOIN sms_schools s ON s.id = sec.school_id AND s.is_active AND s.id NOT IN (9, 10)
 WHERE EXISTS (SELECT 1 FROM sms_enrollments e WHERE e.section_id = sec.id)
 ORDER BY sec.id LIMIT 1;
INSERT INTO tst.ids (name, id)
SELECT 'schoolA', school_id FROM sms_sections WHERE id = tst.id('section');
INSERT INTO tst.ids (name, id)
SELECT 'learner' || row_number() OVER (ORDER BY student_id), student_id
  FROM (SELECT DISTINCT student_id FROM sms_enrollments
         WHERE section_id = tst.id('section') ORDER BY student_id LIMIT 3) x;

WITH u(name, type, school) AS (VALUES
  ('viewer', 'sbfp_viewer', NULL), ('div', 'division_type', NULL),
  ('tA', 'teacher', 'schoolA'))
INSERT INTO sms_users (name, email, type, school_id, is_active)
SELECT u.name, u.name || '@222.test', u.type, tst.id(u.school), true FROM u;
-- The viewer's user_id is left unset: AuthGuard backfills it on first login,
-- which section 3 replays. The others are linked now.
UPDATE sms_users u SET user_id = tst.uid(split_part(u.email, '@', 1))
 WHERE u.email IN ('div@222.test', 'tA@222.test');
INSERT INTO tst.ids (name, id) SELECT split_part(email, '@', 1) || '_row', id
  FROM sms_users WHERE email LIKE '%@222.test';

INSERT INTO sms_sbfp_programs (school_id, school_year)
VALUES (tst.id('schoolA'), '2099-2100');
INSERT INTO tst.ids (name, id)
SELECT 'program', id FROM sms_sbfp_programs WHERE school_year = '2099-2100';

INSERT INTO sms_sbfp_beneficiaries (program_id, student_id, section_id, classification, milk_tolerance, created_by)
SELECT tst.id('program'), tst.id(n), tst.id('section'), c, 'none', tst.id('tA_row')
  FROM (VALUES ('learner1', 'primary'), ('learner2', 'primary'), ('learner3', 'secondary')) v(n, c);

INSERT INTO sms_sbfp_measurements (beneficiary_id, period, nutritional_status)
SELECT b.id, p.period, p.status
  FROM sms_sbfp_beneficiaries b
  JOIN (VALUES
    ('learner1', 'baseline', 'wasted'), ('learner1', 'endline', 'normal'),
    ('learner2', 'baseline', 'severely_wasted'), ('learner2', 'endline', 'wasted'),
    ('learner3', 'baseline', 'normal')) p(n, period, status)
    ON b.student_id = tst.id(p.n)
 WHERE b.program_id = tst.id('program');

INSERT INTO sms_sbfp_feeding_days (program_id, feeding_date)
VALUES (tst.id('program'), '2099-07-01'), (tst.id('program'), '2099-07-02');
-- learner1 fed both days, learner2 absent once, a code on a removed day ignored.
INSERT INTO sms_sbfp_feeding_records (beneficiary_id, feeding_date, code)
SELECT b.id, r.d::DATE, r.code
  FROM sms_sbfp_beneficiaries b
  JOIN (VALUES ('learner1', '2099-07-01', 'H'), ('learner1', '2099-07-02', 'H+M'),
               ('learner2', '2099-07-01', 'A'), ('learner2', '2099-07-02', 'N'),
               ('learner3', '2099-07-03', 'H')) r(n, d, code)
    ON b.student_id = tst.id(r.n)
 WHERE b.program_id = tst.id('program');

INSERT INTO sms_sbfp_feedback (program_id, received_on, source, category, concern, status, created_by)
VALUES (tst.id('program'), '2099-07-01', 'parent', 'food_quality', 'cold rice', 'open', tst.id('tA_row'));

-- ------------------------------------------------- 1. the role is storable --
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM sms_users WHERE email = 'viewer@222.test' AND type = 'sbfp_viewer') THEN
    RAISE EXCEPTION 'FAIL sbfp_viewer not stored';
  END IF;
  RAISE NOTICE 'ok  sbfp_viewer is a legal type';
END $$;

-- ------------------------------------------------- 2. first login backfill --
-- Exactly what AuthGuard does before user_id is set: the session has the
-- auth uid, the row has none yet.
SET LOCAL ROLE authenticated;
SELECT tst.claims(tst.uid('viewer'));
SELECT tst.expect_rows(
  format('UPDATE sms_users SET user_id = %L WHERE id = %s', tst.uid('viewer'), tst.id('viewer_row')), 1);

-- --------------------------------------------------- 3. the viewer reads --
SELECT tst.expect_count(
  format('SELECT count(*) FROM sms_sbfp_beneficiaries WHERE program_id = %s', tst.id('program')), 3);
SELECT tst.expect_count(
  format('SELECT count(*) FROM sms_sbfp_measurements m JOIN sms_sbfp_beneficiaries b ON b.id = m.beneficiary_id WHERE b.program_id = %s', tst.id('program')), 5);
SELECT tst.expect_count(
  format('SELECT count(*) FROM sms_sbfp_feeding_records r JOIN sms_sbfp_beneficiaries b ON b.id = r.beneficiary_id WHERE b.program_id = %s', tst.id('program')), 5);

-- Overview figures for the fixture school.
SELECT tst.expect_count(format('SELECT beneficiaries FROM sbfp_division_overview(''2099-2100'') WHERE school_id = %s', tst.id('schoolA')), 3);
SELECT tst.expect_count(format('SELECT primary_count FROM sbfp_division_overview(''2099-2100'') WHERE school_id = %s', tst.id('schoolA')), 2);
SELECT tst.expect_count(format('SELECT milk_participants FROM sbfp_division_overview(''2099-2100'') WHERE school_id = %s', tst.id('schoolA')), 3);
SELECT tst.expect_count(format('SELECT baseline_weighed FROM sbfp_division_overview(''2099-2100'') WHERE school_id = %s', tst.id('schoolA')), 3);
SELECT tst.expect_count(format('SELECT endline_weighed FROM sbfp_division_overview(''2099-2100'') WHERE school_id = %s', tst.id('schoolA')), 2);
SELECT tst.expect_count(format('SELECT wasted_at_baseline FROM sbfp_division_overview(''2099-2100'') WHERE school_id = %s', tst.id('schoolA')), 2);
SELECT tst.expect_count(format('SELECT rehabilitated FROM sbfp_division_overview(''2099-2100'') WHERE school_id = %s', tst.id('schoolA')), 1);
SELECT tst.expect_count(format('SELECT feeding_days FROM sbfp_division_overview(''2099-2100'') WHERE school_id = %s', tst.id('schoolA')), 2);
-- 'A' is absent and the 07-03 code is on no feeding day: 3 present, not 4 or 5.
SELECT tst.expect_count(format('SELECT days_present FROM sbfp_division_overview(''2099-2100'') WHERE school_id = %s', tst.id('schoolA')), 3);
SELECT tst.expect_count(format('SELECT feedback_open FROM sbfp_division_overview(''2099-2100'') WHERE school_id = %s', tst.id('schoolA')), 1);
-- Test schools never appear; every active school does, programme or not.
SELECT tst.expect_count('SELECT count(*) FROM sbfp_division_overview(''2099-2100'') WHERE school_id IN (9, 10)', 0);
SELECT tst.expect_count(
  'SELECT count(*) FROM sbfp_division_overview(''2099-2100'')',
  (SELECT count(*) FROM sms_schools WHERE is_active AND id NOT IN (9, 10)));
-- Nutrition rows sum back to the weighings.
SELECT tst.expect_count(
  format('SELECT sum(learners) FROM sbfp_division_nutrition(''2099-2100'') WHERE school_id = %s', tst.id('schoolA')), 5);
SELECT tst.expect_count(
  format('SELECT sum(learners) FROM sbfp_division_nutrition(''2099-2100'') WHERE school_id = %s AND period = ''baseline'' AND nutritional_status IN (''wasted'', ''severely_wasted'')', tst.id('schoolA')), 2);

-- ---------------------------------------------- 4. the viewer writes nothing --
SELECT tst.expect_rows(
  format('UPDATE sms_students SET first_name = first_name WHERE id = %s', tst.id('learner1')), 0);
SELECT tst.expect_rows(
  format('UPDATE sms_sections SET name = name WHERE id = %s', tst.id('section')), 0);
SELECT tst.expect_rows(
  format('DELETE FROM sms_sbfp_feedback WHERE program_id = %s', tst.id('program')), 0);
SELECT tst.expect_error(
  format('INSERT INTO sms_sbfp_feedback (program_id, received_on, source, category, concern, status) VALUES (%s, ''2099-07-02'', ''parent'', ''other'', ''x'', ''open'')', tst.id('program')),
  'row-level security');
SELECT tst.expect_error(
  'INSERT INTO sms_schools (name) VALUES (''222 test school'')',
  'row-level security');
-- Its own type cannot be changed into something with more reach (163's guard).
SELECT tst.expect_error(
  format('UPDATE sms_users SET type = ''division_type'' WHERE id = %s', tst.id('viewer_row')),
  'role');

-- ------------------------------------- 5. nobody else's behaviour moves --
SELECT tst.claims(tst.uid('tA'));
SELECT tst.expect_error('SELECT * FROM sbfp_division_overview(''2099-2100'')', 'Only the division office');
SELECT tst.expect_error('SELECT * FROM sbfp_division_nutrition(''2099-2100'')', 'Only the division office');
-- The pre-existing open write policy on sms_students still admits a teacher.
SELECT tst.expect_rows(
  format('UPDATE sms_students SET first_name = first_name WHERE id = %s', tst.id('learner1')), 1);
-- A teacher still sees only the beneficiaries they encoded (210) — all three here.
SELECT tst.expect_count(
  format('SELECT count(*) FROM sms_sbfp_beneficiaries WHERE program_id = %s', tst.id('program')), 3);

SELECT tst.claims(tst.uid('div'));
SELECT tst.expect_count(format('SELECT beneficiaries FROM sbfp_division_overview(''2099-2100'') WHERE school_id = %s', tst.id('schoolA')), 3);
SELECT tst.expect_rows(
  format('UPDATE sms_sections SET name = name WHERE id = %s', tst.id('section')), 1);

RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'ALL 222 CHECKS PASSED'; END $$;
ROLLBACK;
