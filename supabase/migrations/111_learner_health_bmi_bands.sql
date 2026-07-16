-- ============================================================================
-- LEARNER HEALTH — DepEd BMI-for-Age (wasting) bands
-- ============================================================================
-- sms_learner_health.nutritional_status was created (migration 023) with
--       underweight · normal · overweight · obese
-- but every DepEd instrument that consumes this column — SF8 and the School
-- Report Card, section II — reports the BMI-for-Age *wasting* scale:
--       severely_wasted · wasted · normal · overweight · obese
-- The old set has no 'severely wasted' bucket at all, and 'underweight' is not
-- a band on that scale. This migration replaces the CHECK with the DepEd five.
--
-- NOTE ON DATA: existing 'underweight' rows are mapped to 'wasted' — the same
-- bucket under its DepEd name. This mapping is deliberately NOT split into
-- severely_wasted/wasted: that split needs WHO BMI-for-age z-score cutoffs,
-- which are age- and sex-specific and are not modelled in this system. Height
-- and weight are stored, so a future migration could re-band precisely once
-- those reference tables exist; until then, learners previously recorded as
-- underweight land in 'wasted' and can be re-encoded by the adviser if they
-- belong in 'severely_wasted'. normal/overweight/obese are unaffected.
-- ============================================================================

SET search_path TO procurements, public;

-- Drop first: the old CHECK would reject the re-band UPDATE below.
ALTER TABLE procurements.sms_learner_health
  DROP CONSTRAINT IF EXISTS sms_learner_health_nutritional_status_check;

DO $$
DECLARE
  moved INT;
BEGIN
  UPDATE procurements.sms_learner_health
     SET nutritional_status = 'wasted'
   WHERE nutritional_status = 'underweight';

  GET DIAGNOSTICS moved = ROW_COUNT;
  RAISE NOTICE 'Learner health: % row(s) re-banded from underweight to wasted.', moved;
END $$;

ALTER TABLE procurements.sms_learner_health
  ADD CONSTRAINT sms_learner_health_nutritional_status_check
  CHECK (
    nutritional_status IS NULL
    OR nutritional_status IN (
      'severely_wasted', 'wasted', 'normal', 'overweight', 'obese'
    )
  );

COMMENT ON COLUMN procurements.sms_learner_health.nutritional_status IS
  'DepEd BMI-for-Age band: severely_wasted, wasted, normal, overweight, obese (SF8 / SRC section II).';

COMMENT ON COLUMN procurements.sms_learner_health.height_for_age IS
  'DepEd Height-for-Age band: severely_stunted, stunted, normal, tall (SF8 / SRC section II).';
