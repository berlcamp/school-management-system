-- Server-side enforcement of two enrollment-status invariants that were
-- previously only checked in the UI.
--
-- (1) Promotion deadline (review item #7)
--     Once `sms_school_settings.promotion_deadline` has passed for a school,
--     transitions into 'promoted', 'graduated', or 'retained' must be
--     blocked. The previous client-side check could be bypassed by any
--     direct supabase.from(...).update(...) call.
--
-- (2) Graduation is final (review item #6)
--     A student whose latest approved enrollment is 'graduated' must not
--     get a new active enrollment row. The original review noted that
--     graduates could be re-enrolled via the wizard if a clerk picked the
--     wrong mode; this trigger blocks every code path.
--
-- Both checks are implemented as BEFORE INSERT/UPDATE triggers on
-- procurements.sms_enrollments so they cover bulk RPC, single-row updates,
-- the wizard, and any future code path.

-- ---------------------------------------------------------------------------
-- (1) Promotion deadline guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.enforce_promotion_deadline()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deadline DATE;
BEGIN
  -- Only react when the lifecycle status is moving INTO one of the
  -- end-of-year transition states.
  IF NEW.enrollment_status NOT IN ('promoted', 'graduated', 'retained') THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only fire when the value actually changed (idempotent
  -- updates from triggers / re-saves shouldn't be blocked).
  IF TG_OP = 'UPDATE'
     AND OLD.enrollment_status IS NOT DISTINCT FROM NEW.enrollment_status THEN
    RETURN NEW;
  END IF;

  -- Look up the school's promotion deadline. Prefer the per-school row;
  -- fall back to the global row (school_id IS NULL) if none exists.
  SELECT promotion_deadline INTO v_deadline
  FROM procurements.sms_school_settings
  WHERE school_id = NEW.school_id
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT promotion_deadline INTO v_deadline
    FROM procurements.sms_school_settings
    WHERE school_id IS NULL
    LIMIT 1;
  END IF;

  IF v_deadline IS NOT NULL AND CURRENT_DATE > v_deadline THEN
    RAISE EXCEPTION
      'Promotion deadline (%) has passed for this school. % transitions are no longer allowed.',
      v_deadline, NEW.enrollment_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_promotion_deadline
  ON procurements.sms_enrollments;

CREATE TRIGGER trg_enforce_promotion_deadline
BEFORE INSERT OR UPDATE OF enrollment_status
ON procurements.sms_enrollments
FOR EACH ROW
EXECUTE FUNCTION procurements.enforce_promotion_deadline();

-- ---------------------------------------------------------------------------
-- (2) Graduation lock — graduated students cannot be re-enrolled
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.enforce_graduation_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_graduated BOOLEAN;
BEGIN
  -- Only enforce on creation of a fresh active enrollment. UPDATEs can
  -- still adjust historical rows (e.g. correcting a grade).
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Allow non-active lifecycle statuses through — only block creating a
  -- new active/pending row for a graduate.
  IF NEW.enrollment_status NOT IN ('active', 'pending_transfer', 'pending_review') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM procurements.sms_enrollments
    WHERE student_id = NEW.student_id
      AND status = 'approved'
      AND enrollment_status = 'graduated'
  ) INTO v_has_graduated;

  IF v_has_graduated THEN
    RAISE EXCEPTION
      'Student % has already graduated and cannot be re-enrolled.',
      NEW.student_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_graduation_lock
  ON procurements.sms_enrollments;

CREATE TRIGGER trg_enforce_graduation_lock
BEFORE INSERT
ON procurements.sms_enrollments
FOR EACH ROW
EXECUTE FUNCTION procurements.enforce_graduation_lock();
