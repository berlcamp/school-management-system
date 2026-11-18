-- Tests for migration 234. One transaction, rolled back.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/234_section_change_gpa.sql
--
-- A learner moved from section A to section B of the same grade mid-year: the
-- promotion GPA counts the quarters encoded in A as well as B, with B winning a
-- clash; nothing from another grade level or another school is counted; Senior
-- High is unchanged.
BEGIN;

DO $$
DECLARE
  v_school   BIGINT;
  v_other    BIGINT;
  v_staff    BIGINT;
  v_sy       TEXT := '2030-2031';
  v_a BIGINT; v_b BIGINT; v_g8 BIGINT; v_far BIGINT; v_s11a BIGINT; v_s11b BIGINT;
  v_math BIGINT; v_sci BIGINT; v_shs BIGINT;
  v_l BIGINT[] := ARRAY[]::BIGINT[];
  v_id BIGINT;
  v_gpa NUMERIC;
  i INT;

  -- helper to read one learner's GPA
BEGIN
  SELECT id INTO v_school FROM procurements.sms_schools ORDER BY id LIMIT 1;
  SELECT id INTO v_other  FROM procurements.sms_schools WHERE id <> v_school ORDER BY id LIMIT 1;
  SELECT id INTO v_staff  FROM procurements.sms_users ORDER BY id LIMIT 1;

  INSERT INTO procurements.sms_sections (name, grade_level, school_year, school_id) VALUES
    ('T234 A', 7, v_sy, v_school) RETURNING id INTO v_a;
  INSERT INTO procurements.sms_sections (name, grade_level, school_year, school_id) VALUES
    ('T234 B', 7, v_sy, v_school) RETURNING id INTO v_b;
  INSERT INTO procurements.sms_sections (name, grade_level, school_year, school_id) VALUES
    ('T234 G8', 8, v_sy, v_school) RETURNING id INTO v_g8;
  INSERT INTO procurements.sms_sections (name, grade_level, school_year, school_id) VALUES
    ('T234 FAR', 7, v_sy, v_other) RETURNING id INTO v_far;
  INSERT INTO procurements.sms_sections (name, grade_level, school_year, school_id) VALUES
    ('T234 11A', 11, v_sy, v_school) RETURNING id INTO v_s11a;
  INSERT INTO procurements.sms_sections (name, grade_level, school_year, school_id) VALUES
    ('T234 11B', 11, v_sy, v_school) RETURNING id INTO v_s11b;

  INSERT INTO procurements.sms_subjects (code, name, grade_level, school_id) VALUES
    ('T234M', 'T234 Math', 7, v_school) RETURNING id INTO v_math;
  INSERT INTO procurements.sms_subjects (code, name, grade_level, school_id) VALUES
    ('T234S', 'T234 Science', 7, v_school) RETURNING id INTO v_sci;
  INSERT INTO procurements.sms_subjects (code, name, grade_level, school_id) VALUES
    ('T234H', 'T234 SHS Core', 11, v_school) RETURNING id INTO v_shs;

  -- Seven learners, all enrolled in B (the SHS one in 11B, semester 2).
  FOR i IN 1..7 LOOP
    INSERT INTO procurements.sms_students (lrn, first_name, last_name, date_of_birth, gender, school_id)
    VALUES ('T234-' || i, 'Test', 'Learner ' || i, '2015-01-01', 'male', v_school)
    RETURNING id INTO v_id;
    v_l := v_l || v_id;
    IF i = 5 THEN
      INSERT INTO procurements.sms_enrollments
        (student_id, section_id, school_year, grade_level, semester, enrolled_by, school_id, status, enrollment_status)
      VALUES (v_id, v_s11b, v_sy, 11, 2, v_staff, v_school, 'approved', 'active');
    ELSE
      INSERT INTO procurements.sms_enrollments
        (student_id, section_id, school_year, grade_level, enrolled_by, school_id, status, enrollment_status)
      VALUES (v_id, v_b, v_sy, 7, v_staff, v_school, 'approved', 'active');
    END IF;
  END LOOP;

  INSERT INTO procurements.sms_grades (student_id, subject_id, section_id, grading_period, school_year, grade, teacher_id) VALUES
    -- A: never moved, everything in B
    (v_l[1], v_math, v_b, 1, v_sy, 80, v_staff), (v_l[1], v_math, v_b, 2, v_sy, 82, v_staff),
    (v_l[1], v_math, v_b, 3, v_sy, 84, v_staff), (v_l[1], v_math, v_b, 4, v_sy, 86, v_staff),
    -- B: Q1-Q2 in A, Q3-Q4 in B
    (v_l[2], v_math, v_a, 1, v_sy, 80, v_staff), (v_l[2], v_math, v_a, 2, v_sy, 80, v_staff),
    (v_l[2], v_math, v_b, 3, v_sy, 90, v_staff), (v_l[2], v_math, v_b, 4, v_sy, 90, v_staff),
    -- C: Q3 in both, B wins
    (v_l[3], v_math, v_a, 3, v_sy, 70, v_staff),
    (v_l[3], v_math, v_b, 1, v_sy, 90, v_staff), (v_l[3], v_math, v_b, 2, v_sy, 90, v_staff),
    (v_l[3], v_math, v_b, 3, v_sy, 90, v_staff), (v_l[3], v_math, v_b, 4, v_sy, 90, v_staff),
    -- D: a Grade 8 section's row is never counted
    (v_l[4], v_math, v_b, 1, v_sy, 90, v_staff), (v_l[4], v_sci, v_g8, 2, v_sy, 60, v_staff),
    -- E: Senior High unchanged — 11A's row is not counted
    (v_l[5], v_shs, v_s11a, 1, v_sy, 80, v_staff), (v_l[5], v_shs, v_s11b, 3, v_sy, 90, v_staff),
    -- F: another school's Grade 7 section is never counted
    (v_l[6], v_math, v_b, 1, v_sy, 90, v_staff), (v_l[6], v_sci, v_far, 2, v_sy, 60, v_staff),
    -- G: an encoded grade in A beats a 0 (not encoded) in B
    (v_l[7], v_math, v_a, 1, v_sy, 85, v_staff), (v_l[7], v_math, v_b, 1, v_sy, 0, v_staff);

  -- Grade 7 learners
  FOR i IN 1..7 LOOP
    CONTINUE WHEN i = 5;
    SELECT g.gpa INTO v_gpa
    FROM procurements.students_gpa_for_grade(ARRAY[v_l[i]], 7, v_sy, v_school) g;
    IF v_gpa IS DISTINCT FROM (ARRAY[83.00, 85.00, 90.00, 90.00, NULL, 90.00, 85.00]::NUMERIC[])[i] THEN
      RAISE EXCEPTION 'FAIL case %: expected %, got %',
        (ARRAY['A never moved','B moved','C clash','D other grade','E','F other school','G zero'])[i],
        (ARRAY[83.00, 85.00, 90.00, 90.00, NULL, 90.00, 85.00]::NUMERIC[])[i], v_gpa;
    END IF;
    RAISE NOTICE 'ok: case % → %',
      (ARRAY['A never moved','B moved','C clash','D other grade','E','F other school','G zero'])[i], v_gpa;
  END LOOP;

  -- Senior High learner
  SELECT g.gpa INTO v_gpa
  FROM procurements.students_gpa_for_grade(ARRAY[v_l[5]], 11, v_sy, v_school) g;
  IF v_gpa IS DISTINCT FROM 90.00 THEN
    RAISE EXCEPTION 'FAIL case E SHS unchanged: expected 90.00, got %', v_gpa;
  END IF;
  RAISE NOTICE 'ok: case E SHS unchanged → %', v_gpa;
END $$;

ROLLBACK;
