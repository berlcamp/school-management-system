-- ============================================================================
-- CLASS RECORD — WEIGHTED BLOCKS (GMRC / VALUES EDUCATION)
-- ============================================================================
-- 080 modelled a class record as exactly three weighted components, because
-- that is what every DepEd E-Class Record had: Written Works, Performance
-- Tasks, and the summative component. The updated GMRC / Values Education
-- workbook does not fit, and cannot be made to:
--
--   WW  |- Cognitive Domain      5 items   10%
--       `- Affective Domain      5 items   10%
--   PT  |- Cognitive Domain      3 items   10%
--       |- Affective Domain      3 items   10%
--       `- Behavioral Domain     3 items   30%
--   EX     ST1 / ST2 / TE                  30%
--                                         ----
--                                         100%
--
-- Six independently weighted blocks where sms_class_records has three weight
-- columns. The Initial Grade is the sum of six weighted scores, and the Term
-- Grade and descriptor go through 173's table unchanged -- only the shape of
-- the left-hand side is new.
--
-- WHY A TABLE RATHER THAN THREE MORE COLUMNS. The domains are not a fixed
-- extra three: they nest under WW and PT, they carry their own labels, and a
-- DepEd revision that adds a domain or moves one between parents would be
-- another pair of columns and another special case in every consumer. A block
-- row makes the layout data, so a revision is a seed change (the 172 lesson
-- about interleaving strand rows rather than adding a grouping table per
-- level).
--
-- NOTHING EXISTING IS TOUCHED, AND THE DEFAULT IS LOAD-BEARING (153/160/173).
-- `form_layout` is backfilled 'standard' for every existing record and its
-- DEFAULT stays 'standard' -- unlike 173, it does NOT flip, because a blocked
-- layout is opted into per subject rather than adopted school-wide. A standard
-- record has no block rows, its items keep `block_id` NULL, and
-- `post_class_record_grades` takes exactly 080/081's path for it: the three
-- weight columns keep their meaning and their readers, and every one of the
-- ~950 records that exist today computes byte-identically after this applies.
--
-- ONE RULE, NOT TWO. A block's percentage score uses the per-item weighted
-- model when its component is 'ST' and the SUM(raw)/SUM(HPS) model otherwise --
-- the same sentence 081 already wrote for the three-component form, applied
-- per block. No `ps_model` column: a second place to say it is a second place
-- for it to disagree.
--
-- SWITCHING LAYOUT IS GUARDED IN THE DATABASE. Moving a record between layouts
-- rewrites its blocks, and dropping a block cascades its items and their
-- scores. `check_class_record_layout_change` refuses the switch once any score
-- is encoded under the record, so the destructive path only exists while there
-- is nothing to destroy. It guards the UPDATE rather than the block DELETE
-- deliberately: a BEFORE DELETE guard on the blocks would also refuse the
-- cascade from deleting the class record itself.
--
-- Read-only -- what exists before this applies (every record is 'standard'):
--
--   SELECT count(*) FROM procurements.sms_class_records;
--   SELECT count(*) FROM procurements.sms_class_record_items WHERE block_id IS NOT NULL;
--
-- Scope: one new table, two nullable-then-backfilled columns, one new
-- function, one new trigger, and a replaced `post_class_record_grades`. No
-- existing table, policy or trigger is replaced and no row is rewritten.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. Which form this record follows.
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_class_records
  ADD COLUMN IF NOT EXISTS form_layout TEXT;

UPDATE procurements.sms_class_records
   SET form_layout = 'standard'
 WHERE form_layout IS NULL;

ALTER TABLE procurements.sms_class_records
  ALTER COLUMN form_layout SET NOT NULL;

ALTER TABLE procurements.sms_class_records
  ALTER COLUMN form_layout SET DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sms_class_records_form_layout_check'
       AND conrelid = 'procurements.sms_class_records'::regclass
  ) THEN
    ALTER TABLE procurements.sms_class_records
      ADD CONSTRAINT sms_class_records_form_layout_check
      CHECK (form_layout IN ('standard', 'gmrc'));
  END IF;
END $$;

COMMENT ON COLUMN procurements.sms_class_records.form_layout IS
  'standard = 080''s three weighted components; gmrc = the six weighted blocks in sms_class_record_blocks (migration 175).';

-- ----------------------------------------------------------------------------
-- 2. The weighted blocks of a non-standard form.
--    A standard record has no rows here at all.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_class_record_blocks (
  id BIGSERIAL PRIMARY KEY,
  class_record_id BIGINT NOT NULL
    REFERENCES procurements.sms_class_records(id) ON DELETE CASCADE,
  -- Which of the three printed groups the block sits under. Also decides how
  -- its percentage score is computed: 'ST' uses per-item weights (081), the
  -- others SUM(raw)/SUM(HPS).
  component TEXT NOT NULL CHECK (component IN ('WW', 'PT', 'ST')),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  weight NUMERIC(5,2) NOT NULL CHECK (weight >= 0 AND weight <= 100),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_record_id, code)
);

COMMENT ON TABLE procurements.sms_class_record_blocks IS
  'One independently weighted block of a non-standard class record form — the GMRC domains (migration 175). Absent entirely on a standard record.';

CREATE INDEX IF NOT EXISTS idx_sms_class_record_blocks_record
  ON procurements.sms_class_record_blocks(class_record_id, position);

DROP TRIGGER IF EXISTS update_sms_class_record_blocks_updated_at
  ON procurements.sms_class_record_blocks;

CREATE TRIGGER update_sms_class_record_blocks_updated_at
  BEFORE UPDATE ON procurements.sms_class_record_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. Which block an item belongs to. NULL on every item that exists today,
--    and on every item of a standard record from here on.
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_class_record_items
  ADD COLUMN IF NOT EXISTS block_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sms_class_record_items_block_id_fkey'
       AND conrelid = 'procurements.sms_class_record_items'::regclass
  ) THEN
    -- Declared here rather than inline: 116's lesson is that a delete rule
    -- inside CREATE TABLE IF NOT EXISTS is silently skipped, and the same is
    -- true of ADD COLUMN IF NOT EXISTS.
    ALTER TABLE procurements.sms_class_record_items
      ADD CONSTRAINT sms_class_record_items_block_id_fkey
      FOREIGN KEY (block_id)
      REFERENCES procurements.sms_class_record_blocks(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sms_class_record_items_block
  ON procurements.sms_class_record_items(block_id)
  WHERE block_id IS NOT NULL;

COMMENT ON COLUMN procurements.sms_class_record_items.block_id IS
  'The weighted block this column belongs to (migration 175). NULL = a standard record, where the item''s `component` alone places it.';

-- ----------------------------------------------------------------------------
-- 4. A block's percentage score for one learner.
--    Same two models 081 established, chosen by the block's component.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sms_class_record_block_ps(
  p_block_id BIGINT,
  p_student_id BIGINT
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN (SELECT b.component FROM procurements.sms_class_record_blocks b
           WHERE b.id = p_block_id) = 'ST' THEN (
      SELECT CASE
        WHEN SUM(i.weight) IS NULL OR SUM(i.weight) = 0 THEN NULL
        ELSE ROUND(
          SUM( (COALESCE(s.raw_score, 0) / i.max_score * 100) * i.weight )
          / SUM(i.weight), 2)
      END
      FROM procurements.sms_class_record_items i
      LEFT JOIN procurements.sms_class_record_scores s
        ON s.item_id = i.id AND s.student_id = p_student_id
      WHERE i.block_id = p_block_id
    )
    ELSE (
      SELECT CASE
        WHEN SUM(i.max_score) IS NULL OR SUM(i.max_score) = 0 THEN NULL
        ELSE ROUND(SUM(COALESCE(s.raw_score, 0)) / SUM(i.max_score) * 100, 2)
      END
      FROM procurements.sms_class_record_items i
      LEFT JOIN procurements.sms_class_record_scores s
        ON s.item_id = i.id AND s.student_id = p_student_id
      WHERE i.block_id = p_block_id
    )
  END;
$$;

COMMENT ON FUNCTION procurements.sms_class_record_block_ps(BIGINT, BIGINT) IS
  'Percentage score of one weighted block for one learner (migration 175). Mirror of blockPS() in the class record client.';

-- ----------------------------------------------------------------------------
-- 5. A layout switch rewrites the blocks, which cascades their scores away.
--    Allowed only while there is nothing encoded to lose.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.check_class_record_layout_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF NEW.form_layout IS NOT DISTINCT FROM OLD.form_layout THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM procurements.sms_class_record_scores s
      JOIN procurements.sms_class_record_items i ON i.id = s.item_id
     WHERE i.class_record_id = NEW.id
       AND s.raw_score IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'This class record already has scores encoded — clear them before changing its form.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION procurements.check_class_record_layout_change() IS
  'Refuses a form_layout change once any raw score is encoded under the record (migration 175): the switch rewrites the blocks and would cascade those scores away.';

DROP TRIGGER IF EXISTS check_class_record_layout_change_trigger
  ON procurements.sms_class_records;

CREATE TRIGGER check_class_record_layout_change_trigger
  BEFORE UPDATE OF form_layout
  ON procurements.sms_class_records
  FOR EACH ROW
  EXECUTE FUNCTION procurements.check_class_record_layout_change();

-- ----------------------------------------------------------------------------
-- 6. Posting: sum the blocks when there are any, else 080/081's three
--    components exactly as before. Everything else is unchanged from 173.
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
  v_initial    NUMERIC;
  v_term       INTEGER;
  v_posted     INTEGER := 0;
  v_has_score  BOOLEAN;
  v_has_blocks BOOLEAN;
BEGIN
  SELECT * INTO rec FROM procurements.sms_class_records WHERE id = p_class_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class record % not found', p_class_record_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_class_record_blocks b
     WHERE b.class_record_id = rec.id
  ) INTO v_has_blocks;

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

    IF v_has_blocks THEN
      SELECT COALESCE(SUM(
               COALESCE(procurements.sms_class_record_block_ps(b.id, v_student_id), 0)
               * b.weight / 100.0
             ), 0)
        INTO v_initial
        FROM procurements.sms_class_record_blocks b
       WHERE b.class_record_id = rec.id;
    ELSE
      -- Per-component percentage score (missing scores count as 0 on post).
      v_initial :=
          COALESCE(procurements.sms_class_record_component_ps(rec.id, v_student_id, 'WW'), 0)
            * rec.ww_weight / 100.0
        + COALESCE(procurements.sms_class_record_component_ps(rec.id, v_student_id, 'PT'), 0)
            * rec.pt_weight / 100.0
        + COALESCE(procurements.sms_class_record_component_ps(rec.id, v_student_id, 'ST'), 0)
            * rec.st_weight / 100.0;
    END IF;

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

-- ----------------------------------------------------------------------------
-- 7. RLS + GRANTS, matching 080's convention (authenticated, with school and
--    teacher scoping done in the app layer).
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_class_record_blocks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'procurements'
       AND tablename = 'sms_class_record_blocks'
       AND policyname = 'Class record blocks: select'
  ) THEN
    CREATE POLICY "Class record blocks: select" ON procurements.sms_class_record_blocks
      FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "Class record blocks: insert" ON procurements.sms_class_record_blocks
      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY "Class record blocks: update" ON procurements.sms_class_record_blocks
      FOR UPDATE USING (auth.role() = 'authenticated');
    CREATE POLICY "Class record blocks: delete" ON procurements.sms_class_record_blocks
      FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_class_record_blocks TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_class_record_blocks_id_seq TO authenticated;

GRANT EXECUTE ON FUNCTION procurements.sms_class_record_block_ps(BIGINT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.post_class_record_grades(BIGINT) TO authenticated;
