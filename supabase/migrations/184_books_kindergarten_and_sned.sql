-- ============================================================================
-- 184 — Books for Kindergarten and SNED
-- ============================================================================
-- Every other module in the system has spoken three grade vocabularies since
-- `GRADE_LEVELS` was written: **-1 = SNED, 0 = Kindergarten, 1-12 = Grade N**.
-- Sections carry them, enrollment carries them, the roster and every report
-- resolve them through `getGradeLevelLabel()`. The book catalogue alone did not:
-- 021 wrote `CHECK (grade_level >= 1 AND grade_level <= 12)`, so a school could
-- open a Kindergarten section and a SNED section but could not catalogue one
-- book for either.
--
-- The workaround lived in `useBooksByGradeLevel`, and it was worse than the gap
-- it papered over. `if (!gradeLevel) return []` treats Kindergarten's 0 as "no
-- section picked", so **Issue Books to a Kindergarten section listed nothing at
-- all**; and `gradeLevel <= 0 ? 1 : gradeLevel` silently substituted Grade 1, so
-- **a SNED section was issued the Grade 1 catalogue** and the issuance recorded
-- against it said Grade 1 too. Both are removed alongside this; the two grades
-- get their own books, the way every other module already treats them.
--
-- Widens the lower bound only. 12 stays the ceiling, no upper-grade behaviour
-- moves, and the unique index on (school_id, title, grade_level) is untouched —
-- a Kindergarten and a Grade 1 copy of one title were always two rows.
--
-- **Nothing moves on apply and nothing is backfilled.** Neither value was
-- storable before this, so no book can hold one and no existing row is
-- re-validated, re-graded or re-pointed. Backing out is the reverse ALTER, once
-- any Kindergarten/SNED books entered since have been re-graded or deleted:
--
--   SELECT grade_level, count(*) FROM procurements.sms_books
--    WHERE grade_level < 1 GROUP BY 1;     -- 0 rows before this is applied
--
-- One CHECK constraint replaced. No table, column, index, policy, trigger or
-- DML; `sms_book_allocations` and `sms_book_issuances` carry no grade level of
-- their own and are not touched.
-- ============================================================================

SET search_path TO procurements, public;

-- 021 declared the bound inline, so the constraint carries a server-generated
-- name that can differ per database — and it created the table with
-- `CREATE TABLE IF NOT EXISTS`, which on a database where `sms_books` already
-- existed skipped the declaration entirely and left no constraint to find at all
-- (the 116 lesson). Rediscover it by what it constrains rather than by name, and
-- tolerate finding none.
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
       AND t.relname = 'sms_books'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%grade_level%'
  LOOP
    EXECUTE format(
      'ALTER TABLE procurements.sms_books DROP CONSTRAINT %I', con.conname
    );
    RAISE NOTICE '184: dropped % on sms_books', con.conname;
  END LOOP;
END $$;

ALTER TABLE procurements.sms_books
  ADD CONSTRAINT sms_books_grade_level_check
  CHECK (grade_level >= -1 AND grade_level <= 12);

COMMENT ON COLUMN procurements.sms_books.grade_level IS
  'Grade level this title is catalogued for: -1 = SNED, 0 = Kindergarten, 1-12 = Grade N. Matches GRADE_LEVELS / getGradeLevelLabel() in lib/constants.';
