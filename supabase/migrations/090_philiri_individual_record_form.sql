-- ============================================================================
-- Phil-IRI — Individual Record Form (Form 3A Filipino / Form 3B English)
--
-- In addition to the Group Screening Test class record (STCRR / TPPK), section
-- advisers can now record the per-learner ORAL READING test:
--   Part A (Comprehension): reading time, reading rate (wpm), raw score,
--     comprehension %, comprehension level, per-question answers.
--   Part B (Word Reading):  the 7 miscue-type counts, total miscues, word
--     reading score %, word reading level; overall reading level.
--
-- Both form types share sms_philiri_records, discriminated by `form_type`
-- ('screening' | 'individual'); the unique key gains form_type so a learner can
-- have one of each per material / phase / school year. The legacy
-- miscues / word_reading_* / comprehension_* / overall_reading_level columns
-- (dormant since the screening rework) are reused for the individual form.
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_philiri_records
  ADD COLUMN IF NOT EXISTS form_type            TEXT NOT NULL DEFAULT 'screening'
    CHECK (form_type IN ('screening', 'individual')),
  ADD COLUMN IF NOT EXISTS reading_time_seconds INTEGER CHECK (reading_time_seconds IS NULL OR reading_time_seconds >= 0),
  ADD COLUMN IF NOT EXISTS reading_rate         NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS comprehension_raw    INTEGER CHECK (comprehension_raw IS NULL OR comprehension_raw >= 0),
  ADD COLUMN IF NOT EXISTS comprehension_total  INTEGER,
  ADD COLUMN IF NOT EXISTS miscue_counts        JSONB,
  ADD COLUMN IF NOT EXISTS comprehension_answers JSONB;

-- Replace the old unique key so both a screening and an individual record can
-- coexist for the same learner / material / phase / school year.
ALTER TABLE procurements.sms_philiri_records
  DROP CONSTRAINT IF EXISTS sms_philiri_records_material_id_student_id_phase_school_yea_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sms_philiri_records_unique_form'
      AND conrelid = 'procurements.sms_philiri_records'::regclass
  ) THEN
    ALTER TABLE procurements.sms_philiri_records
      ADD CONSTRAINT sms_philiri_records_unique_form
      UNIQUE (material_id, student_id, phase, school_year, form_type);
  END IF;
END $$;
