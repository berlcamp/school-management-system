-- ============================================================================
-- CRLA — reading time + learner experience on the Part 2 Record Form
--
-- The DepEd CRLA workbook ("Reading Scoresheet" / "Class Record" / "Class
-- Summary" sheets) reports three Part 2 figures the app could not produce:
--
--   Number of Words Read  = total words in the story - total miscues   (derived)
--   Words per Minute      = words read * 60 / reading time             (needs TIME)
--   % of Correct Words Read = words read / total words                 (derived)
--
-- Only the reading TIME is genuinely new input; the rest is derivable from what
-- sms_crla_record_form_records + _line_scores already hold. The scoresheet also
-- carries a "Learner Experience (Rating 1-5)" column, which likewise has no
-- home today.
--
-- Both columns are nullable: every existing record stays valid, and the
-- printables simply leave the derived cells blank until a time is recorded.
--
-- The 5-level READING PROFILE the workbook reports (Low Emerging / High
-- Emerging / Developing / Transitioning / Reading At Grade Level) is NOT stored
-- — it is derived in the app from the Part 1 band + reading accuracy +
-- comprehension (see crlaReadingProfile in lib/constants/assessments.ts), so a
-- change to the DepEd scoring reference does not invalidate history.
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_crla_record_form_records
  ADD COLUMN IF NOT EXISTS reading_time_seconds INTEGER
    CHECK (reading_time_seconds IS NULL OR reading_time_seconds >= 0),
  ADD COLUMN IF NOT EXISTS learner_experience INTEGER
    CHECK (learner_experience IS NULL OR learner_experience BETWEEN 1 AND 5);

COMMENT ON COLUMN procurements.sms_crla_record_form_records.reading_time_seconds IS
  'Total time the learner used reading the story, in seconds (DepEd form caps the read at 1 minute). Drives words-per-minute.';

COMMENT ON COLUMN procurements.sms_crla_record_form_records.learner_experience IS
  'Learner Experience rating 1-5 from the DepEd CRLA reading scoresheet.';
