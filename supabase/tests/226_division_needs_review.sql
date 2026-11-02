-- Migration 226 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/226_division_needs_review.sql
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
  ('div',  '00000000-0000-4000-8000-000000000226'),
  ('adv2', '00000000-0000-4000-8000-0000000002f6'),
  ('adv8', '00000000-0000-4000-8000-0000000002f7');
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@226.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id)
SELECT 'school', id FROM sms_schools WHERE is_active AND id NOT IN (9, 10) ORDER BY id LIMIT 1;

WITH u(name, type, school) AS (VALUES ('div', 'division_admin', NULL), ('adv2', 'teacher', 'school'), ('adv8', 'teacher', 'school')),
ins AS (
  INSERT INTO sms_users (name, email, type, school_id, is_active, user_id)
  SELECT u.name, u.name || '@226.test', u.type, tst.id(u.school), true, tst.uid(u.name) FROM u
  RETURNING id, name
)
INSERT INTO tst.ids (name, id) SELECT 'u_' || name, id FROM ins;

-- Grade 2 and Grade 8 sections in a fixture year, each with its adviser.
WITH v(name, grade, adviser) AS (VALUES ('g2', 2, 'u_adv2'), ('g8', 8, 'u_adv8')),
ins AS (
  INSERT INTO sms_sections (name, grade_level, school_year, school_id, section_adviser_id)
  SELECT '226-' || v.name, v.grade, '2099-2100', tst.id('school'), tst.id(v.adviser) FROM v
  RETURNING id, name
)
INSERT INTO tst.ids (name, id) SELECT substr(name, 5), id FROM ins;

INSERT INTO tst.ids (name, id)
SELECT 'learner' || row_number() OVER (ORDER BY id), id
  FROM (SELECT id FROM sms_students ORDER BY id LIMIT 4) x;

-- learner1-2 in Grade 2, learner3 in Grade 8, learner4 pending (not counted).
INSERT INTO sms_enrollments (student_id, section_id, school_id, school_year, grade_level, status, enrollment_status, enrolled_by)
SELECT v.*, tst.id('u_adv2') FROM (VALUES
  (tst.id('learner1'), tst.id('g2'), tst.id('school'), '2099-2100', 2, 'approved', 'active'),
  (tst.id('learner2'), tst.id('g2'), tst.id('school'), '2099-2100', 2, 'approved', 'active'),
  (tst.id('learner3'), tst.id('g8'), tst.id('school'), '2099-2100', 8, 'approved', 'active'),
  (tst.id('learner4'), tst.id('g8'), tst.id('school'), '2099-2100', 8, 'pending',  'active')) v;

-- CRLA for learner1; Phil-IRI for learner3; health for learner1 (a reading
-- with neither height nor weight for learner2 does not count).
INSERT INTO sms_crla_records (material_id, school_id, section_id, student_id, phase, school_year)
SELECT (SELECT id FROM sms_crla_materials ORDER BY id LIMIT 1), tst.id('school'), tst.id('g2'), tst.id('learner1'),
       (SELECT phase FROM sms_crla_records LIMIT 1), '2099-2100';
INSERT INTO sms_philiri_records (material_id, school_id, section_id, student_id, phase, school_year)
SELECT (SELECT id FROM sms_philiri_materials ORDER BY id LIMIT 1), tst.id('school'), tst.id('g8'), tst.id('learner3'),
       (SELECT phase FROM sms_philiri_records LIMIT 1), '2099-2100';
INSERT INTO sms_learner_health (student_id, section_id, school_year, measurement_period, height_cm, weight_kg)
VALUES (tst.id('learner1'), tst.id('g2'), '2099-2100', 'baseline', 120, 22),
       (tst.id('learner2'), tst.id('g2'), '2099-2100', 'baseline', NULL, NULL);

-- Only the Grade 2 adviser has taken attendance.
INSERT INTO sms_attendance (student_id, section_id, school_id, school_year, date, status)
VALUES (tst.id('learner1'), tst.id('g2'), tst.id('school'), '2099-2100', '2099-06-15', 'present');

SET LOCAL ROLE authenticated;
SELECT tst.claims(tst.uid('div'));
CREATE TEMP VIEW r AS SELECT * FROM division_needs_review('2099-2100') x WHERE x.school_id = tst.id('school');

-- ---------------------------------------------------------------- counts --
SELECT tst.expect_count('SELECT learners FROM r', 3);
SELECT tst.expect_count('SELECT crla_learners FROM r', 2);
SELECT tst.expect_count('SELECT crla_assessed FROM r', 1);
SELECT tst.expect_count('SELECT philiri_learners FROM r', 1);
SELECT tst.expect_count('SELECT philiri_assessed FROM r', 1);
SELECT tst.expect_count('SELECT learners_measured FROM r', 1);
SELECT tst.expect_count('SELECT teachers FROM r', 2);
SELECT tst.expect_count('SELECT class_record_teachers FROM r', 0);
SELECT tst.expect_count('SELECT advisers FROM r', 2);
SELECT tst.expect_count('SELECT attendance_advisers FROM r', 1);
SELECT tst.expect_count('SELECT count(*) FROM division_needs_review(''2099-2100'') WHERE school_id IN (9, 10)', 0);

-- ------------------------------------------------- a teacher is refused --
SELECT tst.claims(tst.uid('adv2'));
SELECT tst.expect_error('SELECT * FROM division_needs_review(''2099-2100'')', 'Only the division office');

RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'ALL 226 CHECKS PASSED'; END $$;
ROLLBACK;
