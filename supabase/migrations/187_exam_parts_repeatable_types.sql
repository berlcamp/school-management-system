-- ============================================================================
-- EXAM PARTS — A QUESTION TYPE MAY OPEN MORE THAN ONE PART
-- ============================================================================
-- 100 modelled a printed part AS its question type: one `sms_exam_sections` row
-- per type, `UNIQUE (exam_id, question_type)`. Real papers are not shaped that
-- way. The Division Office routinely issues an exam that runs Part I Multiple
-- Choice, Part II Essay, Part III Multiple Choice again — and a teacher encoding
-- it here finds Multiple Choice gone from the "Add part" list, with no way to
-- continue. They may not alter the paper or the TOS they were handed, so the
-- exam simply could not be encoded.
--
-- A part's identity becomes its POSITION rather than its type. The section row
-- already carries `position`, already NOT NULL, and the builder has always
-- written it as the part's index (`nonEmptyParts.map((p, i) => ...)`).
-- `question_type` stays on the row and keeps its meaning — it is the part's
-- heading and the source of its default directions — it simply stops being the
-- key.
--
-- THE SECOND HALF IS WHAT MAKES IT HONEST. Until now a question knew only its
-- type, and both the builder and the printed paper recovered the parts by
-- grouping CONSECUTIVE RUNS of it. That is exact while no two adjacent parts
-- share a type, and wrong the moment they do — Part I Multiple Choice followed
-- by Part II Multiple Choice (a different topic, different directions) would
-- save as two sections and reopen as one merged part, silently dropping the
-- second part's directions. So the question is given its part outright:
-- `sms_exam_questions.part_position`, matching the section's `position`.
--
-- NOTHING IS BACKFILLED, and that nullable default is load-bearing (the
-- 153/179/186 rule). NULL means "recover this part the way it has always been
-- recovered", so every exam predating this loads, prints and re-numbers exactly
-- as before; real values are written the first time an exam is saved through the
-- builder, one exam at a time, and clearing the column reverts to the run-based
-- reading without a migration.
--
-- NOTHING ELSE IN THE MODULE IS TOUCHED, because nothing else was ever keyed per
-- part: the answer key (132), the OMR answer sheet, 101's item analysis and the
-- continuous item numbering are all keyed per ITEM.
--
-- One constraint dropped, one nullable column, one unique index, and a
-- positional repair that is a no-op on well-formed data (see step 2). No table,
-- policy, trigger or function replaced.
--
-- Rows affected: the repair in step 2, normally none. To confirm before applying:
--   -- exams whose section positions are NOT already distinct (repaired below):
--   SELECT count(*) FROM (
--     SELECT exam_id FROM procurements.sms_exam_sections
--     GROUP BY exam_id, position HAVING count(*) > 1
--   ) d;
--   -- for reference, the whole table:
--   SELECT count(*) FROM procurements.sms_exam_sections;
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. Drop the per-type uniqueness
-- ----------------------------------------------------------------------------
-- 100 declared `UNIQUE (exam_id, question_type)` inline, so the constraint
-- carries an auto-generated name that can differ per database. Rediscovered from
-- pg_constraint rather than dropped by name, per the 116 lesson.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'procurements'
      AND rel.relname = 'sms_exam_sections'
      AND con.contype = 'u'
      AND (
        -- ::TEXT because attname is `name`, and name[] = text[] has no operator
        SELECT array_agg(att.attname::TEXT ORDER BY att.attname::TEXT)
        FROM unnest(con.conkey) AS k(attnum)
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
      ) = ARRAY['exam_id', 'question_type']
  LOOP
    EXECUTE format(
      'ALTER TABLE procurements.sms_exam_sections DROP CONSTRAINT %I', r.conname
    );
    RAISE NOTICE 'dropped unique constraint %', r.conname;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Make the section positions distinct per exam
-- ----------------------------------------------------------------------------
-- `position` is what identifies a part from here on, so it has to be unique
-- within an exam. The builder has always written 0..n-1, so this is expected to
-- touch nothing; it exists because 100 gave the column `DEFAULT 0`, which means
-- any row ever inserted without an explicit position collided silently while the
-- type was still the key.
--
-- Where a collision does exist the tie is broken by `id` — insertion order, and
-- so the order the parts were authored in. That is a guess, but it is the only
-- evidence the row carries, and it is a guess about the ORDER two parts print
-- in, never about their content: no question, option, subitem or direction is
-- rewritten here.
WITH renumbered AS (
  SELECT id,
         (ROW_NUMBER() OVER (PARTITION BY exam_id ORDER BY position, id) - 1)::INTEGER AS pos
  FROM procurements.sms_exam_sections
)
UPDATE procurements.sms_exam_sections s
   SET position = r.pos
  FROM renumbered r
 WHERE s.id = r.id
   AND s.position IS DISTINCT FROM r.pos;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_exam_sections_exam_position
  ON procurements.sms_exam_sections (exam_id, position);

-- ----------------------------------------------------------------------------
-- 3. Tell a question which part it is in
-- ----------------------------------------------------------------------------
-- Nullable and NOT backfilled: NULL is every pre-187 question and is read as
-- "group me by consecutive run of question_type", which is exactly what the
-- builder and the printed paper already did. An exam adopts the column by being
-- saved once through the builder.
--
-- No FK to sms_exam_sections: the builder rebuilds the section rows wholesale on
-- every save (DELETE then INSERT), so their ids churn while their positions do
-- not. The match is by value, on the number that is actually stable.
ALTER TABLE procurements.sms_exam_questions
  ADD COLUMN IF NOT EXISTS part_position INTEGER;

CREATE INDEX IF NOT EXISTS idx_sms_exam_questions_exam_part
  ON procurements.sms_exam_questions (exam_id, part_position, position);

-- ----------------------------------------------------------------------------
-- 4. Say so on the tables
-- ----------------------------------------------------------------------------
COMMENT ON TABLE procurements.sms_exam_sections IS
  'One printed part of an exam: its directions, its heading type and its order. '
  'Keyed on (exam_id, position) since migration 187 — a question type may open '
  'more than one part (I. Multiple Choice / II. Essay / III. Multiple Choice), '
  'which is how DepEd papers are actually issued.';

COMMENT ON COLUMN procurements.sms_exam_sections.question_type IS
  'The part heading and the source of its default directions. NOT a key: the '
  'same type may appear on several parts of one exam (migration 187).';

COMMENT ON COLUMN procurements.sms_exam_sections.position IS
  'The part''s order on the printed paper, 0-based, unique within the exam. This '
  'is the part''s identity (migration 187), matched by sms_exam_questions.part_position.';

COMMENT ON COLUMN procurements.sms_exam_questions.part_position IS
  'The position of the sms_exam_sections row this question is printed under '
  '(migration 187). NULL = pre-187 row: recover the part by grouping consecutive '
  'runs of question_type, which is what the builder and the paper always did.';
