-- ============================================================================
-- 189. Old SHS curriculum on the section — semestral quarters for the Grade 12
--      cohort the strengthened programme has not reached
-- ============================================================================
--
-- WHY
-- ---
-- Two Senior High curricula run side by side in SY 2026-2027. The strengthened
-- programme reaches **Grade 11** this year and **Grade 12 only in 2027-2028**,
-- so this year's Grade 12 learners finish the old DO 8, s.2015 programme they
-- started Grade 11 on: **semestral**, two semesters of two quarters each, with
-- a different set of subjects offered in each semester.
--
-- Nothing in the system could say so. `getGradingPeriods()` answers from the
-- SCHOOL YEAR alone (`lib/utils/schoolYear.ts`), and from SY 2026-2027 it
-- returns three MATATAG terms for every grade level. Every surface downstream
-- inherits that — grade entry, the class record, and the report card, which is
-- where a teacher noticed it: SF9 for Grade 12 listed both semesters' subjects
-- in one block spread across three terms they are not taught in.
--
-- Three separate things were wrong for that cohort, all from the same cause:
--
--   1. **Periods.** Three terms where the curriculum has four quarters, so a
--      second-semester subject had nowhere to be encoded at all.
--   2. **Transmutation.** `sms_class_records.grading_scheme` defaults to
--      `matatag` since 173, so Grade 12 Initial Grades were being transmuted
--      through the updated K-10 table. The two tables disagree for **8,253 of
--      the 10,001** possible Initial Grades, by up to **seven points**, and in
--      the range real grades land in the updated table is always the harsher:
--      IG 90.00 -> 93 under DO 8 and 91 under MATATAG; 80.00 -> 87 and 83;
--      75.00 -> 84 and 79; 70.00 -> 81 and 75. Migration 190 corrects the rows
--      already posted; this one stops new records opening that way.
--   3. **Weights.** Senior High splits its weights by subject type and track
--      (core 25/50/25, academic 25/45/30, TVL/Sports/Arts 20/60/20), which the
--      K-10 presets in `lib/constants/classRecord.ts` never carried.
--
-- WHY THE SECTION, AND WHY STORED
-- -------------------------------
-- The section, per 145's reasoning: a curriculum is a subject set, a subject
-- set is a schedule, and schedules are the only place a subject meets a
-- section. A learner inherits it through `sms_enrollments.section_id`, which is
-- NOT NULL, and SF9 already branches on the SECTION's grade level rather than
-- the learner's (180's Grade 1 card) because the card belongs to the class the
-- learner sits in.
--
-- STORED and never re-derived, per **invariant 14** — the rule 173's
-- `grading_scheme` and 121's `career_stage` already follow. A cohort table
-- consulted at print time ("Grade 12 is old until 2027-2028") would silently
-- rewrite a card, a posted transmutation and a signed semester the year the
-- rollout moves on. `suggestShsCurriculum()` uses exactly that table to
-- SUGGEST a value when a section is created, and the registrar can override
-- it; what is stored is what resolves, for ever.
--
-- CHECK-constrained TEXT per 133/153 rather than free TEXT per 119/132: the
-- value carries behaviour — it fixes the period count, the semester split, the
-- transmutation table, the descriptor legend and which SF9 prints — and the
-- list is two long and cannot grow, because a third curriculum would be a
-- different form, not a third value.
--
-- THE BACKFILL IS THE BEHAVIOUR CHANGE, AND IT IS THE POINT
-- --------------------------------------------------------
-- Unlike 153/160/174, this migration deliberately does NOT leave everything
-- untagged: an untagged section keeps printing the wrong form, which is the
-- reported bug. Every SHS section is tagged from the rollout it actually ran
-- under, which is a cohort fact and true division-wide, not a school
-- preference:
--
--   grade 11-12, school year before 2026-2027   -> old
--   grade 12,    school year 2026-2027           -> old
--   grade 11,    school year 2026-2027 or later  -> strengthened
--   grade 12,    school year 2027-2028 or later  -> strengthened
--
-- Pre-2026 school years were four-quarter years already (`isTermBasedSchoolYear`
-- is false for them), so tagging them changes no grade, no average and no
-- period a grade sits in — only which SF9 layout they print, from the one-block
-- annual form to the semestral one, which is the correct form for those
-- learners and always was.
--
-- Nothing outside Senior High is touched: K-10 sections stay NULL and every
-- `getGradingPeriods()` caller keeps answering exactly as it does today.
--
-- Count what this will tag before applying:
--
--   SELECT grade_level, school_year, count(*)
--   FROM procurements.sms_sections
--   WHERE grade_level IN (11, 12)
--   GROUP BY 1, 2 ORDER BY 2, 1;
--
-- SCOPE
-- -----
-- One nullable column and one guard CHECK on `sms_sections`; one widened CHECK
-- on `sms_class_records.grading_period` (3 -> 4, so a second-semester record
-- can exist at all). One UPDATE, over SHS sections only. No policy, trigger or
-- function touched, and no grade row rewritten — 190 is where rows move.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The column
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_sections
  ADD COLUMN IF NOT EXISTS shs_curriculum TEXT;

ALTER TABLE procurements.sms_sections
  DROP CONSTRAINT IF EXISTS sms_sections_shs_curriculum_check;
ALTER TABLE procurements.sms_sections
  ADD CONSTRAINT sms_sections_shs_curriculum_check CHECK (
    shs_curriculum IS NULL
    OR (shs_curriculum IN ('old', 'strengthened') AND grade_level IN (11, 12))
  );

COMMENT ON COLUMN procurements.sms_sections.shs_curriculum IS
  'old | strengthened. Which Senior High curriculum this section runs: old = DO 8 s.2015, semestral (2 semesters x 2 quarters, grading_period 1-2 and 3-4), DO 8 transmutation and descriptors; strengthened = MATATAG, 3 terms. NULL for K-10. Pinned at creation and NEVER re-derived from the school year (invariant 14) — a posted transmutation and a printed card have to keep resolving the way they did when they were signed.';

-- ----------------------------------------------------------------------------
-- 2. A class record may now carry a 4th period
-- ----------------------------------------------------------------------------
-- 080 wrote `CHECK (grading_period BETWEEN 1 AND 3)` when three terms was the
-- only shape a class record had. A second-semester old-SHS record is period 3
-- or 4, so without this the teacher cannot open one.
--
-- Rediscovered from pg_constraint rather than dropped by name, per the 116/157
-- lesson: this constraint was declared inline in a CREATE TABLE, so its name is
-- whatever Postgres generated, and the migration files and the live schema are
-- known to disagree about such things. Widening only — every existing row is
-- 1-3 and stays valid.
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'procurements'
      AND t.relname = 'sms_class_records'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%grading_period%'
  LOOP
    EXECUTE format(
      'ALTER TABLE procurements.sms_class_records DROP CONSTRAINT %I',
      con.conname
    );
  END LOOP;
END $$;

ALTER TABLE procurements.sms_class_records
  ADD CONSTRAINT sms_class_records_grading_period_check
  CHECK (grading_period BETWEEN 1 AND 4);

COMMENT ON COLUMN procurements.sms_class_records.grading_period IS
  '1-3 = the MATATAG terms; 1-4 on an old-curriculum SHS section, where 1-2 are the first semester''s two quarters and 3-4 the second''s (migration 189).';

-- ----------------------------------------------------------------------------
-- 3. Backfill every SHS section from the rollout it ran under
-- ----------------------------------------------------------------------------
UPDATE procurements.sms_sections
SET shs_curriculum = CASE
      WHEN grade_level = 11 AND school_year >= '2026-2027' THEN 'strengthened'
      WHEN grade_level = 12 AND school_year >= '2027-2028' THEN 'strengthened'
      ELSE 'old'
    END,
    updated_at = NOW()
WHERE grade_level IN (11, 12)
  AND shs_curriculum IS NULL;
