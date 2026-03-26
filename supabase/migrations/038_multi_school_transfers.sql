-- ============================================================================
-- 038: Multi-School Student Records & Transfer System
-- ============================================================================
-- Adds enrollment lifecycle status, record requests table, cross-school
-- LRN lookup, and atomic transfer enrollment RPCs.
-- This migration is fully additive — no existing columns or tables are dropped.
-- ============================================================================

-- ============================================================================
-- 1A. Add columns to sms_enrollments
-- ============================================================================

ALTER TABLE procurements.sms_enrollments
  ADD COLUMN IF NOT EXISTS enrollment_status TEXT NOT NULL DEFAULT 'active'
  CHECK (enrollment_status IN ('active', 'completed', 'transferred_out', 'dropped', 'pending_transfer'));

ALTER TABLE procurements.sms_enrollments
  ADD COLUMN IF NOT EXISTS origin_school_id BIGINT REFERENCES procurements.sms_schools(id) ON DELETE SET NULL;

ALTER TABLE procurements.sms_enrollments
  ADD COLUMN IF NOT EXISTS record_request_id BIGINT;

-- ============================================================================
-- 1B. Create sms_record_requests table
-- ============================================================================

CREATE TABLE IF NOT EXISTS procurements.sms_record_requests (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES procurements.sms_students(id) ON DELETE CASCADE,
  student_lrn TEXT NOT NULL,
  requesting_school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  origin_school_id BIGINT NOT NULL REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  target_grade_level INTEGER CHECK (target_grade_level >= 0 AND target_grade_level <= 12),
  target_school_year TEXT,
  requested_by BIGINT NOT NULL REFERENCES procurements.sms_users(id),
  approved_by BIGINT REFERENCES procurements.sms_users(id),
  remarks TEXT,
  rejection_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate pending requests for same student between same schools
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_record_requests_pending_unique
  ON procurements.sms_record_requests(student_id, requesting_school_id, origin_school_id)
  WHERE status = 'pending';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_sms_record_requests_student ON procurements.sms_record_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_sms_record_requests_requesting_school ON procurements.sms_record_requests(requesting_school_id);
CREATE INDEX IF NOT EXISTS idx_sms_record_requests_origin_school ON procurements.sms_record_requests(origin_school_id);
CREATE INDEX IF NOT EXISTS idx_sms_record_requests_status ON procurements.sms_record_requests(status);
CREATE INDEX IF NOT EXISTS idx_sms_record_requests_lrn ON procurements.sms_record_requests(student_lrn);

-- FK from enrollments → record_requests
ALTER TABLE procurements.sms_enrollments
  ADD CONSTRAINT fk_enrollments_record_request
  FOREIGN KEY (record_request_id) REFERENCES procurements.sms_record_requests(id) ON DELETE SET NULL;

-- Updated_at trigger
CREATE TRIGGER update_sms_record_requests_updated_at
  BEFORE UPDATE ON procurements.sms_record_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE procurements.sms_record_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 1C. Enrollment indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sms_enrollments_enrollment_status
  ON procurements.sms_enrollments(enrollment_status);

CREATE INDEX IF NOT EXISTS idx_sms_enrollments_active_school
  ON procurements.sms_enrollments(school_id, enrollment_status)
  WHERE enrollment_status = 'active';

CREATE INDEX IF NOT EXISTS idx_sms_enrollments_school_active_student
  ON procurements.sms_enrollments(school_id, student_id)
  WHERE status = 'approved' AND enrollment_status = 'active';

-- ============================================================================
-- 1D. Backfill existing data
-- ============================================================================

-- Transferred students: latest enrollment → 'transferred_out'
UPDATE procurements.sms_enrollments e
SET enrollment_status = 'transferred_out'
FROM procurements.sms_students s
WHERE e.student_id = s.id
  AND s.enrollment_status = 'transferred'
  AND e.status = 'approved'
  AND e.id = (
    SELECT e2.id FROM procurements.sms_enrollments e2
    WHERE e2.student_id = s.id AND e2.status = 'approved'
    ORDER BY e2.school_year DESC, e2.created_at DESC LIMIT 1
  );

-- Graduated students: latest enrollment → 'completed'
UPDATE procurements.sms_enrollments e
SET enrollment_status = 'completed'
FROM procurements.sms_students s
WHERE e.student_id = s.id
  AND s.enrollment_status = 'graduated'
  AND e.status = 'approved'
  AND e.id = (
    SELECT e2.id FROM procurements.sms_enrollments e2
    WHERE e2.student_id = s.id AND e2.status = 'approved'
    ORDER BY e2.school_year DESC, e2.created_at DESC LIMIT 1
  );

-- Dropped students: latest enrollment → 'dropped'
UPDATE procurements.sms_enrollments e
SET enrollment_status = 'dropped'
FROM procurements.sms_students s
WHERE e.student_id = s.id
  AND s.enrollment_status = 'dropped'
  AND e.status = 'approved'
  AND e.id = (
    SELECT e2.id FROM procurements.sms_enrollments e2
    WHERE e2.student_id = s.id AND e2.status = 'approved'
    ORDER BY e2.school_year DESC, e2.created_at DESC LIMIT 1
  );

-- Backfill origin_school_id from the enrollment's own school_id
UPDATE procurements.sms_enrollments
SET origin_school_id = school_id
WHERE origin_school_id IS NULL AND school_id IS NOT NULL;

-- ============================================================================
-- 1E. RLS Policies on sms_record_requests
-- ============================================================================

CREATE POLICY "Record requests viewable by involved schools"
  ON procurements.sms_record_requests FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      requesting_school_id = (SELECT school_id FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1)
      OR origin_school_id = (SELECT school_id FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1)
      OR (SELECT type FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1) = 'division_admin'
    )
  );

CREATE POLICY "Record requests insertable by school staff"
  ON procurements.sms_record_requests FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND requesting_school_id = (SELECT school_id FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "Record requests updatable by origin school"
  ON procurements.sms_record_requests FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND (
      origin_school_id = (SELECT school_id FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1)
      OR (SELECT type FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1) = 'division_admin'
    )
  );

CREATE POLICY "Record requests deletable by division admin"
  ON procurements.sms_record_requests FOR DELETE
  USING (
    (SELECT type FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1) = 'division_admin'
  );

-- ============================================================================
-- 1F. RPC Functions
-- ============================================================================

-- Cross-school LRN lookup (limited preview)
CREATE OR REPLACE FUNCTION procurements.lookup_student_by_lrn(p_lrn TEXT)
RETURNS TABLE (
  student_id BIGINT, lrn TEXT, first_name TEXT, last_name TEXT,
  middle_name TEXT, suffix TEXT, date_of_birth DATE, gender TEXT,
  current_school_id BIGINT, current_school_name TEXT,
  current_grade_level INTEGER, current_school_year TEXT, enrollment_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.lrn, s.first_name, s.last_name, s.middle_name, s.suffix,
    s.date_of_birth, s.gender, e.school_id, sch.name,
    e.grade_level, e.school_year, e.enrollment_status
  FROM procurements.sms_students s
  LEFT JOIN LATERAL (
    SELECT e2.school_id, e2.grade_level, e2.school_year, e2.enrollment_status
    FROM procurements.sms_enrollments e2
    WHERE e2.student_id = s.id AND e2.status = 'approved'
    ORDER BY e2.school_year DESC, e2.created_at DESC LIMIT 1
  ) e ON TRUE
  LEFT JOIN procurements.sms_schools sch ON sch.id = e.school_id
  WHERE s.lrn = p_lrn;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Atomic: enroll transferee + create record request in one transaction
CREATE OR REPLACE FUNCTION procurements.enroll_student_with_record_request(
  p_student_id BIGINT, p_requesting_school_id BIGINT, p_requested_by BIGINT,
  p_section_id BIGINT, p_grade_level INTEGER, p_school_year TEXT,
  p_semester INTEGER DEFAULT NULL, p_remarks TEXT DEFAULT NULL
) RETURNS TABLE (enrollment_id BIGINT, request_id BIGINT) AS $$
DECLARE
  v_origin_school_id BIGINT; v_student_lrn TEXT;
  v_enrollment_id BIGINT; v_request_id BIGINT;
BEGIN
  SELECT s.lrn INTO v_student_lrn FROM procurements.sms_students s WHERE s.id = p_student_id;
  IF v_student_lrn IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;

  SELECT e.school_id INTO v_origin_school_id
  FROM procurements.sms_enrollments e
  WHERE e.student_id = p_student_id AND e.status = 'approved'
    AND e.enrollment_status IN ('active', 'completed')
  ORDER BY e.school_year DESC, e.created_at DESC LIMIT 1;

  IF v_origin_school_id IS NULL THEN RAISE EXCEPTION 'Student has no active enrollment'; END IF;
  IF v_origin_school_id = p_requesting_school_id THEN RAISE EXCEPTION 'Student already at this school'; END IF;

  -- Create record request
  INSERT INTO procurements.sms_record_requests (
    student_id, student_lrn, requesting_school_id, origin_school_id,
    requested_by, target_grade_level, target_school_year, remarks
  ) VALUES (
    p_student_id, v_student_lrn, p_requesting_school_id, v_origin_school_id,
    p_requested_by, p_grade_level, p_school_year, p_remarks
  ) RETURNING id INTO v_request_id;

  -- Mark origin enrollment as pending_transfer
  UPDATE procurements.sms_enrollments
  SET enrollment_status = 'pending_transfer'
  WHERE student_id = p_student_id AND school_id = v_origin_school_id
    AND status = 'approved' AND enrollment_status = 'active';

  -- Create new enrollment at requesting school (status = 'pending' until record approved)
  INSERT INTO procurements.sms_enrollments (
    student_id, school_id, section_id, grade_level, school_year, semester,
    status, enrollment_status, origin_school_id, record_request_id, enrolled_by
  ) VALUES (
    p_student_id, p_requesting_school_id, p_section_id, p_grade_level, p_school_year,
    p_semester, 'pending', 'active', v_origin_school_id, v_request_id, p_requested_by
  ) RETURNING id INTO v_enrollment_id;

  -- Update student school_id for backward compat
  UPDATE procurements.sms_students
  SET school_id = p_requesting_school_id, enrollment_status = 'enrolled',
      grade_level = p_grade_level, current_section_id = p_section_id
  WHERE id = p_student_id;

  RETURN QUERY SELECT v_enrollment_id, v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create record request (standalone)
CREATE OR REPLACE FUNCTION procurements.create_record_request(
  p_student_id BIGINT, p_requesting_school_id BIGINT, p_requested_by BIGINT,
  p_target_grade_level INTEGER DEFAULT NULL, p_target_school_year TEXT DEFAULT NULL,
  p_remarks TEXT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_origin_school_id BIGINT; v_student_lrn TEXT; v_request_id BIGINT;
BEGIN
  SELECT s.lrn INTO v_student_lrn FROM procurements.sms_students s WHERE s.id = p_student_id;
  IF v_student_lrn IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;

  SELECT e.school_id INTO v_origin_school_id
  FROM procurements.sms_enrollments e
  WHERE e.student_id = p_student_id AND e.status = 'approved'
    AND e.enrollment_status IN ('active', 'completed')
  ORDER BY e.school_year DESC, e.created_at DESC LIMIT 1;

  IF v_origin_school_id IS NULL THEN RAISE EXCEPTION 'Student has no active enrollment'; END IF;
  IF v_origin_school_id = p_requesting_school_id THEN RAISE EXCEPTION 'Cannot request from same school'; END IF;

  INSERT INTO procurements.sms_record_requests (
    student_id, student_lrn, requesting_school_id, origin_school_id,
    requested_by, target_grade_level, target_school_year, remarks
  ) VALUES (
    p_student_id, v_student_lrn, p_requesting_school_id, v_origin_school_id,
    p_requested_by, p_target_grade_level, p_target_school_year, p_remarks
  ) RETURNING id INTO v_request_id;

  UPDATE procurements.sms_enrollments
  SET enrollment_status = 'pending_transfer'
  WHERE student_id = p_student_id AND school_id = v_origin_school_id
    AND status = 'approved' AND enrollment_status = 'active';

  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Approve or reject record request
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
      rejection_reason = CASE WHEN p_action = 'rejected' THEN p_rejection_reason ELSE NULL END
  WHERE id = p_request_id;

  IF p_action = 'approved' THEN
    -- Mark origin enrollment as transferred_out
    UPDATE procurements.sms_enrollments
    SET enrollment_status = 'transferred_out', updated_at = NOW()
    WHERE student_id = v_request.student_id AND school_id = v_request.origin_school_id
      AND status = 'approved' AND enrollment_status IN ('active', 'pending_transfer');

    -- Approve the pending enrollment at the requesting school
    UPDATE procurements.sms_enrollments
    SET status = 'approved', updated_at = NOW()
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

-- Cancel record request (by requesting school)
CREATE OR REPLACE FUNCTION procurements.cancel_record_request(
  p_request_id BIGINT, p_user_id BIGINT
) RETURNS VOID AS $$
DECLARE v_request RECORD;
BEGIN
  SELECT * INTO v_request FROM procurements.sms_record_requests
  WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already processed'; END IF;

  UPDATE procurements.sms_record_requests SET status = 'cancelled' WHERE id = p_request_id;

  -- Revert origin enrollment to active
  UPDATE procurements.sms_enrollments
  SET enrollment_status = 'active', updated_at = NOW()
  WHERE student_id = v_request.student_id AND school_id = v_request.origin_school_id
    AND status = 'approved' AND enrollment_status = 'pending_transfer';

  -- Remove the pending enrollment at the requesting school
  DELETE FROM procurements.sms_enrollments
  WHERE record_request_id = p_request_id AND status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get current school for a student
CREATE OR REPLACE FUNCTION procurements.get_student_current_school(p_student_id BIGINT)
RETURNS BIGINT AS $$
  SELECT e.school_id FROM procurements.sms_enrollments e
  WHERE e.student_id = p_student_id AND e.status = 'approved' AND e.enrollment_status = 'active'
  ORDER BY e.school_year DESC, e.created_at DESC LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- 1G. Deprecate sms_students.school_id (comment only, column kept)
-- ============================================================================

COMMENT ON COLUMN procurements.sms_students.school_id
  IS 'DEPRECATED - Use sms_enrollments for school relationship. Kept for backward compatibility.';

COMMENT ON TABLE procurements.sms_record_requests
  IS 'Inter-school student record transfer requests. Created when a school enrolls a transferee.';

-- ============================================================================
-- 1H. Grant permissions
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_record_requests TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_record_requests_id_seq TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.lookup_student_by_lrn TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.enroll_student_with_record_request TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.create_record_request TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.respond_to_record_request TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.cancel_record_request TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.get_student_current_school TO authenticated;
