-- ============================================================================
-- REMOVE DELETED_AT COLUMNS
-- ============================================================================
-- This migration removes soft delete (deleted_at) functionality from all tables.
-- Tables will use hard deletes instead.
-- ============================================================================

SET search_path TO procurements, public;

-- Drop indexes that reference deleted_at (must drop before removing column)
DROP INDEX IF EXISTS procurements.idx_subjects_active;
DROP INDEX IF EXISTS procurements.idx_sections_active;
DROP INDEX IF EXISTS procurements.idx_students_active;
DROP INDEX IF EXISTS procurements.idx_rooms_active;

-- Remove deleted_at column from sms_subjects
ALTER TABLE procurements.sms_subjects DROP COLUMN IF EXISTS deleted_at;

-- Remove deleted_at column from sms_sections
ALTER TABLE procurements.sms_sections DROP COLUMN IF EXISTS deleted_at;

-- Remove deleted_at column from sms_students
ALTER TABLE procurements.sms_students DROP COLUMN IF EXISTS deleted_at;

-- Remove deleted_at column from sms_rooms
ALTER TABLE procurements.sms_rooms DROP COLUMN IF EXISTS deleted_at;

-- Recreate indexes without deleted_at filter
CREATE INDEX IF NOT EXISTS idx_subjects_active ON procurements.sms_subjects(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sections_active ON procurements.sms_sections(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_students_active ON procurements.sms_students(enrollment_status) WHERE enrollment_status = 'enrolled';
CREATE INDEX IF NOT EXISTS idx_rooms_active ON procurements.sms_rooms(is_active) WHERE is_active = true;
