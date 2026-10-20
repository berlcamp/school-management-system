-- ============================================================================
-- 213. Senior High SF9 grouping — Applied and Specialized Subjects
-- ============================================================================
--
-- WHY
-- ---
-- 185 gave the SHS card two group headings, Core Subjects and Elective
-- Subjects, read off the MATATAG Grade 11/12 sheets. Learners still on the
-- K to 12 (pre-MATATAG) SHS curriculum carry a card grouped the old way —
-- Core, **Applied** and **Specialized** Subjects — and a school had nowhere to
-- file an applied or specialized subject except under Elective or no heading.
--
-- WHAT THIS CHANGES
-- -----------------
-- Widens `sms_subjects_shs_category_check` from ('core', 'elective') to
-- ('core', 'applied', 'specialized', 'elective'). The print order (Core,
-- Applied, Specialized, Elective) lives in `SHS_SUBJECT_CATEGORIES` in
-- `lib/constants/shsSubjects.ts`, per 185.
--
-- NOTHING MOVES ON APPLY
-- ----------------------
-- Only widened: every existing value stays legal and no row is rewritten.
-- One CHECK constraint replaced; no table, column, policy, trigger, function
-- or DML.
-- ============================================================================

ALTER TABLE procurements.sms_subjects
  DROP CONSTRAINT IF EXISTS sms_subjects_shs_category_check;

ALTER TABLE procurements.sms_subjects
  ADD CONSTRAINT sms_subjects_shs_category_check
  CHECK (
    shs_category IS NULL
    OR shs_category IN ('core', 'applied', 'specialized', 'elective')
  );

COMMENT ON COLUMN procurements.sms_subjects.shs_category IS
  'SHS SF9 grouping: core | applied | specialized | elective (185, widened by 213). NULL = ungrouped, printed without a heading.';
