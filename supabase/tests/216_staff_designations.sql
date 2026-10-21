-- Migration 216 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/216_staff_designations.sql
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
  ('h', '00000000-0000-4000-8000-0000000216a1'),
  ('t', '00000000-0000-4000-8000-0000000216a2'),
  ('g', '00000000-0000-4000-8000-0000000216a3');
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@216.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id) SELECT 's1', min(id) FROM sms_schools;
INSERT INTO tst.ids (name, id) SELECT 's2', min(id) FROM sms_schools WHERE id <> tst.id('s1');

WITH u(name, type) AS (VALUES ('h','school_head'), ('t','teacher'), ('g','security_guard'))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@216.test', u.type, tst.id('s1'), tst.uid(u.name), true FROM u;
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;

INSERT INTO sms_user_schools (user_id, school_id)
SELECT x.uid_, x.sid FROM (VALUES
  (tst.id('h'), tst.id('s1')), (tst.id('t'), tst.id('s1')),
  (tst.id('t'), tst.id('s2')), (tst.id('g'), tst.id('s1'))) AS x(uid_, sid)
WHERE NOT EXISTS (SELECT 1 FROM sms_user_schools s WHERE s.user_id = x.uid_ AND s.school_id = x.sid);

INSERT INTO sms_subjects (name, code, school_id, grade_level) VALUES ('Designation Test Subject', 'DTS216', tst.id('s1'), 5);
INSERT INTO sms_subjects (name, code, school_id, grade_level) VALUES ('Designation Test Subject 2', 'DTS216B', tst.id('s2'), 5);
INSERT INTO tst.ids (name, id) SELECT 'y', id FROM sms_subjects WHERE code = 'DTS216B' AND school_id = tst.id('s2');
INSERT INTO tst.ids (name, id) SELECT 'x', id FROM sms_subjects WHERE code = 'DTS216' AND school_id = tst.id('s1');

-- ------------------------------------------------------------- head writes --
SELECT tst.claims(tst.uid('h'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(format(
  $$ INSERT INTO sms_staff_designations (user_id, school_id, designation) VALUES (%s, %s, 'department_head') $$,
  tst.id('t'), tst.id('s1')), 1);
SELECT tst.expect_rows(format(
  $$ INSERT INTO sms_department_head_subjects (user_id, subject_id) VALUES (%s, %s) $$,
  tst.id('t'), tst.id('x')), 1);
-- An UPDATE cannot repoint a link to another user or another school's subject.
SELECT tst.expect_error(format(
  $$ UPDATE sms_department_head_subjects SET user_id = %s WHERE user_id = %s $$,
  tst.id('h'), tst.id('t')), 'not a Department Head');
SELECT tst.expect_error(format(
  $$ UPDATE sms_department_head_subjects SET subject_id = %s WHERE user_id = %s $$,
  tst.id('y'), tst.id('t')), 'not a Department Head');
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_staff_designations (user_id, school_id, designation) VALUES (%s, %s, 'grade_level_coordinator') $$,
  tst.id('t'), tst.id('s1')), 'check');
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_staff_designations (user_id, school_id, designation) VALUES (%s, %s, 'aral_coordinator') $$,
  tst.id('g'), tst.id('s1')), 'cannot be designated');
RESET ROLE;

-- ---------------------------------------------------------------- teacher --
SELECT tst.claims(tst.uid('t'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_staff_designations (user_id, school_id, designation) VALUES (%s, %s, 'reading_coordinator') $$,
  tst.id('t'), tst.id('s1')), 'row-level security');
SELECT tst.expect_count(format($$ SELECT sms_has_designation('department_head', %s)::int $$, tst.id('s1')), 1);
SELECT tst.expect_count(format($$ SELECT sms_heads_subject(%s)::int $$, tst.id('x')), 1);
SELECT tst.expect_count(format($$ SELECT sms_has_designation('aral_coordinator', %s)::int $$, tst.id('s1')), 0);
RESET ROLE;

-- Switched to another school, the designation at S1 stops counting.
SELECT set_config('request.jwt.claims', '', true);
UPDATE sms_users SET school_id = tst.id('s2') WHERE id = tst.id('t');
SELECT tst.claims(tst.uid('t'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count(format($$ SELECT sms_has_designation('department_head', %s)::int $$, tst.id('s1')), 0);
SELECT tst.expect_count(format($$ SELECT sms_heads_subject(%s)::int $$, tst.id('x')), 0);
RESET ROLE;

-- ---------------------------------------------------- delete cascades links --
SELECT tst.claims(tst.uid('h'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(format(
  $$ DELETE FROM sms_staff_designations WHERE user_id = %s AND designation = 'department_head' $$,
  tst.id('t')), 1);
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_department_head_subjects WHERE user_id = %s $$, tst.id('t')), 0);
RESET ROLE;

-- ============================================================ PART B tests --
-- Subjects, schedules and storage under the designations.

-- Back to S1 for T; fixtures for part B.
SELECT set_config('request.jwt.claims', '', true);
UPDATE sms_users SET school_id = tst.id('s1') WHERE id = tst.id('t');

INSERT INTO tst.ids (name, uid) VALUES
  ('u', '00000000-0000-4000-8000-0000000216b1'),
  ('r', '00000000-0000-4000-8000-0000000216b2'),
  ('v', '00000000-0000-4000-8000-0000000216b3');
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@216.test', 'authenticated', 'authenticated'
FROM tst.ids WHERE name IN ('u', 'r', 'v');
WITH u(name, type) AS (VALUES ('u','teacher'), ('r','registrar'), ('v','teacher'))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@216.test', u.type, tst.id('s1'), tst.uid(u.name), true FROM u;
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid AND i.name IN ('u', 'r', 'v');
INSERT INTO sms_user_schools (user_id, school_id)
SELECT tst.id(n), tst.id('s1') FROM unnest(ARRAY['u', 'r', 'v']) AS n
WHERE NOT EXISTS (SELECT 1 FROM sms_user_schools s WHERE s.user_id = tst.id(n) AND s.school_id = tst.id('s1'));

-- Subject Y1 @S1, not headed by T.
INSERT INTO sms_subjects (name, code, school_id, grade_level) VALUES ('Designation Test Subject 3', 'DTS216C', tst.id('s1'), 5);
INSERT INTO tst.ids (name, id) SELECT 'y1', id FROM sms_subjects WHERE code = 'DTS216C' AND school_id = tst.id('s1');

INSERT INTO sms_rooms (name, school_id) VALUES ('Room 216', tst.id('s1'));
INSERT INTO tst.ids (name, id) SELECT 'room', id FROM sms_rooms WHERE name = 'Room 216' AND school_id = tst.id('s1');
INSERT INTO sms_sections (name, grade_level, school_year, school_id) VALUES
  ('216 5-A', 5, '2099-2100', tst.id('s1')), ('216 6-A', 6, '2099-2100', tst.id('s1'));
INSERT INTO tst.ids (name, id) SELECT 'sec5', id FROM sms_sections WHERE name = '216 5-A' AND school_id = tst.id('s1');
INSERT INTO tst.ids (name, id) SELECT 'sec6', id FROM sms_sections WHERE name = '216 6-A' AND school_id = tst.id('s1');
INSERT INTO sms_sections (name, grade_level, school_year, school_id) VALUES
  ('216 S2 5-A', 5, '2099-2100', tst.id('s2'));
INSERT INTO tst.ids (name, id) SELECT 'sec5s2', id FROM sms_sections WHERE name = '216 S2 5-A' AND school_id = tst.id('s2');

-- The local clone holds the procurements schema only, so 004's public overlap
-- helpers (called by the schedule conflict trigger) may be missing. Re-create
-- them from 004 inside this rolled-back transaction when they are.
DO $do$
BEGIN
  IF to_regprocedure('public.times_overlap(time, time, time, time)') IS NULL THEN
    CREATE FUNCTION public.times_overlap(start1 TIME, end1 TIME, start2 TIME, end2 TIME)
    RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $f$
    BEGIN RETURN (start1 < end2 AND end1 > start2); END; $f$;
  END IF;
  IF to_regprocedure('public.days_overlap(integer[], integer[])') IS NULL THEN
    CREATE FUNCTION public.days_overlap(days1 INTEGER[], days2 INTEGER[])
    RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $f$
    BEGIN RETURN EXISTS (SELECT 1 FROM unnest(days1) AS day1 WHERE day1 = ANY(days2)); END; $f$;
  END IF;
END $do$;

INSERT INTO sms_subject_schedules (subject_id, section_id, room_id, days_of_week, start_time, end_time, school_year, school_id)
VALUES
  (tst.id('x'),  tst.id('sec5'), tst.id('room'), ARRAY[1], '07:00', '07:30', '2099-2100', tst.id('s1')),
  (tst.id('y1'), tst.id('sec5'), tst.id('room'), ARRAY[1], '08:00', '08:30', '2099-2100', tst.id('s1')),
  (tst.id('y1'), tst.id('sec6'), tst.id('room'), ARRAY[1], '09:00', '09:30', '2099-2100', tst.id('s1'));

-- Designations, handed out by the school head.
SELECT tst.claims(tst.uid('h'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(format(
  $$ INSERT INTO sms_staff_designations (user_id, school_id, designation) VALUES (%s, %s, 'department_head'), (%s, %s, 'department_head') $$,
  tst.id('t'), tst.id('s1'), tst.id('r'), tst.id('s1')), 2);
SELECT tst.expect_rows(format(
  $$ INSERT INTO sms_department_head_subjects (user_id, subject_id) VALUES (%s, %s), (%s, %s) $$,
  tst.id('t'), tst.id('x'), tst.id('r'), tst.id('x')), 2);
SELECT tst.expect_rows(format(
  $$ INSERT INTO sms_staff_designations (user_id, school_id, designation, grade_levels) VALUES (%s, %s, 'grade_level_coordinator', '{5}') $$,
  tst.id('u'), tst.id('s1')), 1);
-- T is also a Grade Level Coordinator for Grade 5 (DH + GLC).
SELECT tst.expect_rows(format(
  $$ INSERT INTO sms_staff_designations (user_id, school_id, designation, grade_levels) VALUES (%s, %s, 'grade_level_coordinator', '{5}') $$,
  tst.id('t'), tst.id('s1')), 1);
SELECT tst.expect_rows(format(
  $$ INSERT INTO sms_staff_designations (user_id, school_id, designation) VALUES (%s, %s, 'reading_coordinator') $$,
  tst.id('v'), tst.id('s1')), 1);
RESET ROLE;

-- ----------------------------------------------------- Department Head: T --
SELECT tst.claims(tst.uid('t'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(format(
  $$ INSERT INTO sms_subjects (name, code, school_id, grade_level, is_madrasah) VALUES ('Designation Test Subject Z', 'DTS216Z', %s, 6, true) $$,
  tst.id('s1')), 1);
SELECT tst.expect_count(format(
  $$ SELECT count(*) FROM sms_department_head_subjects l JOIN sms_subjects s ON s.id = l.subject_id
     WHERE l.user_id = %s AND s.code = 'DTS216Z' AND s.school_id = %s $$,
  tst.id('t'), tst.id('s1')), 1);
-- Not at another school.
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_subjects (name, code, school_id, grade_level) VALUES ('Designation Test Subject W', 'DTS216W', %s, 6) $$,
  tst.id('s2')), 'row-level security');
SELECT tst.expect_rows(format($$ UPDATE sms_subjects SET name = 'Renamed by DH', code = 'DTS216X', description = 'd' WHERE id = %s $$, tst.id('x')), 1);
SELECT tst.expect_error(format($$ UPDATE sms_subjects SET is_madrasah = true WHERE id = %s $$, tst.id('x')), 'may change only the code');
SELECT tst.expect_error(format($$ UPDATE sms_subjects SET grade_level = 7 WHERE id = %s $$, tst.id('x')), 'may change only the code');
SELECT tst.expect_rows(format($$ UPDATE sms_subjects SET name = 'nope' WHERE id = %s $$, tst.id('y1')), 0);
SELECT tst.expect_rows(format($$ DELETE FROM sms_subjects WHERE id = %s $$, tst.id('x')), 0);
SELECT tst.expect_rows(format(
  $$ INSERT INTO sms_subject_schedules (subject_id, section_id, room_id, days_of_week, start_time, end_time, school_year, school_id)
     VALUES (%s, %s, %s, ARRAY[2], '10:00', '10:30', '2099-2100', %s) $$,
  tst.id('x'), tst.id('sec6'), tst.id('room'), tst.id('s1')), 1);
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_subject_schedules (subject_id, section_id, room_id, days_of_week, start_time, end_time, school_year, school_id)
     VALUES (%s, %s, %s, ARRAY[2], '11:00', '11:30', '2099-2100', %s) $$,
  tst.id('y1'), tst.id('sec6'), tst.id('room'), tst.id('s1')), 'row-level security');
-- A schedule for X stamped with another school is refused.
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_subject_schedules (subject_id, section_id, room_id, days_of_week, start_time, end_time, school_year, school_id)
     VALUES (%s, %s, %s, ARRAY[3], '11:00', '11:30', '2099-2100', %s) $$,
  tst.id('x'), tst.id('sec6'), tst.id('room'), tst.id('s2')), 'row-level security');
-- A schedule for X placed in another school's section is refused, even when
-- stamped with X's own school.
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_subject_schedules (subject_id, section_id, room_id, days_of_week, start_time, end_time, school_year, school_id)
     VALUES (%s, %s, %s, ARRAY[3], '12:00', '12:30', '2099-2100', %s) $$,
  tst.id('x'), tst.id('sec5s2'), tst.id('room'), tst.id('s1')), 'row-level security');
SELECT tst.expect_rows(format(
  $$ DELETE FROM sms_subject_schedules WHERE subject_id = %s AND section_id = %s $$,
  tst.id('x'), tst.id('sec6')), 1);
-- A Department Head edits every column of their own subject's schedule.
SELECT tst.expect_rows(format(
  $$ UPDATE sms_subject_schedules SET start_time = '07:05' WHERE subject_id = %s AND section_id = %s $$,
  tst.id('x'), tst.id('sec5')), 1);
-- DH + GLC: a covered-grade schedule of X cannot be moved onto Y1, which T
-- does not head (the column guard exempts a DH only when both are headed).
SELECT tst.expect_error(format(
  $$ UPDATE sms_subject_schedules SET subject_id = %s WHERE subject_id = %s AND section_id = %s $$,
  tst.id('y1'), tst.id('x'), tst.id('sec5')), 'may change only the teacher');
RESET ROLE;

-- ------------------------------------------------ Grade Level Coordinator --
SELECT tst.claims(tst.uid('u'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(format(
  $$ UPDATE sms_subject_schedules SET teacher_id = %s WHERE subject_id = %s AND section_id = %s $$,
  tst.id('u'), tst.id('y1'), tst.id('sec5')), 1);
SELECT tst.expect_error(format(
  $$ UPDATE sms_subject_schedules SET start_time = '08:05' WHERE subject_id = %s AND section_id = %s $$,
  tst.id('y1'), tst.id('sec5')), 'may change only the teacher');
SELECT tst.expect_rows(format(
  $$ UPDATE sms_subject_schedules SET teacher_id = %s WHERE subject_id = %s AND section_id = %s $$,
  tst.id('u'), tst.id('y1'), tst.id('sec6')), 0);
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_subject_schedules (subject_id, section_id, room_id, days_of_week, start_time, end_time, school_year, school_id)
     VALUES (%s, %s, %s, ARRAY[4], '11:00', '11:30', '2099-2100', %s) $$,
  tst.id('y1'), tst.id('sec5'), tst.id('room'), tst.id('s1')), 'row-level security');
SELECT tst.expect_rows(format(
  $$ DELETE FROM sms_subject_schedules WHERE subject_id = %s AND section_id = %s $$,
  tst.id('y1'), tst.id('sec5')), 0);
RESET ROLE;

-- ------------------------------------- roster role is never restricted: R --
SELECT tst.claims(tst.uid('r'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(format($$ UPDATE sms_subjects SET is_madrasah = true WHERE id = %s $$, tst.id('x')), 1);
RESET ROLE;

-- ------------------------------- no caller (postgres / service_role): open --
SELECT set_config('request.jwt.claims', '', true);
SELECT tst.expect_rows(format($$ UPDATE sms_subjects SET grade_level = 6 WHERE id = %s $$, tst.id('x')), 1);
SELECT tst.expect_rows(format(
  $$ UPDATE sms_subject_schedules SET start_time = '08:10' WHERE subject_id = %s AND section_id = %s $$,
  tst.id('y1'), tst.id('sec5')), 1);

-- ------------------------------------- deleting a subject drops its links --
SELECT tst.claims(tst.uid('h'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(format($$ DELETE FROM sms_subjects WHERE id = %s $$, tst.id('x')), 1);
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_department_head_subjects WHERE subject_id = %s $$, tst.id('x')), 0);
RESET ROLE;

-- ------------------------------------------------ Reading Coordinator: V --
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO storage.buckets (id, name, public)
SELECT 'school-management', 'school-management', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'school-management');
SELECT tst.claims(tst.uid('v'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(
  $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('school-management', 'crla-materials/test-216.pdf') $$, 1);
SELECT tst.expect_rows(
  $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('school-management', 'philiri-materials/test-216.pdf') $$, 1);
SELECT tst.expect_error(
  $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('school-management', 'landing-hero/test-216.png') $$, 'row-level security');
RESET ROLE;
SELECT tst.claims(tst.uid('t'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('school-management', 'crla-materials/test-216-t.pdf') $$, 'row-level security');
RESET ROLE;

-- Home school counts as assigned: no sms_user_schools row needed.
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO auth.users (id, email, aud, role) VALUES ('00000000-0000-4000-8000-0000000216d1', 'n1@216.test', 'authenticated', 'authenticated'), ('00000000-0000-4000-8000-0000000216d2', 'n2@216.test', 'authenticated', 'authenticated');
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active) VALUES
  ('n1', 'n1@216.test', 'teacher', tst.id('s1'), '00000000-0000-4000-8000-0000000216d1', true),
  ('n2', 'n2@216.test', 'teacher', tst.id('s2'), '00000000-0000-4000-8000-0000000216d2', true);
INSERT INTO tst.ids (name, id) SELECT 'n1', id FROM sms_users WHERE email = 'n1@216.test';
INSERT INTO tst.ids (name, id) SELECT 'n2', id FROM sms_users WHERE email = 'n2@216.test';
SELECT tst.claims(tst.uid('h'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(format(
  $$ INSERT INTO sms_staff_designations (user_id, school_id, designation) VALUES (%s, %s, 'reading_coordinator') $$,
  tst.id('n1'), tst.id('s1')), 1);
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_staff_designations (user_id, school_id, designation) VALUES (%s, %s, 'reading_coordinator') $$,
  tst.id('n2'), tst.id('s1')), 'not assigned');
RESET ROLE;

ROLLBACK;
