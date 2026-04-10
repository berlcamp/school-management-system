-- Simplify transfer enrollment: students are immediately active at the new school.
-- Record requests only control data access to previous school records.
-- The "Pending Reviews" two-stage approval is removed.

-- ============================================================================
-- 1. Rewrite enroll_student_with_record_request
--    Enrollment is now immediately approved & active (not pending).
-- ============================================================================

CREATE OR REPLACE FUNCTION procurements.enroll_student_with_record_request(
  p_student_id BIGINT, p_requesting_school_id BIGINT, p_requested_by BIGINT,
  p_section_id BIGINT, p_grade_level INTEGER, p_school_year TEXT,
  p_semester INTEGER DEFAULT NULL, p_remarks TEXT DEFAULT NULL
) RETURNS TABLE (enrollment_id BIGINT, request_id BIGINT) AS $$
DECLARE
  v_origin_school_id BIGINT; v_student_lrn TEXT;
  v_enrollment_id BIGINT; v_request_id BIGINT;
  v_origin_status TEXT;
  v_existing_enrollment_id BIGINT;
BEGIN
  SELECT s.lrn INTO v_student_lrn FROM procurements.sms_students s WHERE s.id = p_student_id;
  IF v_student_lrn IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;

  SELECT e.school_id, e.enrollment_status INTO v_origin_school_id, v_origin_status
  FROM procurements.sms_enrollments e
  WHERE e.student_id = p_student_id AND e.status = 'approved'
    AND e.enrollment_status IN ('active', 'completed', 'transferred_out', 'promoted', 'graduated', 'retained')
  ORDER BY e.school_year DESC, e.created_at DESC LIMIT 1;

  IF v_origin_school_id IS NULL THEN RAISE EXCEPTION 'Student has no active enrollment'; END IF;
  IF v_origin_school_id = p_requesting_school_id THEN RAISE EXCEPTION 'Student already at this school'; END IF;

  -- Create record request for data access
  INSERT INTO procurements.sms_record_requests (
    student_id, student_lrn, requesting_school_id, origin_school_id,
    requested_by, target_grade_level, target_school_year, remarks
  ) VALUES (
    p_student_id, v_student_lrn, p_requesting_school_id, v_origin_school_id,
    p_requested_by, p_grade_level, p_school_year, p_remarks
  ) RETURNING id INTO v_request_id;

  -- Mark origin enrollment as pending_transfer (only if still active)
  IF v_origin_status = 'active' THEN
    UPDATE procurements.sms_enrollments
    SET enrollment_status = 'pending_transfer'
    WHERE student_id = p_student_id AND school_id = v_origin_school_id
      AND status = 'approved' AND enrollment_status = 'active';
  END IF;

  -- Check if student already has an enrollment at this school for this school year
  -- (e.g., student transferred away and is now returning). Reactivate it instead of
  -- inserting a duplicate that would violate the unique constraint.
  SELECT id INTO v_existing_enrollment_id
  FROM procurements.sms_enrollments
  WHERE student_id = p_student_id
    AND school_id = p_requesting_school_id
    AND school_year = p_school_year
    AND COALESCE(semester, 0) = COALESCE(p_semester, 0)
  LIMIT 1;

  IF v_existing_enrollment_id IS NOT NULL THEN
    -- Reactivate the existing enrollment
    UPDATE procurements.sms_enrollments
    SET section_id = p_section_id, grade_level = p_grade_level,
        status = 'approved', enrollment_status = 'active',
        origin_school_id = v_origin_school_id, record_request_id = v_request_id,
        enrolled_by = p_requested_by, approved_by = p_requested_by,
        remarks = NULL, updated_at = NOW()
    WHERE id = v_existing_enrollment_id
    RETURNING id INTO v_enrollment_id;
  ELSE
    -- Create new enrollment — immediately approved & active
    INSERT INTO procurements.sms_enrollments (
      student_id, school_id, section_id, grade_level, school_year, semester,
      status, enrollment_status, origin_school_id, record_request_id,
      enrolled_by, approved_by
    ) VALUES (
      p_student_id, p_requesting_school_id, p_section_id, p_grade_level, p_school_year,
      p_semester, 'approved', 'active', v_origin_school_id, v_request_id,
      p_requested_by, p_requested_by
    ) RETURNING id INTO v_enrollment_id;
  END IF;

  -- Update student record
  UPDATE procurements.sms_students
  SET school_id = p_requesting_school_id, enrollment_status = 'enrolled',
      grade_level = p_grade_level, current_section_id = p_section_id
  WHERE id = p_student_id;

  RETURN QUERY SELECT v_enrollment_id, v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. Rewrite respond_to_record_request
--    Approve: grant data access only (enrollment is already active).
--    Reject: deny data access only (enrollment stays).
-- ============================================================================

CREATE OR REPLACE FUNCTION procurements.respond_to_record_request(
  p_request_id BIGINT, p_action TEXT, p_responder_id BIGINT,
  p_rejection_reason TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE v_request RECORD;
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid action'; END IF;

  SELECT * INTO v_request FROM procurements.sms_record_requests
  WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already processed'; END IF;

  UPDATE procurements.sms_record_requests
  SET status = p_action, approved_by = p_responder_id, responded_at = NOW(),
      rejection_reason = CASE WHEN p_action = 'rejected' THEN p_rejection_reason ELSE NULL END,
      record_access_granted = CASE WHEN p_action = 'approved' THEN TRUE ELSE FALSE END,
      access_granted_at = CASE WHEN p_action = 'approved' THEN NOW() ELSE NULL END
  WHERE id = p_request_id;

  IF p_action = 'approved' THEN
    -- Mark origin enrollment as transferred_out
    UPDATE procurements.sms_enrollments
    SET enrollment_status = 'transferred_out', updated_at = NOW()
    WHERE student_id = v_request.student_id AND school_id = v_request.origin_school_id
      AND status = 'approved' AND enrollment_status IN ('active', 'pending_transfer');

  ELSIF p_action = 'rejected' THEN
    -- Revert origin enrollment to active (if it was pending_transfer)
    UPDATE procurements.sms_enrollments
    SET enrollment_status = 'active', updated_at = NOW()
    WHERE student_id = v_request.student_id AND school_id = v_request.origin_school_id
      AND status = 'approved' AND enrollment_status = 'pending_transfer';
    -- Destination enrollment stays active — student remains enrolled
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. Rewrite cancel_record_request
--    Cancel the record request only. Enrollment stays active.
-- ============================================================================

CREATE OR REPLACE FUNCTION procurements.cancel_record_request(
  p_request_id BIGINT, p_user_id BIGINT
) RETURNS VOID AS $$
DECLARE v_request RECORD;
BEGIN
  SELECT * INTO v_request FROM procurements.sms_record_requests
  WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already processed'; END IF;

  UPDATE procurements.sms_record_requests SET status = 'cancelled' WHERE id = p_request_id;

  -- Revert origin enrollment to active (if it was pending_transfer)
  UPDATE procurements.sms_enrollments
  SET enrollment_status = 'active', updated_at = NOW()
  WHERE student_id = v_request.student_id AND school_id = v_request.origin_school_id
    AND status = 'approved' AND enrollment_status = 'pending_transfer';
  -- Destination enrollment stays active
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. New RPC: remove_transfer_student
--    Destination school removes a transferee after reviewing records.
-- ============================================================================

CREATE OR REPLACE FUNCTION procurements.remove_transfer_student(
  p_request_id BIGINT,
  p_remover_id BIGINT,
  p_reason TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_request RECORD;
  v_enrollment RECORD;
BEGIN
  -- Must have approved request with data access granted
  SELECT * INTO v_request FROM procurements.sms_record_requests
  WHERE id = p_request_id AND status = 'approved' AND record_access_granted = TRUE
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or records not yet accessible';
  END IF;

  -- Find the active enrollment at the requesting school
  SELECT * INTO v_enrollment FROM procurements.sms_enrollments
  WHERE record_request_id = p_request_id AND status = 'approved' AND enrollment_status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active enrollment found for this request';
  END IF;

  -- Drop the enrollment
  UPDATE procurements.sms_enrollments
  SET enrollment_status = 'dropped', status = 'rejected',
      remarks = COALESCE(p_reason, 'Removed after record review'), updated_at = NOW()
  WHERE id = v_enrollment.id;

  -- Revoke data access
  UPDATE procurements.sms_record_requests
  SET record_access_granted = FALSE
  WHERE id = p_request_id;

  -- Revert origin enrollment from transferred_out back to active/previous
  UPDATE procurements.sms_enrollments
  SET enrollment_status = 'active', updated_at = NOW()
  WHERE student_id = v_request.student_id AND school_id = v_request.origin_school_id
    AND status = 'approved' AND enrollment_status = 'transferred_out';

  -- Revert student record to origin school
  UPDATE procurements.sms_students
  SET enrollment_status = 'enrolled',
      school_id = v_request.origin_school_id,
      current_section_id = NULL
  WHERE id = v_request.student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION procurements.remove_transfer_student TO authenticated;
