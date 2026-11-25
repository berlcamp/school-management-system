-- Tests for migration 240. One transaction, rolled back. Requires 198, 216, 223, 235, 239, 240.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/240_term_grade_adjustments.sql
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
CREATE TEMP TABLE fx (k TEXT PRIMARY KEY, v BIGINT) ON COMMIT DROP;
CREATE TEMP TABLE who (k TEXT PRIMARY KEY, uid UUID) ON COMMIT DROP;
GRANT SELECT ON fx, who TO authenticated;

-- Act as a fixture user.
CREATE FUNCTION pg_temp.act(p TEXT) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(SELECT uid FROM who WHERE k=p))::TEXT, true);
$$;
CREATE FUNCTION pg_temp.f(p TEXT) RETURNS BIGINT LANGUAGE sql AS $$ SELECT v FROM fx WHERE k=p $$;
-- Expect the statement to be refused with a message like p_like.
CREATE FUNCTION pg_temp.refused(p_sql TEXT, p_like TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE p_like THEN RAISE EXCEPTION 'FAIL wrong refusal: % (wanted %)', SQLERRM, p_like; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL not refused: %', p_sql;
END $$;

DO $$
DECLARE v_school BIGINT; v_other BIGINT; v_id BIGINT; u RECORD; v_uid UUID;
  v_sec BIGINT; v_sub BIGINT; v_sub2 BIGINT; v_stu BIGINT; v_room BIGINT; p INT;
BEGIN
  INSERT INTO procurements.sms_schools (name, school_id) VALUES ('T240 A', 'T240A') RETURNING id INTO v_school;
  INSERT INTO procurements.sms_schools (name, school_id) VALUES ('T240 B', 'T240B') RETURNING id INTO v_other;
  INSERT INTO fx VALUES ('school', v_school);
  FOR u IN SELECT * FROM (VALUES ('teacher','teacher',v_school), ('dh','teacher',v_school),
      ('head','school_head',v_school), ('other','teacher',v_school),
      ('head_b','school_head',v_other)) t(k, typ, sch) LOOP
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (id, email) VALUES (v_uid, 't240-'||u.k||'@test.local');
    INSERT INTO procurements.sms_users (user_id, email, name, type, school_id, is_active)
      VALUES (v_uid, 't240-'||u.k||'@test.local', 'T240 '||u.k, u.typ, u.sch, true) RETURNING id INTO v_id;
    INSERT INTO fx VALUES (u.k, v_id); INSERT INTO who VALUES (u.k, v_uid);
  END LOOP;
  INSERT INTO procurements.sms_rooms (name, school_id) VALUES ('T240', v_school) RETURNING id INTO v_room;
  INSERT INTO procurements.sms_sections (name, grade_level, school_year, school_id)
    VALUES ('T240', 8, '2030-2031', v_school) RETURNING id INTO v_sec;
  INSERT INTO procurements.sms_subjects (code, name, grade_level, school_id)
    VALUES ('T240', 'T240 Subject', 8, v_school) RETURNING id INTO v_sub;
  INSERT INTO procurements.sms_subjects (code, name, grade_level, school_id)
    VALUES ('T240X', 'T240 Other', 8, v_school) RETURNING id INTO v_sub2;
  INSERT INTO procurements.sms_students (lrn, first_name, last_name, date_of_birth, gender, school_id)
    VALUES ('T240-1', 'Test', 'Learner', '2012-01-01', 'female', v_school) RETURNING id INTO v_stu;
  INSERT INTO procurements.sms_enrollments (student_id, section_id, school_id, school_year, grade_level, status, enrollment_status, enrollment_date, enrolled_by)
    VALUES (v_stu, v_sec, v_school, '2030-2031', 8, 'approved', 'active', '2030-06-01', pg_temp.f('head'));
  INSERT INTO procurements.sms_subject_schedules
    (subject_id, section_id, room_id, days_of_week, start_time, end_time, school_year, school_id, teacher_id)
    VALUES (v_sub, v_sec, v_room, ARRAY[1], '07:00', '08:00', '2030-2031', v_school, pg_temp.f('teacher'));
  UPDATE procurements.sms_subject_schedules SET grading_periods = '{1,2}' WHERE subject_id = v_sub;
  INSERT INTO procurements.sms_staff_designations (user_id, school_id, designation)
    VALUES (pg_temp.f('dh'), v_school, 'department_head');
  INSERT INTO procurements.sms_department_head_subjects (user_id, subject_id, school_id)
    VALUES (pg_temp.f('dh'), v_sub, v_school);
  FOR p IN 1..3 LOOP
    INSERT INTO procurements.sms_grades (student_id, subject_id, section_id, grading_period, school_year, grade, teacher_id)
      VALUES (v_stu, v_sub, v_sec, p, '2030-2031', 76, pg_temp.f('teacher'));
  END LOOP;
  INSERT INTO fx VALUES ('sec', v_sec), ('sub', v_sub), ('stu', v_stu);
END $$;


-- Term 1: a class record scoring 73; terms 2-3 typed.
DO $$ DECLARE v_rec BIGINT; v_item BIGINT; BEGIN
  INSERT INTO procurements.sms_class_records (subject_id, section_id, school_year, grading_period, teacher_id, school_id, ww_weight, pt_weight, st_weight, grading_scheme, use_transmutation)
    VALUES (pg_temp.f('sub'), pg_temp.f('sec'), '2030-2031', 1, pg_temp.f('teacher'), pg_temp.f('school'), 100, 0, 0, 'legacy', false) RETURNING id INTO v_rec;
  INSERT INTO procurements.sms_class_record_items (class_record_id, component, label, max_score, position)
    VALUES (v_rec, 'WW', 'Q1', 100, 1) RETURNING id INTO v_item;
  INSERT INTO procurements.sms_class_record_scores (item_id, student_id, raw_score) VALUES (v_item, pg_temp.f('stu'), 73);
  INSERT INTO fx VALUES ('rec', v_rec), ('item', v_item);
END $$;
CREATE FUNCTION pg_temp.req(t INT, p INT) RETURNS BIGINT LANGUAGE sql AS $$
  SELECT procurements.grade_adjustment_request(pg_temp.f('stu'), pg_temp.f('sub'), pg_temp.f('sec'), (10+t)::SMALLINT, p, 'extracurricular', NULL) $$;
CREATE FUNCTION pg_temp.expect(p_grade INT, p_added INT, p_remarks TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE g procurements.sms_grades; BEGIN
  SELECT * INTO g FROM procurements.sms_grades WHERE student_id = pg_temp.f('stu') AND grading_period = 1;
  IF g.grade IS DISTINCT FROM p_grade OR g.added_points IS DISTINCT FROM p_added OR g.remarks IS DISTINCT FROM p_remarks
  THEN RAISE EXCEPTION 'FAIL got % % %, wanted % % %', g.grade, g.added_points, g.remarks, p_grade, p_added, p_remarks; END IF;
END $$;

-- A: refused while unposted, with no record, outside one's terms, by others
SET LOCAL ROLE authenticated;
SELECT pg_temp.act('teacher');
SELECT pg_temp.refused('SELECT pg_temp.req(1, 2)', '%not posted%');
SELECT pg_temp.refused('SELECT pg_temp.req(2, 2)', '%not posted%');
SELECT pg_temp.refused('SELECT pg_temp.req(3, 2)', '%Only the subject%');
SELECT procurements.post_class_record_grades(pg_temp.f('rec'));
SELECT pg_temp.act('other');
SELECT pg_temp.refused('SELECT pg_temp.req(1, 2)', '%Only the subject%');
SELECT pg_temp.refused('SELECT procurements.grade_adjustment_apply_term(1)', '%permission denied%');
RESET ROLE;
SELECT pg_temp.expect(73, 0, 'Failed');

-- B: a request changes nothing; approval raises the term, its remarks and the GPA
SET LOCAL ROLE authenticated;
SELECT pg_temp.act('teacher');
SELECT pg_temp.req(1, 4);
SELECT pg_temp.refused('SELECT pg_temp.req(1, 1)', '%already has%');
RESET ROLE;
SELECT pg_temp.expect(73, 0, 'Failed');
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM procurements.sms_notifications WHERE body LIKE '%, Term 1') THEN RAISE EXCEPTION 'FAIL B label'; END IF; END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.act('head');
SELECT procurements.grade_adjustment_decide((SELECT max(id) FROM procurements.sms_grade_adjustments), true);
RESET ROLE;
SELECT pg_temp.expect(77, 4, 'Passed');
DO $$ DECLARE v NUMERIC; BEGIN
  SELECT gpa INTO v FROM procurements.students_gpa_for_grade(ARRAY[pg_temp.f('stu')], 8);
  -- (77 + 76 + 76) / 3: counted once
  IF v <> 76.33 THEN RAISE EXCEPTION 'FAIL B gpa %', v; END IF;
END $$;

-- C: re-posting keeps them, on new scores and capped at 100
SET LOCAL ROLE authenticated;
SELECT pg_temp.act('teacher');
SELECT procurements.post_class_record_grades(pg_temp.f('rec'));
RESET ROLE;
SELECT pg_temp.expect(77, 4, 'Passed');
UPDATE procurements.sms_class_record_scores SET raw_score = 98 WHERE item_id = pg_temp.f('item');
SELECT procurements.post_class_record_grades(pg_temp.f('rec'));
SELECT pg_temp.expect(100, 2, 'Passed');
UPDATE procurements.sms_class_record_scores SET raw_score = 72 WHERE item_id = pg_temp.f('item');
SELECT procurements.post_class_record_grades(pg_temp.f('rec'));
SELECT pg_temp.expect(76, 4, 'Passed');

-- D: unpost takes the grade away, posting again restores it with the points
SET LOCAL ROLE authenticated;
SELECT pg_temp.act('teacher');
SELECT procurements.unpost_class_record_grades(pg_temp.f('rec'));
SELECT procurements.post_class_record_grades(pg_temp.f('rec'));
RESET ROLE;
SELECT pg_temp.expect(76, 4, 'Passed');

-- E: final points stack on top, then revoking the term's points restores 72
SET LOCAL ROLE authenticated;
SELECT pg_temp.act('teacher');
SELECT procurements.grade_adjustment_request(pg_temp.f('stu'), pg_temp.f('sub'), pg_temp.f('sec'), 0::SMALLINT, 1, 'leadership', NULL);
SELECT pg_temp.act('head');
SELECT procurements.grade_adjustment_decide((SELECT max(id) FROM procurements.sms_grade_adjustments WHERE semester = 0), true);
RESET ROLE;
DO $$ BEGIN IF (SELECT gpa FROM procurements.students_gpa_for_grade(ARRAY[pg_temp.f('stu')], 8)) <> 77 THEN RAISE EXCEPTION 'FAIL E gpa'; END IF; END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.act('head');
SELECT procurements.grade_adjustment_revoke((SELECT id FROM procurements.sms_grade_adjustments WHERE semester = 11), 'mistake');
RESET ROLE;
SELECT pg_temp.expect(72, 0, 'Failed');

-- F: a carried-over grade takes none
UPDATE procurements.sms_grades SET carried_from_school = 'Elsewhere' WHERE student_id = pg_temp.f('stu') AND grading_period = 1;
SET LOCAL ROLE authenticated;
SELECT pg_temp.act('teacher');
SELECT pg_temp.refused('SELECT pg_temp.req(1, 2)', '%not posted%');
RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'ok: 240 all passed'; END $$;
ROLLBACK;
