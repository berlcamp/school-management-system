-- ============================================================================
-- 114: Learner profile — ethnicity + 4Ps recipient
-- ============================================================================
-- DepEd SF1 captures whether a learner's household is a 4Ps (Pantawid
-- Pamilyang Pilipino Program) beneficiary, and the learner's ethnicity.
--
-- `ethnicity` is intentionally SEPARATE from the existing `ip_ethnic_group`:
-- that column is the Indigenous Peoples group (blank for non-IP learners),
-- while `ethnicity` applies to every learner.
-- ============================================================================

ALTER TABLE procurements.sms_students
  ADD COLUMN IF NOT EXISTS ethnicity TEXT,
  ADD COLUMN IF NOT EXISTS is_4ps BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN procurements.sms_students.ethnicity IS
  'Learner ethnicity (all learners). Distinct from ip_ethnic_group, which is the Indigenous Peoples group.';

COMMENT ON COLUMN procurements.sms_students.is_4ps IS
  '4Ps (Pantawid Pamilyang Pilipino Program) recipient. Defaults to FALSE for existing rows.';
