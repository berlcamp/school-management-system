-- ============================================================================
-- ADD school_id TO sms_subject_schedules
-- ============================================================================
-- Adds school_id to schedules table for direct filtering by user's school.
-- ============================================================================

SET search_path TO procurements, public;

-- Add school_id column
ALTER TABLE procurements.sms_subject_schedules
  ADD COLUMN IF NOT EXISTS school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sms_subject_schedules_school_id ON procurements.sms_subject_schedules(school_id);

-- Backfill existing schedules from subject's school_id
UPDATE procurements.sms_subject_schedules s
SET school_id = sub.school_id
FROM procurements.sms_subjects sub
WHERE s.subject_id = sub.id AND s.school_id IS NULL AND sub.school_id IS NOT NULL;

COMMENT ON COLUMN procurements.sms_subject_schedules.school_id IS 'FK to sms_schools.id - school this schedule belongs to';
