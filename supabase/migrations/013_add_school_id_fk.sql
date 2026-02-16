-- ============================================================================
-- ADD school_id FK TO TABLES REFERENCING sms_schools
-- ============================================================================
-- Adds school_id foreign key to sms_schools(id) for multi-school support.
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- sms_users: Add/convert school_id to FK (stores sms_schools.id)
-- ============================================================================
-- Handles both: (a) school_id TEXT exists - migrate to BIGINT FK
--              (b) school_id does not exist - add as new BIGINT FK column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'procurements' AND table_name = 'sms_users' AND column_name = 'school_id'
  ) THEN
    -- school_id exists (TEXT): migrate via temp column
    ALTER TABLE procurements.sms_users ADD COLUMN IF NOT EXISTS school_id_new BIGINT;
    UPDATE procurements.sms_users u
    SET school_id_new = COALESCE(
      (SELECT s.id FROM procurements.sms_schools s WHERE s.id::text = u.school_id LIMIT 1),
      (SELECT s.id FROM procurements.sms_schools s WHERE s.school_id = u.school_id LIMIT 1)
    )
    WHERE u.school_id IS NOT NULL AND u.school_id != '';
    ALTER TABLE procurements.sms_users DROP COLUMN school_id;
    ALTER TABLE procurements.sms_users RENAME COLUMN school_id_new TO school_id;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'procurements' AND table_name = 'sms_users' AND column_name = 'school_id_new'
  ) THEN
    -- Partial migration: school_id dropped, school_id_new exists - just rename
    ALTER TABLE procurements.sms_users RENAME COLUMN school_id_new TO school_id;
  ELSE
    -- school_id does not exist: add as new column
    ALTER TABLE procurements.sms_users ADD COLUMN IF NOT EXISTS school_id BIGINT;
  END IF;
END $$;

ALTER TABLE procurements.sms_users DROP CONSTRAINT IF EXISTS fk_sms_users_school;
ALTER TABLE procurements.sms_users
  ADD CONSTRAINT fk_sms_users_school
  FOREIGN KEY (school_id) REFERENCES procurements.sms_schools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sms_users_school_id ON procurements.sms_users(school_id);

-- ============================================================================
-- sms_subjects: Add school_id
-- ============================================================================
ALTER TABLE procurements.sms_subjects
  ADD COLUMN IF NOT EXISTS school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sms_subjects_school_id ON procurements.sms_subjects(school_id);

-- ============================================================================
-- sms_sections: Add school_id
-- ============================================================================
ALTER TABLE procurements.sms_sections
  ADD COLUMN IF NOT EXISTS school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sms_sections_school_id ON procurements.sms_sections(school_id);

-- ============================================================================
-- sms_students: Add school_id
-- ============================================================================
ALTER TABLE procurements.sms_students
  ADD COLUMN IF NOT EXISTS school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sms_students_school_id ON procurements.sms_students(school_id);

-- ============================================================================
-- sms_rooms: Add school_id
-- ============================================================================
ALTER TABLE procurements.sms_rooms
  ADD COLUMN IF NOT EXISTS school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE;

-- Drop unique on name to allow same room name across schools; add composite unique
ALTER TABLE procurements.sms_rooms DROP CONSTRAINT IF EXISTS sms_rooms_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_rooms_name_school
  ON procurements.sms_rooms(name, school_id)
  WHERE school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_rooms_school_id ON procurements.sms_rooms(school_id);

-- ============================================================================
-- sms_gpa_thresholds: Add school_id (per-school thresholds)
-- ============================================================================
ALTER TABLE procurements.sms_gpa_thresholds
  ADD COLUMN IF NOT EXISTS school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sms_gpa_thresholds_school_id ON procurements.sms_gpa_thresholds(school_id);

-- Drop existing unique constraint if we had one; allow multiple rows per school
-- (migration 009 seeded one row; we may need to update that row's school_id later per school)

-- ============================================================================
-- sms_enrollments: Add school_id (denormalized for query performance)
-- ============================================================================
ALTER TABLE procurements.sms_enrollments
  ADD COLUMN IF NOT EXISTS school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sms_enrollments_school_id ON procurements.sms_enrollments(school_id);

-- ============================================================================
-- sms_form137_requests: Add school_id
-- ============================================================================
ALTER TABLE procurements.sms_form137_requests
  ADD COLUMN IF NOT EXISTS school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sms_form137_requests_school_id ON procurements.sms_form137_requests(school_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON COLUMN procurements.sms_users.school_id IS 'FK to sms_schools.id - school this user belongs to';
COMMENT ON COLUMN procurements.sms_subjects.school_id IS 'FK to sms_schools.id - school offering this subject';
COMMENT ON COLUMN procurements.sms_sections.school_id IS 'FK to sms_schools.id - school this section belongs to';
COMMENT ON COLUMN procurements.sms_students.school_id IS 'FK to sms_schools.id - current school of enrollment';
COMMENT ON COLUMN procurements.sms_rooms.school_id IS 'FK to sms_schools.id - school this room belongs to';
COMMENT ON COLUMN procurements.sms_gpa_thresholds.school_id IS 'FK to sms_schools.id - school-specific GPA thresholds';
COMMENT ON COLUMN procurements.sms_enrollments.school_id IS 'FK to sms_schools.id - school for this enrollment';
COMMENT ON COLUMN procurements.sms_form137_requests.school_id IS 'FK to sms_schools.id - school processing the request';
