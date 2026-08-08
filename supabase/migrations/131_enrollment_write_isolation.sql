-- ============================================================================
-- Migration 131: school isolation for enrollment WRITES
-- ============================================================================
--
-- APPLY AFTER 130 (it reuses assert_enrollment_staff).
--
-- ---------------------------------------------------------------------------
-- What is wrong today
-- ---------------------------------------------------------------------------
--
-- Migration 001 shipped sms_enrollments with four placeholder policies, under a
-- comment that says so: "Basic policies (adjust based on your security
-- requirements) — These are permissive policies".
--
--   Enrollments are viewable  by authenticated users  SELECT  USING (auth.role() = 'authenticated')
--   Enrollments are insertable by admins              INSERT  WITH CHECK (auth.role() = 'authenticated')
--   Enrollments are updatable  by admins              UPDATE  USING (auth.role() = 'authenticated')
--   Enrollments are deletable  by admins              DELETE  USING (auth.role() = 'authenticated')
--
-- Despite the names, none of them checks a role or a school: the only condition
-- is "is signed in". The anon key ships in the browser bundle, so any account in
-- the division — a teacher, a librarian, a clerk at another school — can insert,
-- rewrite or DELETE any enrollment row belonging to any school, straight through
-- PostgREST, without going near the application.
--
-- Migration 130 closed the RPC route into this table. This closes the table
-- itself, which is the larger of the two: the RPCs were a door, this is the wall
-- they were set in.
--
-- ---------------------------------------------------------------------------
-- Scope: writes only, deliberately
-- ---------------------------------------------------------------------------
--
-- SELECT is left exactly as it is. Read paths are numerous (dashboards, SF1-SF10,
-- KPI's SECURITY INVOKER RPCs, grade monitoring, the teacher pages, the transfer
-- record viewer via 057's has_record_access policy), and tightening reads without
-- auditing every one of them risks blanking a report rather than corrupting data.
-- Writes are where the damage is, and the app already filters them by school, so
-- this stage matches what the code does today. Reads are a follow-up.
--
-- ---------------------------------------------------------------------------
-- What still works
-- ---------------------------------------------------------------------------
--
--   * every school-scoped write the app makes — the wizard, ChangeStatusModal,
--     PromoteStudentModal, RetainNlisModal, TransferOutModal and the auto-enroll
--     rollback all act on rows of the caller's own school;
--   * the transfer RPCs, which are SECURITY DEFINER and run as the owner, so RLS
--     does not apply inside them (that is how a learner's row at the ORIGIN
--     school is still moved to transferred_out);
--   * the service-role client used by the server actions, which bypasses RLS;
--   * division_admin / division_type / super admin, who write across schools.
--     Super admin is in that branch rather than school-matched because AuthGuard
--     swaps their school_id for the active-school override (the 113 precedent).
--
-- The one client write this refuses is the enrollment wizard closing a duplicate
-- active enrollment at ANOTHER school. Section 3 below replaces it with a
-- definer function that authorises the caller first; the wizard is changed to
-- call it in the same commit.
--
-- ---------------------------------------------------------------------------
-- Blast radius
-- ---------------------------------------------------------------------------
--
-- Drops 3 policies, creates 3 policies, creates 2 functions. Creates no table,
-- drops no column, and modifies NO ROWS — there is no DML in this file.
-- Reversible by re-creating the three policies from 001.
--
-- Before applying, count enrollments with no school_id. Such a row can only be
-- written by division staff afterwards, because a school match against NULL is
-- never true:
--
--   SELECT count(*) FROM procurements.sms_enrollments WHERE school_id IS NULL;
--
-- Expect 0. If it is not 0, tell me before applying — those rows need an owner.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Who may write an enrollment belonging to a given school
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so it resolves regardless of how sms_users' own RLS is
-- written, matching can_write_src (113) and current_staff (130).

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
      AND (
        u.type IN ('division_admin', 'division_type', 'super admin')
        OR u.school_id = p_school_id
      )
  );
$$;

COMMENT ON FUNCTION procurements.can_write_enrollment IS
  'True when the signed-in staff member may write an enrollment row owned by p_school_id. Division-level roles write anywhere; everyone else only their own school. NULL p_school_id is division-only.';

GRANT EXECUTE ON FUNCTION procurements.can_write_enrollment(BIGINT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Replace the placeholder write policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Enrollments are insertable by admins" ON procurements.sms_enrollments;
DROP POLICY IF EXISTS "Enrollments are updatable by admins"  ON procurements.sms_enrollments;
DROP POLICY IF EXISTS "Enrollments are deletable by admins"  ON procurements.sms_enrollments;

CREATE POLICY "enrollments_insert_own_school"
  ON procurements.sms_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (procurements.can_write_enrollment(school_id));

-- USING gates which rows may be touched; WITH CHECK gates what they may become,
-- so a row cannot be updated and handed to another school in one statement.
CREATE POLICY "enrollments_update_own_school"
  ON procurements.sms_enrollments FOR UPDATE
  TO authenticated
  USING      (procurements.can_write_enrollment(school_id))
  WITH CHECK (procurements.can_write_enrollment(school_id));

CREATE POLICY "enrollments_delete_own_school"
  ON procurements.sms_enrollments FOR DELETE
  TO authenticated
  USING (procurements.can_write_enrollment(school_id));

-- ---------------------------------------------------------------------------
-- 3. The one legitimate cross-school write, made explicit
-- ---------------------------------------------------------------------------
-- When a learner is re-enrolled at this school for a school year in which they
-- still hold an active enrollment somewhere else, one of the two rows is stale —
-- nobody sits in two schools at once, and leaving both active double-counts the
-- learner in every enrolment figure in the division.
--
-- The wizard used to do this with a direct UPDATE, which the policies above now
-- refuse (correctly: it is a write to another school's row). It is narrow enough
-- to be worth keeping, so here it is as a function that says exactly what it
-- will touch and checks the caller first:
--
--   * the caller must be entitled to enrol at p_keep_school_id (130's rule);
--   * only rows for that ONE learner, that ONE school year, that are active and
--     approved, at a school other than p_keep_school_id;
--   * a remark records why, so the origin school can see what happened.
--
-- It is not a transfer and does not pretend to be: no record request is opened,
-- and the learner's data stays with the origin school. An actual transfer goes
-- through enroll_student_with_record_request.

CREATE OR REPLACE FUNCTION procurements.close_duplicate_enrollment(
  p_student_id     BIGINT,
  p_school_year    TEXT,
  p_keep_school_id BIGINT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_closed INTEGER;
BEGIN
  PERFORM procurements.assert_enrollment_staff(p_keep_school_id);

  IF p_student_id IS NULL OR p_school_year IS NULL OR p_keep_school_id IS NULL THEN
    RAISE EXCEPTION 'close_duplicate_enrollment requires a student, a school year and the school to keep.';
  END IF;

  UPDATE procurements.sms_enrollments
  SET enrollment_status = 'transferred_out',
      remarks = format(
        'Closed automatically — learner re-enrolled at school %s for SY %s.',
        p_keep_school_id, p_school_year),
      updated_at = NOW()
  WHERE student_id = p_student_id
    AND school_year = p_school_year
    AND school_id IS DISTINCT FROM p_keep_school_id
    AND status = 'approved'
    AND enrollment_status = 'active';

  GET DIAGNOSTICS v_closed = ROW_COUNT;
  RETURN v_closed;
END;
$$;

COMMENT ON FUNCTION procurements.close_duplicate_enrollment IS
  'Marks a learner''s active enrollments at OTHER schools for one school year as transferred_out, after checking the caller may enrol at the school being kept. Returns how many rows were closed. Not a transfer — use enroll_student_with_record_request for that.';

GRANT EXECUTE ON FUNCTION procurements.close_duplicate_enrollment(BIGINT, TEXT, BIGINT)
  TO authenticated, service_role;
