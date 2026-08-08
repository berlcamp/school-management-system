-- Graduation lock: close the reactivation bypass, and stop blocking the
-- Grade 6 → Grade 7 / Grade 10 → Grade 11 progression.
--
-- Two defects in migration 062's enforce_graduation_lock():
--
-- (1) IT NEVER SAW UPDATEs.
--     The function returns early for anything that is not an INSERT, but both
--     re-enrolment paths reactivate an existing row with an UPDATE:
--       * EnrollmentWizard's "existing student" branch finds a stale enrollment
--         at this school for the target school year — its stale list included
--         'graduated' — and flips it to active.
--       * enroll_student_with_record_request (066) reactivates any existing row
--         at the requesting school for that school year, whatever its status.
--     A completer could be put back on the active roster with no error at all.
--
-- (2) IT WAS TOO BROAD.
--     lib/constants/enrollment.ts treats Grades 6, 10 and 12 as terminal, so
--     PromoteStudentModal writes 'graduated' for an elementary or JHS completer
--     — and 062 then refused to let that learner enrol in Grade 7 or Grade 11
--     ANYWHERE, at any school, in any later year: 'Student % has already
--     graduated and cannot be re-enrolled.' Only Grade 12 is genuinely an exit
--     from K-12.
--
-- The rule this replaces both with: a graduation may never be walked backwards.
-- A new or reactivated on-the-roster enrollment is refused when it would put
-- the learner at or below a grade level they already graduated, or in that
-- school year or earlier. Moving forward — the completer's next grade, in a
-- later school year, at any school — is allowed.
--
--   G6 graduated in SY 2025-2026  →  G7 in SY 2026-2027   allowed
--   G6 graduated in SY 2025-2026  →  G6 in SY 2026-2027   blocked (repeat)
--   G6 graduated in SY 2025-2026  →  G6 in SY 2025-2026   blocked (the bypass)
--   G12 graduated                 →  anything             blocked (nothing above 12)
--
-- School years are "YYYY-YYYY", so lexicographic comparison orders them
-- correctly.

CREATE OR REPLACE FUNCTION procurements.enforce_graduation_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_grad_grade       INTEGER;
  v_grad_school_year TEXT;
BEGIN
  -- Only guard transitions INTO an on-the-roster status. Historical rows can
  -- still be corrected in every other direction.
  IF NEW.enrollment_status NOT IN ('active', 'pending_transfer', 'pending_review') THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only fire when the status actually moves. Re-saving an already
  -- active row (section change, grade-level correction) must stay allowed.
  IF TG_OP = 'UPDATE'
     AND OLD.enrollment_status IS NOT DISTINCT FROM NEW.enrollment_status THEN
    RETURN NEW;
  END IF;

  -- The graduation that would be walked backwards, if any. Deliberately NOT
  -- excluding NEW.id: when the row being reactivated IS the graduated one,
  -- that row is exactly the bypass, and BEFORE UPDATE still sees its old
  -- value in the table.
  SELECT e.grade_level, e.school_year
    INTO v_grad_grade, v_grad_school_year
  FROM procurements.sms_enrollments e
  WHERE e.student_id = NEW.student_id
    AND e.status = 'approved'
    AND e.enrollment_status = 'graduated'
    AND (
      NEW.grade_level <= e.grade_level
      OR NEW.school_year <= e.school_year
    )
  ORDER BY e.school_year DESC, e.grade_level DESC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Student % graduated from grade % in SY %. They cannot be enrolled in grade % for SY % — a graduation cannot be walked back.',
      NEW.student_id, v_grad_grade, v_grad_school_year,
      NEW.grade_level, NEW.school_year
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- 062 created the trigger as BEFORE INSERT only; it has to see UPDATEs now.
DROP TRIGGER IF EXISTS trg_enforce_graduation_lock
  ON procurements.sms_enrollments;

CREATE TRIGGER trg_enforce_graduation_lock
BEFORE INSERT OR UPDATE OF enrollment_status
ON procurements.sms_enrollments
FOR EACH ROW
EXECUTE FUNCTION procurements.enforce_graduation_lock();

COMMENT ON FUNCTION procurements.enforce_graduation_lock IS
  'Refuses a new or reactivated on-the-roster enrollment that would put a learner at or below a grade level they already graduated, or in that school year or earlier. Covers INSERT and the UPDATE reactivation path. Grade 6/10 completers may still move up to Grade 7/11.';
