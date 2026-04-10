-- Fix: enforce_promotion_deadline trigger fails with "operator does not exist: text = bigint"
-- because sms_school_settings.school_id is TEXT while sms_enrollments.school_id is BIGINT.
-- Cast NEW.school_id to TEXT for the comparison.

CREATE OR REPLACE FUNCTION procurements.enforce_promotion_deadline()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deadline DATE;
BEGIN
  IF NEW.enrollment_status NOT IN ('promoted', 'graduated', 'retained') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.enrollment_status IS NOT DISTINCT FROM NEW.enrollment_status THEN
    RETURN NEW;
  END IF;

  -- sms_school_settings.school_id is TEXT; sms_enrollments.school_id is BIGINT
  SELECT promotion_deadline INTO v_deadline
  FROM procurements.sms_school_settings
  WHERE school_id = NEW.school_id::TEXT
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
