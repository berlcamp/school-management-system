-- ============================================================================
-- SCHOOL MANAGEMENT SYSTEM - SAMPLE DATA SEED
-- ============================================================================
-- This seed file adds sample data to the database for testing and development
-- Run this after running the migration files
-- All data is inserted into the 'procurements' schema
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- CLEAR EXISTING DATA (Optional - uncomment if you want to reset)
-- ============================================================================
-- TRUNCATE TABLE procurements.sms_grades CASCADE;
-- TRUNCATE TABLE procurements.sms_section_students CASCADE;
-- TRUNCATE TABLE procurements.sms_subject_assignments CASCADE;
-- TRUNCATE TABLE procurements.sms_enrollments CASCADE;
-- TRUNCATE TABLE procurements.sms_form137_requests CASCADE;
-- TRUNCATE TABLE procurements.sms_students CASCADE;
-- TRUNCATE TABLE procurements.sms_sections CASCADE;
-- TRUNCATE TABLE procurements.sms_subjects CASCADE;
-- TRUNCATE TABLE procurements.sms_users CASCADE;

-- ============================================================================
-- SMS_USERS (Staff/Teachers)
-- ============================================================================
-- Note: Using existing sms_users.id values
-- Teacher: id = 3
-- Registrar: id = 1

-- ============================================================================
-- ROOMS
-- ============================================================================

INSERT INTO procurements.sms_rooms (name, building, capacity, room_type, description, is_active)
VALUES
  ('Room 101', 'Main Building', 40, 'classroom', 'Standard classroom', true),
  ('Room 102', 'Main Building', 40, 'classroom', 'Standard classroom', true),
  ('Room 103', 'Main Building', 40, 'classroom', 'Standard classroom', true),
  ('Room 201', 'Main Building', 40, 'classroom', 'Standard classroom', true),
  ('Room 202', 'Main Building', 40, 'classroom', 'Standard classroom', true),
  ('Science Lab 1', 'Science Building', 30, 'science_lab', 'Chemistry and Physics Laboratory', true),
  ('Science Lab 2', 'Science Building', 30, 'science_lab', 'Biology Laboratory', true),
  ('Computer Lab 1', 'Technology Building', 30, 'computer_lab', 'Computer Laboratory', true),
  ('Computer Lab 2', 'Technology Building', 30, 'computer_lab', 'Computer Laboratory', true),
  ('Library', 'Main Building', 100, 'library', 'School Library', true),
  ('Gymnasium', 'Sports Complex', 200, 'gym', 'School Gymnasium', true),
  ('Auditorium', 'Main Building', 500, 'auditorium', 'School Auditorium', true),
  ('Music Room', 'Arts Building', 30, 'music_room', 'Music Room', true),
  ('Art Room', 'Arts Building', 30, 'art_room', 'Art Room', true)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SUBJECTS
-- ============================================================================

INSERT INTO procurements.sms_subjects (code, name, description, grade_level, is_active)
VALUES
  -- Grade 7 Subjects
  ('MATH7', 'Mathematics 7', 'Basic Mathematics for Grade 7', 7, true),
  ('ENG7', 'English 7', 'English Language and Literature', 7, true),
  ('SCI7', 'Science 7', 'General Science', 7, true),
  ('FIL7', 'Filipino 7', 'Filipino Language', 7, true),
  ('AP7', 'Araling Panlipunan 7', 'Social Studies 7', 7, true),
  ('TLE7', 'Technology and Livelihood Education 7', 'TLE 7', 7, true),
  ('MAPEH7', 'Music, Arts, PE, and Health 7', 'MAPEH 7', 7, true),
  
  -- Grade 8 Subjects
  ('MATH8', 'Mathematics 8', 'Basic Mathematics for Grade 8', 8, true),
  ('ENG8', 'English 8', 'English Language and Literature', 8, true),
  ('SCI8', 'Science 8', 'General Science', 8, true),
  ('FIL8', 'Filipino 8', 'Filipino Language', 8, true),
  ('AP8', 'Araling Panlipunan 8', 'Social Studies 8', 8, true),
  ('TLE8', 'Technology and Livelihood Education 8', 'TLE 8', 8, true),
  ('MAPEH8', 'Music, Arts, PE, and Health 8', 'MAPEH 8', 8, true),
  
  -- Grade 9 Subjects
  ('MATH9', 'Mathematics 9', 'Basic Mathematics for Grade 9', 9, true),
  ('ENG9', 'English 9', 'English Language and Literature', 9, true),
  ('SCI9', 'Science 9', 'General Science', 9, true),
  ('FIL9', 'Filipino 9', 'Filipino Language', 9, true),
  ('AP9', 'Araling Panlipunan 9', 'Social Studies 9', 9, true),
  ('TLE9', 'Technology and Livelihood Education 9', 'TLE 9', 9, true),
  ('MAPEH9', 'Music, Arts, PE, and Health 9', 'MAPEH 9', 9, true),
  
  -- Grade 10 Subjects
  ('MATH10', 'Mathematics 10', 'Basic Mathematics for Grade 10', 10, true),
  ('ENG10', 'English 10', 'English Language and Literature', 10, true),
  ('SCI10', 'Science 10', 'General Science', 10, true),
  ('FIL10', 'Filipino 10', 'Filipino Language', 10, true),
  ('AP10', 'Araling Panlipunan 10', 'Social Studies 10', 10, true),
  ('TLE10', 'Technology and Livelihood Education 10', 'TLE 10', 10, true),
  ('MAPEH10', 'Music, Arts, PE, and Health 10', 'MAPEH 10', 10, true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- SECTIONS (for School Year 2024-2025)
-- ============================================================================

-- Get teacher ID from existing user
DO $$
DECLARE
  v_teacher_id BIGINT;
BEGIN
  -- Get teacher ID (id = 3)
  SELECT id INTO v_teacher_id FROM procurements.sms_users WHERE id = 3 LIMIT 1;

  INSERT INTO procurements.sms_sections (name, grade_level, school_year, section_adviser_id, max_students, is_active)
  VALUES
    -- Grade 7 Sections
    ('Grade 7-A', 7, '2024-2025', v_teacher_id, 40, true),
    ('Grade 7-B', 7, '2024-2025', v_teacher_id, 40, true),
    ('Grade 7-C', 7, '2024-2025', v_teacher_id, 40, true),
    
    -- Grade 8 Sections
    ('Grade 8-A', 8, '2024-2025', v_teacher_id, 40, true),
    ('Grade 8-B', 8, '2024-2025', v_teacher_id, 40, true),
    
    -- Grade 9 Sections
    ('Grade 9-A', 9, '2024-2025', v_teacher_id, 40, true),
    ('Grade 9-B', 9, '2024-2025', v_teacher_id, 40, true),
    
    -- Grade 10 Sections
    ('Grade 10-A', 10, '2024-2025', v_teacher_id, 40, true),
    ('Grade 10-B', 10, '2024-2025', v_teacher_id, 40, true)
  ON CONFLICT (name, school_year, grade_level) DO NOTHING;
END $$;

-- ============================================================================
-- STUDENTS
-- ============================================================================

INSERT INTO procurements.sms_students (
  lrn, first_name, middle_name, last_name, suffix, date_of_birth, gender,
  address, contact_number, email, parent_guardian_name, parent_guardian_contact,
  parent_guardian_relationship, previous_school, enrollment_status
)
VALUES
  -- Grade 7 Students
  ('123456789012', 'Juan', 'Dela', 'Cruz', NULL, '2010-05-15', 'male', '123 Main St, Manila', '09111111111', 'juan.cruz@email.com', 'Maria Cruz', '09111111112', 'Mother', NULL, 'enrolled'),
  ('123456789013', 'Maria', 'Santos', 'Garcia', NULL, '2010-07-20', 'female', '456 Oak Ave, Quezon City', '09111111113', 'maria.garcia@email.com', 'Juan Garcia', '09111111114', 'Father', NULL, 'enrolled'),
  ('123456789014', 'Pedro', NULL, 'Reyes', NULL, '2010-03-10', 'male', '789 Pine St, Makati', '09111111115', 'pedro.reyes@email.com', 'Ana Reyes', '09111111116', 'Mother', NULL, 'enrolled'),
  ('123456789015', 'Ana', 'Lopez', 'Torres', NULL, '2010-09-25', 'female', '321 Elm St, Pasig', '09111111117', 'ana.torres@email.com', 'Carlos Torres', '09111111118', 'Father', NULL, 'enrolled'),
  ('123456789016', 'Carlos', 'Villanueva', 'Fernandez', NULL, '2010-11-30', 'male', '654 Maple Ave, Mandaluyong', '09111111119', 'carlos.fernandez@email.com', 'Rosa Fernandez', '09111111120', 'Mother', NULL, 'enrolled'),
  
  -- Grade 8 Students
  ('123456789017', 'Sofia', 'Martinez', 'Lopez', NULL, '2009-04-12', 'female', '987 Cedar St, Taguig', '09111111121', 'sofia.lopez@email.com', 'Miguel Lopez', '09111111122', 'Father', NULL, 'enrolled'),
  ('123456789018', 'Miguel', NULL, 'Sanchez', NULL, '2009-06-18', 'male', '147 Birch Ave, Paranaque', '09111111123', 'miguel.sanchez@email.com', 'Carmen Sanchez', '09111111124', 'Mother', NULL, 'enrolled'),
  ('123456789019', 'Isabella', 'Gonzalez', 'Ramirez', NULL, '2009-08-22', 'female', '258 Spruce St, Las Pinas', '09111111125', 'isabella.ramirez@email.com', 'Jose Ramirez', '09111111126', 'Father', NULL, 'enrolled'),
  ('123456789020', 'Diego', 'Morales', 'Castro', NULL, '2009-10-05', 'male', '369 Willow Ave, Muntinlupa', '09111111127', 'diego.castro@email.com', 'Elena Castro', '09111111128', 'Mother', NULL, 'enrolled'),
  ('123456789021', 'Lucia', NULL, 'Rivera', NULL, '2009-12-14', 'female', '741 Ash St, Valenzuela', '09111111129', 'lucia.rivera@email.com', 'Roberto Rivera', '09111111130', 'Father', NULL, 'enrolled'),
  
  -- Grade 9 Students
  ('123456789022', 'Alejandro', 'Dominguez', 'Mendoza', NULL, '2008-02-08', 'male', '852 Poplar Ave, Caloocan', '09111111131', 'alejandro.mendoza@email.com', 'Patricia Mendoza', '09111111132', 'Mother', NULL, 'enrolled'),
  ('123456789023', 'Valentina', 'Herrera', 'Gutierrez', NULL, '2008-04-16', 'female', '963 Sycamore St, Malabon', '09111111133', 'valentina.gutierrez@email.com', 'Fernando Gutierrez', '09111111134', 'Father', NULL, 'enrolled'),
  ('123456789024', 'Sebastian', NULL, 'Vargas', NULL, '2008-06-24', 'male', '159 Walnut Ave, Navotas', '09111111135', 'sebastian.vargas@email.com', 'Monica Vargas', '09111111136', 'Mother', NULL, 'enrolled'),
  ('123456789025', 'Camila', 'Jimenez', 'Ortega', NULL, '2008-08-30', 'female', '357 Chestnut St, Marikina', '09111111137', 'camila.ortega@email.com', 'Ricardo Ortega', '09111111138', 'Father', NULL, 'enrolled'),
  ('123456789026', 'Mateo', 'Moreno', 'Silva', NULL, '2008-10-11', 'male', '468 Hickory Ave, San Juan', '09111111139', 'mateo.silva@email.com', 'Gabriela Silva', '09111111140', 'Mother', NULL, 'enrolled'),
  
  -- Grade 10 Students
  ('123456789027', 'Emma', 'Vega', 'Molina', NULL, '2007-01-19', 'female', '579 Cypress St, Pasay', '09111111141', 'emma.molina@email.com', 'Alberto Molina', '09111111142', 'Father', NULL, 'enrolled'),
  ('123456789028', 'Lucas', NULL, 'Herrera', NULL, '2007-03-27', 'male', '680 Fir Ave, Manila', '09111111143', 'lucas.herrera@email.com', 'Diana Herrera', '09111111144', 'Mother', NULL, 'enrolled'),
  ('123456789029', 'Olivia', 'Cordero', 'Pena', NULL, '2007-05-14', 'female', '791 Redwood St, Quezon City', '09111111145', 'olivia.pena@email.com', 'Enrique Pena', '09111111146', 'Father', NULL, 'enrolled'),
  ('123456789030', 'Noah', 'Fuentes', 'Ramos', NULL, '2007-07-22', 'male', '802 Sequoia Ave, Makati', '09111111147', 'noah.ramos@email.com', 'Laura Ramos', '09111111148', 'Mother', NULL, 'enrolled'),
  ('123456789031', 'Ava', NULL, 'Delgado', NULL, '2007-09-09', 'female', '913 Magnolia St, Pasig', '09111111149', 'ava.delgado@email.com', 'Francisco Delgado', '09111111150', 'Father', NULL, 'enrolled')
ON CONFLICT (lrn) DO NOTHING;

-- ============================================================================
-- SECTION STUDENTS (Assign students to sections)
-- ============================================================================

DO $$
DECLARE
  v_section_7a_id BIGINT;
  v_section_7b_id BIGINT;
  v_section_8a_id BIGINT;
  v_section_9a_id BIGINT;
  v_section_10a_id BIGINT;
  v_student_ids BIGINT[];
BEGIN
  -- Get section IDs
  SELECT id INTO v_section_7a_id FROM procurements.sms_sections WHERE name = 'Grade 7-A' AND school_year = '2024-2025' LIMIT 1;
  SELECT id INTO v_section_7b_id FROM procurements.sms_sections WHERE name = 'Grade 7-B' AND school_year = '2024-2025' LIMIT 1;
  SELECT id INTO v_section_8a_id FROM procurements.sms_sections WHERE name = 'Grade 8-A' AND school_year = '2024-2025' LIMIT 1;
  SELECT id INTO v_section_9a_id FROM procurements.sms_sections WHERE name = 'Grade 9-A' AND school_year = '2024-2025' LIMIT 1;
  SELECT id INTO v_section_10a_id FROM procurements.sms_sections WHERE name = 'Grade 10-A' AND school_year = '2024-2025' LIMIT 1;

  -- Get student IDs (first 5 are Grade 7, next 5 are Grade 8, etc.)
  SELECT ARRAY_AGG(id) INTO v_student_ids
  FROM procurements.sms_students
  WHERE lrn IN ('123456789012', '123456789013', '123456789014', '123456789015', '123456789016');

  -- Assign Grade 7 students
  INSERT INTO procurements.sms_section_students (section_id, student_id, school_year)
  SELECT v_section_7a_id, unnest(v_student_ids[1:3]), '2024-2025'
  ON CONFLICT (section_id, student_id, school_year) DO NOTHING;

  INSERT INTO procurements.sms_section_students (section_id, student_id, school_year)
  SELECT v_section_7b_id, unnest(v_student_ids[4:5]), '2024-2025'
  ON CONFLICT (section_id, student_id, school_year) DO NOTHING;

  -- Get Grade 8 student IDs
  SELECT ARRAY_AGG(id) INTO v_student_ids
  FROM procurements.sms_students
  WHERE lrn IN ('123456789017', '123456789018', '123456789019', '123456789020', '123456789021');

  -- Assign Grade 8 students
  INSERT INTO procurements.sms_section_students (section_id, student_id, school_year)
  SELECT v_section_8a_id, unnest(v_student_ids), '2024-2025'
  ON CONFLICT (section_id, student_id, school_year) DO NOTHING;

  -- Get Grade 9 student IDs
  SELECT ARRAY_AGG(id) INTO v_student_ids
  FROM procurements.sms_students
  WHERE lrn IN ('123456789022', '123456789023', '123456789024', '123456789025', '123456789026');

  -- Assign Grade 9 students
  INSERT INTO procurements.sms_section_students (section_id, student_id, school_year)
  SELECT v_section_9a_id, unnest(v_student_ids), '2024-2025'
  ON CONFLICT (section_id, student_id, school_year) DO NOTHING;

  -- Get Grade 10 student IDs
  SELECT ARRAY_AGG(id) INTO v_student_ids
  FROM procurements.sms_students
  WHERE lrn IN ('123456789027', '123456789028', '123456789029', '123456789030', '123456789031');

  -- Assign Grade 10 students
  INSERT INTO procurements.sms_section_students (section_id, student_id, school_year)
  SELECT v_section_10a_id, unnest(v_student_ids), '2024-2025'
  ON CONFLICT (section_id, student_id, school_year) DO NOTHING;
END $$;

-- ============================================================================
-- SUBJECT ASSIGNMENTS (Assign teachers to subjects and sections)
-- ============================================================================

DO $$
DECLARE
  v_teacher_id BIGINT;
  v_math7_id BIGINT;
  v_eng7_id BIGINT;
  v_sci7_id BIGINT;
  v_section_7a_id BIGINT;
  v_section_7b_id BIGINT;
BEGIN
  -- Get teacher ID (id = 3)
  SELECT id INTO v_teacher_id FROM procurements.sms_users WHERE id = 3 LIMIT 1;

  -- Get subject IDs
  SELECT id INTO v_math7_id FROM procurements.sms_subjects WHERE code = 'MATH7' LIMIT 1;
  SELECT id INTO v_eng7_id FROM procurements.sms_subjects WHERE code = 'ENG7' LIMIT 1;
  SELECT id INTO v_sci7_id FROM procurements.sms_subjects WHERE code = 'SCI7' LIMIT 1;

  -- Get section IDs
  SELECT id INTO v_section_7a_id FROM procurements.sms_sections WHERE name = 'Grade 7-A' AND school_year = '2024-2025' LIMIT 1;
  SELECT id INTO v_section_7b_id FROM procurements.sms_sections WHERE name = 'Grade 7-B' AND school_year = '2024-2025' LIMIT 1;

  -- Assign teachers to subjects and sections
  INSERT INTO procurements.sms_subject_assignments (teacher_id, subject_id, section_id, school_year)
  VALUES
    (v_teacher_id, v_math7_id, v_section_7a_id, '2024-2025'),
    (v_teacher_id, v_math7_id, v_section_7b_id, '2024-2025'),
    (v_teacher_id, v_eng7_id, v_section_7a_id, '2024-2025'),
    (v_teacher_id, v_eng7_id, v_section_7b_id, '2024-2025'),
    (v_teacher_id, v_sci7_id, v_section_7a_id, '2024-2025'),
    (v_teacher_id, v_sci7_id, v_section_7b_id, '2024-2025')
  ON CONFLICT (teacher_id, subject_id, section_id, school_year) DO NOTHING;
END $$;

-- ============================================================================
-- SAMPLE GRADES (Optional - for testing grade entry)
-- ============================================================================

DO $$
DECLARE
  v_student_id BIGINT;
  v_subject_id BIGINT;
  v_section_id BIGINT;
  v_teacher_id BIGINT;
BEGIN
  -- Get IDs
  SELECT id INTO v_student_id FROM procurements.sms_students WHERE lrn = '123456789012' LIMIT 1;
  SELECT id INTO v_subject_id FROM procurements.sms_subjects WHERE code = 'MATH7' LIMIT 1;
  SELECT id INTO v_section_id FROM procurements.sms_sections WHERE name = 'Grade 7-A' AND school_year = '2024-2025' LIMIT 1;
  SELECT id INTO v_teacher_id FROM procurements.sms_users WHERE id = 3 LIMIT 1;

  -- Insert sample grades for first grading period
  IF v_student_id IS NOT NULL AND v_subject_id IS NOT NULL AND v_section_id IS NOT NULL AND v_teacher_id IS NOT NULL THEN
    INSERT INTO procurements.sms_grades (student_id, subject_id, section_id, grading_period, school_year, grade, remarks, teacher_id)
    VALUES
      (v_student_id, v_subject_id, v_section_id, 1, '2024-2025', 85.50, 'Passed', v_teacher_id),
      (v_student_id, v_subject_id, v_section_id, 2, '2024-2025', 88.00, 'Passed', v_teacher_id)
    ON CONFLICT (student_id, subject_id, section_id, grading_period, school_year) DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- SAMPLE ENROLLMENTS (Optional)
-- ============================================================================

DO $$
DECLARE
  v_student_id BIGINT;
  v_section_id BIGINT;
  v_registrar_id BIGINT;
BEGIN
  -- Get IDs
  SELECT id INTO v_student_id FROM procurements.sms_students WHERE lrn = '123456789012' LIMIT 1;
  SELECT id INTO v_section_id FROM procurements.sms_sections WHERE name = 'Grade 7-A' AND school_year = '2024-2025' LIMIT 1;
  SELECT id INTO v_registrar_id FROM procurements.sms_users WHERE id = 1 LIMIT 1;

  -- Insert sample enrollment
  IF v_student_id IS NOT NULL AND v_section_id IS NOT NULL AND v_registrar_id IS NOT NULL THEN
    INSERT INTO procurements.sms_enrollments (student_id, section_id, school_year, grade_level, enrollment_date, status, enrolled_by, approved_by)
    VALUES
      (v_student_id, v_section_id, '2024-2025', 7, '2024-06-01', 'approved', v_registrar_id, v_registrar_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- NOTES
-- ============================================================================
-- 1. This seed file uses existing sms_users.id values:
--    - Teacher: id = 3
--    - Registrar: id = 1
-- 2. The seed data includes:
--    - 28 subjects (7 subjects × 4 grade levels: 7, 8, 9, 10)
--    - 9 sections (for school year 2024-2025)
--    - 20 students (5 per grade level)
--    - Section-student assignments
--    - Subject-teacher-section assignments
--    - Sample grades and enrollments
-- 3. Adjust the data as needed for your testing requirements
-- 4. Make sure to run migrations first before running this seed file
-- 5. Ensure the user IDs exist in sms_users table before running this seed
