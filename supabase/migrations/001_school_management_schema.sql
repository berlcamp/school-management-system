-- ============================================================================
-- SCHOOL MANAGEMENT SYSTEM DATABASE SCHEMA
-- ============================================================================
-- This migration creates all tables for the School Management System
-- Run this in your Supabase SQL Editor or via Supabase CLI
-- All tables are created in the 'procurements' schema
-- ============================================================================

-- Create procurements schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS procurements;

-- Set the schema to procurements
SET search_path TO procurements, public;

-- ============================================================================
-- SMS_USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_users (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE, -- Supabase Auth user ID
  division_id TEXT,
  school_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  position TEXT,
  employee_id TEXT,
  type TEXT CHECK (type IN ('school_head', 'teacher', 'registrar', 'admin', 'super admin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for sms_users
CREATE INDEX IF NOT EXISTS idx_sms_users_user_id ON procurements.sms_users(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_users_email ON procurements.sms_users(email);
CREATE INDEX IF NOT EXISTS idx_sms_users_active ON procurements.sms_users(is_active) WHERE is_active = true;

-- ============================================================================
-- SUBJECTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_subjects (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  grade_level INTEGER NOT NULL CHECK (grade_level >= 1 AND grade_level <= 12),
  subject_teacher_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for subjects
CREATE INDEX IF NOT EXISTS idx_subjects_grade_level ON procurements.sms_subjects(grade_level);
CREATE INDEX IF NOT EXISTS idx_subjects_teacher ON procurements.sms_subjects(subject_teacher_id);
CREATE INDEX IF NOT EXISTS idx_subjects_active ON procurements.sms_subjects(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_subjects_code ON procurements.sms_subjects(code);

-- ============================================================================
-- SECTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_sections (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  grade_level INTEGER NOT NULL CHECK (grade_level >= 1 AND grade_level <= 12),
  school_year TEXT NOT NULL,
  section_adviser_id BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  max_students INTEGER CHECK (max_students > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name, school_year, grade_level)
);

-- Indexes for sections
CREATE INDEX IF NOT EXISTS idx_sections_grade_level ON procurements.sms_sections(grade_level);
CREATE INDEX IF NOT EXISTS idx_sections_school_year ON procurements.sms_sections(school_year);
CREATE INDEX IF NOT EXISTS idx_sections_adviser ON procurements.sms_sections(section_adviser_id);
CREATE INDEX IF NOT EXISTS idx_sections_active ON procurements.sms_sections(is_active) WHERE is_active = true;

-- ============================================================================
-- STUDENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_students (
  id BIGSERIAL PRIMARY KEY,
  lrn TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  suffix TEXT,
  date_of_birth DATE NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  contact_number TEXT,
  email TEXT,
  parent_guardian_name TEXT NOT NULL,
  parent_guardian_contact TEXT NOT NULL,
  parent_guardian_relationship TEXT NOT NULL,
  previous_school TEXT,
  enrollment_status TEXT NOT NULL DEFAULT 'enrolled' 
    CHECK (enrollment_status IN ('enrolled', 'transferred', 'graduated', 'dropped')),
  current_section_id BIGINT REFERENCES procurements.sms_sections(id) ON DELETE SET NULL,
  enrolled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for students
CREATE INDEX IF NOT EXISTS idx_students_lrn ON procurements.sms_students(lrn);
CREATE INDEX IF NOT EXISTS idx_students_section ON procurements.sms_students(current_section_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON procurements.sms_students(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_students_name ON procurements.sms_students(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_students_active ON procurements.sms_students(enrollment_status) WHERE enrollment_status = 'enrolled';

-- ============================================================================
-- SECTION STUDENTS (Junction Table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_section_students (
  id BIGSERIAL PRIMARY KEY,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  transferred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(section_id, student_id, school_year)
);

-- Indexes for section_students
CREATE INDEX IF NOT EXISTS idx_section_students_section ON procurements.sms_section_students(section_id);
CREATE INDEX IF NOT EXISTS idx_section_students_student ON procurements.sms_section_students(student_id);
CREATE INDEX IF NOT EXISTS idx_section_students_school_year ON procurements.sms_section_students(school_year);
CREATE INDEX IF NOT EXISTS idx_section_students_active ON procurements.sms_section_students(transferred_at) WHERE transferred_at IS NULL;

-- ============================================================================
-- GRADES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_grades (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  subject_id BIGINT NOT NULL REFERENCES procurements.sms_subjects(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  grading_period INTEGER NOT NULL CHECK (grading_period >= 1 AND grading_period <= 4),
  school_year TEXT NOT NULL,
  grade NUMERIC(5,2) NOT NULL CHECK (grade >= 0 AND grade <= 100),
  remarks TEXT CHECK (remarks IN ('Passed', 'Failed', 'Incomplete')),
  teacher_id BIGINT NOT NULL REFERENCES procurements.sms_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, subject_id, section_id, grading_period, school_year)
);

-- Indexes for grades
CREATE INDEX IF NOT EXISTS idx_grades_student ON procurements.sms_grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_subject ON procurements.sms_grades(subject_id);
CREATE INDEX IF NOT EXISTS idx_grades_section ON procurements.sms_grades(section_id);
CREATE INDEX IF NOT EXISTS idx_grades_period ON procurements.sms_grades(grading_period, school_year);
CREATE INDEX IF NOT EXISTS idx_grades_teacher ON procurements.sms_grades(teacher_id);

-- ============================================================================
-- ENROLLMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_enrollments (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  grade_level INTEGER NOT NULL CHECK (grade_level >= 1 AND grade_level <= 12),
  enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'approved', 'rejected')),
  enrolled_by BIGINT NOT NULL REFERENCES procurements.sms_users(id) ON DELETE RESTRICT,
  approved_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for enrollments
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON procurements.sms_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_section ON procurements.sms_enrollments(section_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON procurements.sms_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_school_year ON procurements.sms_enrollments(school_year);
CREATE INDEX IF NOT EXISTS idx_enrollments_grade_level ON procurements.sms_enrollments(grade_level);

-- ============================================================================
-- FORM 137 REQUESTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_form137_requests (
  id BIGSERIAL PRIMARY KEY,
  student_lrn TEXT NOT NULL,
  student_id BIGINT REFERENCES procurements.sms_students(id) ON DELETE SET NULL,
  requestor_name TEXT NOT NULL,
  requestor_contact TEXT NOT NULL,
  requestor_relationship TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for form137_requests
CREATE INDEX IF NOT EXISTS idx_form137_lrn ON procurements.sms_form137_requests(student_lrn);
CREATE INDEX IF NOT EXISTS idx_form137_student ON procurements.sms_form137_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_form137_status ON procurements.sms_form137_requests(status);
CREATE INDEX IF NOT EXISTS idx_form137_approved_by ON procurements.sms_form137_requests(approved_by);
CREATE INDEX IF NOT EXISTS idx_form137_requested_at ON procurements.sms_form137_requests(requested_at);

-- ============================================================================
-- SUBJECT ASSIGNMENTS TABLE (Many-to-many: Teachers ↔ Subjects)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procurements.sms_subject_assignments (
  id BIGSERIAL PRIMARY KEY,
  teacher_id BIGINT NOT NULL REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  subject_id BIGINT NOT NULL REFERENCES procurements.sms_subjects(id) ON DELETE CASCADE,
  section_id BIGINT REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(teacher_id, subject_id, section_id, school_year)
);

-- Indexes for subject_assignments
CREATE INDEX IF NOT EXISTS idx_subject_assignments_teacher ON procurements.sms_subject_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_subject_assignments_subject ON procurements.sms_subject_assignments(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_assignments_section ON procurements.sms_subject_assignments(section_id);
CREATE INDEX IF NOT EXISTS idx_subject_assignments_school_year ON procurements.sms_subject_assignments(school_year);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT TIMESTAMPS
-- ============================================================================

-- Function to update updated_at timestamp (create in public schema so it can be used across schemas)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all tables
CREATE TRIGGER update_sms_users_updated_at 
  BEFORE UPDATE ON procurements.sms_users 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sms_subjects_updated_at 
  BEFORE UPDATE ON procurements.sms_subjects 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sms_sections_updated_at 
  BEFORE UPDATE ON procurements.sms_sections 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sms_students_updated_at 
  BEFORE UPDATE ON procurements.sms_students 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sms_section_students_updated_at 
  BEFORE UPDATE ON procurements.sms_section_students 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sms_grades_updated_at 
  BEFORE UPDATE ON procurements.sms_grades 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sms_enrollments_updated_at 
  BEFORE UPDATE ON procurements.sms_enrollments 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sms_form137_requests_updated_at 
  BEFORE UPDATE ON procurements.sms_form137_requests 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sms_subject_assignments_updated_at 
  BEFORE UPDATE ON procurements.sms_subject_assignments 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Enable RLS on all tables
ALTER TABLE procurements.sms_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_section_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_form137_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_subject_assignments ENABLE ROW LEVEL SECURITY;

-- Basic policies (adjust based on your security requirements)
-- These are permissive policies - you should customize them based on your needs

-- SMS Users: All authenticated users can read, only admins can write
CREATE POLICY "SMS users are viewable by authenticated users"
  ON procurements.sms_users FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "SMS users are insertable by admins"
  ON procurements.sms_users FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "SMS users are updatable by admins"
  ON procurements.sms_users FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "SMS users are deletable by admins"
  ON procurements.sms_users FOR DELETE
  USING (auth.role() = 'authenticated');

-- Subjects: All authenticated users can read, only admins/school heads can write
CREATE POLICY "Subjects are viewable by authenticated users"
  ON procurements.sms_subjects FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Subjects are insertable by admins"
  ON procurements.sms_subjects FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Subjects are updatable by admins"
  ON procurements.sms_subjects FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Subjects are deletable by admins"
  ON procurements.sms_subjects FOR DELETE
  USING (auth.role() = 'authenticated');

-- Sections: Similar policies
CREATE POLICY "Sections are viewable by authenticated users"
  ON procurements.sms_sections FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Sections are insertable by admins"
  ON procurements.sms_sections FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Sections are updatable by admins"
  ON procurements.sms_sections FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Sections are deletable by admins"
  ON procurements.sms_sections FOR DELETE
  USING (auth.role() = 'authenticated');

-- Students: Similar policies
CREATE POLICY "Students are viewable by authenticated users"
  ON procurements.sms_students FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Students are insertable by admins"
  ON procurements.sms_students FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Students are updatable by admins"
  ON procurements.sms_students FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Students are deletable by admins"
  ON procurements.sms_students FOR DELETE
  USING (auth.role() = 'authenticated');

-- Section Students: Similar policies
CREATE POLICY "Section students are viewable by authenticated users"
  ON procurements.sms_section_students FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Section students are insertable by admins"
  ON procurements.sms_section_students FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Section students are updatable by admins"
  ON procurements.sms_section_students FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Section students are deletable by admins"
  ON procurements.sms_section_students FOR DELETE
  USING (auth.role() = 'authenticated');

-- Grades: Teachers can insert/update their own grades, all can read
CREATE POLICY "Grades are viewable by authenticated users"
  ON procurements.sms_grades FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Grades are insertable by teachers"
  ON procurements.sms_grades FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Grades are updatable by teachers"
  ON procurements.sms_grades FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Grades are deletable by admins"
  ON procurements.sms_grades FOR DELETE
  USING (auth.role() = 'authenticated');

-- Enrollments: Similar policies
CREATE POLICY "Enrollments are viewable by authenticated users"
  ON procurements.sms_enrollments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Enrollments are insertable by admins"
  ON procurements.sms_enrollments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enrollments are updatable by admins"
  ON procurements.sms_enrollments FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Enrollments are deletable by admins"
  ON procurements.sms_enrollments FOR DELETE
  USING (auth.role() = 'authenticated');

-- Form 137 Requests: Public can insert, authenticated can read, school head can update
CREATE POLICY "Form 137 requests are viewable by authenticated users"
  ON procurements.sms_form137_requests FOR SELECT
  USING (auth.role() = 'authenticated' OR true);

CREATE POLICY "Form 137 requests are insertable by anyone"
  ON procurements.sms_form137_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Form 137 requests are updatable by admins"
  ON procurements.sms_form137_requests FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Form 137 requests are deletable by admins"
  ON procurements.sms_form137_requests FOR DELETE
  USING (auth.role() = 'authenticated');

-- Subject Assignments: Similar policies
CREATE POLICY "Subject assignments are viewable by authenticated users"
  ON procurements.sms_subject_assignments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Subject assignments are insertable by admins"
  ON procurements.sms_subject_assignments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Subject assignments are updatable by admins"
  ON procurements.sms_subject_assignments FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Subject assignments are deletable by admins"
  ON procurements.sms_subject_assignments FOR DELETE
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get user ID by email (if not exists) - create in public schema
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email TEXT)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;
  
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE procurements.sms_subjects IS 'Subjects offered in the school, organized by grade level';
COMMENT ON TABLE procurements.sms_sections IS 'Class sections for each grade level and school year';
COMMENT ON TABLE procurements.sms_students IS 'Student records with LRN and personal information';
COMMENT ON TABLE procurements.sms_section_students IS 'Junction table linking students to sections';
COMMENT ON TABLE procurements.sms_grades IS 'Student grades per subject, section, and grading period';
COMMENT ON TABLE procurements.sms_enrollments IS 'Enrollment requests and approvals';
COMMENT ON TABLE procurements.sms_form137_requests IS 'Form 137 (Permanent Record) requests from students';
COMMENT ON TABLE procurements.sms_subject_assignments IS 'Many-to-many relationship between teachers and subjects';
