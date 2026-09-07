-- ============================================================================
-- MATATAG TRANSMUTATION — BACK TO THE E-CLASS RECORD WORKBOOK'S TABLE
-- ============================================================================
-- This reverses migration 176 and restores the table migration 173 shipped.
--
-- 173 built `sms_transmute_grade_matatag` from the conversion table on the
-- HELPER sheet of DepEd's updated E-Class Record workbook. 176 replaced it
-- with a separately published table on the reading that the published document
-- governs. That reading is now withdrawn: the workbook's table is the one the
-- division is grading with, and this migration puts it back.
--
-- THE EVIDENCE FOR THE WORKBOOK TABLE. A Grade 6 Science class record filed
-- from Sagmone Elementary School on the issued "K to 10 (Updated)" workbook
-- computes these Term Grades, and only the workbook table reproduces them:
--
--     Initial Grade    the sheet    workbook (this)    176 (published doc)
--        81.20             84             84                   83
--        72.40             77             77                   75
--        87.20             89             89                   89
--        89.20             91             91                   91
--        79.75             83             83                   81
--
-- Five of five under this table; two of five under 176's. A school filing on
-- the issued file is the strongest available statement of what the tables are
-- actually used for, and it is what settles it.
--
-- SCALE. Across the 10,001 Initial Grades from 0.00 to 100.00 the two tables
-- give a different Term Grade for 8,356 of them, by up to eight points. They
-- agree only at the pass mark (IG 70.00 -> 75) and at IG 84.00 -> 86.
--
-- ---------------------------------------------------------------------------
-- THIS ONE DOES MOVE GRADES, AND 176 DID NOT
-- ---------------------------------------------------------------------------
-- 176 could replace the function outright because not one class record was on
-- the matatag scheme -- there was nothing to rescore. That is no longer true:
-- 177 moved every SY 2026-2027 record onto matatag and re-posted it. So this
-- migration rescores real, posted grades, and the 121 `career_stage` rule is
-- engaged rather than satisfied.
--
-- It is done anyway, deliberately, because the alternative is worse: the
-- grades posted by 177 were computed with a table the division does not use,
-- and leaving them would mean every class record in the system disagreeing
-- with the workbook its teacher filed on. A term is only "signed on paper"
-- once it agrees with the paper. Check what you are about to move:
--
--   SELECT count(*) FROM procurements.sms_class_records
--    WHERE grading_scheme = 'matatag' AND is_posted;
--
-- If that is zero, this is a pure function swap and steps 1 and 3 are no-ops.
--
-- ROLLBACK: re-apply 176, then re-run step 3 here. The step 1 snapshot
-- restores the exact pre-178 grades:
--   UPDATE procurements.sms_grades g SET grade = b.grade, remarks = b.remarks
--     FROM procurements.sms_grades_pre_178_backup b WHERE b.id = g.id;
--
-- ---------------------------------------------------------------------------
-- DESCRIPTORS ARE NOT TOUCHED. The five bands the division supplied alongside
-- this table -- Advancing 90-100, Benchmarking 80-89, Connecting 75-79,
-- Developing 65-74, Emerging 60-64, with their General Descriptions -- are
-- already exactly what `lib/constants/classRecord.ts` carries, and descriptors
-- are app-layer only (173). Nothing in SQL expresses them.
--
-- The bands below are transcribed from the division's supplied table verbatim,
-- IG(Min.) by IG(Min.). 173's boundary caveat returns with them: the workbook
-- itself resolves the band with INDEX(D8:D48, MATCH(IG,B8:B48,-1)+1), which
-- lands one band low when the Initial Grade is exactly a listed minimum; the
-- published IG(Min.)/IG(Max.) bands are what is implemented here, and every
-- non-boundary value agrees with the workbook exactly.
--
-- One function replaced; one recovery table; no table, column, policy or
-- trigger touched.
-- ============================================================================


-- --------------------------------------------------------------------------
-- STEP 1 — snapshot every grade step 3 can overwrite
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_grades_pre_178_backup AS
SELECT g.*, NOW() AS backed_up_at
  FROM procurements.sms_grades g
 WHERE EXISTS (
   SELECT 1 FROM procurements.sms_class_records r
    WHERE r.is_posted
      AND r.grading_scheme  = 'matatag'
      AND r.subject_id      = g.subject_id
      AND r.section_id      = g.section_id
      AND r.grading_period  = g.grading_period
      AND r.school_year     = g.school_year
 );

COMMENT ON TABLE procurements.sms_grades_pre_178_backup IS
  'Recovery snapshot taken by migration 178 immediately before the MATATAG '
  'transmutation table was reverted to the E-Class Record workbook''s and '
  'grades were re-posted. Not part of the schema; drop once signed off.';


-- --------------------------------------------------------------------------
-- STEP 2 — restore the workbook table
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sms_transmute_grade_matatag(
  p_initial NUMERIC
) RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_initial IS NULL THEN NULL
    WHEN p_initial >=  99.50  THEN 100
    WHEN p_initial >=  98.32  THEN 99
    WHEN p_initial >=  97.14  THEN 98
    WHEN p_initial >=  95.96  THEN 97
    WHEN p_initial >=  94.78  THEN 96
    WHEN p_initial >=  93.60  THEN 95
    WHEN p_initial >=  92.42  THEN 94
    WHEN p_initial >=  91.24  THEN 93
    WHEN p_initial >=  90.06  THEN 92
    WHEN p_initial >=  88.88  THEN 91
    WHEN p_initial >=  87.70  THEN 90
    WHEN p_initial >=  86.52  THEN 89
    WHEN p_initial >=  85.34  THEN 88
    WHEN p_initial >=  84.16  THEN 87
    WHEN p_initial >=  82.98  THEN 86
    WHEN p_initial >=  81.80  THEN 85
    WHEN p_initial >=  80.62  THEN 84
    WHEN p_initial >=  79.44  THEN 83
    WHEN p_initial >=  78.26  THEN 82
    WHEN p_initial >=  77.08  THEN 81
    WHEN p_initial >=  75.90  THEN 80
    WHEN p_initial >=  74.72  THEN 79
    WHEN p_initial >=  73.54  THEN 78
    WHEN p_initial >=  72.36  THEN 77
    WHEN p_initial >=  71.18  THEN 76
    WHEN p_initial >=  70.00  THEN 75
    WHEN p_initial >=  65.34  THEN 74
    WHEN p_initial >=  60.67  THEN 73
    WHEN p_initial >=  56.01  THEN 72
    WHEN p_initial >=  51.34  THEN 71
    WHEN p_initial >=  46.67  THEN 70
    WHEN p_initial >=  42.01  THEN 69
    WHEN p_initial >=  37.34  THEN 68
    WHEN p_initial >=  32.68  THEN 67
    WHEN p_initial >=  28.01  THEN 66
    WHEN p_initial >=  23.35  THEN 65
    WHEN p_initial >=  18.68  THEN 64
    WHEN p_initial >=  14.01  THEN 63
    WHEN p_initial >=   9.35  THEN 62
    WHEN p_initial >=   4.68  THEN 61
    ELSE 60
  END::INTEGER;
$$;


-- --------------------------------------------------------------------------
-- STEP 3 — re-post, so sms_grades agrees with the restored table
-- --------------------------------------------------------------------------
DO $$
DECLARE
  r        RECORD;
  v_recs   INTEGER := 0;
  v_grades INTEGER := 0;
BEGIN
  FOR r IN
    SELECT id FROM procurements.sms_class_records
     WHERE is_posted AND grading_scheme = 'matatag'
     ORDER BY id
  LOOP
    v_grades := v_grades + procurements.post_class_record_grades(r.id);
    v_recs   := v_recs + 1;
  END LOOP;

  RAISE NOTICE 'migration 178: re-posted % class records, % learner-terms',
    v_recs, v_grades;
END $$;
