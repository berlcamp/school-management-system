-- Migration 200 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/200_transfer_in_carried_grades.sql
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

-- --------------------------------------------------------------- fixtures --
INSERT INTO tst.ids (name, uid) VALUES
  ('adv',   '00000000-0000-4000-8000-000000000201'),  -- adviser, school A
  ('subj',  '00000000-0000-4000-8000-000000000202'),  -- subject teacher, school A
  ('reg',   '00000000-0000-4000-8000-000000000203'),  -- registrar, school A
  ('other', '00000000-0000-4000-8000-000000000204');  -- teacher, school B
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@200.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id)
SELECT 'schoolA', min(id) FROM sms_schools
UNION ALL
SELECT 'schoolB', (SELECT id FROM sms_schools ORDER BY id OFFSET 1 LIMIT 1);

WITH u(name, type, school) AS (VALUES
  ('adv', 'teacher', 'schoolA'), ('subj', 'teacher', 'schoolA'),
  ('reg', 'registrar', 'schoolA'), ('other', 'teacher', 'schoolB'))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@200.test', u.type, tst.id(u.school), tst.uid(u.name), true
FROM u;
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;

INSERT INTO sms_sections (name, grade_level, school_year, section_adviser_id, is_active, school_id)
VALUES ('T200', 5, '2026-2027', tst.id('adv'), true, tst.id('schoolA'))
RETURNING id \gset sec_
INSERT INTO tst.ids (name, id) VALUES ('sec', :sec_id);

INSERT INTO sms_sections (name, grade_level, school_year, section_adviser_id, is_active, school_id)
VALUES ('T200-G1', 1, '2026-2027', tst.id('adv'), true, tst.id('schoolA'))
RETURNING id \gset g1_
INSERT INTO tst.ids (name, id) VALUES ('secG1', :g1_id);

INSERT INTO sms_subjects (name, code, grade_level, school_id)
VALUES ('Mathematics T200', 'MATH-T200', 5, tst.id('schoolA'))
RETURNING id \gset subj_
INSERT INTO tst.ids (name, id) VALUES ('math', :subj_id);
INSERT INTO sms_subjects (name, code, grade_level, school_id)
VALUES ('Unscheduled T200', 'NOPE-T200', 5, tst.id('schoolA'))
RETURNING id \gset nope_
INSERT INTO tst.ids (name, id) VALUES ('nope', :nope_id);

INSERT INTO sms_subject_schedules (subject_id, section_id, teacher_id, school_year, room_id, days_of_week, start_time, end_time, school_id, conflict_override)
VALUES (tst.id('math'), tst.id('sec'), tst.id('subj'), '2026-2027', (SELECT min(id) FROM sms_rooms), ARRAY[1], '08:00', '09:00', tst.id('schoolA'), true);

-- two learners: P = private-school transferee, N = ordinary learner
WITH s(name, lrn) AS (VALUES ('P', '900000000201'), ('N', '900000000202'))
INSERT INTO sms_students (lrn, first_name, last_name, date_of_birth, gender,
                          parent_guardian_name, parent_guardian_contact, parent_guardian_relationship, school_id)
SELECT s.lrn, s.name, 'T200', '2015-01-01', 'male', 'g', '0', 'parent', tst.id('schoolA') FROM s;
INSERT INTO tst.ids (name, id)
SELECT 'stu' || first_name, id FROM sms_students WHERE last_name = 'T200';

INSERT INTO sms_enrollments (student_id, section_id, school_year, grade_level, enrollment_date,
                             status, enrollment_status, school_id, enrolled_by)
SELECT tst.id(n), tst.id('sec'), '2026-2027', 5, '2027-01-10', 'approved', 'active', tst.id('schoolA'), tst.id('reg')
FROM (VALUES ('stuP'), ('stuN')) v(n);
INSERT INTO tst.ids (name, id)
SELECT 'enr' || s.first_name, e.id FROM sms_enrollments e JOIN sms_students s ON s.id = e.student_id
WHERE s.last_name = 'T200';

-- ----------------------------------------------------------------- columns --
SELECT tst.expect_count($$ SELECT count(*) FROM information_schema.columns
  WHERE table_schema = 'procurements'
    AND ((table_name = 'sms_enrollments' AND column_name = 'transfer_in_school_name')
      OR (table_name = 'sms_grades' AND column_name = 'carried_from_school')) $$, 2);

-- ------------------------------------------------------------------ guard ---
SELECT tst.claims(tst.uid('other'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, 'St. Jude Academy',
  '[{"subject_id": %s, "grading_period": 1, "grade": 88}]') $$, tst.id('enrP'), tst.id('math')),
  'may not');
RESET ROLE;

SELECT tst.claims(tst.uid('subj'));   -- teaches Math here but is not the adviser
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, 'St. Jude Academy',
  '[{"subject_id": %s, "grading_period": 1, "grade": 88}]') $$, tst.id('enrP'), tst.id('math')),
  'may not');
RESET ROLE;

-- -------------------------------------------------------------- validation --
SELECT tst.claims(tst.uid('adv'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, '  ',
  '[{"subject_id": %s, "grading_period": 1, "grade": 88}]') $$, tst.id('enrP'), tst.id('math')),
  'Name the school');
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, 'St. Jude Academy',
  '[{"subject_id": %s, "grading_period": 1, "grade": 59}]') $$, tst.id('enrP'), tst.id('math')),
  'whole number from 60 to 100');
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, 'St. Jude Academy',
  '[{"subject_id": %s, "grading_period": 1, "grade": 85.5}]') $$, tst.id('enrP'), tst.id('math')),
  'whole number from 60 to 100');
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, 'St. Jude Academy',
  '[{"subject_id": %s, "grading_period": 5, "grade": 85}]') $$, tst.id('enrP'), tst.id('math')),
  'grading period');
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, 'St. Jude Academy',
  '[{"subject_id": %s, "grading_period": 1, "grade": 85}]') $$, tst.id('enrP'), tst.id('nope')),
  'not scheduled');

-- ------------------------------------------------------------------- save ---
SELECT tst.expect_count(format($$ SELECT save_transfer_in_grades(%s, ' St. Jude Academy ',
  '[{"subject_id": %s, "grading_period": 1, "grade": 88},
    {"subject_id": %s, "grading_period": 2, "grade": 90}]') $$,
  tst.id('enrP'), tst.id('math'), tst.id('math')), 2);
RESET ROLE;

SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_enrollments
  WHERE id = %s AND transfer_in_school_name = 'St. Jude Academy' $$, tst.id('enrP')), 1);
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_grades
  WHERE student_id = %s AND carried_from_school = 'St. Jude Academy'
    AND remarks = 'Passed' AND teacher_id = %s $$, tst.id('stuP'), tst.id('adv')), 2);

-- registrar at the same school may edit; grade null removes the carried row
SELECT tst.claims(tst.uid('reg'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count(format($$ SELECT save_transfer_in_grades(%s, 'St. Jude Academy',
  '[{"subject_id": %s, "grading_period": 2, "grade": null}]') $$,
  tst.id('enrP'), tst.id('math')), 1);
RESET ROLE;
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_grades WHERE student_id = %s $$,
  tst.id('stuP')), 1);

-- Kindergarten / Grade 1 refused
INSERT INTO sms_enrollments (student_id, section_id, school_year, grade_level, enrollment_date,
                             status, enrollment_status, school_id, enrolled_by)
VALUES (tst.id('stuN'), tst.id('secG1'), '2027-2028', 1, '2027-06-10', 'approved', 'active', tst.id('schoolA'), tst.id('reg'))
RETURNING id \gset g1enr_
SELECT tst.claims(tst.uid('adv'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format($$ SELECT save_transfer_in_grades(%s, 'X', '[]') $$, :g1enr_id),
  'Kindergarten and Grade 1');
RESET ROLE;

-- ---------------------------------------------------- class record posting --
INSERT INTO sms_class_records (school_id, teacher_id, subject_id, section_id, school_year, grading_period,
                               ww_weight, pt_weight, st_weight, use_transmutation, is_posted,
                               grading_scheme, form_layout)
VALUES (tst.id('schoolA'), tst.id('subj'), tst.id('math'), tst.id('sec'), '2026-2027', 1,
        20, 50, 30, true, false, 'matatag', 'standard')
RETURNING id \gset cr_
INSERT INTO sms_class_record_items (class_record_id, component, position, max_score, label)
VALUES (:cr_id, 'WW', 1, 10, 'Quiz 1') RETURNING id \gset it_
-- both learners have a score in Term 1 (P's must NOT reach the card)
INSERT INTO sms_class_record_scores (item_id, student_id, raw_score)
VALUES (:it_id, tst.id('stuP'), 2), (:it_id, tst.id('stuN'), 9);

SELECT procurements.post_class_record_grades(:cr_id);
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_grades
  WHERE student_id = %s AND grading_period = 1 AND grade = 88
    AND carried_from_school = 'St. Jude Academy' $$, tst.id('stuP')), 1);
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_grades
  WHERE student_id = %s AND grading_period = 1 AND carried_from_school IS NULL $$,
  tst.id('stuN')), 1);

-- unpost removes N's computed grade but keeps P's carried one
SELECT tst.claims(tst.uid('subj'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count(format($$ SELECT unpost_class_record_grades(%s) $$, :cr_id), 1);
RESET ROLE;
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_grades
  WHERE student_id = %s AND grading_period = 1 $$, tst.id('stuP')), 1);
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_grades
  WHERE student_id = %s AND grading_period = 1 $$, tst.id('stuN')), 0);

-- saving a carried grade overwrites a computed one in the same slot
SELECT procurements.post_class_record_grades(:cr_id);   -- N gets a computed T1 again
SELECT tst.claims(tst.uid('adv'));
SET LOCAL ROLE authenticated;
SELECT save_transfer_in_grades(tst.id('enrN'), 'Holy Child School',
  format('[{"subject_id": %s, "grading_period": 1, "grade": 77}]', tst.id('math'))::jsonb);
RESET ROLE;
SELECT tst.expect_count(format($$ SELECT count(*) FROM sms_grades
  WHERE student_id = %s AND grading_period = 1 AND grade = 77
    AND carried_from_school = 'Holy Child School' $$, tst.id('stuN')), 1);

-- -------------------------------------------------------------- privileges --
SELECT tst.expect_count($$ SELECT count(*) FROM information_schema.routine_privileges
  WHERE routine_schema = 'procurements' AND routine_name = 'save_transfer_in_grades'
    AND grantee = 'anon' $$, 0);

\echo 'ALL 200 ASSERTIONS PASSED'
ROLLBACK;
