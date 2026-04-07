-- Atomic bulk enrollment for promoted/retained students.
--
-- Replaces the previous client-side flow in EnrollStudentsTabContent.tsx that
-- (1) inserted new enrollments and (2) separately marked the old promoted
-- enrollments as 'completed'. If the second step failed (network blip, crash)
-- the system was left with stale 'promoted' rows that re-appeared in the
-- enrollment lists indefinitely.
--
-- This RPC performs both operations in a single transaction. It also marks
-- prior 'retained' enrollments as 'completed' when re-enrolling them, which
-- eliminates duplicate retained rows.
--
-- Inputs:
--   p_records       jsonb[]  – array of new enrollment rows to insert
--   p_source_ids    bigint[] – ids of the prior enrollments to mark completed
--   p_school_id     bigint   – tenant guard; both inserts and updates are
--                              constrained to this school. Pass NULL only for
--                              division-admin (cross-school) callers.
--
-- Returns: { inserted: int, skipped: int }
--
-- Skips rows that violate uq_enrollments_student_school_year (already enrolled
-- for the target school year) and reports them in `skipped`.

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
BEGIN
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
        (v_record->>'enrolled_by')::bigint,
        (v_record->>'approved_by')::bigint,
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

GRANT EXECUTE ON FUNCTION procurements.enroll_students_atomic(jsonb, bigint[], bigint)
  TO authenticated;
