-- ============================================================================
-- SUBJECT PROGRAM — ADD ALS (ALTERNATIVE LEARNING SYSTEM)
-- ============================================================================
-- The Program dropdown on Subjects was a two-state boolean (034's is_madrasah),
-- so a third program could not be stored at all. This adds a real
-- `program` column (regular | madrasah | als) and makes it the source of truth.
--
-- `is_madrasah` is NOT dropped and NOT renamed. Since 034 it has meant two
-- concrete behaviours, both of which ALS shares:
--   1. selective enrolment — only learners listed in sms_student_subjects take
--      the subject, instead of every learner in the section;
--   2. exclusion from the general average (076, 128, SF9/SF10/Form 137/report
--      card).
-- Rather than re-point ~20 call sites and two RPCs at a new column — including
-- signed, already-printed forms — `is_madrasah` is kept as the *mechanism*
-- flag and is derived from `program` by a trigger. Every existing consumer
-- keeps working untouched, and ALS inherits both behaviours for free.
--
-- Nothing is deleted and nothing is re-derived: existing rows are mapped
-- 1:1 (is_madrasah = true → 'madrasah', false → 'regular'), so no subject
-- changes behaviour when this is applied.
-- ============================================================================

SET search_path TO procurements, public;

-- ============================================================================
-- ADD program COLUMN
-- ============================================================================
-- Added nullable first so the backfill below can be WHERE-scoped and counted;
-- the default and NOT NULL are set afterwards.
ALTER TABLE procurements.sms_subjects
  ADD COLUMN IF NOT EXISTS program TEXT;

-- Backfill from the existing flag. Touches only rows not yet mapped.
UPDATE procurements.sms_subjects
   SET program = 'madrasah'
 WHERE program IS NULL
   AND COALESCE(is_madrasah, false) = true;

UPDATE procurements.sms_subjects
   SET program = 'regular'
 WHERE program IS NULL;

ALTER TABLE procurements.sms_subjects
  ALTER COLUMN program SET DEFAULT 'regular';

ALTER TABLE procurements.sms_subjects
  ALTER COLUMN program SET NOT NULL;

-- Values are constrained here because, unlike the free-TEXT codes of 119/121,
-- this set is not a DepEd list that revises on its own — each value carries
-- application behaviour that has to be written in code anyway.
ALTER TABLE procurements.sms_subjects
  DROP CONSTRAINT IF EXISTS sms_subjects_program_check;

ALTER TABLE procurements.sms_subjects
  ADD CONSTRAINT sms_subjects_program_check
  CHECK (program IN ('regular', 'madrasah', 'als'));

COMMENT ON COLUMN procurements.sms_subjects.program IS
  'Program the subject belongs to: regular | madrasah (MEP) | als. Source of truth for the Program dropdown. is_madrasah is derived from this by sync_subject_program_trigger.';

COMMENT ON COLUMN procurements.sms_subjects.is_madrasah IS
  'Derived from program (true for madrasah and als). Means: selectively enrolled via sms_student_subjects, and excluded from the general average. Do not set directly — write program instead.';

-- ============================================================================
-- KEEP program AND is_madrasah IN SYNC
-- ============================================================================
-- Two-directional on purpose: a writer that only knows about the old boolean
-- (anything predating this migration) still lands on a consistent row, and a
-- writer that sets program wins when both change in the same statement.
CREATE OR REPLACE FUNCTION procurements.sync_subject_program()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A caller that supplied only the old boolean lands on 'regular' via the
    -- column default, which would silently downgrade it — so on insert the
    -- boolean wins whenever program says nothing more specific.
    IF COALESCE(NEW.program, 'regular') = 'regular'
       AND COALESCE(NEW.is_madrasah, false) = true THEN
      NEW.program := 'madrasah';
    ELSIF NEW.program IS NULL THEN
      NEW.program := 'regular';
    END IF;
    NEW.is_madrasah := NEW.program IN ('madrasah', 'als');
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.program IS DISTINCT FROM OLD.program THEN
    NEW.is_madrasah := NEW.program IN ('madrasah', 'als');
  ELSIF NEW.is_madrasah IS DISTINCT FROM OLD.is_madrasah THEN
    NEW.program := CASE WHEN NEW.is_madrasah THEN 'madrasah' ELSE 'regular' END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_subject_program_trigger ON procurements.sms_subjects;

CREATE TRIGGER sync_subject_program_trigger
  BEFORE INSERT OR UPDATE ON procurements.sms_subjects
  FOR EACH ROW
  EXECUTE FUNCTION procurements.sync_subject_program();

-- ============================================================================
-- INDEX
-- ============================================================================
-- Mirrors 034's partial index: the lookups are always "the non-regular ones".
CREATE INDEX IF NOT EXISTS idx_subjects_program
  ON procurements.sms_subjects(program) WHERE program <> 'regular';
