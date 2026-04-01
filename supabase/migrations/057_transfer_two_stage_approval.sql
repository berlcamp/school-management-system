-- ============================================================================
-- 057: Two-Stage Transfer Approval & Cross-School Data Access
-- ============================================================================
-- 1. Add 'pending_review' to enrollment_status allowed values
-- 2. Add record_access_granted + access_granted_at to sms_record_requests
-- 3. Update enroll_student_with_record_request to handle pre-released students
-- 4. Update respond_to_record_request: origin approval → pending_review (not auto-approve)
-- 5. New RPC: review_transfer_enrollment (destination school approve/reject)
-- 6. RLS policies for cross-school data access when record_access_granted = true
-- ============================================================================

-- ============================================================================
-- 1. Add 'pending_review' to enrollment_status CHECK constraint
-- ============================================================================

-- Drop and re-add the check constraint to include 'pending_review'
ALTER TABLE procurements.sms_enrollments
  DROP CONSTRAINT IF EXISTS sms_enrollments_enrollment_status_check;

ALTER TABLE procurements.sms_enrollments
  ADD CONSTRAINT sms_enrollments_enrollment_status_check
  CHECK (enrollment_status IN (
    'active', 'completed', 'transferred_out', 'dropped',
    'pending_transfer', 'retained', 'promoted', 'graduated',
    'pending_review'
  ));

-- ============================================================================
-- 2. Add record_access_granted columns to sms_record_requests
-- ============================================================================

ALTER TABLE procurements.sms_record_requests
  ADD COLUMN IF NOT EXISTS record_access_granted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE procurements.sms_record_requests
  ADD COLUMN IF NOT EXISTS access_granted_at TIMESTAMPTZ;

-- Index for quick RLS lookups
CREATE INDEX IF NOT EXISTS idx_sms_record_requests_access_granted
  ON procurements.sms_record_requests(student_id, requesting_school_id)
  WHERE record_access_granted = TRUE AND status = 'approved';

-- ============================================================================
-- 3. Update enroll_student_with_record_request to handle pre-released students
-- ============================================================================
-- Now handles students with enrollment_status 'transferred_out' or 'transferred'
-- instead of requiring a separate pre_released path in the frontend.

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

  -- Find the latest approved enrollment (now also accepts transferred_out/completed)
  SELECT e.school_id, e.enrollment_status INTO v_origin_school_id, v_origin_status
  FROM procurements.sms_enrollments e
  WHERE e.student_id = p_student_id AND e.status = 'approved'
    AND e.enrollment_status IN ('active', 'completed', 'transferred_out')
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

-- ============================================================================
-- 4. Update respond_to_record_request: approval → pending_review (not active)
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
      -- Grant data access when approved
      record_access_granted = CASE WHEN p_action = 'approved' THEN TRUE ELSE FALSE END,
      access_granted_at = CASE WHEN p_action = 'approved' THEN NOW() ELSE NULL END
  WHERE id = p_request_id;

  IF p_action = 'approved' THEN
    -- Mark origin enrollment as transferred_out
    UPDATE procurements.sms_enrollments
    SET enrollment_status = 'transferred_out', updated_at = NOW()
    WHERE student_id = v_request.student_id AND school_id = v_request.origin_school_id
      AND status = 'approved' AND enrollment_status IN ('active', 'pending_transfer');

    -- Move enrollment to pending_review (NOT approved — destination school must review)
    UPDATE procurements.sms_enrollments
    SET enrollment_status = 'pending_review', updated_at = NOW()
    WHERE record_request_id = p_request_id AND status = 'pending';

  ELSIF p_action = 'rejected' THEN
    -- Revert origin enrollment to active
    UPDATE procurements.sms_enrollments
    SET enrollment_status = 'active', updated_at = NOW()
    WHERE student_id = v_request.student_id AND school_id = v_request.origin_school_id
      AND status = 'approved' AND enrollment_status = 'pending_transfer';

    -- Remove the pending enrollment at the requesting school
    DELETE FROM procurements.sms_enrollments
    WHERE record_request_id = p_request_id AND status = 'pending';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. New RPC: review_transfer_enrollment (destination school approve/reject)
-- ============================================================================

CREATE OR REPLACE FUNCTION procurements.review_transfer_enrollment(
  p_enrollment_id BIGINT, p_action TEXT, p_reviewer_id BIGINT,
  p_rejection_reason TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_enrollment RECORD;
  v_request RECORD;
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid action'; END IF;

  -- Get the enrollment that is pending review
  SELECT * INTO v_enrollment FROM procurements.sms_enrollments
  WHERE id = p_enrollment_id AND enrollment_status = 'pending_review' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment not found or not pending review'; END IF;

  IF p_action = 'approved' THEN
    -- Approve the enrollment — student is now active
    UPDATE procurements.sms_enrollments
    SET status = 'approved', enrollment_status = 'active',
        approved_by = p_reviewer_id, updated_at = NOW()
    WHERE id = p_enrollment_id;

    -- Update student record
    UPDATE procurements.sms_students
    SET enrollment_status = 'enrolled',
        grade_level = v_enrollment.grade_level,
        current_section_id = v_enrollment.section_id,
        school_id = v_enrollment.school_id
    WHERE id = v_enrollment.student_id;

  ELSIF p_action = 'rejected' THEN
    -- Reject the enrollment
    UPDATE procurements.sms_enrollments
    SET status = 'rejected', enrollment_status = 'dropped',
        remarks = p_rejection_reason, updated_at = NOW()
    WHERE id = p_enrollment_id;

    -- Revoke data access on the record request
    IF v_enrollment.record_request_id IS NOT NULL THEN
      UPDATE procurements.sms_record_requests
      SET record_access_granted = FALSE
      WHERE id = v_enrollment.record_request_id;
    END IF;

    -- Update student — revert to previous state
    UPDATE procurements.sms_students
    SET enrollment_status = 'transferred',
        current_section_id = NULL
    WHERE id = v_enrollment.student_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. RLS policies for cross-school data access
-- ============================================================================
-- When a record request is approved and record_access_granted = true,
-- the requesting school can read the student's historical data from the
-- origin school. This enables the new school to generate DepEd forms.

-- Helper function: check if current user's school has granted access to a student
CREATE OR REPLACE FUNCTION procurements.has_record_access(p_student_id BIGINT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_record_requests rr
    WHERE rr.student_id = p_student_id
      AND rr.record_access_granted = TRUE
      AND rr.status = 'approved'
      AND rr.requesting_school_id = (
        SELECT school_id FROM procurements.sms_users
        WHERE user_id = auth.uid() LIMIT 1
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Policy on sms_grades: allow requesting school to read transferee's grades
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Cross-school grade access via record request'
      AND tablename = 'sms_grades'
  ) THEN
    CREATE POLICY "Cross-school grade access via record request"
      ON procurements.sms_grades FOR SELECT
      USING (procurements.has_record_access(student_id));
  END IF;
END $$;

-- Policy on sms_attendance: allow requesting school to read transferee's attendance
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Cross-school attendance access via record request'
      AND tablename = 'sms_attendance'
  ) THEN
    CREATE POLICY "Cross-school attendance access via record request"
      ON procurements.sms_attendance FOR SELECT
      USING (procurements.has_record_access(student_id));
  END IF;
END $$;

-- Policy on sms_enrollments: allow requesting school to read transferee's enrollment history
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Cross-school enrollment access via record request'
      AND tablename = 'sms_enrollments'
  ) THEN
    CREATE POLICY "Cross-school enrollment access via record request"
      ON procurements.sms_enrollments FOR SELECT
      USING (procurements.has_record_access(student_id));
  END IF;
END $$;

-- Policy on sms_eccd_assessments: allow requesting school to read transferee's ECCD data
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Cross-school ECCD access via record request'
      AND tablename = 'sms_eccd_assessments'
  ) THEN
    CREATE POLICY "Cross-school ECCD access via record request"
      ON procurements.sms_eccd_assessments FOR SELECT
      USING (procurements.has_record_access(student_id));
  END IF;
END $$;

-- Policy on sms_learner_health: allow requesting school to read transferee's health data
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Cross-school health access via record request'
      AND tablename = 'sms_learner_health'
  ) THEN
    CREATE POLICY "Cross-school health access via record request"
      ON procurements.sms_learner_health FOR SELECT
      USING (procurements.has_record_access(student_id));
  END IF;
END $$;

-- ============================================================================
-- 7. Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION procurements.review_transfer_enrollment TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.has_record_access TO authenticated;
