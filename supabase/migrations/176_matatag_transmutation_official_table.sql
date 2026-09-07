-- ============================================================================
-- MATATAG TRANSMUTATION — THE ISSUED TABLE SUPERSEDES THE WORKBOOK'S
-- ============================================================================
-- 173 built `sms_transmute_grade_matatag` from the conversion table on the
-- HELPER sheet of DepEd's updated E-Class Record workbook, that being the
-- table the issued file actually computes with. The table DepEd published
-- separately is a different one, and it is the one that governs.
--
-- They are not a near match. Across the 10,001 Initial Grades from 0.00 to
-- 100.00 the two give a different Term Grade for 8,356 of them, by up to eight
-- points. They agree only at the two figures usually quoted -- the pass mark at
-- an Initial Grade of 70.00, and 84.00 -> 86 -- which is very likely why the
-- difference went unnoticed:
--
--     Initial Grade    173 (workbook)    this migration
--         90.00              91                92
--         84.00              86                86
--         80.00              83                82
--         75.00              79                77
--         70.00              75                75
--         60.00              72                70
--         40.00              68                61
--         30.00              66                60
--
-- The published table bands on whole numbers where the workbook banded on
-- ~1.18-point steps, and it is markedly harsher below the pass mark: every
-- Initial Grade under 40.00 is a 60.
--
-- NOTHING MOVES, AND THIS IS THE ONLY MOMENT THAT IS TRUE. 173's default flip
-- means only records created after it is applied are 'matatag', and it has been
-- applied to no database that grades anybody -- there is not one 'matatag' row
-- anywhere. So replacing the function rewrites no stored grade and re-grades no
-- learner. Confirm before applying; it must return zero:
--
--   SELECT count(*) FROM procurements.sms_class_records
--    WHERE grading_scheme = 'matatag';
--
-- If it ever returns more than zero, this is no longer a safe replacement and
-- the 121 rule applies instead: add a third scheme rather than move the ground
-- under a term already posted.
--
-- `sms_transmute_grade` (DO 8, s.2015) is untouched, as always -- every one of
-- the ~950 existing records resolves through it and none of them move.
--
-- THE 173 BOUNDARY CAVEAT NO LONGER APPLIES. That divergence was a property of
-- the workbook's INDEX/MATCH lookup, which landed one band low when the Initial
-- Grade was exactly a listed minimum. This table is transcribed from the issued
-- document itself, so there is no formula to disagree with -- the bands print
-- back verbatim (the 137/154/172 rule), irregular widths and all: 3.00 wide at
-- the pass band, 1.50 at 96.00-97.49, 15.00 at 39.99-25.00.
--
-- The last two rows both read 60 (39.99-25.00, and 24.99-0.00 marked "default
-- minimum"), so they are kept as printed rather than merged: the screen and the
-- paper have to show the same rows.
--
-- Scope: one function replaced. No table, column, policy, trigger or other
-- function is touched, and there is no DML.
-- ============================================================================

SET search_path TO procurements, public;

CREATE OR REPLACE FUNCTION procurements.sms_transmute_grade_matatag(p_initial NUMERIC)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_initial IS NULL   THEN NULL
    WHEN p_initial >= 99.50  THEN 100
    WHEN p_initial >= 97.50  THEN 99
    WHEN p_initial >= 96.00  THEN 98
    WHEN p_initial >= 95.00  THEN 97
    WHEN p_initial >= 94.00  THEN 96
    WHEN p_initial >= 93.00  THEN 95
    WHEN p_initial >= 92.00  THEN 94
    WHEN p_initial >= 91.00  THEN 93
    WHEN p_initial >= 90.00  THEN 92
    WHEN p_initial >= 89.00  THEN 91
    WHEN p_initial >= 88.00  THEN 90
    WHEN p_initial >= 87.00  THEN 89
    WHEN p_initial >= 86.00  THEN 88
    WHEN p_initial >= 85.00  THEN 87
    WHEN p_initial >= 84.00  THEN 86
    WHEN p_initial >= 83.00  THEN 85
    WHEN p_initial >= 82.00  THEN 84
    WHEN p_initial >= 81.00  THEN 83
    WHEN p_initial >= 80.00  THEN 82
    WHEN p_initial >= 79.00  THEN 81
    WHEN p_initial >= 78.00  THEN 80
    WHEN p_initial >= 77.00  THEN 79
    WHEN p_initial >= 76.00  THEN 78
    WHEN p_initial >= 75.00  THEN 77
    WHEN p_initial >= 73.00  THEN 76
    WHEN p_initial >= 70.00  THEN 75   -- the pass mark
    WHEN p_initial >= 68.00  THEN 74
    WHEN p_initial >= 66.00  THEN 73
    WHEN p_initial >= 64.00  THEN 72
    WHEN p_initial >= 62.00  THEN 71
    WHEN p_initial >= 60.00  THEN 70
    WHEN p_initial >= 58.00  THEN 69
    WHEN p_initial >= 56.00  THEN 68
    WHEN p_initial >= 54.00  THEN 67
    WHEN p_initial >= 52.00  THEN 66
    WHEN p_initial >= 50.00  THEN 65
    WHEN p_initial >= 48.00  THEN 64
    WHEN p_initial >= 46.00  THEN 63
    WHEN p_initial >= 43.00  THEN 62
    WHEN p_initial >= 40.00  THEN 61
    WHEN p_initial >= 25.00  THEN 60
    ELSE 60                            -- 24.99 - 0.00, the default minimum
  END;
$$;

COMMENT ON FUNCTION procurements.sms_transmute_grade_matatag(NUMERIC) IS
  'DepEd''s issued MATATAG transmutation table (migration 176, superseding the workbook HELPER table 173 read out of the E-Class Record file). Mirror of MATATAG_TRANSMUTATION_TABLE in lib/constants/classRecord.ts.';

GRANT EXECUTE ON FUNCTION procurements.sms_transmute_grade_matatag(NUMERIC) TO authenticated;
