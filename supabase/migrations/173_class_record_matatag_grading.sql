-- ============================================================================
-- CLASS RECORD — MATATAG TRANSMUTATION + DESCRIPTORS (updated DepEd E-Class Record)
-- ============================================================================
-- DepEd reissued the K-to-10 Electronic Class Record ("K to 10 (Updated)").
-- Three things changed in the computation, and 080/081 encode the old ones:
--
--   1. THE TRANSMUTATION TABLE IS DIFFERENT. 080's `sms_transmute_grade` is the
--      DO 8, s. 2015 table, where an Initial Grade of 60.00 transmutes to 75.
--      The updated ECR's HELPER!B8:D48 moves the passing floor to an IG of
--      70.00, steps ~1.18 above the pass mark and ~4.66 below it:
--
--        IG 84.00  ->  DO 8: 90   updated: 86
--        IG 70.00  ->  DO 8: 81   updated: 75
--        IG 60.00  ->  DO 8: 75   updated: 73
--
--   2. TRANSMUTATION IS NO LONGER OPTIONAL. The workbook's Term Grade cell is
--      an unconditional INDEX/MATCH into that table; there is no toggle.
--      080's `use_transmutation` defaults to FALSE, so most records today post
--      the rounded Initial Grade instead.
--
--   3. THE DESCRIPTORS ARE REPLACED. Outstanding / Very Satisfactory /
--      Satisfactory / Fairly Satisfactory / Did Not Meet Expectations become
--      Advancing (90-100) / Benchmarking (80-89) / Connecting (75-79) /
--      Developing (65-74) / Emerging (60-64). Descriptors are app-layer only
--      (`lib/constants/classRecord.ts`), so nothing about them is in here.
--
-- WHY A SCHEME COLUMN RATHER THAN A REWRITE. A term grade is posted into
-- sms_grades, printed on a class record, and read back by the learner in the
-- student portal. Replacing `sms_transmute_grade` in place would silently
-- rescore every record that is ever re-posted, including terms already signed
-- off on paper -- the 121 `career_stage` rule and 152's `comprehension_total`
-- rule, in that order. So the scheme is pinned on the record row and never
-- re-derived from the school year.
--
-- THE DEFAULT IS LOAD-BEARING (the 153/160 rule). The column is backfilled
-- 'legacy' for every existing record, so no stored grade, posted grade or
-- printed record moves on apply; the DEFAULT is only then flipped to
-- 'matatag', so records created from here on adopt the updated computation.
-- Reverting a single record is `SET grading_scheme = 'legacy'` -- no migration.
--
-- ONE KNOWN DIVERGENCE FROM THE WORKBOOK, DELIBERATE. The ECR resolves the
-- band with INDEX(D8:D48, MATCH(IG, B8:B48, -1) + 1), which lands one band low
-- when the Initial Grade is *exactly* a listed minimum (IG 71.18 returns 75,
-- while the workbook's own IG(Min.)/IG(Max.) columns band 71.18-72.35 as 76).
-- This function reproduces the published band table, which is the artifact
-- DepEd documents and the one a teacher reads. Every non-boundary value agrees
-- with the workbook exactly.
--
-- Read-only -- how many records this changes the behaviour of (none: they are
-- all backfilled 'legacy'), and how many would post differently if moved:
--
--   SELECT grading_scheme, use_transmutation, COUNT(*)
--     FROM procurements.sms_class_records
--    GROUP BY 1, 2 ORDER BY 1, 2;
--
-- Scope: one nullable-then-backfilled column, one new function, and a replaced
-- `post_class_record_grades`. `sms_transmute_grade` is NOT touched -- legacy
-- records still resolve through it. No policy, trigger or existing function is
-- replaced, and no grade row is rewritten.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. Which grading scheme this record was opened under.
--    Added nullable and backfilled rather than declared with a DEFAULT, so the
--    two defaults ('legacy' for what exists, 'matatag' for what comes next) can
--    differ. Guarded per 116: ADD COLUMN IF NOT EXISTS skips the CHECK when the
--    column already exists, so the constraint is added separately.
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_class_records
  ADD COLUMN IF NOT EXISTS grading_scheme TEXT;

UPDATE procurements.sms_class_records
   SET grading_scheme = 'legacy'
 WHERE grading_scheme IS NULL;

ALTER TABLE procurements.sms_class_records
  ALTER COLUMN grading_scheme SET NOT NULL;

ALTER TABLE procurements.sms_class_records
  ALTER COLUMN grading_scheme SET DEFAULT 'matatag';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sms_class_records_grading_scheme_check'
       AND conrelid = 'procurements.sms_class_records'::regclass
  ) THEN
    ALTER TABLE procurements.sms_class_records
      ADD CONSTRAINT sms_class_records_grading_scheme_check
      CHECK (grading_scheme IN ('legacy', 'matatag'));
  END IF;
END $$;

COMMENT ON COLUMN procurements.sms_class_records.grading_scheme IS
  'Which grading scheme the Term Grade is computed under: legacy = DO 8 s.2015 table, honouring use_transmutation; matatag = the updated K-to-10 ECR table, always transmuted. Pinned at creation and never re-derived (migration 173).';

-- ----------------------------------------------------------------------------
-- 2. The updated K-to-10 ECR transmutation table (HELPER!B8:D48).
--    A new function, not a replacement: legacy records still need the old one.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sms_transmute_grade_matatag(p_initial NUMERIC)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_initial IS NULL   THEN NULL
    WHEN p_initial >= 99.50  THEN 100
    WHEN p_initial >= 98.32  THEN 99
    WHEN p_initial >= 97.14  THEN 98
    WHEN p_initial >= 95.96  THEN 97
    WHEN p_initial >= 94.78  THEN 96
    WHEN p_initial >= 93.60  THEN 95
    WHEN p_initial >= 92.42  THEN 94
    WHEN p_initial >= 91.24  THEN 93
    WHEN p_initial >= 90.06  THEN 92
    WHEN p_initial >= 88.88  THEN 91
    WHEN p_initial >= 87.70  THEN 90
    WHEN p_initial >= 86.52  THEN 89
    WHEN p_initial >= 85.34  THEN 88
    WHEN p_initial >= 84.16  THEN 87
    WHEN p_initial >= 82.98  THEN 86
    WHEN p_initial >= 81.80  THEN 85
    WHEN p_initial >= 80.62  THEN 84
    WHEN p_initial >= 79.44  THEN 83
    WHEN p_initial >= 78.26  THEN 82
    WHEN p_initial >= 77.08  THEN 81
    WHEN p_initial >= 75.90  THEN 80
    WHEN p_initial >= 74.72  THEN 79
    WHEN p_initial >= 73.54  THEN 78
    WHEN p_initial >= 72.36  THEN 77
    WHEN p_initial >= 71.18  THEN 76
    WHEN p_initial >= 70.00  THEN 75
    WHEN p_initial >= 65.34  THEN 74
    WHEN p_initial >= 60.67  THEN 73
    WHEN p_initial >= 56.01  THEN 72
    WHEN p_initial >= 51.34  THEN 71
    WHEN p_initial >= 46.67  THEN 70
    WHEN p_initial >= 42.01  THEN 69
    WHEN p_initial >= 37.34  THEN 68
    WHEN p_initial >= 32.68  THEN 67
    WHEN p_initial >= 28.01  THEN 66
    WHEN p_initial >= 23.35  THEN 65
    WHEN p_initial >= 18.68  THEN 64
    WHEN p_initial >= 14.01  THEN 63
    WHEN p_initial >= 9.35   THEN 62
    WHEN p_initial >= 4.68   THEN 61
    ELSE 60
  END;
$$;

COMMENT ON FUNCTION procurements.sms_transmute_grade_matatag(NUMERIC) IS
  'Updated K-to-10 E-Class Record transmutation table (migration 173). Mirror of MATATAG_TRANSMUTATION_TABLE in lib/constants/classRecord.ts.';

-- ----------------------------------------------------------------------------
-- 3. Posting resolves the Term Grade through the record's own scheme.
--    Everything else -- the component percentage scores, the enrolment filter,
--    the skip for a learner with no score, the upsert into sms_grades -- is
--    080's, unchanged.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.post_class_record_grades(p_class_record_id BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO procurements, public
AS $$
DECLARE
  rec          procurements.sms_class_records%ROWTYPE;
  v_student_id BIGINT;
  v_ww         NUMERIC;
  v_pt         NUMERIC;
  v_st         NUMERIC;
  v_initial    NUMERIC;
  v_term       INTEGER;
  v_posted     INTEGER := 0;
  v_has_score  BOOLEAN;
BEGIN
  SELECT * INTO rec FROM procurements.sms_class_records WHERE id = p_class_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class record % not found', p_class_record_id;
  END IF;

  FOR v_student_id IN
    SELECT e.student_id
    FROM procurements.sms_enrollments e
    WHERE e.section_id = rec.section_id
      AND e.school_year = rec.school_year
      AND e.status = 'approved'
      AND e.enrollment_status IN ('active', 'promoted', 'graduated', 'retained', 'completed')
  LOOP
    -- Skip learners with no score entered anywhere in this record.
    SELECT EXISTS (
      SELECT 1
      FROM procurements.sms_class_record_scores s
      JOIN procurements.sms_class_record_items i ON i.id = s.item_id
      WHERE i.class_record_id = rec.id
        AND s.student_id = v_student_id
        AND s.raw_score IS NOT NULL
    ) INTO v_has_score;

    IF NOT v_has_score THEN
      CONTINUE;
    END IF;

    -- Per-component percentage score (missing scores count as 0 on post).
    v_ww := procurements.sms_class_record_component_ps(rec.id, v_student_id, 'WW');
    v_pt := procurements.sms_class_record_component_ps(rec.id, v_student_id, 'PT');
    v_st := procurements.sms_class_record_component_ps(rec.id, v_student_id, 'ST');

    v_initial := COALESCE(v_ww, 0) * rec.ww_weight / 100.0
               + COALESCE(v_pt, 0) * rec.pt_weight / 100.0
               + COALESCE(v_st, 0) * rec.st_weight / 100.0;

    IF rec.grading_scheme = 'matatag' THEN
      -- The updated ECR always transmutes; use_transmutation does not apply.
      v_term := procurements.sms_transmute_grade_matatag(v_initial);
    ELSIF rec.use_transmutation THEN
      v_term := procurements.sms_transmute_grade(v_initial);
    ELSE
      v_term := ROUND(v_initial);
    END IF;

    INSERT INTO procurements.sms_grades (
      student_id, subject_id, section_id, grading_period, school_year,
      grade, remarks, teacher_id
    ) VALUES (
      v_student_id, rec.subject_id, rec.section_id, rec.grading_period, rec.school_year,
      v_term, CASE WHEN v_term >= 75 THEN 'Passed' ELSE 'Failed' END, rec.teacher_id
    )
    ON CONFLICT (student_id, subject_id, section_id, grading_period, school_year)
    DO UPDATE SET
      grade = EXCLUDED.grade,
      remarks = EXCLUDED.remarks,
      teacher_id = EXCLUDED.teacher_id,
      updated_at = NOW();

    v_posted := v_posted + 1;
  END LOOP;

  UPDATE procurements.sms_class_records SET is_posted = true, updated_at = NOW()
  WHERE id = rec.id;

  RETURN v_posted;
END;
$$;

GRANT EXECUTE ON FUNCTION procurements.sms_transmute_grade_matatag(NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.post_class_record_grades(BIGINT) TO authenticated;
