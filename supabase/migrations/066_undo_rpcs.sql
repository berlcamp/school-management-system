-- Undo RPCs for record request and transfer enrollment actions.
-- Only "approve" actions are reversible; reject/cancel delete enrollment rows.

-- 1. Undo record request approval (incoming tab)
-- Reverts request to pending, revokes data access, restores enrollment statuses.
CREATE OR REPLACE FUNCTION procurements.undo_record_request_approval(
  p_request_id BIGINT,
  p_user_id BIGINT
) RETURNS VOID AS $$
DECLARE
  v_request RECORD;
BEGIN
  SELECT * INTO v_request FROM procurements.sms_record_requests
  WHERE id = p_request_id AND status = 'approved'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not in approved status';
  END IF;

  -- Check that the destination enrollment is still in pending_review
  -- (if it was already approved/rejected by destination, we cannot undo)
  IF EXISTS (
    SELECT 1 FROM procurements.sms_enrollments
    WHERE record_request_id = p_request_id
      AND enrollment_status NOT IN ('pending_transfer', 'pending_review')
      AND status IN ('approved', 'rejected')
  ) THEN
    RAISE EXCEPTION 'Cannot undo: destination school has already acted on this enrollment';
  END IF;

  -- Revert request to pending
  UPDATE procurements.sms_record_requests
  SET status = 'pending',
      record_access_granted = FALSE,
      access_granted_at = NULL,
      approved_by = NULL,
      responded_at = NULL,
      rejection_reason = NULL
  WHERE id = p_request_id;

  -- Revert origin enrollment from transferred_out back to pending_transfer
  UPDATE procurements.sms_enrollments
  SET enrollment_status = 'pending_transfer', updated_at = NOW()
  WHERE student_id = v_request.student_id
    AND school_id = v_request.origin_school_id
    AND status = 'approved'
    AND enrollment_status = 'transferred_out';

  -- Revert destination enrollment from pending_review back to pending_transfer
  UPDATE procurements.sms_enrollments
  SET enrollment_status = 'pending_transfer', status = 'pending', updated_at = NOW()
  WHERE record_request_id = p_request_id
    AND enrollment_status = 'pending_review';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Undo transfer enrollment approval (pending reviews tab)
-- Reverts active enrollment back to pending_review.
CREATE OR REPLACE FUNCTION procurements.undo_transfer_enrollment_approval(
  p_enrollment_id BIGINT,
  p_user_id BIGINT
) RETURNS VOID AS $$
DECLARE
  v_enrollment RECORD;
BEGIN
  SELECT * INTO v_enrollment FROM procurements.sms_enrollments
  WHERE id = p_enrollment_id
    AND status = 'approved'
    AND enrollment_status = 'active'
    AND record_request_id IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found or not eligible for undo';
  END IF;

  -- Revert enrollment to pending_review
  UPDATE procurements.sms_enrollments
  SET status = 'pending',
      enrollment_status = 'pending_review',
      approved_by = NULL,
      updated_at = NOW()
  WHERE id = p_enrollment_id;

  -- Revert student record — clear section, keep at destination school
  UPDATE procurements.sms_students
  SET current_section_id = NULL
  WHERE id = v_enrollment.student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION procurements.undo_record_request_approval TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.undo_transfer_enrollment_approval TO authenticated;
