-- Trigger: automatically sync sms_students.enrollment_status from sms_enrollments.
--
-- Problem solved: previously, every piece of application code that updated
-- sms_enrollments.enrollment_status also had to manually update
-- sms_students.enrollment_status. This was fragile — a missed update silently
-- left the student record stale.
--
-- This trigger fires after any INSERT, UPDATE, or DELETE on sms_enrollments.
-- It finds the most recent approved enrollment for the affected student and
-- maps its lifecycle status to the student-level enrollment status.
--
-- Lifecycle → student status mapping:
--   active, promoted, retained, completed  → enrolled
--   graduated                              → graduated
--   transferred_out, pending_transfer      → transferred
--   dropped                                → dropped

CREATE OR REPLACE FUNCTION procurements.sync_student_enrollment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_student_id BIGINT;
  v_lifecycle_status TEXT;
  v_student_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_student_id := OLD.student_id;
  ELSE
    v_student_id := NEW.student_id;
  END IF;

  -- Derive status from the most recent approved enrollment
  SELECT enrollment_status INTO v_lifecycle_status
  FROM procurements.sms_enrollments
  WHERE student_id = v_student_id
    AND status = 'approved'
  ORDER BY school_year DESC, created_at DESC
  LIMIT 1;

  IF v_lifecycle_status IS NULL THEN
    -- No approved enrollment exists; leave student record unchanged
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_student_status := CASE v_lifecycle_status
    WHEN 'active'           THEN 'enrolled'
    WHEN 'promoted'         THEN 'enrolled'
    WHEN 'retained'         THEN 'enrolled'
    WHEN 'completed'        THEN 'enrolled'
    WHEN 'graduated'        THEN 'graduated'
    WHEN 'transferred_out'  THEN 'transferred'
    WHEN 'pending_transfer' THEN 'transferred'
    WHEN 'dropped'          THEN 'dropped'
    ELSE 'enrolled'
  END;

  UPDATE procurements.sms_students
  SET enrollment_status = v_student_status
  WHERE id = v_student_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_student_enrollment_status ON procurements.sms_enrollments;

CREATE TRIGGER trg_sync_student_enrollment_status
AFTER INSERT OR UPDATE OR DELETE
ON procurements.sms_enrollments
FOR EACH ROW
EXECUTE FUNCTION procurements.sync_student_enrollment_status();
