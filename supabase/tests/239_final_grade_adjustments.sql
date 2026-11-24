-- Tests for migration 239. One transaction, rolled back. Requires 198, 216, 235, 239.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/239_final_grade_adjustments.sql
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
  INSERT INTO procurements.sms_schools (name, school_id) VALUES ('T239 A', 'T239A') RETURNING id INTO v_school;
  INSERT INTO procurements.sms_schools (name, school_id) VALUES ('T239 B', 'T239B') RETURNING id INTO v_other;
  INSERT INTO fx VALUES ('school', v_school);
  FOR u IN SELECT * FROM (VALUES ('teacher','teacher',v_school), ('dh','teacher',v_school),
      ('head','school_head',v_school), ('other','teacher',v_school),
      ('head_b','school_head',v_other)) t(k, typ, sch) LOOP
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (id, email) VALUES (v_uid, 't239-'||u.k||'@test.local');
    INSERT INTO procurements.sms_users (user_id, email, name, type, school_id, is_active)
      VALUES (v_uid, 't239-'||u.k||'@test.local', 'T239 '||u.k, u.typ, u.sch, true) RETURNING id INTO v_id;
    INSERT INTO fx VALUES (u.k, v_id); INSERT INTO who VALUES (u.k, v_uid);
  END LOOP;
  INSERT INTO procurements.sms_rooms (name, school_id) VALUES ('T239', v_school) RETURNING id INTO v_room;
  INSERT INTO procurements.sms_sections (name, grade_level, school_year, school_id)
    VALUES ('T239', 8, '2030-2031', v_school) RETURNING id INTO v_sec;
  INSERT INTO procurements.sms_subjects (code, name, grade_level, school_id)
    VALUES ('T239', 'T239 Subject', 8, v_school) RETURNING id INTO v_sub;
  INSERT INTO procurements.sms_subjects (code, name, grade_level, school_id)
    VALUES ('T239X', 'T239 Other', 8, v_school) RETURNING id INTO v_sub2;
  INSERT INTO procurements.sms_students (lrn, first_name, last_name, date_of_birth, gender, school_id)
    VALUES ('T239-1', 'Test', 'Learner', '2012-01-01', 'female', v_school) RETURNING id INTO v_stu;
  INSERT INTO procurements.sms_enrollments (student_id, section_id, school_id, school_year, grade_level, status, enrollment_status, enrollment_date, enrolled_by)
    VALUES (v_stu, v_sec, v_school, '2030-2031', 8, 'approved', 'active', '2030-06-01', pg_temp.f('head'));
  INSERT INTO procurements.sms_subject_schedules
    (subject_id, section_id, room_id, days_of_week, start_time, end_time, school_year, school_id, teacher_id)
    VALUES (v_sub, v_sec, v_room, ARRAY[1], '07:00', '08:00', '2030-2031', v_school, pg_temp.f('teacher'));
  INSERT INTO procurements.sms_staff_designations (user_id, school_id, designation)
    VALUES (pg_temp.f('dh'), v_school, 'department_head');
  INSERT INTO procurements.sms_department_head_subjects (user_id, subject_id, school_id)
    VALUES (pg_temp.f('dh'), v_sub, v_school);
  FOR p IN 1..2 LOOP
    INSERT INTO procurements.sms_grades (student_id, subject_id, section_id, grading_period, school_year, grade, teacher_id)
      VALUES (v_stu, v_sub, v_sec, p, '2030-2031', 76, pg_temp.f('teacher'));
  END LOOP;
  INSERT INTO fx VALUES ('sec', v_sec), ('sub', v_sub), ('stu', v_stu);
END $$;

CREATE FUNCTION pg_temp.req(p INT) RETURNS BIGINT LANGUAGE sql AS $$
  SELECT procurements.grade_adjustment_request(pg_temp.f('stu'), pg_temp.f('sub'), pg_temp.f('sec'), 0::SMALLINT, p, 'extracurricular', NULL) $$;

SET LOCAL ROLE authenticated;
-- A: refusals before the final exists, and by outsiders
SELECT pg_temp.act('teacher');
SELECT pg_temp.refused('SELECT pg_temp.req(2)', '%not complete%');
RESET ROLE;
INSERT INTO procurements.sms_grades (student_id, subject_id, section_id, grading_period, school_year, grade, teacher_id)
  VALUES (pg_temp.f('stu'), pg_temp.f('sub'), pg_temp.f('sec'), 3, '2030-2031', 79, pg_temp.f('teacher'));
SET LOCAL ROLE authenticated;
SELECT pg_temp.act('other');
SELECT pg_temp.refused('SELECT pg_temp.req(2)', '%Only the subject%');
SELECT pg_temp.act('teacher');
SELECT pg_temp.refused('SELECT pg_temp.req(11)', '%1 to 10%');
SELECT pg_temp.refused('INSERT INTO procurements.sms_grade_adjustments DEFAULT VALUES', '%permission denied%');

-- B: a request notifies the DH and the head only, and moves no GPA
SELECT pg_temp.req(2);
SELECT pg_temp.refused('SELECT pg_temp.req(1)', '%already has%');
SELECT pg_temp.refused('SELECT procurements.grade_adjustment_decide((SELECT max(id) FROM procurements.sms_grade_adjustments), true)', '%Department Head%');
RESET ROLE;
DO $$ BEGIN
  IF (SELECT array_agg(user_id ORDER BY user_id) FROM procurements.sms_notifications)
     IS DISTINCT FROM (SELECT array_agg(v ORDER BY v) FROM fx WHERE k IN ('dh','head'))
  THEN RAISE EXCEPTION 'FAIL B recipients'; END IF;
  IF (SELECT gpa FROM procurements.students_gpa_for_grade(ARRAY[pg_temp.f('stu')], 8)) <> 77
  THEN RAISE EXCEPTION 'FAIL B gpa moved'; END IF;
END $$;

-- C: visibility and authority
SET LOCAL ROLE authenticated;
SELECT pg_temp.act('head_b');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM procurements.sms_grade_adjustments) THEN RAISE EXCEPTION 'FAIL C other school sees pending'; END IF;
  IF EXISTS (SELECT 1 FROM procurements.grade_adjustment_list(pg_temp.f('school'), true)) THEN RAISE EXCEPTION 'FAIL C list'; END IF;
  IF EXISTS (SELECT 1 FROM procurements.sms_notifications) THEN RAISE EXCEPTION 'FAIL C notifications leak'; END IF;
END $$;
SELECT pg_temp.act('dh');
DO $$ DECLARE v BIGINT; BEGIN
  SELECT id INTO v FROM procurements.sms_grade_adjustments;
  IF procurements.grade_adjustment_pending_count(pg_temp.f('school')) <> 1 THEN RAISE EXCEPTION 'FAIL C count'; END IF;
  IF (SELECT current_final FROM procurements.grade_adjustment_list(pg_temp.f('school'), true)) <> 77 THEN RAISE EXCEPTION 'FAIL C list row'; END IF;
  PERFORM pg_temp.refused(format('SELECT procurements.grade_adjustment_decide(%s, false)', v), '%reason for rejecting%');
  PERFORM procurements.grade_adjustment_decide(v, true);
  PERFORM pg_temp.refused(format('SELECT procurements.grade_adjustment_decide(%s, true)', v), '%no longer pending%');
END $$;
RESET ROLE;
-- D: approved = 79, badges cleared, teacher told, no grade row changed
DO $$ BEGIN
  IF (SELECT gpa FROM procurements.students_gpa_for_grade(ARRAY[pg_temp.f('stu')], 8)) <> 79 THEN RAISE EXCEPTION 'FAIL D gpa'; END IF;
  IF (SELECT sum(grade) FROM procurements.sms_grades WHERE student_id = pg_temp.f('stu')) <> 231 THEN RAISE EXCEPTION 'FAIL D grades'; END IF;
  IF EXISTS (SELECT 1 FROM procurements.sms_notifications WHERE kind='grade_adjustment_request' AND read_at IS NULL) THEN RAISE EXCEPTION 'FAIL D badge'; END IF;
  IF (SELECT count(*) FROM procurements.sms_notifications WHERE kind='grade_adjustment_decision' AND user_id=pg_temp.f('teacher') AND read_at IS NULL) <> 1 THEN RAISE EXCEPTION 'FAIL D teacher'; END IF;
END $$;
-- E: marking read touches only your own
SET LOCAL ROLE authenticated;
SELECT pg_temp.act('other');
SELECT procurements.notifications_mark_read((SELECT array_agg(x) FROM generate_series(1,100000) x));
RESET ROLE;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM procurements.sms_notifications WHERE read_at IS NULL) THEN RAISE EXCEPTION 'FAIL E'; END IF; END $$;
-- F: revoke restores 77; the head may not decide their own request
SET LOCAL ROLE authenticated;
SELECT pg_temp.act('head');
SELECT procurements.grade_adjustment_revoke((SELECT id FROM procurements.sms_grade_adjustments WHERE status='approved'), 'mistake');
RESET ROLE;
DO $$ BEGIN
  IF (SELECT gpa FROM procurements.students_gpa_for_grade(ARRAY[pg_temp.f('stu')], 8)) <> 77 THEN RAISE EXCEPTION 'FAIL F gpa'; END IF;
END $$;
UPDATE procurements.sms_subject_schedules SET teacher_id = pg_temp.f('head') WHERE subject_id = pg_temp.f('sub');
SET LOCAL ROLE authenticated;
SELECT pg_temp.act('head');
SELECT pg_temp.req(3);
SELECT pg_temp.refused('SELECT procurements.grade_adjustment_decide((SELECT max(id) FROM procurements.sms_grade_adjustments), true)', '%your own%');
SELECT procurements.grade_adjustment_withdraw((SELECT max(id) FROM procurements.sms_grade_adjustments));
RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'ok: 239 all passed'; END $$;
ROLLBACK;
