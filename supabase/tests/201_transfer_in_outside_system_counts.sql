-- Migration 201 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/201_transfer_in_outside_system_counts.sql
-- Everything runs in one transaction that is rolled back at the end.
\set ON_ERROR_STOP 1
BEGIN;
SET search_path TO procurements, public;

CREATE SCHEMA tst;
CREATE TABLE tst.ids (name TEXT PRIMARY KEY, id BIGINT);
CREATE FUNCTION tst.id(p TEXT) RETURNS BIGINT LANGUAGE sql STABLE AS
  $$ SELECT id FROM tst.ids WHERE name = p $$;
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

-- --------------------------------------------------------------- fixtures --
-- A school year nobody uses, so every count below is exactly the fixtures.
INSERT INTO tst.ids (name, id)
SELECT 'schoolA', min(id) FROM sms_schools WHERE is_active
UNION ALL
SELECT 'schoolB', (SELECT id FROM sms_schools WHERE is_active ORDER BY id OFFSET 1 LIMIT 1)
UNION ALL
SELECT 'enroller', (SELECT min(id) FROM sms_users);

INSERT INTO sms_sections (name, grade_level, school_year, is_active, school_id)
VALUES ('T201', 5, '2090-2091', true, tst.id('schoolA'))
RETURNING id \gset sec_
INSERT INTO tst.ids (name, id) VALUES ('sec', :sec_id);
INSERT INTO sms_sections (name, grade_level, school_year, is_active, school_id)
VALUES ('T201-B', 5, '2090-2091', true, tst.id('schoolB'))
RETURNING id \gset secb_
INSERT INTO tst.ids (name, id) VALUES ('secB', :secb_id);

-- O = in-system transferee, P = private-school transferee, N = ordinary,
-- T = transferred in from a private school and then out again
WITH s(name, lrn, sex) AS (VALUES
  ('O', '900000000211', 'male'), ('P', '900000000212', 'female'),
  ('N', '900000000213', 'male'), ('T', '900000000214', 'female'))
INSERT INTO sms_students (lrn, first_name, last_name, date_of_birth, gender,
                          parent_guardian_name, parent_guardian_contact,
                          parent_guardian_relationship, school_id)
SELECT s.lrn, s.name, 'T201', '2080-01-01', s.sex, 'g', '0', 'parent', tst.id('schoolA')
FROM s;
INSERT INTO tst.ids (name, id)
SELECT 'stu' || first_name, id FROM sms_students WHERE last_name = 'T201';

INSERT INTO sms_enrollments (student_id, section_id, school_year, grade_level, enrollment_date,
                             status, enrollment_status, school_id, enrolled_by,
                             origin_school_id, transfer_in_school_name)
VALUES
  (tst.id('stuO'), tst.id('sec'), '2090-2091', 5, '2091-01-10', 'approved', 'active',
   tst.id('schoolA'), tst.id('enroller'), tst.id('schoolB'), NULL),
  (tst.id('stuP'), tst.id('sec'), '2090-2091', 5, '2091-01-10', 'approved', 'active',
   tst.id('schoolA'), tst.id('enroller'), NULL, 'St. Jude Academy'),
  (tst.id('stuN'), tst.id('sec'), '2090-2091', 5, '2090-06-10', 'approved', 'active',
   tst.id('schoolA'), tst.id('enroller'), NULL, NULL),
  (tst.id('stuT'), tst.id('sec'), '2090-2091', 5, '2090-09-10', 'approved', 'transferred_out',
   tst.id('schoolA'), tst.id('enroller'), NULL, 'Holy Child School'),
  -- O's old enrolment at the origin school, released by the transfer: it must
  -- not stop O counting as a transfer-in at school A.
  (tst.id('stuO'), tst.id('secB'), '2090-2091', 5, '2090-06-10', 'approved', 'transferred_out',
   tst.id('schoolB'), tst.id('enroller'), NULL, NULL);

-- ------------------------------------------------- division_enrollment_actual --
-- Both transferees counted: one male (in-system), one female (outside).
SELECT tst.expect_count(format($$ SELECT COALESCE(sum(total), 0) FROM
  division_enrollment_actual('2090-2091', NULL, NULL, 'transfer_in')
  WHERE school_id = %s AND grade_level = 5 $$, tst.id('schoolA')), 2);
SELECT tst.expect_count(format($$ SELECT COALESCE(sum(female), 0) FROM
  division_enrollment_actual('2090-2091', NULL, NULL, 'transfer_in')
  WHERE school_id = %s AND grade_level = 5 $$, tst.id('schoolA')), 1);
-- T transferred in and out again: counted on transfer_out only.
SELECT tst.expect_count(format($$ SELECT COALESCE(sum(total), 0) FROM
  division_enrollment_actual('2090-2091', NULL, NULL, 'transfer_out')
  WHERE school_id = %s AND grade_level = 5 $$, tst.id('schoolA')), 1);
-- The ordinary enrolment category is untouched: O, P, N (T has left).
SELECT tst.expect_count(format($$ SELECT COALESCE(sum(total), 0) FROM
  division_enrollment_actual('2090-2091', NULL, NULL, 'enrollment')
  WHERE school_id = %s AND grade_level = 5 $$, tst.id('schoolA')), 3);

-- ----------------------------------------------- division_enrollment_sections --
-- The drill-down sums to the grade row (165's rule).
SELECT tst.expect_count(format($$ SELECT COALESCE(sum(total), 0) FROM
  division_enrollment_sections(%s, '2090-2091', NULL, 5, 'transfer_in') $$,
  tst.id('schoolA')), 2);

-- ------------------------------------------------- reporting.v_report_enrollment --
-- The view is per enrolment: T's row still says it came from elsewhere.
SELECT tst.expect_count($$ SELECT count(*) FROM reporting.v_report_enrollment
  WHERE school_year = '2090-2091' AND is_transfer_in $$, 3);
SELECT tst.expect_count($$ SELECT count(*) FROM reporting.v_report_enrollment
  WHERE school_year = '2090-2091' AND origin_school_name = 'St. Jude Academy' $$, 1);
SELECT tst.expect_count(format($$ SELECT count(*) FROM reporting.v_report_enrollment v
  JOIN sms_schools s ON s.id = %s
  WHERE v.school_year = '2090-2091' AND v.origin_school_name = s.name $$,
  tst.id('schoolB')), 1);
SELECT tst.expect_count($$ SELECT count(*) FROM reporting.v_report_enrollment
  WHERE school_year = '2090-2091' AND NOT is_transfer_in AND origin_school_name IS NULL $$, 2);

\echo 'ALL 201 ASSERTIONS PASSED'
ROLLBACK;
