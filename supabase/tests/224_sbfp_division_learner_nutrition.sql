-- Migration 224 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/224_sbfp_division_learner_nutrition.sql
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
  ('viewer', '00000000-0000-4000-8000-000000000224'),
  ('tA',     '00000000-0000-4000-8000-0000000002e4');
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@224.test', 'authenticated', 'authenticated' FROM tst.ids;

-- Two sections of one real, active, non-test school, and a test school's section.
INSERT INTO tst.ids (name, id)
SELECT 'section' || row_number() OVER (ORDER BY sec.id), sec.id
  FROM (SELECT sec.id FROM sms_sections sec
          JOIN sms_schools s ON s.id = sec.school_id AND s.is_active AND s.id NOT IN (9, 10)
         WHERE sec.school_id = (SELECT sec2.school_id FROM sms_sections sec2
                                  JOIN sms_schools s2 ON s2.id = sec2.school_id AND s2.is_active AND s2.id NOT IN (9, 10)
                                 GROUP BY sec2.school_id HAVING count(*) >= 2 ORDER BY sec2.school_id LIMIT 1)
         ORDER BY sec.id LIMIT 2) sec;
INSERT INTO tst.ids (name, id)
SELECT 'schoolA', school_id FROM sms_sections WHERE id = tst.id('section1');
INSERT INTO tst.ids (name, id)
SELECT 'testSection', id FROM sms_sections WHERE school_id IN (9, 10) ORDER BY id LIMIT 1;
INSERT INTO tst.ids (name, id)
SELECT 'learner' || row_number() OVER (ORDER BY id), id
  FROM (SELECT id FROM sms_students ORDER BY id LIMIT 3) x;

WITH u(name, type, school) AS (VALUES ('viewer', 'sbfp_viewer', NULL), ('tA', 'teacher', 'schoolA'))
INSERT INTO sms_users (name, email, type, school_id, is_active, user_id)
SELECT u.name, u.name || '@224.test', u.type, tst.id(u.school), true, tst.uid(u.name) FROM u;

-- learner1: baseline in section1, then a later baseline in section2 (moved) —
-- counted once, at the later reading. learner2: baseline + endline.
-- learner3: a reading at a test school only — not counted.
INSERT INTO sms_learner_health (student_id, section_id, school_year, measurement_period, nutritional_status, height_for_age, measured_at)
VALUES
  (tst.id('learner1'), tst.id('section1'), '2099-2100', 'baseline', 'wasted', 'normal', '2099-07-01'),
  (tst.id('learner1'), tst.id('section2'), '2099-2100', 'baseline', 'normal', 'normal', '2099-07-20'),
  (tst.id('learner2'), tst.id('section1'), '2099-2100', 'baseline', 'severely_wasted', 'stunted', '2099-07-01'),
  (tst.id('learner2'), tst.id('section1'), '2099-2100', 'endline', 'wasted', 'stunted', '2100-02-01');
INSERT INTO sms_learner_health (student_id, section_id, school_year, measurement_period, nutritional_status, height_for_age, measured_at)
SELECT tst.id('learner3'), tst.id('testSection'), '2099-2100', 'baseline', 'obese', 'tall', '2099-07-01'
 WHERE tst.id('testSection') IS NOT NULL;

SET LOCAL ROLE authenticated;

-- ------------------------------------------------------ 1. the viewer reads --
SELECT tst.claims(tst.uid('viewer'));
SELECT tst.expect_count('SELECT sum(learners) FROM sbfp_division_learner_nutrition(''2099-2100'')', 3);
SELECT tst.expect_count('SELECT sum(learners) FROM sbfp_division_learner_nutrition(''2099-2100'') WHERE period = ''baseline''', 2);
-- The moved learner counts once, at the later reading (normal), not the earlier (wasted).
SELECT tst.expect_count('SELECT sum(learners) FROM sbfp_division_learner_nutrition(''2099-2100'') WHERE period = ''baseline'' AND nutritional_status = ''wasted''', NULL);
SELECT tst.expect_count('SELECT sum(learners) FROM sbfp_division_learner_nutrition(''2099-2100'') WHERE period = ''baseline'' AND nutritional_status = ''normal''', 1);
SELECT tst.expect_count('SELECT sum(learners) FROM sbfp_division_learner_nutrition(''2099-2100'') WHERE period = ''endline'' AND height_for_age = ''stunted''', 1);
-- The test school is left out.
SELECT tst.expect_count('SELECT sum(learners) FROM sbfp_division_learner_nutrition(''2099-2100'') WHERE nutritional_status = ''obese''', NULL);

-- ------------------------------------------------- 2. a teacher is refused --
SELECT tst.claims(tst.uid('tA'));
SELECT tst.expect_error('SELECT * FROM sbfp_division_learner_nutrition(''2099-2100'')', 'Only the division office');

RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'ALL 224 CHECKS PASSED'; END $$;
ROLLBACK;
