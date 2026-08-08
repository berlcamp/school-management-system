-- Pin every record request to the ONE origin enrollment it is about.
--
-- The transfer RPCs in 066 all identify the origin enrollment by predicate —
-- (student_id, origin_school_id, status = 'approved', enrollment_status IN …) —
-- with no school year or row id. A learner who has attended the origin school
-- before matches on several rows, so:
--
--   * remove_transfer_student reverted EVERY historical 'transferred_out' row
--     at that school back to 'active'. Undoing one transfer resurrected the
--     learner as concurrently enrolled in several past school years.
--   * respond_to_record_request / cancel_record_request had the same shape on
--     their pending_transfer reverts.
--
-- Fix: sms_record_requests.origin_enrollment_id records the exact row when the
-- request is created, and every RPC acts on that id alone.
--
-- Legacy rows: the column is backfilled below, but only where the predicate
-- resolves to exactly one candidate. Where it is still NULL the RPCs fall back
-- to the most recent matching row (ORDER BY school_year DESC, created_at DESC
-- LIMIT 1) — one row, never the whole history.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

ALTER TABLE procurements.sms_record_requests
  ADD COLUMN IF NOT EXISTS origin_enrollment_id BIGINT
    REFERENCES procurements.sms_enrollments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_record_requests_origin_enrollment
  ON procurements.sms_record_requests (origin_enrollment_id);

COMMENT ON COLUMN procurements.sms_record_requests.origin_enrollment_id IS
  'The single enrollment row at the origin school this request is about. NULL only for requests created before migration 127 whose origin row could not be identified unambiguously.';

-- ---------------------------------------------------------------------------
-- 2. Backfill — additive, writes only the new column
-- ---------------------------------------------------------------------------
-- Touches: sms_record_requests rows where origin_enrollment_id IS NULL (all of
-- them, since the column is new) — and sets a value only for those whose origin
-- school has exactly ONE enrollment for that learner in a transfer-related
-- state. Ambiguous ones stay NULL and use the fallback path. No other column,
-- table or row is modified.

UPDATE procurements.sms_record_requests r
SET origin_enrollment_id = (
  SELECT e.id
  FROM procurements.sms_enrollments e
  WHERE e.student_id = r.student_id
    AND e.school_id = r.origin_school_id
    AND e.status = 'approved'
    AND e.enrollment_status IN ('active', 'pending_transfer', 'transferred_out')
)
WHERE r.origin_enrollment_id IS NULL
  AND (
    SELECT COUNT(*)
    FROM procurements.sms_enrollments e
    WHERE e.student_id = r.student_id
      AND e.school_id = r.origin_school_id
      AND e.status = 'approved'
      AND e.enrollment_status IN ('active', 'pending_transfer', 'transferred_out')
  ) = 1;

-- ---------------------------------------------------------------------------
-- 3. enroll_student_with_record_request — record the origin row, scope the
--    pending_transfer mark to it
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.enroll_student_with_record_request(
  p_student_id BIGINT, p_requesting_school_id BIGINT, p_requested_by BIGINT,
  p_section_id BIGINT, p_grade_level INTEGER, p_school_year TEXT,
  p_semester INTEGER DEFAULT NULL, p_remarks TEXT DEFAULT NULL
) RETURNS TABLE (enrollment_id BIGINT, request_id BIGINT) AS $$
DECLARE
  v_origin_school_id BIGINT; v_student_lrn TEXT;
  v_enrollment_id BIGINT; v_request_id BIGINT;
  v_origin_status TEXT;
  v_origin_enrollment_id BIGINT;
  v_existing_enrollment_id BIGINT;
BEGIN
  SELECT s.lrn INTO v_student_lrn FROM procurements.sms_students s WHERE s.id = p_student_id;
  IF v_student_lrn IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;

  -- The learner's latest approved enrollment IS the origin — capture its id,
  -- not just its school, so every later step acts on this one row.
  SELECT e.id, e.school_id, e.enrollment_status
    INTO v_origin_enrollment_id, v_origin_school_id, v_origin_status
  FROM procurements.sms_enrollments e
  WHERE e.student_id = p_student_id AND e.status = 'approved'
    AND e.enrollment_status IN ('active', 'completed', 'transferred_out', 'promoted', 'graduated', 'retained')
  ORDER BY e.school_year DESC, e.created_at DESC LIMIT 1;

  IF v_origin_school_id IS NULL THEN RAISE EXCEPTION 'Student has no active enrollment'; END IF;
  IF v_origin_school_id = p_requesting_school_id THEN RAISE EXCEPTION 'Student already at this school'; END IF;

  -- Create record request for data access
  INSERT INTO procurements.sms_record_requests (
    student_id, student_lrn, requesting_school_id, origin_school_id,
    origin_enrollment_id, requested_by, target_grade_level, target_school_year, remarks
  ) VALUES (
    p_student_id, v_student_lrn, p_requesting_school_id, v_origin_school_id,
    v_origin_enrollment_id, p_requested_by, p_grade_level, p_school_year, p_remarks
  ) RETURNING id INTO v_request_id;

  -- Mark THAT origin enrollment as pending_transfer (only if still active)
  IF v_origin_status = 'active' THEN
    UPDATE procurements.sms_enrollments
    SET enrollment_status = 'pending_transfer'
    WHERE id = v_origin_enrollment_id;
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
    -- Reactivate the existing enrollment. A row that was left 'graduated' is
    -- refused by trg_enforce_graduation_lock (126), not silently revived.
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

-- ---------------------------------------------------------------------------
-- 4. respond_to_record_request — act on the pinned origin row only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.respond_to_record_request(
  p_request_id BIGINT, p_action TEXT, p_responder_id BIGINT,
  p_rejection_reason TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_request RECORD;
  v_origin_enrollment_id BIGINT;
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid action'; END IF;

  SELECT * INTO v_request FROM procurements.sms_record_requests
  WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already processed'; END IF;

  -- Pinned row, or — for a pre-127 request — the most recent single candidate.
  v_origin_enrollment_id := COALESCE(
    v_request.origin_enrollment_id,
    (SELECT e.id FROM procurements.sms_enrollments e
      WHERE e.student_id = v_request.student_id
        AND e.school_id = v_request.origin_school_id
        AND e.status = 'approved'
        AND e.enrollment_status IN ('active', 'pending_transfer')
      ORDER BY e.school_year DESC, e.created_at DESC LIMIT 1)
  );

  UPDATE procurements.sms_record_requests
  SET status = p_action, approved_by = p_responder_id, responded_at = NOW(),
      rejection_reason = CASE WHEN p_action = 'rejected' THEN p_rejection_reason ELSE NULL END,
      record_access_granted = CASE WHEN p_action = 'approved' THEN TRUE ELSE FALSE END,
      access_granted_at = CASE WHEN p_action = 'approved' THEN NOW() ELSE NULL END,
      origin_enrollment_id = COALESCE(origin_enrollment_id, v_origin_enrollment_id)
  WHERE id = p_request_id;

  IF p_action = 'approved' THEN
    -- Mark that one origin enrollment as transferred_out
    UPDATE procurements.sms_enrollments
    SET enrollment_status = 'transferred_out', updated_at = NOW()
    WHERE id = v_origin_enrollment_id
      AND status = 'approved'
      AND enrollment_status IN ('active', 'pending_transfer');

  ELSIF p_action = 'rejected' THEN
    -- Revert that one origin enrollment to active (if it was pending_transfer)
    UPDATE procurements.sms_enrollments
    SET enrollment_status = 'active', updated_at = NOW()
    WHERE id = v_origin_enrollment_id
      AND status = 'approved'
      AND enrollment_status = 'pending_transfer';
    -- Destination enrollment stays active — student remains enrolled
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 5. cancel_record_request — same scoping
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.cancel_record_request(
  p_request_id BIGINT, p_user_id BIGINT
) RETURNS VOID AS $$
DECLARE
  v_request RECORD;
  v_origin_enrollment_id BIGINT;
BEGIN
  SELECT * INTO v_request FROM procurements.sms_record_requests
  WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already processed'; END IF;

  v_origin_enrollment_id := COALESCE(
    v_request.origin_enrollment_id,
    (SELECT e.id FROM procurements.sms_enrollments e
      WHERE e.student_id = v_request.student_id
        AND e.school_id = v_request.origin_school_id
        AND e.status = 'approved'
        AND e.enrollment_status = 'pending_transfer'
      ORDER BY e.school_year DESC, e.created_at DESC LIMIT 1)
  );

  UPDATE procurements.sms_record_requests SET status = 'cancelled' WHERE id = p_request_id;

  -- Revert that one origin enrollment to active (if it was pending_transfer)
  UPDATE procurements.sms_enrollments
  SET enrollment_status = 'active', updated_at = NOW()
  WHERE id = v_origin_enrollment_id
    AND status = 'approved'
    AND enrollment_status = 'pending_transfer';
  -- Destination enrollment stays active
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 6. remove_transfer_student — revert ONE origin enrollment, not the history
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.remove_transfer_student(
  p_request_id BIGINT,
  p_remover_id BIGINT,
  p_reason TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_request RECORD;
  v_enrollment RECORD;
  v_origin_enrollment_id BIGINT;
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

  -- Revert the ONE origin enrollment this request transferred out. Pre-127
  -- requests fall back to the most recent single candidate — never the whole
  -- transfer history, which is what this migration exists to stop.
  v_origin_enrollment_id := COALESCE(
    v_request.origin_enrollment_id,
    (SELECT e.id FROM procurements.sms_enrollments e
      WHERE e.student_id = v_request.student_id
        AND e.school_id = v_request.origin_school_id
        AND e.status = 'approved'
        AND e.enrollment_status = 'transferred_out'
      ORDER BY e.school_year DESC, e.created_at DESC LIMIT 1)
  );

  UPDATE procurements.sms_enrollments
  SET enrollment_status = 'active', updated_at = NOW()
  WHERE id = v_origin_enrollment_id
    AND status = 'approved'
    AND enrollment_status = 'transferred_out';

  -- Revert student record to origin school
  UPDATE procurements.sms_students
  SET enrollment_status = 'enrolled',
      school_id = v_request.origin_school_id,
      current_section_id = NULL
  WHERE id = v_request.student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION procurements.remove_transfer_student TO authenticated;
