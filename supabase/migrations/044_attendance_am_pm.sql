-- ============================================================================
-- ATTENDANCE AM/PM REFACTOR
-- ============================================================================
-- Adds am_present and pm_present boolean columns to sms_attendance.
-- Auto-computes the legacy `status` column via trigger for backward compat.
-- ============================================================================

SET search_path TO procurements, public;

-- 1. Add AM/PM columns (NULL = not yet recorded)
ALTER TABLE procurements.sms_attendance
  ADD COLUMN IF NOT EXISTS am_present BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pm_present BOOLEAN DEFAULT NULL;

-- 2. Drop the CHECK constraint on status and make it nullable
ALTER TABLE procurements.sms_attendance DROP CONSTRAINT IF EXISTS sms_attendance_status_check;
ALTER TABLE procurements.sms_attendance ALTER COLUMN status DROP NOT NULL;

-- 3. Backfill existing records
UPDATE procurements.sms_attendance
SET am_present = true, pm_present = true
WHERE status = 'present' AND am_present IS NULL;

UPDATE procurements.sms_attendance
SET am_present = false, pm_present = false
WHERE status = 'absent' AND am_present IS NULL;

UPDATE procurements.sms_attendance
SET am_present = true, pm_present = false
WHERE status = 'tardy' AND am_present IS NULL;

-- 4. Trigger to auto-compute status from am_present / pm_present
CREATE OR REPLACE FUNCTION procurements.compute_attendance_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.am_present IS NULL AND NEW.pm_present IS NULL THEN
    NEW.status := NULL;
  ELSIF NEW.am_present = true AND NEW.pm_present = true THEN
    NEW.status := 'present';
  ELSIF NEW.am_present = false AND NEW.pm_present = false THEN
    NEW.status := 'absent';
  ELSE
    NEW.status := 'tardy';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_compute_attendance_status
  BEFORE INSERT OR UPDATE ON procurements.sms_attendance
  FOR EACH ROW EXECUTE FUNCTION procurements.compute_attendance_status();
