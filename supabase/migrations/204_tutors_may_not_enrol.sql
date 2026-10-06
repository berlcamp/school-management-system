-- =============================================================================
-- 204: ARAL tutors may not enrol learners
-- =============================================================================
--
-- A pure ARAL tutor (`sms_users.type = 'tutor'`, created by the Add Tutor
-- modal so they can log in to the tutor workspace) has no Enrollment menu, but
-- could type `/enrollment` and enrol a new or existing same-school learner:
-- `can_write_enrollment` (131 → 139), which backs the three write policies on
-- `sms_enrollments`, admits every active user at the school except a
-- `volunteer_teacher`. The two enrolment RPCs were already closed to tutors —
-- `assert_enrollment_staff` admits a fixed roster that never named `tutor` —
-- so only the wizard's direct INSERT/UPDATE/DELETE path was open.
--
-- This refuses `tutor` in `can_write_enrollment` exactly as 139 refused
-- `volunteer_teacher`. A teacher or staff member who ALSO tutors keeps their
-- own `type` (their tutor access is the `is_tutor` flag AuthGuard derives from
-- `sms_aral_tutors`), so nobody else's access changes.
-- App twin: `ENROLLMENT_BLOCKED_USER_TYPES` in lib/constants/userTypes.ts,
-- which now makes `/enrollment` render ModuleAccessDenied for a tutor.
--
-- Same signature and return type as the live function, so a plain
-- CREATE OR REPLACE keeps its grants and the policies that call it. The body
-- is the live one from the local clone with only the type test widened.
--
-- ROWS TOUCHED: none. One function replaced; no table, policy, trigger or DML.
-- Enrolments a tutor may already have written are not touched. To see them:
--
--   SELECT e.id, e.school_id, e.school_year, u.name AS enrolled_by
--   FROM procurements.sms_enrollments e
--   JOIN procurements.sms_users u ON u.id::text = e.enrolled_by::text
--   WHERE u.type = 'tutor';
-- =============================================================================

CREATE OR REPLACE FUNCTION procurements.can_write_enrollment(p_school_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM procurements.sms_users u
    WHERE u.user_id = auth.uid()
      AND u.is_active
      AND u.type IS DISTINCT FROM 'volunteer_teacher'
      AND u.type IS DISTINCT FROM 'tutor'
      AND (
        u.type IN ('division_admin', 'division_type', 'super admin')
        OR u.school_id = p_school_id
      )
  );
$$;
