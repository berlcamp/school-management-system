-- ============================================================================
-- EPP / TLE IS ONE LEARNING AREA, NOT TWO SUBJECTS
-- ============================================================================
-- Migration 153 established that MAPEH prints as a single line carrying one
-- grade, with its components indented beneath, counting ONCE toward the
-- general average. EPP-TLE has exactly the same shape and was never modelled:
-- a school teaching ICT alongside a rotating specialisation carries two
-- ordinary `sms_subjects` rows, so the card prints two full subjects and the
-- general average weights the learning area TWICE against Mathematics. That is
-- 153's bug, still open on a second learning area.
--
-- IT IS NOT AN AVERAGE. The updated DepEd per-component workbook combines the
-- two sheets with fixed, unequal weights, and it does so every term:
--
--   TERM 1  ROUND( ICT x 0.25 + AFA x 0.75, 0 )
--   TERM 2  ROUND( ICT x 0.25 + FCS x 0.75, 0 )
--   TERM 3  ROUND( ICT x 0.25 + IA  x 0.75, 0 )
--   FINAL   ROUND( AVERAGE(TERM 1, TERM 2, TERM 3), 0 )
--
-- ICT is taught across all three terms and the specialisation rotates, which
-- is why ICT is the quarter and the specialisation the three quarters.
--
-- THE ROTATION NEEDS NO SCHEMA. Which specialisation falls in which term is a
-- property of what the school actually offered, and that is already recorded:
-- the term's grades. The card combines whichever tagged subjects carry a grade
-- for that term, so a school rotating AFA/IA/FCS instead of AFA/FCS/IA needs
-- nothing here. Storing the rotation would be storing a second, contradictable
-- copy of the timetable -- the 153 rule about not creating a parent row a
-- teacher can encode against.
--
-- CHECK-CONSTRAINED, per 133/153 rather than free TEXT per 119/132: the value
-- carries behaviour (it fixes the weight and the print order), and these are
-- the four the issued workbook has. A fifth is a one-line constraint swap, not
-- a redesign -- deliberately, because DepEd renamed Home Economics to Family
-- and Consumer Science in MATATAG and may revise the set again.
--
-- THE NULL DEFAULT IS LOAD-BEARING (the 153 rule). Nothing is tagged on apply,
-- so no card, no SF9 and no general average moves until a school opts in one
-- subject at a time, and clearing the tags reverts everything exactly without
-- a migration.
--
-- A subject cannot be a MAPEH component AND a TLE component -- both fold it
-- into a computed parent, and two parents cannot both own one grade. Both
-- columns are on this table, so unlike 136's cross-table rule this one really
-- is a CHECK.
--
-- SF10 and Form 137 are deliberately untouched, exactly as 153/155 left them:
-- they are archival records and their own grouping is a separate decision.
--
-- Read-only -- what is tagged today (nothing: the column is new):
--
--   SELECT tle_component, count(*) FROM procurements.sms_subjects
--    GROUP BY 1 ORDER BY 1;
--
-- Scope: one nullable column and two CHECK constraints on sms_subjects. No
-- table, policy, trigger or function is touched, and no row is rewritten.
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_subjects
  ADD COLUMN IF NOT EXISTS tle_component TEXT;

COMMENT ON COLUMN procurements.sms_subjects.tle_component IS
  'Which EPP/TLE component this subject is (migration 174). NULL = not part of EPP/TLE. ict weighs 0.25 of the term grade, the specialisation 0.75; labels and weights live in lib/constants/tle.ts.';

-- Guarded per 116: ADD COLUMN IF NOT EXISTS skips a CHECK declared inline when
-- the column already exists, so both constraints are added separately.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sms_subjects_tle_component_check'
       AND conrelid = 'procurements.sms_subjects'::regclass
  ) THEN
    ALTER TABLE procurements.sms_subjects
      ADD CONSTRAINT sms_subjects_tle_component_check
      CHECK (tle_component IS NULL OR tle_component IN ('ict', 'afa', 'fcs', 'ia'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sms_subjects_one_learning_area_check'
       AND conrelid = 'procurements.sms_subjects'::regclass
  ) THEN
    ALTER TABLE procurements.sms_subjects
      ADD CONSTRAINT sms_subjects_one_learning_area_check
      CHECK (mapeh_component IS NULL OR tle_component IS NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sms_subjects_tle_component
  ON procurements.sms_subjects(tle_component)
  WHERE tle_component IS NOT NULL;
