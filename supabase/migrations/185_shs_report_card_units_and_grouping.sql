-- ============================================================================
-- 185. Senior High SF9 — units, Core/Elective grouping, and the
--      Effective Communication / Mabisang Komunikasyon learning area
-- ============================================================================
--
-- WHY
-- ---
-- The issued MATATAG *SF9 - GRADE 11 ACADEMIC* and *SF9 - GRADE 12 ACADEMIC*
-- sheets are the same Learner's Performance Report the K-10 card already
-- prints — same header, same T1/T2/T3 columns, same Final Grade / Remarks,
-- same attendance grid, same certificates — with three differences the system
-- had no way to record:
--
--   1. a **Units** column between the terms and the Final Grade, totalled on
--      the General Average row (39 on the Grade 11 sheet, 36 on Grade 12);
--   2. the learning areas grouped under **Core Subjects** and **Elective
--      Subjects** headings — Grade 12's card carries electives only, because
--      the five core subjects are all taken in Grade 11;
--   3. **Effective Communication / Mabisang Komunikasyon** printed as ONE line
--      carrying one grade with the two languages indented beneath it, exactly
--      the shape 153/155 gave MAPEH and 174 gave EPP/TLE. The workbook's Class
--      Summary confirms the two are encoded separately and combined into one
--      Term Grade.
--
-- WHAT THIS ADDS, AND WHY EACH IS SHAPED THE WAY IT IS
-- ----------------------------------------------------
-- `units` — SMALLINT, nullable. The figure **as it prints on the card**: the
-- subject's units for the whole year, not per term. The issued HELPER sheet
-- quotes a core subject at 2 units per term and the card prints 6; a one-term
-- academic elective is 3 on both. Deriving the card figure from a per-term
-- value would mean multiplying by "the terms the learner has a grade in",
-- which makes a card printed after Term 1 report a third of the units the
-- learner is enrolled for — units are a property of the offering, not of how
-- far encoding has got. So the registrar transcribes one number and it is
-- printed back verbatim, per the 137/154 rule.
--
-- Units are NOT weights. The General Average stays the plain mean of the
-- per-subject finals that count, exactly as the K-10 card computes it; the
-- Units column and its total are reported, never multiplied. (Confirmed with
-- the user before this was written — the workbook ships its formulas as
-- #VALUE! over an empty roster, so the file itself cannot be read for it.)
--
-- `shs_category` — CHECK-constrained TEXT ('core' | 'elective') per 133/153
-- rather than free TEXT per 119/132, because the value carries behaviour: it
-- fixes which heading a subject prints under and in what order the two blocks
-- appear. The list is two long and cannot grow without the form changing.
--
-- `comm_component` — CHECK-constrained for the same reason, and the same two
-- reasons 153 gave: the pair does not move, and the value fixes the print
-- order beneath the parent. The parent row is **computed at print time and
-- never stored**, per 153/174 — a real parent subject would need its own
-- schedule and grade entry, letting a teacher encode a combined grade that
-- contradicts its two halves. Components weigh equally, as MAPEH's do.
--
-- NOTHING MOVES ON APPLY (the 153/160/174 rule)
-- ---------------------------------------------
-- All three columns are nullable with no backfill and no DEFAULT. Until a
-- school tags a subject, every card, SF9, SF10, GPA and general average prints
-- exactly what it prints today: the Units column appears only on a Grade 11-12
-- card, the group headings only when some subject at that grade level carries
-- a category, and an untagged Effective Communication subject stays an
-- ordinary line. Clearing the tags reverts all of it without a migration.
--
-- SCOPE
-- -----
-- Three nullable columns and two CHECK constraints on `sms_subjects`. No
-- table, policy, trigger, function or existing column touched, and no DML.
-- 174's `sms_subjects_one_learning_area_check` is widened to three components
-- rather than left standing beside a new one, so "a subject belongs to at most
-- one computed learning area" keeps being one constraint that says so.
-- ============================================================================

ALTER TABLE procurements.sms_subjects
  ADD COLUMN IF NOT EXISTS units SMALLINT,
  ADD COLUMN IF NOT EXISTS shs_category TEXT,
  ADD COLUMN IF NOT EXISTS comm_component TEXT;

COMMENT ON COLUMN procurements.sms_subjects.units IS
  'SHS SF9 Units column — the subject''s units for the whole school year, as printed (core 6, one-term academic elective 3). Reported, never used as a weight. NULL = not applicable / not yet transcribed.';
COMMENT ON COLUMN procurements.sms_subjects.shs_category IS
  'SHS SF9 grouping: core | elective. NULL = ungrouped, printed without a heading.';
COMMENT ON COLUMN procurements.sms_subjects.comm_component IS
  'Effective Communication / Mabisang Komunikasyon component (migration 185). NULL = not part of that learning area. The parent line is computed at print time, never stored.';

-- Guarded per 116: ADD COLUMN IF NOT EXISTS skips a CHECK declared inline when
-- the column already exists, so every constraint is added by name, separately,
-- and only when it is not already there.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'procurements.sms_subjects'::regclass
      AND conname = 'sms_subjects_units_check'
  ) THEN
    ALTER TABLE procurements.sms_subjects
      ADD CONSTRAINT sms_subjects_units_check
      CHECK (units IS NULL OR (units > 0 AND units <= 50));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'procurements.sms_subjects'::regclass
      AND conname = 'sms_subjects_shs_category_check'
  ) THEN
    ALTER TABLE procurements.sms_subjects
      ADD CONSTRAINT sms_subjects_shs_category_check
      CHECK (shs_category IS NULL OR shs_category IN ('core', 'elective'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'procurements.sms_subjects'::regclass
      AND conname = 'sms_subjects_comm_component_check'
  ) THEN
    ALTER TABLE procurements.sms_subjects
      ADD CONSTRAINT sms_subjects_comm_component_check
      CHECK (
        comm_component IS NULL
        OR comm_component IN ('effective_communication', 'mabisang_komunikasyon')
      );
  END IF;
END $$;

-- One learning area per subject, now over three. 174 wrote this as a pair;
-- replacing it keeps the rule in one place instead of two that must agree.
-- Nothing can violate the widened form: no row can carry `comm_component` yet.
--
-- The expression is BUILT from the component columns that actually exist,
-- rather than naming all three outright. A CHECK is validated against the live
-- table, so naming a column that is not there aborts the whole migration --
-- which is what happened on the clone this was tested against, where 153 had
-- been applied and 174 had not. That is invariant 11 and the 116/157 lesson:
-- the migration files and the live schema are known to disagree, and a
-- constraint that says "at most one of the component columns present" is true
-- of every one of those states. Applying the missing migration later widens
-- this one, because it re-creates the constraint itself (174 already does).
DO $$
DECLARE
  v_terms TEXT := '';
  v_column TEXT;
BEGIN
  FOREACH v_column IN ARRAY ARRAY['mapeh_component', 'tle_component', 'comm_component']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'procurements'
        AND table_name = 'sms_subjects'
        AND column_name = v_column
    ) THEN
      v_terms := v_terms
        || CASE WHEN v_terms = '' THEN '' ELSE ' + ' END
        || format('(CASE WHEN %I IS NOT NULL THEN 1 ELSE 0 END)', v_column);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'procurements.sms_subjects'::regclass
      AND conname = 'sms_subjects_one_learning_area_check'
  ) THEN
    ALTER TABLE procurements.sms_subjects
      DROP CONSTRAINT sms_subjects_one_learning_area_check;
  END IF;

  -- Never empty: `comm_component` is added by the statement at the top of this
  -- file, so the loop always finds at least that one.
  EXECUTE format(
    'ALTER TABLE procurements.sms_subjects
       ADD CONSTRAINT sms_subjects_one_learning_area_check CHECK ((%s) <= 1)',
    v_terms
  );

  RAISE NOTICE 'one-learning-area CHECK built over: %', v_terms;
END $$;
