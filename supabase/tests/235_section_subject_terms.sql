-- Tests for migration 235. One transaction, rolled back.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/235_section_subject_terms.sql
--
-- A strengthened Grade 11 section offers one subject in some terms only. The
-- save RPC narrows the subject's schedules with the offering, schedules can't
-- leave it, and a term holding grades can't be dropped.
BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

CREATE TEMP TABLE fx (k TEXT PRIMARY KEY, v BIGINT) ON COMMIT DROP;
GRANT SELECT ON fx TO authenticated;

DO $$
DECLARE
  v_school BIGINT; v_staff BIGINT; v_room BIGINT;
  v_g11 BIGINT; v_g10 BIGINT; v_subj BIGINT; v_core BIGINT; v_stu BIGINT;
  v_sy TEXT := '2030-2031';
BEGIN
  SELECT id INTO v_school FROM procurements.sms_schools ORDER BY id LIMIT 1;
  SELECT id INTO v_staff  FROM procurements.sms_users ORDER BY id LIMIT 1;
  INSERT INTO procurements.sms_rooms (name, school_id) VALUES ('T235 Room', v_school) RETURNING id INTO v_room;
  INSERT INTO procurements.sms_sections (name, grade_level, school_year, school_id, shs_curriculum)
    VALUES ('T235 G11', 11, v_sy, v_school, 'strengthened') RETURNING id INTO v_g11;
  INSERT INTO procurements.sms_sections (name, grade_level, school_year, school_id)
    VALUES ('T235 G10', 10, v_sy, v_school) RETURNING id INTO v_g10;
  INSERT INTO procurements.sms_subjects (code, name, grade_level, school_id)
    VALUES ('T235E', 'T235 Elective', 11, v_school) RETURNING id INTO v_subj;
  INSERT INTO procurements.sms_subjects (code, name, grade_level, school_id)
    VALUES ('T235C', 'T235 Core', 11, v_school) RETURNING id INTO v_core;
  INSERT INTO procurements.sms_students (lrn, first_name, last_name, date_of_birth, gender, school_id)
    VALUES ('T235-1', 'Test', 'Learner', '2010-01-01', 'female', v_school) RETURNING id INTO v_stu;

  -- Two time blocks for the elective: one whole-year, one Terms 1-2.
  INSERT INTO procurements.sms_subject_schedules
    (subject_id, section_id, room_id, days_of_week, start_time, end_time, school_year, school_id, teacher_id)
  VALUES
    (v_subj, v_g11, v_room, ARRAY[1], '07:00', '08:00', v_sy, v_school, v_staff),
    (v_subj, v_g11, v_room, ARRAY[2], '07:00', '08:00', v_sy, v_school, v_staff);
  UPDATE procurements.sms_subject_schedules SET grading_periods = '{1,2}'
   WHERE subject_id = v_subj AND section_id = v_g11 AND days_of_week = ARRAY[2];

  INSERT INTO fx VALUES ('school', v_school), ('staff', v_staff), ('room', v_room), ('g11', v_g11),
    ('g10', v_g10), ('subj', v_subj), ('core', v_core), ('stu', v_stu);
END $$;

-- A: offering Term 1 only narrows both schedule rows to {1}
DO $$
DECLARE r jsonb; v_bad INT; v_terms SMALLINT[];
BEGIN
  r := procurements.save_section_subject_terms(
    (SELECT v FROM fx WHERE k='g11'), (SELECT v FROM fx WHERE k='subj'), '{1}');
  IF (r->>'narrowed_schedules')::INT <> 2 THEN RAISE EXCEPTION 'FAIL A: narrowed %', r; END IF;
  SELECT count(*) INTO v_bad FROM procurements.sms_subject_schedules
   WHERE subject_id = (SELECT v FROM fx WHERE k='subj') AND grading_periods IS DISTINCT FROM '{1}';
  IF v_bad <> 0 THEN RAISE EXCEPTION 'FAIL A: % rows not narrowed', v_bad; END IF;
  SELECT terms INTO v_terms FROM procurements.sms_section_subject_terms
   WHERE subject_id = (SELECT v FROM fx WHERE k='subj');
  IF v_terms IS DISTINCT FROM '{1}'::SMALLINT[] THEN RAISE EXCEPTION 'FAIL A: offering %', v_terms; END IF;
  RAISE NOTICE 'ok: A Term 1 only narrows the schedules';
END $$;

-- C: a whole-year schedule row is refused while the offering exists
DO $$
BEGIN
  BEGIN
    INSERT INTO procurements.sms_subject_schedules
      (subject_id, section_id, room_id, days_of_week, start_time, end_time, school_year, school_id, teacher_id)
    VALUES ((SELECT v FROM fx WHERE k='subj'), (SELECT v FROM fx WHERE k='g11'), (SELECT v FROM fx WHERE k='room'),
            ARRAY[3], '07:00', '08:00', '2030-2031', (SELECT v FROM fx WHERE k='school'), (SELECT v FROM fx WHERE k='staff'));
    RAISE EXCEPTION 'FAIL C: NULL schedule accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%Term 1%' THEN RAISE EXCEPTION 'FAIL C: message %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'ok: C NULL schedule refused';
END $$;

-- D: a schedule row cannot move outside the offering
DO $$
BEGIN
  BEGIN
    UPDATE procurements.sms_subject_schedules SET grading_periods = '{2}'
     WHERE subject_id = (SELECT v FROM fx WHERE k='subj') AND days_of_week = ARRAY[1];
    RAISE EXCEPTION 'FAIL D: moved outside the offering';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok: D schedule kept inside the offering';
END $$;

-- B: whole year deletes the offering; the schedules keep {1}
DO $$
DECLARE r jsonb; v_n INT;
BEGIN
  r := procurements.save_section_subject_terms(
    (SELECT v FROM fx WHERE k='g11'), (SELECT v FROM fx WHERE k='subj'), '{1,2,3}');
  SELECT count(*) INTO v_n FROM procurements.sms_section_subject_terms
   WHERE subject_id = (SELECT v FROM fx WHERE k='subj');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL B: offering row kept'; END IF;
  SELECT count(*) INTO v_n FROM procurements.sms_subject_schedules
   WHERE subject_id = (SELECT v FROM fx WHERE k='subj') AND grading_periods = '{1}';
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL B: schedules changed (%)', v_n; END IF;
  RAISE NOTICE 'ok: B whole year deletes the row, schedules untouched';
END $$;

-- E: a time block that only covers Term 3 refuses the whole save
DO $$
DECLARE v_n INT;
BEGIN
  UPDATE procurements.sms_subject_schedules SET grading_periods = '{3}'
   WHERE subject_id = (SELECT v FROM fx WHERE k='subj') AND days_of_week = ARRAY[2];
  BEGIN
    PERFORM procurements.save_section_subject_terms(
      (SELECT v FROM fx WHERE k='g11'), (SELECT v FROM fx WHERE k='subj'), '{1}');
    RAISE EXCEPTION 'FAIL E: save accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%only covers Term 3%' THEN RAISE EXCEPTION 'FAIL E: message %', SQLERRM; END IF;
  END;
  SELECT count(*) INTO v_n FROM procurements.sms_section_subject_terms
   WHERE subject_id = (SELECT v FROM fx WHERE k='subj');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL E: offering written'; END IF;
  UPDATE procurements.sms_subject_schedules SET grading_periods = '{1,2}'
   WHERE subject_id = (SELECT v FROM fx WHERE k='subj') AND days_of_week = ARRAY[2];
  RAISE NOTICE 'ok: E empty intersection refuses the save';
END $$;

-- F: a grade in Term 2 blocks dropping Term 2, but {1,2} is fine
DO $$
BEGIN
  INSERT INTO procurements.sms_grades (student_id, subject_id, section_id, grading_period, school_year, grade, teacher_id)
  VALUES ((SELECT v FROM fx WHERE k='stu'), (SELECT v FROM fx WHERE k='subj'), (SELECT v FROM fx WHERE k='g11'),
          2, '2030-2031', 85, (SELECT v FROM fx WHERE k='staff'));
  BEGIN
    PERFORM procurements.save_section_subject_terms(
      (SELECT v FROM fx WHERE k='g11'), (SELECT v FROM fx WHERE k='subj'), '{1}');
    RAISE EXCEPTION 'FAIL F: dropped a graded term';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%Term 2%' THEN RAISE EXCEPTION 'FAIL F: message %', SQLERRM; END IF;
  END;
  PERFORM procurements.save_section_subject_terms(
    (SELECT v FROM fx WHERE k='g11'), (SELECT v FROM fx WHERE k='subj'), '{1,2}');
  RAISE NOTICE 'ok: F graded term kept; {1,2} accepted';
END $$;

-- G: a carried transfer-in grade (200) blocks too — only where 200 is applied
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'procurements'
                 AND table_name = 'sms_grades' AND column_name = 'carried_from_school') THEN
    RAISE NOTICE 'skip: G — migration 200 not on this database';
    RETURN;
  END IF;
  EXECUTE format('INSERT INTO procurements.sms_grades (student_id, subject_id, section_id, grading_period, school_year, grade, teacher_id, carried_from_school)
                  VALUES (%s, %s, %s, 1, %L, 88, %s, %L)',
    (SELECT v FROM fx WHERE k='stu'), (SELECT v FROM fx WHERE k='core'), (SELECT v FROM fx WHERE k='g11'),
    '2030-2031', (SELECT v FROM fx WHERE k='staff'), 'Other School');
  BEGIN
    PERFORM procurements.save_section_subject_terms(
      (SELECT v FROM fx WHERE k='g11'), (SELECT v FROM fx WHERE k='core'), '{2}');
    RAISE EXCEPTION 'FAIL G: carried grade ignored';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok: G carried grade blocks';
END $$;

-- H: only Grade 11-12 term-based sections
DO $$
BEGIN
  BEGIN
    PERFORM procurements.save_section_subject_terms(
      (SELECT v FROM fx WHERE k='g10'), (SELECT v FROM fx WHERE k='subj'), '{1}');
    RAISE EXCEPTION 'FAIL H: Grade 10 accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%Grade 11%' THEN RAISE EXCEPTION 'FAIL H: message %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'ok: H Grade 10 refused';
END $$;

-- I: malformed terms
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['{0}', '{}', '{4}'] LOOP
    BEGIN
      PERFORM procurements.save_section_subject_terms(
        (SELECT v FROM fx WHERE k='g11'), (SELECT v FROM fx WHERE k='core'), t::SMALLINT[]);
      RAISE EXCEPTION 'FAIL I: % accepted', t;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    END;
  END LOOP;
  -- {1,1} is normalised, not refused
  PERFORM procurements.save_section_subject_terms(
    (SELECT v FROM fx WHERE k='g11'), (SELECT v FROM fx WHERE k='core'), '{1,1}');
  IF (SELECT terms FROM procurements.sms_section_subject_terms WHERE subject_id = (SELECT v FROM fx WHERE k='core'))
     IS DISTINCT FROM '{1}'::SMALLINT[] THEN RAISE EXCEPTION 'FAIL I: {1,1} not normalised'; END IF;
  RAISE NOTICE 'ok: I malformed terms refused, duplicates normalised';
END $$;

-- R: who may set an offering — a teacher is refused, the school's head is not
DO $$
DECLARE v_teacher RECORD; v_head RECORD;
BEGIN
  SELECT u.* INTO v_teacher FROM procurements.sms_users u
   WHERE u.type = 'teacher' AND u.user_id IS NOT NULL AND u.school_id = (SELECT v FROM fx WHERE k='school') LIMIT 1;
  SELECT u.* INTO v_head FROM procurements.sms_users u
   WHERE u.type = 'school_head' AND u.user_id IS NOT NULL AND u.school_id = (SELECT v FROM fx WHERE k='school') LIMIT 1;
  IF v_teacher.id IS NULL OR v_head.id IS NULL THEN
    RAISE NOTICE 'skip: R — no teacher / school head with a login at the fixture school';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_teacher.user_id, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM procurements.save_section_subject_terms(
      (SELECT v FROM fx WHERE k='g11'), (SELECT v FROM fx WHERE k='core'), '{2}');
    RAISE EXCEPTION 'FAIL R: teacher allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Only the school head%' THEN RAISE EXCEPTION 'FAIL R: message %', SQLERRM; END IF;
  END;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_head.user_id, 'role', 'authenticated')::text, true);
  PERFORM procurements.save_section_subject_terms(
    (SELECT v FROM fx WHERE k='g11'), (SELECT v FROM fx WHERE k='core'), '{1}');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  RAISE NOTICE 'ok: R teacher refused, school head allowed';
END $$;

-- J-N: promotion GPA and Grade Monitoring follow the offering (parts 6-7)
DO $$
DECLARE
  v_school BIGINT := (SELECT v FROM fx WHERE k='school');
  v_staff  BIGINT := (SELECT v FROM fx WHERE k='staff');
  v_room   BIGINT := (SELECT v FROM fx WHERE k='room');
  v_sy     TEXT := '2030-2031';
  v_sec BIGINT; v_core BIGINT; v_elec BIGINT; v_a BIGINT; v_b BIGINT;
  v_gpa NUMERIC; v_periods INTEGER[];
BEGIN
  INSERT INTO procurements.sms_sections (name, grade_level, school_year, school_id, shs_curriculum)
    VALUES ('T235 G11J', 11, v_sy, v_school, 'strengthened') RETURNING id INTO v_sec;
  INSERT INTO procurements.sms_subjects (code, name, grade_level, school_id)
    VALUES ('T235JC', 'T235 J Core', 11, v_school) RETURNING id INTO v_core;
  INSERT INTO procurements.sms_subjects (code, name, grade_level, school_id)
    VALUES ('T235JE', 'T235 J Elective', 11, v_school) RETURNING id INTO v_elec;
  INSERT INTO procurements.sms_students (lrn, first_name, last_name, date_of_birth, gender, school_id)
    VALUES ('T235-J', 'Test', 'J', '2010-01-01', 'male', v_school) RETURNING id INTO v_a;
  INSERT INTO procurements.sms_students (lrn, first_name, last_name, date_of_birth, gender, school_id)
    VALUES ('T235-L', 'Test', 'L', '2010-01-01', 'male', v_school) RETURNING id INTO v_b;
  INSERT INTO procurements.sms_enrollments
    (student_id, section_id, school_year, grade_level, semester, enrolled_by, school_id, status, enrollment_status)
  VALUES (v_a, v_sec, v_sy, 11, 1, v_staff, v_school, 'approved', 'active'),
         (v_b, v_sec, v_sy, 11, 1, v_staff, v_school, 'approved', 'active');

  INSERT INTO procurements.sms_subject_schedules
    (subject_id, section_id, room_id, days_of_week, start_time, end_time, school_year, school_id, teacher_id)
  VALUES (v_core, v_sec, v_room, ARRAY[5], '07:00', '08:00', v_sy, v_school, v_staff),
         (v_elec, v_sec, v_room, ARRAY[5], '09:00', '10:00', v_sy, v_school, v_staff);
  PERFORM procurements.save_section_subject_terms(v_sec, v_elec, '{1}');

  INSERT INTO procurements.sms_grades (student_id, subject_id, section_id, grading_period, school_year, grade, teacher_id) VALUES
    (v_a, v_core, v_sec, 1, v_sy, 80, v_staff), (v_a, v_core, v_sec, 2, v_sy, 80, v_staff),
    (v_a, v_core, v_sec, 3, v_sy, 80, v_staff), (v_a, v_elec, v_sec, 1, v_sy, 95, v_staff),
    (v_b, v_core, v_sec, 1, v_sy, 80, v_staff), (v_b, v_core, v_sec, 2, v_sy, 80, v_staff),
    (v_b, v_core, v_sec, 3, v_sy, 80, v_staff);

  -- J: a Term 1 elective weighs the same as a full-year subject
  SELECT g.gpa INTO v_gpa FROM procurements.students_gpa_for_grade(ARRAY[v_a], 11, v_sy, v_school) g;
  IF v_gpa IS DISTINCT FROM 87.50 THEN RAISE EXCEPTION 'FAIL J: expected 87.50, got %', v_gpa; END IF;
  RAISE NOTICE 'ok: J term elective weighs as one subject → %', v_gpa;

  -- K: a stray grade outside the offering is ignored
  INSERT INTO procurements.sms_grades (student_id, subject_id, section_id, grading_period, school_year, grade, teacher_id)
    VALUES (v_a, v_elec, v_sec, 2, v_sy, 60, v_staff);
  SELECT g.gpa INTO v_gpa FROM procurements.students_gpa_for_grade(ARRAY[v_a], 11, v_sy, v_school) g;
  IF v_gpa IS DISTINCT FROM 87.50 THEN RAISE EXCEPTION 'FAIL K: expected 87.50, got %', v_gpa; END IF;
  RAISE NOTICE 'ok: K stray grade outside the offering ignored';

  -- L: no term-limited subject, every subject fully encoded — same as 234 gives
  INSERT INTO procurements.sms_subjects (code, name, grade_level, school_id)
    VALUES ('T235JC2', 'T235 J Core 2', 11, v_school) RETURNING id INTO v_elec;  -- reused var: a second whole-year subject
  INSERT INTO procurements.sms_grades (student_id, subject_id, section_id, grading_period, school_year, grade, teacher_id) VALUES
    (v_b, v_elec, v_sec, 1, v_sy, 90, v_staff), (v_b, v_elec, v_sec, 2, v_sy, 90, v_staff),
    (v_b, v_elec, v_sec, 3, v_sy, 90, v_staff);
  SELECT g.gpa INTO v_gpa FROM procurements.students_gpa_for_grade(ARRAY[v_b], 11, v_sy, v_school) g;
  IF v_gpa IS DISTINCT FROM 85.00 THEN RAISE EXCEPTION 'FAIL L: expected 85.00, got %', v_gpa; END IF;
  RAISE NOTICE 'ok: L whole-year subjects unchanged → %', v_gpa;
  v_elec := (SELECT id FROM procurements.sms_subjects WHERE code = 'T235JE' AND school_id = v_school);

  -- N: Grade Monitoring expects the elective in Term 1 only
  SELECT array_agg(grading_period ORDER BY grading_period) INTO v_periods
  FROM procurements.get_grade_encoding_status(v_school, v_sy, 3)
  WHERE subject_id = v_elec AND section_id = v_sec;
  IF v_periods IS DISTINCT FROM ARRAY[1] THEN RAISE EXCEPTION 'FAIL N: monitoring periods %', v_periods; END IF;
  SELECT array_agg(grading_period ORDER BY grading_period) INTO v_periods
  FROM procurements.get_grade_encoding_status(v_school, v_sy, 3)
  WHERE subject_id = v_core AND section_id = v_sec;
  IF v_periods IS DISTINCT FROM ARRAY[1,2,3] THEN RAISE EXCEPTION 'FAIL N: core periods %', v_periods; END IF;
  RAISE NOTICE 'ok: N monitoring follows the offering';
END $$;

-- S: a section holding offerings cannot leave eligibility (review fix)
DO $$
DECLARE v_g11 BIGINT := (SELECT v FROM fx WHERE k='g11');
BEGIN
  BEGIN
    UPDATE procurements.sms_sections SET shs_curriculum = 'old' WHERE id = v_g11;
    RAISE EXCEPTION 'FAIL S: curriculum changed under an offering';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%Offered in%' THEN RAISE EXCEPTION 'FAIL S: message %', SQLERRM; END IF;
  END;
  BEGIN
    UPDATE procurements.sms_sections SET grade_level = 10 WHERE id = v_g11;
    RAISE EXCEPTION 'FAIL S: grade level changed under an offering';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  -- Other edits still go through.
  UPDATE procurements.sms_sections SET name = 'T235 G11 renamed' WHERE id = v_g11;
  RAISE NOTICE 'ok: S section eligibility locked while offerings exist';
END $$;

-- T: a learner whose section has no offering keeps 234's GPA (review fix)
DO $$
DECLARE
  v_school BIGINT := (SELECT v FROM fx WHERE k='school');
  v_staff  BIGINT := (SELECT v FROM fx WHERE k='staff');
  v_sec BIGINT; v_a BIGINT; v_b BIGINT; v_l BIGINT; v_gpa NUMERIC;
BEGIN
  INSERT INTO procurements.sms_sections (name, grade_level, school_year, school_id, shs_curriculum)
    VALUES ('T235 G11T', 11, '2030-2031', v_school, 'strengthened') RETURNING id INTO v_sec;
  INSERT INTO procurements.sms_subjects (code, name, grade_level, school_id)
    VALUES ('T235TA', 'T235 T A', 11, v_school) RETURNING id INTO v_a;
  INSERT INTO procurements.sms_subjects (code, name, grade_level, school_id)
    VALUES ('T235TB', 'T235 T B', 11, v_school) RETURNING id INTO v_b;
  INSERT INTO procurements.sms_students (lrn, first_name, last_name, date_of_birth, gender, school_id)
    VALUES ('T235-T', 'Test', 'T', '2010-01-01', 'male', v_school) RETURNING id INTO v_l;
  INSERT INTO procurements.sms_enrollments
    (student_id, section_id, school_year, grade_level, semester, enrolled_by, school_id, status, enrollment_status)
  VALUES (v_l, v_sec, '2030-2031', 11, 1, v_staff, v_school, 'approved', 'active');
  INSERT INTO procurements.sms_grades (student_id, subject_id, section_id, grading_period, school_year, grade, teacher_id) VALUES
    (v_l, v_a, v_sec, 1, '2030-2031', 80, v_staff), (v_l, v_a, v_sec, 2, '2030-2031', 80, v_staff),
    (v_l, v_a, v_sec, 3, '2030-2031', 80, v_staff), (v_l, v_b, v_sec, 1, '2030-2031', 95, v_staff);
  SELECT g.gpa INTO v_gpa FROM procurements.students_gpa_for_grade(ARRAY[v_l], 11, '2030-2031', v_school) g;
  -- 234: mean of (period, subject) values = (80 + 80 + 80 + 95) / 4
  IF v_gpa IS DISTINCT FROM 83.75 THEN RAISE EXCEPTION 'FAIL T: expected 83.75 (234), got %', v_gpa; END IF;
  RAISE NOTICE 'ok: T no offering in the section → 234 GPA unchanged';
END $$;

ROLLBACK;
