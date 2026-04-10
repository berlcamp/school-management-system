-- Fix: enroll_student_with_record_request fails for promoted/graduated/retained students
-- The RPC only checked for enrollment_status IN ('active', 'completed', 'transferred_out')
-- but students who were promoted, graduated, or retained have those statuses instead.

CREATE OR REPLACE FUNCTION procurements.enroll_student_with_record_request(
  p_student_id BIGINT, p_requesting_school_id BIGINT, p_requested_by BIGINT,
  p_section_id BIGINT, p_grade_level INTEGER, p_school_year TEXT,
  p_semester INTEGER DEFAULT NULL, p_remarks TEXT DEFAULT NULL
) RETURNS TABLE (enrollment_id BIGINT, request_id BIGINT) AS $$
DECLARE
  v_origin_school_id BIGINT; v_student_lrn TEXT;
  v_enrollment_id BIGINT; v_request_id BIGINT;
  v_origin_status TEXT;
BEGIN
  SELECT s.lrn INTO v_student_lrn FROM procurements.sms_students s WHERE s.id = p_student_id;
  IF v_student_lrn IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;

  -- Find the latest approved enrollment (includes promoted/graduated/retained)
  SELECT e.school_id, e.enrollment_status INTO v_origin_school_id, v_origin_status
  FROM procurements.sms_enrollments e
  WHERE e.student_id = p_student_id AND e.status = 'approved'
    AND e.enrollment_status IN ('active', 'completed', 'transferred_out', 'promoted', 'graduated', 'retained')
  ORDER BY e.school_year DESC, e.created_at DESC LIMIT 1;

  IF v_origin_school_id IS NULL THEN RAISE EXCEPTION 'Student has no active enrollment'; END IF;
  IF v_origin_school_id = p_requesting_school_id THEN RAISE EXCEPTION 'Student already at this school'; END IF;

  -- Create record request (always, even for pre-released students)
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

  -- Create new enrollment at requesting school (pending until full two-stage approval)
  INSERT INTO procurements.sms_enrollments (
    student_id, school_id, section_id, grade_level, school_year, semester,
    status, enrollment_status, origin_school_id, record_request_id, enrolled_by
  ) VALUES (
    p_student_id, p_requesting_school_id, p_section_id, p_grade_level, p_school_year,
    p_semester, 'pending', 'pending_transfer', v_origin_school_id, v_request_id, p_requested_by
  ) RETURNING id INTO v_enrollment_id;

  -- Update student school_id for backward compat
  UPDATE procurements.sms_students
  SET school_id = p_requesting_school_id, enrollment_status = 'enrolled',
      grade_level = p_grade_level, current_section_id = p_section_id
  WHERE id = p_student_id;

  RETURN QUERY SELECT v_enrollment_id, v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
