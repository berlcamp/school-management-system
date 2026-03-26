-- ============================================================================
-- MADRASAH EDUCATION PROGRAM (MEP) SUPPORT
-- ============================================================================
-- 1. Add is_madrasah flag to sms_subjects
-- 2. Create sms_student_subjects pivot table for selective subject enrollment
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- ADD is_madrasah COLUMN TO sms_subjects
-- ============================================================================
-- Default false ensures all existing subjects remain unaffected.
-- When true, only students explicitly enrolled via sms_student_subjects
-- take this subject (instead of all students in the section).
ALTER TABLE procurements.sms_subjects
  ADD COLUMN IF NOT EXISTS is_madrasah BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- SMS_STUDENT_SUBJECTS PIVOT TABLE
-- ============================================================================
-- Selective enrollment: links individual students to specific subjects
-- within a section. Used for Madrasah subjects where not all section
-- students participate.
CREATE TABLE IF NOT EXISTS procurements.sms_student_subjects (
  id            BIGSERIAL PRIMARY KEY,
  student_id    BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  subject_id    BIGINT NOT NULL REFERENCES procurements.sms_subjects(id) ON DELETE CASCADE,
  section_id    BIGINT NOT NULL REFERENCES procurements.sms_sections(id) ON DELETE CASCADE,
  school_id     BIGINT NOT NULL REFERENCES procurements.sms_schools(id),
  school_year   TEXT NOT NULL,
  enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enrolled_by   BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, subject_id, section_id, school_year)
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_student_subjects_student
  ON procurements.sms_student_subjects(student_id);
CREATE INDEX IF NOT EXISTS idx_student_subjects_subject
  ON procurements.sms_student_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_student_subjects_section
  ON procurements.sms_student_subjects(section_id);
CREATE INDEX IF NOT EXISTS idx_student_subjects_school_id
  ON procurements.sms_student_subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_student_subjects_school_year
  ON procurements.sms_student_subjects(school_year);

-- Partial index for quick Madrasah subject filtering
CREATE INDEX IF NOT EXISTS idx_subjects_is_madrasah
  ON procurements.sms_subjects(is_madrasah) WHERE is_madrasah = true;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT ALL ON procurements.sms_student_subjects TO authenticated;
GRANT ALL ON procurements.sms_student_subjects TO anon;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_student_subjects_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_student_subjects_id_seq TO anon;
