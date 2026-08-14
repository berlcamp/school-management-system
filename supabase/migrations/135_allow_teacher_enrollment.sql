-- ============================================================================
-- Migration 135: teachers may enrol learners
-- ============================================================================
--
-- APPLY AFTER 130, which created assert_enrollment_staff().
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
--
-- 130 locked the two enrollment RPCs to a roster copied from STAFF_TYPES in
-- lib/requests/auth.ts, on the stated assumption that "teachers and tutors have
-- their own workflows and never enrol". In this division they do enrol: the
-- Teacher Menu has carried an Enrollment entry to the full staff module since
-- the first commit (components/AppSidebar.tsx, `teacherItems`), the page has no
-- role gate, and migration 131's RLS already lets any active staff member —
-- teachers included — insert an enrollment row for their own school. So a
-- teacher could already enrol a brand-new or existing same-school learner
-- through the wizard's direct INSERT path, and was refused only on the two
-- paths that go through an RPC:
--
--   enroll_student_with_record_request  → transferee from another school
--   enroll_students_atomic              → bulk re-enrol of promoted/retained
--
-- The same page therefore worked for one kind of enrollment and raised
-- "Your role (teacher) may not enrol learners." for another. This aligns the
-- RPC roster with what RLS and the UI already permit.
--
-- ---------------------------------------------------------------------------
-- What this does NOT relax
-- ---------------------------------------------------------------------------
--
-- Only the role list changes. Everything else 130 established stands:
--
--   * the acting staff member is still resolved from auth.uid(), never from
--     the caller's arguments — a teacher cannot enrol as somebody else;
--   * a teacher is school-scoped, so the branch below still refuses a
--     mismatched or NULL p_school_id: they may enrol only at the school in
--     their own sms_users.school_id (which is the active school, per 134);
--   * enrolled_by / approved_by are still overwritten with the resolved
--     caller, so the audit trail records the teacher who actually did it;
--   * `tutor` stays out. A tutor is an ARAL volunteer with no enrolment duty,
--     and a staff member who also tutors carries `is_tutor` on their real
--     role rather than logging in as one.
--
-- STAFF_TYPES in lib/requests/auth.ts is deliberately left alone: that roster
-- governs who may work the *requests queue* (approving another school's record
-- request, document requests), which is registrar/school-head work. A teacher
-- enrolling a transferee still opens the outgoing record request — the RPC does
-- that internally — but acting on the queue remains staff-only.
--
-- ---------------------------------------------------------------------------
-- Blast radius
-- ---------------------------------------------------------------------------
--
-- Replaces 1 function. Creates no table, drops nothing, and modifies NO ROWS —
-- there is no DML in this file. Idempotent; re-running is a no-op.
--
-- Reversible by re-running 130's definition of this function verbatim.
-- ============================================================================

CREATE OR REPLACE FUNCTION procurements.assert_enrollment_staff(p_school_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_staff procurements.sms_users;
BEGIN
  IF procurements.is_service_role() THEN
    RETURN NULL;
  END IF;

  v_staff := procurements.current_staff();

  IF v_staff.id IS NULL THEN
    RAISE EXCEPTION
      'Not signed in as an active staff member.'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  -- 130's roster plus 'teacher' — see the header. Tutors are still refused.
  IF v_staff.type NOT IN (
    'school_head', 'assistant_school_head', 'admin', 'registrar', 'librarian',
    'teacher',
    'super admin', 'division_admin', 'division_type'
  ) THEN
    RAISE EXCEPTION
      'Your role (%) may not enrol learners.', v_staff.type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Division-level staff act across schools. A super admin is here rather than
  -- in the school-matched branch because AuthGuard replaces their school_id
  -- with their active-school override (the 113 precedent).
  IF v_staff.type IN ('division_admin', 'division_type', 'super admin') THEN
    RETURN v_staff.id;
  END IF;

  -- Teachers land here: school-scoped like every other school-level role.
  IF p_school_id IS NULL OR v_staff.school_id IS DISTINCT FROM p_school_id THEN
    RAISE EXCEPTION
      'You may only enrol learners at your own school (yours: %, requested: %).',
      COALESCE(v_staff.school_id::TEXT, 'none'),
      COALESCE(p_school_id::TEXT, 'none')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_staff.id;
END;
$$;

COMMENT ON FUNCTION procurements.assert_enrollment_staff IS
  'The signed-in staff member''s sms_users.id when they may enrol for p_school_id, else raises. Roster includes teacher (135); tutors and deactivated accounts are refused. NULL for the service role, which authorises upstream.';

GRANT EXECUTE ON FUNCTION procurements.assert_enrollment_staff(BIGINT) TO authenticated, service_role;
