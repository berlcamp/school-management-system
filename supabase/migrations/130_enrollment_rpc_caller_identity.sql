-- ============================================================================
-- Migration 130: the enrollment RPCs stop trusting the caller's own claims
-- ============================================================================
--
-- APPLY AFTER 127 (which rewrote enroll_student_with_record_request) and
-- alongside 129, which closed the same hole for the three *record request*
-- RPCs. 129 names this migration as its follow-up:
--
--     "enroll_student_with_record_request is deliberately NOT revoked: the
--      enrollment wizard still calls it directly … It has the same
--      unchecked-caller shape and should get the same treatment in a follow-up."
--
-- ---------------------------------------------------------------------------
-- What is wrong today
-- ---------------------------------------------------------------------------
--
-- Two SECURITY DEFINER functions are granted to `authenticated` and take the
-- acting school and user as ARGUMENTS, with nothing checking either:
--
--   enroll_student_with_record_request(p_student_id, p_requesting_school_id,
--                                      p_requested_by, …)
--   enroll_students_atomic(p_records, p_source_ids, p_school_id)
--
-- A definer function runs as its owner, so RLS never applies inside it. The
-- anon key ships in the browser bundle, so any signed-in account — a teacher, a
-- librarian, a deactivated clerk at another school — can call these directly
-- and:
--
--   * enrol any learner, identified only by id, into any school and section,
--     which also rewrites sms_students.school_id and opens a record request
--     against the learner's real school;
--   * bulk-insert enrollments for another school. enroll_students_atomic even
--     documents a tenant guard — but it compares each record against the
--     p_school_id the CALLER supplied, so passing NULL disables it;
--   * write a false audit trail, since enrolled_by / approved_by are whatever
--     the caller put in the payload.
--
-- ---------------------------------------------------------------------------
-- What replaces it
-- ---------------------------------------------------------------------------
--
-- The acting staff member is resolved inside the function from auth.uid() —
-- the same source 037/038/071/112/113 use in policies, and the same identity
-- lib/requests/auth.ts resolves from the session cookie. The arguments are
-- then treated as assertions, never as facts:
--
--   * school-scoped roles may only act for their OWN school; a mismatched or
--     NULL p_school_id is refused rather than waved through;
--   * division_admin / division_type / super admin keep acting across schools
--     (AuthGuard swaps a super admin's school_id for their active-school
--     override, so a school match would break them — the 113 precedent);
--   * enrolled_by / approved_by are overwritten with the resolved caller, so
--     the audit trail records who actually did it;
--   * teachers, tutors, students and deactivated accounts are refused
--     outright. The permitted set matches STAFF_TYPES in lib/requests/auth.ts.
--
-- The service role is exempt: auth.uid() is NULL for it, and it is only
-- reachable from server code that has already authenticated the caller — the
-- arrangement 129 established. That keeps the door open to move these two
-- calls behind server actions later without touching the SQL again.
--
-- ---------------------------------------------------------------------------
-- Blast radius
-- ---------------------------------------------------------------------------
--
-- Creates 4 functions, replaces 3. Creates no table, drops nothing, and
-- modifies NO ROWS — there is no DML in this file.
--
-- One behavioural consequence worth stating plainly: if any account has been
-- enrolling learners for a school other than its own — a super admin whose
-- override is not set, a clerk covering for a neighbouring school — that stops
-- working and returns "You may only enrol learners at your own school". That
-- is the point of the migration, but it is the kind of thing that surfaces on
-- a Monday morning, so check before applying:
--
--   SELECT u.type, u.school_id AS user_school, e.school_id AS enrolled_into,
--          count(*)
--   FROM procurements.sms_enrollments e
--   JOIN procurements.sms_users u ON u.id = e.enrolled_by
--   WHERE e.created_at > NOW() - INTERVAL '1 year'
--     AND u.school_id IS DISTINCT FROM e.school_id
--     AND u.type NOT IN ('division_admin','division_type','super admin')
--   GROUP BY 1,2,3 ORDER BY 4 DESC;
--
-- Rows here are cross-school enrolments by school-scoped staff. Expect none.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Caller identity helpers
-- ---------------------------------------------------------------------------

-- True when the request carries the service-role JWT. Read from the request
-- claims rather than current_user, which inside a SECURITY DEFINER function is
-- the function's OWNER and says nothing about who called it.
CREATE OR REPLACE FUNCTION procurements.is_service_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;

COMMENT ON FUNCTION procurements.is_service_role IS
  'True when the caller presented the service-role key. Server code that has already authenticated the acting user, per the lib/requests/auth.ts pattern.';

-- The signed-in staff member's sms_users row, or NULL.
CREATE OR REPLACE FUNCTION procurements.current_staff()
RETURNS procurements.sms_users
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT u.*
  FROM procurements.sms_users u
  WHERE u.user_id = auth.uid()
    AND u.is_active
  LIMIT 1;
$$;

COMMENT ON FUNCTION procurements.current_staff IS
  'The active sms_users row behind auth.uid(), or NULL. SECURITY DEFINER so it resolves regardless of how sms_users RLS is written.';

-- Any active staff member. Returns their sms_users.id, or NULL for the
-- service role (which authorises for itself upstream).
CREATE OR REPLACE FUNCTION procurements.assert_staff()
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

  RETURN v_staff.id;
END;
$$;

-- Staff who may enrol, for the school they are enrolling into.
-- Returns their sms_users.id, or NULL for the service role.
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

  -- Same roster as STAFF_TYPES in lib/requests/auth.ts. Teachers and tutors
  -- have their own workflows and never enrol.
  IF v_staff.type NOT IN (
    'school_head', 'assistant_school_head', 'admin', 'registrar', 'librarian',
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

GRANT EXECUTE ON FUNCTION procurements.is_service_role()               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.current_staff()                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.assert_staff()                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.assert_enrollment_staff(BIGINT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. enroll_students_atomic — derive the tenant guard, don't accept it
-- ---------------------------------------------------------------------------
-- Body is otherwise 061's, with 061's comments kept.

CREATE OR REPLACE FUNCTION procurements.enroll_students_atomic(
  p_records    jsonb,
  p_source_ids bigint[],
  p_school_id  bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_record         jsonb;
  v_inserted       int := 0;
  v_skipped        int := 0;
  v_record_school  bigint;
  v_caller_id      bigint;
BEGIN
  -- Refuses the caller outright unless they may enrol for p_school_id. A
  -- school-scoped caller passing NULL — the old way to switch the guard below
  -- off — is refused here.
  v_caller_id := procurements.assert_enrollment_staff(p_school_id);

  IF p_records IS NULL OR jsonb_array_length(p_records) = 0 THEN
    RETURN jsonb_build_object('inserted', 0, 'skipped', 0);
  END IF;

  -- Insert new enrollments one by one so a single duplicate doesn't abort
  -- the whole batch. Each iteration shares the same outer transaction, so
  -- the subsequent UPDATE below remains atomic with the inserts.
  FOR v_record IN SELECT * FROM jsonb_array_elements(p_records)
  LOOP
    -- Tenant guard: every record must belong to the caller's school
    -- (or have school_id NULL when caller is division-admin / NULL).
    v_record_school := NULLIF(v_record->>'school_id', '')::bigint;
    IF p_school_id IS NOT NULL AND v_record_school IS DISTINCT FROM p_school_id THEN
      RAISE EXCEPTION 'school_id mismatch in enrollment record (expected %, got %)',
        p_school_id, v_record_school;
    END IF;

    BEGIN
      INSERT INTO procurements.sms_enrollments (
        student_id, section_id, school_year, grade_level, semester,
        enrollment_date, status, enrollment_status,
        enrolled_by, approved_by, school_id
      )
      VALUES (
        (v_record->>'student_id')::bigint,
        (v_record->>'section_id')::bigint,
        v_record->>'school_year',
        (v_record->>'grade_level')::int,
        NULLIF(v_record->>'semester','')::int,
        (v_record->>'enrollment_date')::date,
        v_record->>'status',
        v_record->>'enrollment_status',
        -- Who did this is resolved from the session, not taken from the
        -- payload, so the audit trail cannot be forged. The payload value is
        -- the fallback only for service-role callers.
        COALESCE(v_caller_id, (v_record->>'enrolled_by')::bigint),
        COALESCE(v_caller_id, (v_record->>'approved_by')::bigint),
        v_record_school
      );
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Already enrolled for the target school year — skip silently.
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  -- Mark the prior promoted/retained enrollments as completed. Constrained
  -- by school_id so a forged source id from another school cannot be
  -- mutated through this RPC.
  IF p_source_ids IS NOT NULL AND array_length(p_source_ids, 1) > 0 THEN
    UPDATE procurements.sms_enrollments
    SET enrollment_status = 'completed'
    WHERE id = ANY(p_source_ids)
      AND enrollment_status IN ('promoted', 'retained')
      AND (p_school_id IS NULL OR school_id = p_school_id);
  END IF;

  RETURN jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. enroll_student_with_record_request — same treatment
-- ---------------------------------------------------------------------------
-- Body is 127's, with 127's comments kept; p_requested_by becomes a fallback
-- for the service role rather than the source of truth.

CREATE OR REPLACE FUNCTION procurements.enroll_student_with_record_request(
  p_student_id BIGINT, p_requesting_school_id BIGINT, p_requested_by BIGINT,
  p_section_id BIGINT, p_grade_level INTEGER, p_school_year TEXT,
  p_semester INTEGER DEFAULT NULL, p_remarks TEXT DEFAULT NULL
) RETURNS TABLE (enrollment_id BIGINT, request_id BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_origin_school_id BIGINT; v_student_lrn TEXT;
  v_enrollment_id BIGINT; v_request_id BIGINT;
  v_origin_status TEXT;
  v_origin_enrollment_id BIGINT;
  v_existing_enrollment_id BIGINT;
  v_actor_id BIGINT;
BEGIN
  -- The learner is moved between schools and their sms_students.school_id is
  -- rewritten, so establish who is asking before anything else happens.
  v_actor_id := COALESCE(
    procurements.assert_enrollment_staff(p_requesting_school_id),
    p_requested_by
  );

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
    v_origin_enrollment_id, v_actor_id, p_grade_level, p_school_year, p_remarks
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
        enrolled_by = v_actor_id, approved_by = v_actor_id,
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
      v_actor_id, v_actor_id
    ) RETURNING id INTO v_enrollment_id;
  END IF;

  -- Update student record
  UPDATE procurements.sms_students
  SET school_id = p_requesting_school_id, enrollment_status = 'enrolled',
      grade_level = p_grade_level, current_section_id = p_section_id
  WHERE id = p_student_id;

  RETURN QUERY SELECT v_enrollment_id, v_request_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. lookup_student_by_lrn — staff only
-- ---------------------------------------------------------------------------
-- Body is 042's. This one is a read, but a SECURITY DEFINER read that returns
-- a named learner's date of birth and school for any LRN in the division, to
-- anyone holding the anon key and any account at all. Cross-school visibility
-- is the point (it is how a transferee is recognised), so the check is only
-- that the caller is an active staff member, with no school match.

CREATE OR REPLACE FUNCTION procurements.lookup_student_by_lrn(p_lrn TEXT)
RETURNS TABLE (
  student_id BIGINT, lrn TEXT, first_name TEXT, last_name TEXT,
  middle_name TEXT, suffix TEXT, date_of_birth DATE, gender TEXT,
  current_school_id BIGINT, current_school_name TEXT,
  current_grade_level INTEGER, current_school_year TEXT, enrollment_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  PERFORM procurements.assert_staff();

  RETURN QUERY
  SELECT s.id, s.lrn, s.first_name, s.last_name, s.middle_name, s.suffix,
    s.date_of_birth, s.gender,
    COALESCE(e.school_id, s.school_id),
    COALESCE(sch_e.name, sch_s.name),
    e.grade_level, e.school_year, e.enrollment_status
  FROM procurements.sms_students s
  LEFT JOIN LATERAL (
    SELECT e2.school_id, e2.grade_level, e2.school_year, e2.enrollment_status
    FROM procurements.sms_enrollments e2
    WHERE e2.student_id = s.id AND e2.status = 'approved'
    ORDER BY e2.school_year DESC, e2.created_at DESC LIMIT 1
  ) e ON TRUE
  LEFT JOIN procurements.sms_schools sch_e ON sch_e.id = e.school_id
  LEFT JOIN procurements.sms_schools sch_s ON sch_s.id = s.school_id
  WHERE s.lrn = p_lrn;
END;
$$;

-- Grants are preserved by CREATE OR REPLACE; restated so the intended reach of
-- each function is visible in one place.
GRANT EXECUTE ON FUNCTION procurements.enroll_students_atomic(jsonb, bigint[], bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.enroll_student_with_record_request(BIGINT, BIGINT, BIGINT, BIGINT, INTEGER, TEXT, INTEGER, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.lookup_student_by_lrn(TEXT) TO authenticated, service_role;
