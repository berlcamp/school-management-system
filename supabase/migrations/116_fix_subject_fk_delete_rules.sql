-- ============================================================================
-- FIX: deleting a subject fails with 23503 "Key is still referenced from table
--      sms_subject_schedules", even though every migration declares the FK as
--      ON DELETE CASCADE.
-- ============================================================================
-- 004 created sms_subject_schedules with
--   subject_id BIGINT NOT NULL REFERENCES procurements.sms_subjects(id) ON DELETE CASCADE
-- but wrapped it in CREATE TABLE **IF NOT EXISTS**. The table already existed in
-- this database, so the whole statement was skipped and the pre-existing FK — no
-- delete rule, i.e. NO ACTION — survived. Nothing since has altered it (the only
-- later change is 016, which adds a school_id column), so the declared CASCADE
-- has never actually been in effect. The migration files and the live schema
-- have disagreed here since 004.
--
-- This is why /subjects could not delete anything: with NO ACTION the delete is
-- rejected outright rather than taking the 988 schedule rows with it.
--
-- Every other FK into sms_subjects was declared the same way inside a
-- CREATE TABLE IF NOT EXISTS (001 sms_grades, 034 sms_student_subjects,
-- 070 sms_mps, 080 sms_class_records, 096 sms_tos), so any of them may carry the
-- same drift. Postgres reports only the first constraint that blocks a delete,
-- so fixing them one error at a time would take as many rounds as there are
-- broken constraints. This repairs all of them in one pass.
--
-- Rather than name constraints (names vary when a table was created outside a
-- migration), the block below discovers every single-column FK that references
-- sms_subjects and re-creates any whose delete rule is wrong. It is idempotent:
-- a constraint already carrying the intended rule is left untouched.
--
-- Intended rules:
--   sms_tos.subject_id  -> SET NULL. Per 096 this is an optional link on a
--                          teacher-authored Table of Specification; the TOS (and
--                          its exams/competencies/items) must outlive the
--                          subject, and the column is nullable.
--   everything else     -> CASCADE. These columns are all NOT NULL, so SET NULL
--                          is not available, and the rows are meaningless
--                          without their subject.
--
-- Safe to cascade: nothing references sms_subject_schedules, and its only
-- triggers are updated_at and check_schedule_conflicts_before_insert_update
-- (BEFORE INSERT OR UPDATE — see 004), so neither fires on a cascaded delete.
--
-- NOTE ON sms_section_subjects: this legacy junction table exists in the
-- database but in no migration, and no application code reads or writes it (it
-- is debris alongside sms_section_students, dropped in 051). It is empty, so it
-- cannot be blocking anything today, but it is repaired here too so it cannot
-- start blocking subject deletes if anything ever writes to it. Dropping it
-- outright is the better cleanup and is left as a separate decision.
--
-- This changes DELETE semantics, which is the point: deleting a subject now
-- destroys its schedules, grades, class records, MPS entries and Madrasah
-- subject enrollments. The /subjects UI already gates that behind a super-admin
-- force-delete that requires typing the subject code (see List.tsx), and blocks
-- the delete for every other role in favour of deactivation.
-- ============================================================================

SET search_path TO procurements, public;

DO $$
DECLARE
  fk           RECORD;
  wanted       TEXT;
  wanted_code  "char";
BEGIN
  FOR fk IN
    SELECT c.oid          AS constraint_oid,
           c.conname      AS constraint_name,
           c.confdeltype  AS delete_code,
           tn.nspname     AS table_schema,
           t.relname      AS table_name,
           a.attname      AS column_name
    FROM pg_constraint c
    JOIN pg_class     t  ON t.oid  = c.conrelid
    JOIN pg_namespace tn ON tn.oid = t.relnamespace
    JOIN pg_class     r  ON r.oid  = c.confrelid
    JOIN pg_namespace rn ON rn.oid = r.relnamespace
    JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND rn.nspname = 'procurements'
      AND r.relname  = 'sms_subjects'
      AND array_length(c.conkey, 1) = 1
  LOOP
    IF fk.table_name = 'sms_tos' THEN
      wanted := 'SET NULL';
      wanted_code := 'n';
    ELSE
      wanted := 'CASCADE';
      wanted_code := 'c';
    END IF;

    IF fk.delete_code = wanted_code THEN
      RAISE NOTICE 'ok: %.% (%) already ON DELETE %',
        fk.table_schema, fk.table_name, fk.constraint_name, wanted;
      CONTINUE;
    END IF;

    RAISE NOTICE 'repairing: %.% (%) confdeltype % -> ON DELETE %',
      fk.table_schema, fk.table_name, fk.constraint_name, fk.delete_code, wanted;

    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      fk.table_schema, fk.table_name, fk.constraint_name
    );
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) '
      'REFERENCES procurements.sms_subjects(id) ON DELETE %s',
      fk.table_schema, fk.table_name, fk.constraint_name, fk.column_name, wanted
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- Verification: every row should read CASCADE, except sms_tos -> SET NULL.
-- ----------------------------------------------------------------------------
SELECT t.relname  AS referencing_table,
       a.attname  AS column_name,
       c.conname  AS constraint_name,
       CASE c.confdeltype
         WHEN 'c' THEN 'CASCADE'
         WHEN 'n' THEN 'SET NULL'
         WHEN 'a' THEN 'NO ACTION'
         WHEN 'r' THEN 'RESTRICT'
         WHEN 'd' THEN 'SET DEFAULT'
       END AS on_delete
FROM pg_constraint c
JOIN pg_class     t  ON t.oid  = c.conrelid
JOIN pg_class     r  ON r.oid  = c.confrelid
JOIN pg_namespace rn ON rn.oid = r.relnamespace
JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
WHERE c.contype = 'f'
  AND rn.nspname = 'procurements'
  AND r.relname  = 'sms_subjects'
ORDER BY t.relname;
