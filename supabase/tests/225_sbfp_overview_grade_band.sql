-- Migration 225 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/225_sbfp_overview_grade_band.sql
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
  ('viewer', '00000000-0000-4000-8000-000000000225'),
  ('tA',     '00000000-0000-4000-8000-0000000002e5');
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@225.test', 'authenticated', 'authenticated' FROM tst.ids;

-- Two real, active, non-test schools. A offers Grade 1 and Grade 8 in the
-- fixture year; B offers Grade 11 only and has no programme.
INSERT INTO tst.ids (name, id)
SELECT 'school' || chr(64 + row_number() OVER (ORDER BY id)::int), id
  FROM (SELECT id FROM sms_schools WHERE is_active AND id NOT IN (9, 10) ORDER BY id LIMIT 2) s;
WITH v(name, school, grade) AS (VALUES ('g1', 'schoolA', 1), ('g8', 'schoolA', 8), ('g11', 'schoolB', 11)),
ins AS (
  INSERT INTO sms_sections (name, grade_level, school_year, school_id)
  SELECT '225-' || v.name, v.grade, '2099-2100', tst.id(v.school) FROM v
  RETURNING id, name
)
INSERT INTO tst.ids (name, id) SELECT substr(name, 5), id FROM ins;
INSERT INTO tst.ids (name, id)
SELECT 'learner' || row_number() OVER (ORDER BY id), id
  FROM (SELECT id FROM sms_students ORDER BY id LIMIT 3) x;

WITH u(name, type, school) AS (VALUES ('viewer', 'sbfp_viewer', NULL), ('tA', 'teacher', 'schoolA'))
INSERT INTO sms_users (name, email, type, school_id, is_active, user_id)
SELECT u.name, u.name || '@225.test', u.type, tst.id(u.school), true, tst.uid(u.name) FROM u;

WITH p AS (
  INSERT INTO sms_sbfp_programs (school_id, school_year) VALUES (tst.id('schoolA'), '2099-2100') RETURNING id
)
INSERT INTO tst.ids (name, id) SELECT 'prog', id FROM p;

-- learner1 in Grade 1 (fed 2 of 2 days), learner2 in Grade 8 (fed 1),
-- learner3 with no section — counted only with no band.
WITH v(name, learner, section) AS (VALUES ('b1', 'learner1', 'g1'), ('b2', 'learner2', 'g8'), ('b3', 'learner3', NULL)),
ins AS (
  INSERT INTO sms_sbfp_beneficiaries (program_id, student_id, section_id)
  SELECT tst.id('prog'), tst.id(v.learner), tst.id(v.section) FROM v
  RETURNING id, student_id
)
INSERT INTO tst.ids (name, id)
SELECT 'b' || right(t.name, 1), ins.id FROM ins JOIN tst.ids t ON t.id = ins.student_id AND t.name LIKE 'learner%';

INSERT INTO sms_sbfp_feeding_days (program_id, feeding_date)
VALUES (tst.id('prog'), '2099-08-01'), (tst.id('prog'), '2099-08-02');
INSERT INTO sms_sbfp_feeding_records (beneficiary_id, feeding_date, code) VALUES
  (tst.id('b1'), '2099-08-01', 'H'), (tst.id('b1'), '2099-08-02', 'H'),
  (tst.id('b2'), '2099-08-01', 'H'), (tst.id('b2'), '2099-08-02', 'A');

-- Deliveries: Grade 1 (10 packs), Grade 8 (20 packs), a hot-meals delivery with no grade.
INSERT INTO sms_sbfp_deliveries (program_id, component, grade_level, packs_new) VALUES
  (tst.id('prog'), 'nfp', 1, 10),
  (tst.id('prog'), 'nfp', 8, 20),
  (tst.id('prog'), 'hot_meals', NULL, 0);

SET LOCAL ROLE authenticated;
SELECT tst.claims(tst.uid('viewer'));

CREATE TEMP VIEW a_all AS SELECT * FROM sbfp_division_overview('2099-2100') o WHERE o.school_id = tst.id('schoolA');
CREATE TEMP VIEW a_k1  AS SELECT * FROM sbfp_division_overview('2099-2100', ARRAY[0, 1]) o WHERE o.school_id = tst.id('schoolA');
CREATE TEMP VIEW a_jhs AS SELECT * FROM sbfp_division_overview('2099-2100', ARRAY[7, 8, 9, 10]) o WHERE o.school_id = tst.id('schoolA');

-- ------------------------------------------------- 1. no band = 222 output --
SELECT tst.expect_count('SELECT beneficiaries FROM a_all', 3);
SELECT tst.expect_count('SELECT days_present FROM a_all', 3);
SELECT tst.expect_count('SELECT deliveries FROM a_all', 3);
SELECT tst.expect_count('SELECT packs_new FROM a_all', 30);
SELECT tst.expect_count('SELECT count(*) FROM sbfp_division_overview(''2099-2100'') WHERE NOT has_grade_band', 0);

-- ------------------------------------------------------ 2. a band narrows --
SELECT tst.expect_count('SELECT beneficiaries FROM a_k1', 1);
SELECT tst.expect_count('SELECT days_present FROM a_k1', 2);
SELECT tst.expect_count('SELECT feeding_days FROM a_k1', 2);
SELECT tst.expect_count('SELECT deliveries FROM a_k1', 1);
SELECT tst.expect_count('SELECT packs_new FROM a_k1', 10);
SELECT tst.expect_count('SELECT beneficiaries FROM a_jhs', 1);
SELECT tst.expect_count('SELECT days_present FROM a_jhs', 1);
SELECT tst.expect_count('SELECT packs_new FROM a_jhs', 20);
-- Hot meals are school-level: unchanged by the band.
SELECT tst.expect_count('SELECT hot_meal_deliveries FROM a_k1', 1);
SELECT tst.expect_count('SELECT hot_meal_deliveries FROM a_jhs', 1);

-- ----------------------------------------------- 3. which schools offer it --
SELECT tst.expect_count('SELECT count(*) FROM a_k1 WHERE has_grade_band', 1);
SELECT tst.expect_count('SELECT count(*) FROM sbfp_division_overview(''2099-2100'', ARRAY[11, 12]) o WHERE o.school_id = tst.id(''schoolA'') AND has_grade_band', 0);
SELECT tst.expect_count('SELECT count(*) FROM sbfp_division_overview(''2099-2100'', ARRAY[11, 12]) o WHERE o.school_id = tst.id(''schoolB'') AND has_grade_band', 1);

-- ------------------------------------------------- 4. a teacher is refused --
SELECT tst.claims(tst.uid('tA'));
SELECT tst.expect_error('SELECT * FROM sbfp_division_overview(''2099-2100'', ARRAY[1])', 'Only the division office');

RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'ALL 225 CHECKS PASSED'; END $$;
ROLLBACK;
