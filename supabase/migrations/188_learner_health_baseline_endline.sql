-- ============================================================================
-- SF8 IS MEASURED TWICE A YEAR, NOT ONCE
-- ============================================================================
-- DepEd's Learner Basic Health and Nutrition Report is taken at the Beginning
-- of School Year (Baseline, around July) and again at the End (Endline, around
-- February-March). The pair IS the form: the School-Based Feeding Program
-- draws its beneficiaries from the learners who come out Severely Wasted or
-- Wasted at baseline, and endline is what shows whether they improved. A single
-- reading cannot answer the question the sheet is filed to answer.
--
-- sms_learner_health (023) holds ONE height / weight / band / measured_at per
-- learner per section per school year, and UNIQUE(student_id, section_id,
-- school_year) is what enforces that. Encoding the February measurement
-- therefore OVERWROTE the July one -- the baseline was not kept anywhere, so
-- the comparison the form exists for was destroyed by the act of recording its
-- second half.
--
-- ---------------------------------------------------------------------------
-- A row per reading, not a second set of columns
-- ---------------------------------------------------------------------------
-- measured_at, remarks, nutritional_status and height_for_age are already
-- per-reading facts. Modelling this as height_cm_bosy / height_cm_eosy would
-- duplicate six columns and force every consumer to branch on period twice.
-- A row instead means SF8 groups and the SRC filters, and -- the reason that
-- matters most -- the WHO banding in lib/utils/nutritionalStatus.ts reads the
-- learner's age AT THE DATE OF MEASUREMENT, so a second row is banded correctly
-- by the code that already exists, with no change at all.
--
-- ---------------------------------------------------------------------------
-- Nothing moves on apply, and that is the entire safety argument
-- ---------------------------------------------------------------------------
-- Every row on file today was taken early in the school year, so every row IS
-- the baseline; the backfill says so and is a verbatim classification, not a
-- guess (the 179 rule). After this is applied every stored figure, every band,
-- every SF8 printout and every SRC prefill is identical to what it was before.
-- Nothing changes until a school encodes an endline, one section at a time.
--
--   -- What is on file before applying. Every row should be counted here, and
--   -- all of them become 'baseline':
--   SELECT count(*) AS rows_to_backfill FROM procurements.sms_learner_health;
--
-- The DEFAULT is 'baseline' rather than being flipped to 'endline' later (the
-- opposite of 173's deliberate flip): a writer that does not know about periods
-- is far likelier to be encoding the year's first measurement, and the entry
-- screen always names the period explicitly anyway.
--
-- ---------------------------------------------------------------------------
-- The unique key is rediscovered, never named
-- ---------------------------------------------------------------------------
-- 023 declares UNIQUE(student_id, section_id, school_year) inside a
-- CREATE TABLE **IF NOT EXISTS**, which is exactly the trap migration 116
-- documented: where the table already existed the statement was skipped, so the
-- live constraint may carry a different name, may be a bare unique index made
-- through the Supabase table editor, or may not exist at all. Dropping it by
-- the name Postgres would have generated is therefore not safe. This finds it
-- by its COLUMN SET, handles constraint and bare index alike, and is idempotent
-- -- re-running it is a no-op once the four-column key is in place.
--
--   -- What is actually on the live table right now:
--   SELECT i.indexrelid::regclass AS index_name,
--          i.indisunique,
--          pg_get_indexdef(i.indexrelid) AS definition
--     FROM pg_index i
--     JOIN pg_class t     ON t.oid = i.indrelid
--     JOIN pg_namespace n ON n.oid = t.relnamespace
--    WHERE n.nspname = 'procurements' AND t.relname = 'sms_learner_health';
--
-- The client's upsert names the conflict target by column list
-- (HealthEntryTable.tsx), so it is widened to the four columns in the same
-- change -- PostgREST resolves on_conflict against a real unique index, and a
-- mismatch fails every save with a 409.
--
-- ---------------------------------------------------------------------------
-- src_autofill would otherwise double-count, so it is fixed here
-- ---------------------------------------------------------------------------
-- 112's Section II counts every sms_learner_health row for the school year. The
-- moment a section carries two readings, every BMI and height-for-age band in
-- the School Report Card doubles. The function is replaced with 'baseline' on
-- both branches, which reproduces today's figures EXACTLY -- no SRC already
-- drafted moves, and the whole function is reproduced verbatim from 112 below
-- with only those two predicates added, because CREATE OR REPLACE needs the
-- full body.
--
-- Reporting the endline in the SRC as well is deliberately NOT done here: it
-- needs a period key in SRC_HEALTH_COLUMNS and two further tables in
-- generateSchoolReportCard.ts, and 112's rule is that a filed SRC is a signed
-- snapshot. It is a separate decision, written down rather than assumed.
--
-- ---------------------------------------------------------------------------
-- Backing out
-- ---------------------------------------------------------------------------
-- Clearing the column does NOT restore the three-column key, and restoring it
-- fails while any endline row exists. A genuine revert is: delete the endline
-- rows, drop the four-column key, re-add the three-column one. Said plainly
-- because it is not the usual one-line revert the other columns here enjoy.
--
-- Touches: one column, one CHECK, one unique key swapped, one function
-- replaced. No table created, no policy, trigger or other function altered,
-- and no measurement rewritten.
-- ============================================================================

SET search_path TO procurements, public;

-- ---------------------------------------------------------------------------
-- 1. The column: nullable first, so the backfill decides every existing row
-- ---------------------------------------------------------------------------
ALTER TABLE procurements.sms_learner_health
  ADD COLUMN IF NOT EXISTS measurement_period TEXT;

UPDATE procurements.sms_learner_health
   SET measurement_period = 'baseline'
 WHERE measurement_period IS NULL;

ALTER TABLE procurements.sms_learner_health
  DROP CONSTRAINT IF EXISTS sms_learner_health_measurement_period_check;

-- CHECK-constrained per the 133/153 precedent rather than free TEXT per
-- 119/132: these two values are not a DepEd list that gets revised, and each
-- carries behaviour -- the value picks the column group on the printed SF8 and
-- decides which reading the School Report Card counts.
ALTER TABLE procurements.sms_learner_health
  ADD CONSTRAINT sms_learner_health_measurement_period_check
  CHECK (measurement_period IN ('baseline', 'endline'));

ALTER TABLE procurements.sms_learner_health
  ALTER COLUMN measurement_period SET DEFAULT 'baseline';

ALTER TABLE procurements.sms_learner_health
  ALTER COLUMN measurement_period SET NOT NULL;

COMMENT ON COLUMN procurements.sms_learner_health.measurement_period IS
  'Which of the school year''s two SF8 measurements this row is: ''baseline'' '
  '(Beginning of School Year, around July) or ''endline'' (End of School Year, '
  'around February-March). Migration 188; every row predating it is baseline. '
  'The School Report Card (src_autofill) counts baseline only.';

-- ---------------------------------------------------------------------------
-- 2. Widen the unique key, finding the old one by its columns (the 116 lesson)
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_idx     RECORD;
  v_conname TEXT;
BEGIN
  FOR v_idx IN
    -- The bare name out of pg_class, not indexrelid::regclass::text: regclass
    -- drops the schema whenever it is already on the search_path, and the
    -- unqualified form cannot then be split back apart.
    SELECT i.indexrelid,
           ic.relname AS index_name
      FROM pg_index i
      JOIN pg_class t     ON t.oid = i.indrelid
      JOIN pg_class ic    ON ic.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'procurements'
       AND t.relname = 'sms_learner_health'
       AND i.indisunique
       AND i.indpred IS NULL          -- a partial index is a different rule
       AND (
         SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM unnest(string_to_array(i.indkey::text, ' ')::int[]) AS k(attnum)
           JOIN pg_attribute a
             ON a.attrelid = i.indrelid AND a.attnum = k.attnum
       ) = ARRAY['school_year', 'section_id', 'student_id']
  LOOP
    -- A unique CONSTRAINT owns its index and must be dropped as a constraint;
    -- a bare unique index (the Supabase table editor makes these) is dropped as
    -- an index. Both shapes are live somewhere, so handle both.
    SELECT c.conname INTO v_conname
      FROM pg_constraint c
     WHERE c.conindid = v_idx.indexrelid;

    IF v_conname IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE procurements.sms_learner_health DROP CONSTRAINT %I',
        v_conname);
      RAISE NOTICE 'Dropped three-column unique constraint %', v_conname;
    ELSE
      EXECUTE format('DROP INDEX procurements.%I', v_idx.index_name);
      RAISE NOTICE 'Dropped three-column unique index %', v_idx.index_name;
    END IF;
  END LOOP;
END
$guard$;

DO $add$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class t     ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'procurements'
       AND t.relname = 'sms_learner_health'
       AND i.indisunique
       AND i.indpred IS NULL
       AND (
         SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM unnest(string_to_array(i.indkey::text, ' ')::int[]) AS k(attnum)
           JOIN pg_attribute a
             ON a.attrelid = i.indrelid AND a.attnum = k.attnum
       ) = ARRAY['measurement_period', 'school_year', 'section_id', 'student_id']
  ) THEN
    ALTER TABLE procurements.sms_learner_health
      ADD CONSTRAINT sms_learner_health_student_section_year_period_key
      UNIQUE (student_id, section_id, school_year, measurement_period);
  END IF;
END
$add$;

-- ---------------------------------------------------------------------------
-- 3. src_autofill -- 112's function verbatim, with baseline-only on Section II
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.src_autofill(
  p_school_id BIGINT,
  p_school_year TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_enrollment      JSONB;
  v_health          JSONB;
  v_performance     JSONB;
  v_teacher_count   INT;
  v_classroom_count INT;
  v_total_enrolled  INT;
  v_dropped         INT;
  v_promoted        INT;
  v_dropout_rate    NUMERIC(5, 2);
  v_promotion_rate  NUMERIC(5, 2);
  v_lt_rows         JSONB;
  v_lc_rows         JSONB;
BEGIN
  -- Section I — enrollment by grade level, semester and sex.
  SELECT COALESCE(jsonb_agg(r ORDER BY r.grade_level, r.semester NULLS FIRST), '[]'::jsonb)
    INTO v_enrollment
    FROM (
      SELECT
        p_school_year                                       AS school_year,
        e.grade_level                                       AS grade_level,
        e.semester                                          AS semester,
        COUNT(*) FILTER (WHERE st.gender = 'male')::int     AS male,
        COUNT(*) FILTER (WHERE st.gender = 'female')::int   AS female
      FROM procurements.sms_enrollments e
      JOIN procurements.sms_students st ON st.id = e.student_id
      WHERE e.school_id = p_school_id
        AND e.school_year = p_school_year
        AND e.enrollment_status IN
          ('active', 'completed', 'promoted', 'retained', 'graduated')
      GROUP BY e.grade_level, e.semester
    ) r;

  -- Section II — BMI-for-age and height-for-age bands by grade level and sex.
  -- Scoped through the section the measurement was taken in (sms_learner_health
  -- has no school_id); that section is at the school the learner attends.
  SELECT COALESCE(jsonb_agg(r ORDER BY r.band_type, r.grade_level, r.sex), '[]'::jsonb)
    INTO v_health
    FROM (
      SELECT
        sec.grade_level        AS grade_level,
        st.gender              AS sex,
        'bmi'                  AS band_type,
        lh.nutritional_status  AS band,
        COUNT(*)::int          AS count
      FROM procurements.sms_learner_health lh
      JOIN procurements.sms_sections sec ON sec.id = lh.section_id
      JOIN procurements.sms_students st  ON st.id = lh.student_id
      WHERE sec.school_id = p_school_id
        AND lh.school_year = p_school_year
        AND lh.nutritional_status IS NOT NULL
        -- Baseline only (migration 188). Two readings per learner now
        -- exist; counting both would double every band in this section.
        AND lh.measurement_period = 'baseline'
      GROUP BY sec.grade_level, st.gender, lh.nutritional_status

      UNION ALL

      SELECT
        sec.grade_level     AS grade_level,
        st.gender           AS sex,
        'hfa'               AS band_type,
        lh.height_for_age   AS band,
        COUNT(*)::int       AS count
      FROM procurements.sms_learner_health lh
      JOIN procurements.sms_sections sec ON sec.id = lh.section_id
      JOIN procurements.sms_students st  ON st.id = lh.student_id
      WHERE sec.school_id = p_school_id
        AND lh.school_year = p_school_year
        AND lh.height_for_age IS NOT NULL
        -- Baseline only (migration 188). Two readings per learner now
        -- exist; counting both would double every band in this section.
        AND lh.measurement_period = 'baseline'
      GROUP BY sec.grade_level, st.gender, lh.height_for_age
    ) r;

  -- Section IX — general average per learning area, across grading periods.
  SELECT COALESCE(jsonb_agg(r ORDER BY r.grade_level, r.subject), '[]'::jsonb)
    INTO v_performance
    FROM (
      SELECT
        sec.grade_level                        AS grade_level,
        NULL::int                              AS semester,
        sub.name                               AS subject,
        ROUND(AVG(g.grade), 2)                 AS general_average
      FROM procurements.sms_grades g
      JOIN procurements.sms_sections sec ON sec.id = g.section_id
      JOIN procurements.sms_subjects sub ON sub.id = g.subject_id
      WHERE sec.school_id = p_school_id
        AND g.school_year = p_school_year
      GROUP BY sec.grade_level, sub.name
    ) r;

  -- Sections VII & VIII — dropout and promotion rates over BOSY enrollment.
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE e.enrollment_status = 'dropped')::int,
    COUNT(*) FILTER (WHERE e.enrollment_status IN ('promoted', 'graduated'))::int
  INTO v_total_enrolled, v_dropped, v_promoted
  FROM procurements.sms_enrollments e
  WHERE e.school_id = p_school_id
    AND e.school_year = p_school_year
    AND e.enrollment_status IN
      ('active', 'completed', 'promoted', 'retained', 'graduated', 'dropped');

  IF v_total_enrolled > 0 THEN
    v_dropout_rate   := ROUND((v_dropped::numeric  / v_total_enrolled) * 100, 2);
    v_promotion_rate := ROUND((v_promoted::numeric / v_total_enrolled) * 100, 2);
  END IF;

  -- Sections XIII & XIV — ratio denominators.
  -- Teachers are counted by type, not staff_category_code: the latter (added
  -- in migration 071 for the non-teaching breakdown) is NULL on rows predating
  -- it, so counting by it would undercount.
  SELECT COUNT(*)::int
    INTO v_teacher_count
    FROM procurements.sms_users u
   WHERE u.school_id = p_school_id
     AND u.is_active
     AND u.type = 'teacher';

  SELECT COUNT(*)::int
    INTO v_classroom_count
    FROM procurements.sms_rooms r
   WHERE r.school_id = p_school_id
     AND r.is_active
     AND r.room_type = 'classroom';

  -- Per-grade learner counts drive the ratio tables; units are school-wide.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'grade_level', t.grade_level,
             'learners',    t.learners,
             'units',       v_teacher_count
           ) ORDER BY t.grade_level), '[]'::jsonb)
    INTO v_lt_rows
    FROM (
      SELECT e.grade_level, COUNT(*)::int AS learners
        FROM procurements.sms_enrollments e
       WHERE e.school_id = p_school_id
         AND e.school_year = p_school_year
         AND e.enrollment_status IN
           ('active', 'completed', 'promoted', 'retained', 'graduated')
       GROUP BY e.grade_level
    ) t;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'grade_level', t.grade_level,
             'learners',    t.learners,
             'units',       v_classroom_count
           ) ORDER BY t.grade_level), '[]'::jsonb)
    INTO v_lc_rows
    FROM (
      SELECT e.grade_level, COUNT(*)::int AS learners
        FROM procurements.sms_enrollments e
       WHERE e.school_id = p_school_id
         AND e.school_year = p_school_year
         AND e.enrollment_status IN
           ('active', 'completed', 'promoted', 'retained', 'graduated')
       GROUP BY e.grade_level
    ) t;

  RETURN jsonb_build_object(
    'enrollment',           jsonb_build_object('rows', v_enrollment),
    'health',               jsonb_build_object('rows', v_health),
    'academic_performance', jsonb_build_object('rows', v_performance),
    'dropouts', jsonb_build_object(
      'rows', jsonb_build_array(jsonb_build_object(
        'school_year', p_school_year,
        'frequency',   v_dropped,
        'percentage',  v_dropout_rate
      )),
      'causes', '[]'::jsonb
    ),
    'promotion', jsonb_build_object(
      'rows', jsonb_build_array(jsonb_build_object(
        'school_year', p_school_year,
        'frequency',   v_promoted,
        'percentage',  v_promotion_rate
      ))
    ),
    'learner_teacher',   jsonb_build_object('rows', v_lt_rows),
    'learner_classroom', jsonb_build_object('rows', v_lc_rows),
    'indicators', jsonb_build_object(
      'teacher_count',   v_teacher_count,
      'classroom_count', v_classroom_count,
      'dropout_rate',    v_dropout_rate,
      'promotion_rate',  v_promotion_rate
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION procurements.src_autofill(BIGINT, TEXT) TO authenticated;
