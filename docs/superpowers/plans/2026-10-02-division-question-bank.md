# Division Question Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the DepEd question-bank flow: a division competency catalogue every TOS picks from, a division-wide Least Learned Competencies list pooled from Summative Test results, QA-reviewed bank questions written for those competencies, and bank questions usable item-by-item in division exams.

**Architecture:** One additive migration (`195_question_bank.sql`) built up across Tasks 1–4 and tested by one rolled-back SQL scenario file (`supabase/tests/195_question_bank.sql`). The database enforces every rule (guard triggers, RLS, SECURITY DEFINER RPCs extending 194's `exam_review_*` machinery); the client mirrors the rules in pure, vitest-covered helpers and only shapes the screens. The exam builder copies an approved bank question into its in-memory draft and the database validates the copy on save.

**Tech Stack:** PostgreSQL (Supabase, `procurements` schema), Next.js 16 App Router, React 19, shadcn/ui, Supabase JS client, `xlsx`, vitest, Playwright (mocked Supabase).

**Spec:** `docs/superpowers/specs/2026-10-01-division-question-bank-design.md`

## Global Constraints

- **Local database only.** `LOCAL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Never read `.env.local`, never connect to production, never `supabase link` / `db push`. If the local DB is down: `docker start supabase_db_school-management` (see memory note). If `.env.development.local` is missing, stop and tell the user.
- **Applying 195 to production is the user's job.** No task applies it anywhere but `$LOCAL`.
- **194's migration file is never edited.** 195 replaces 194 functions with `CREATE OR REPLACE` and identical signatures.
- **194's test file gets fixture-only edits** (Task 1); no assertion in it may change.
- The migration file must be **re-runnable on local** (each task re-applies it): `CREATE … IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY/TRIGGER IF EXISTS` before create, `DROP CONSTRAINT IF EXISTS` before add.
- No DML on existing rows, no backfill.
- `LLC_COUNT = 3`; ties at the cut are included.
- Bank launch types: `multiple_choice`, `true_false` only. TF answer is stored `True` / `False`.
- Only `exam_type = 'Summative Test'` results feed the LLC list; `Term Exam` never does.
- TypeScript: no `any`. Use `escapeIlikePattern()` for any user-typed `ilike`. Lists use the `isMounted` flag.
- Dependencies: none added (`xlsx`, `cmdk` popover/command already present). If one is added anyway, update `pnpm-lock.yaml` with `npx pnpm@10 install --lockfile-only`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A bank item moved to another slot in the exam builder.** Item numbers are positional; moving a part or inserting a question renumbers later items, and a bank question then sits on a TOS item of another competency. Expected: the builder flags that item before Save and Save fails naming the item, never silently saving a mismatched copy. Pinned by `bankSlotStatus` tests (Task 5) and the "different competency" SQL test (Task 4).
2. **A learning area / grade / school year with no summative results.** Expected: an empty LLC list with a clear message and no Write buttons, never an error. Pinned by the "no results → 0 rows" SQL test (Task 2).
3. **A retired catalogue entry already used by a TOS.** Expected: the TOS still opens, prints and re-saves while it keeps that entry; only *picking* a retired entry is refused. Pinned by the SQL test in Task 1.
4. **A messy import sheet** — blank cells, `Kinder`/`Grade 5`/`5` grade spellings, lower-case LC codes with spaces, duplicate rows. Expected: per-row errors with row numbers; valid rows still import; nothing is deleted. Pinned by `catalogueImport` tests (Task 5).
5. **Archiving an old private TOS** (only `is_active` changes) or deleting a user who authored one. Expected: never refused by the catalogue guard. Pinned by the SQL test in Task 1.

---

## File map

**Database**
- Create `supabase/migrations/195_question_bank.sql` — sections 1–12, written in Tasks 1–4.
- Create `supabase/tests/195_question_bank.sql` — scenario test, grown in Tasks 1–4.
- Modify `supabase/tests/194_exam_qa_review.sql` — fixture-only (Task 1).

**Shared TypeScript (Task 5)**
- Modify `types/database.ts` — `LearningArea`, `CatalogueCompetency`, `BankQuestion`, `BankOption`; new optional columns on `Tos`, `TosCompetency`, `ExamQuestion`.
- Modify `lib/constants/examReview.ts` — `ReviewEntity` + `"question"`, `ReviewAction` + `"set_level"`.
- Create `lib/constants/questionBank.ts` — `LLC_COUNT`, `BANK_SUPPORTED_TYPES`, wording strings.
- Create `lib/utils/questionBank.ts` — pure helpers + RPC wrappers.
- Create `lib/utils/catalogueImport.ts` — xlsx row parsing + import writer.
- Create `lib/utils/catalogueMatch.ts` — map-competencies suggestions.
- Create `lib/utils/__tests__/questionBank.test.ts`, `catalogueImport.test.ts`, `catalogueMatch.test.ts`.
- Create `hooks/useCatalogue.ts`.

**UI**
- Task 6: `components/examinations/catalogue/{CompetencyCatalogue,CatalogueAreas,CatalogueCompetencies,CatalogueImportDialog,CataloguePicker}.tsx`, `app/(protected)/division/competencies/page.tsx`, `app/(protected)/qa/competencies/page.tsx`, `components/AppSidebar.tsx`.
- Task 7: `components/examinations/TosBuilderModal.tsx`.
- Task 8: `components/examinations/ExamQuestionEditor.tsx` (optional `onRemove`), `components/examinations/bank/BankQuestionModal.tsx`, `app/(protected)/teacher/examinations/division/llc/page.tsx`, `app/(protected)/teacher/examinations/division/questions/page.tsx`, `app/(protected)/teacher/examinations/page.tsx`, `components/examinations/review/ReviewHistory.tsx`.
- Task 9: `components/examinations/bank/BankPickerDialog.tsx`, `components/examinations/ExamBuilderModal.tsx`.
- Task 10: `components/examinations/review/BankReviewQueueTable.tsx`, `components/examinations/review/ExamBankSourceTable.tsx`, `app/(protected)/qa/page.tsx`, `app/(protected)/qa/question/[id]/page.tsx`, `app/(protected)/qa/exam/[id]/page.tsx`.
- Task 11: `e2e/question-bank.spec.ts`, `CLAUDE.md`.

---

### Task 1: Catalogue tables and TOS catalogue guards (SQL)

**Files:**
- Create: `supabase/migrations/195_question_bank.sql`
- Create: `supabase/tests/195_question_bank.sql`
- Modify: `supabase/tests/194_exam_qa_review.sql` (fixtures only)

**Interfaces:**
- Produces: tables `sms_learning_areas(id, name, is_active, created_by, created_at, updated_at)`, `sms_competency_catalogue(id, learning_area_id, grade_level, lc_code, competency_text, is_active, created_by, created_at, updated_at)`; columns `sms_tos.learning_area_id`, `sms_tos_competencies.catalogue_competency_id`; helper `procurements.can_manage_catalogue() RETURNS BOOLEAN`; triggers `sms_tos_guard_catalogue`, `sms_tos_competencies_guard_catalogue`, `sms_competency_catalogue_normalize`.
- Produces (test file): schema `tst` helpers `tst.id(name)`, `tst.uid(name)`, `tst.claims(uid)`, `tst.expect_error(sql, like)`, `tst.expect_rows(sql, n)`, `tst.expect_count(sql, n)`; fixture ids `qa1, t1, t2, mt, do, schoolA, schoolB, la, laOther, c1..c5, cOld`.

- [ ] **Step 1: Confirm the local database is up and 194 passes before touching anything**

```bash
export LOCAL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
psql "$LOCAL" -c "select 1" || docker start supabase_db_school-management
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql 2>&1 | tail -3
```
Expected: last line `ROLLBACK`, no `FAIL`. If 194 is not applied locally (`relation "sms_exam_qa_authors" does not exist`), apply it: `psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/migrations/194_division_exam_qa_review.sql`, then rerun.

- [ ] **Step 2: Write the failing scenario test skeleton**

Create `supabase/tests/195_question_bank.sql`:

```sql
-- Migration 195 scenario test. LOCAL DATABASE ONLY.
--   psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/195_question_bank.sql
-- Everything runs in one transaction that is rolled back at the end.
\set ON_ERROR_STOP 1
BEGIN;
SET search_path TO procurements, public;

CREATE SCHEMA tst;
GRANT USAGE ON SCHEMA tst TO authenticated;
CREATE TABLE tst.ids (name TEXT PRIMARY KEY, id BIGINT, uid UUID);
GRANT SELECT ON tst.ids TO authenticated;
CREATE FUNCTION tst.id(p TEXT) RETURNS BIGINT LANGUAGE sql STABLE AS
  $$ SELECT id FROM tst.ids WHERE name = p $$;
CREATE FUNCTION tst.uid(p TEXT) RETURNS UUID LANGUAGE sql STABLE AS
  $$ SELECT uid FROM tst.ids WHERE name = p $$;
CREATE FUNCTION tst.claims(p_uid UUID) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION tst.expect_error(p_sql TEXT, p_like TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%' || p_like || '%' THEN
      RAISE NOTICE 'ok  refused: %', SQLERRM;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL expected error like "%" but got "%" for: %', p_like, SQLERRM, p_sql;
  END;
  RAISE EXCEPTION 'FAIL expected error like "%" but it succeeded: %', p_like, p_sql;
END $$;
CREATE FUNCTION tst.expect_rows(p_sql TEXT, p_n INT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> p_n THEN
    RAISE EXCEPTION 'FAIL expected % row(s), got % for: %', p_n, n, p_sql;
  END IF;
  RAISE NOTICE 'ok  % row(s): %', n, left(p_sql, 80);
END $$;
CREATE FUNCTION tst.expect_count(p_sql TEXT, p_n BIGINT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE c BIGINT;
BEGIN
  EXECUTE p_sql INTO c;
  IF c IS DISTINCT FROM p_n THEN
    RAISE EXCEPTION 'FAIL expected %, got % for: %', p_n, c, p_sql;
  END IF;
  RAISE NOTICE 'ok  = %: %', c, left(p_sql, 80);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tst TO authenticated;

-- ---------------------------------------------------------------- fixtures --
INSERT INTO tst.ids (name, uid) VALUES
  ('qa1', '00000000-0000-4000-8000-0000000195a1'),
  ('t1',  '00000000-0000-4000-8000-0000000195b1'),
  ('t2',  '00000000-0000-4000-8000-0000000195b2'),
  ('mt',  '00000000-0000-4000-8000-0000000195b3'),
  ('do',  '00000000-0000-4000-8000-0000000195c1');
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@195.test', 'authenticated', 'authenticated' FROM tst.ids;

-- Two schools that both have sections (results need a section).
INSERT INTO tst.ids (name, id)
SELECT 'schoolA', min(school_id) FROM sms_sections
UNION ALL
SELECT 'schoolB', (SELECT DISTINCT school_id FROM sms_sections
                   WHERE school_id > (SELECT min(school_id) FROM sms_sections)
                   ORDER BY school_id LIMIT 1);

WITH u(name, type, school) AS (VALUES
  ('qa1', 'qa', NULL), ('t1', 'teacher', 'schoolA'), ('t2', 'teacher', 'schoolB'),
  ('mt', 'teacher', 'schoolA'), ('do', 'division_type', NULL))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@195.test', u.type, tst.id(u.school), tst.uid(u.name), true FROM u;
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;
INSERT INTO sms_user_roles (user_id, role, school_id)
SELECT s.id, s.type, s.school_id FROM sms_users s
WHERE s.user_id IN (SELECT uid FROM tst.ids WHERE uid IS NOT NULL)
ON CONFLICT DO NOTHING;
INSERT INTO sms_user_roles (user_id, role, school_id) VALUES (tst.id('mt'), 'qa', tst.id('schoolA'));

-- t1 and mt are QA-authorized authors (194's RPC).
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_qa_authorize(tst.id('t1'));
SELECT procurements.exam_qa_authorize(tst.id('mt'));
RESET ROLE;

-- ------------------------------------------------------------- task 1 ------
-- (task sections are appended above the final marker)

-- (later tasks append their sections above this line)

ROLLBACK;
```

- [ ] **Step 3: Add the Task 1 assertions** — insert this block right after the `-- ------- task 1 ------` line:

```sql
-- catalogue writes: division office and QA yes, teacher no, nobody deletes
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ INSERT INTO sms_learning_areas (name) VALUES ('T195 Nope') $$, 'row-level security');
RESET ROLE;
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT tst.expect_rows($$ INSERT INTO sms_learning_areas (name) VALUES ('T195 Math') $$, 1);
SELECT tst.expect_rows($$ INSERT INTO sms_learning_areas (name) VALUES ('T195 Other') $$, 1);
SELECT tst.expect_error($$ INSERT INTO sms_learning_areas (name) VALUES ('  t195 math ') $$, 'uq_sms_learning_areas_name');
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'la', id FROM sms_learning_areas WHERE name = 'T195 Math';
INSERT INTO tst.ids (name, id) SELECT 'laOther', id FROM sms_learning_areas WHERE name = 'T195 Other';

SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
-- LC codes are normalized: trimmed, upper-cased, inner spaces removed
SELECT tst.expect_rows($$ INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
  VALUES (tst.id('la'), 5, ' m5ns-ia-1 ', 'Competency one'),
         (tst.id('la'), 5, 'M5NS-Ib-2', 'Competency two'),
         (tst.id('la'), 5, 'M5NS-Ic-3', 'Competency three'),
         (tst.id('la'), 5, 'M5NS-Id-4', 'Competency four'),
         (tst.id('la'), 5, 'M5NS-Ie-5', 'Competency five'),
         (tst.id('la'), 5, 'M5NS-If-6', 'Old competency') $$, 6);
SELECT tst.expect_count($$ SELECT count(*) FROM sms_competency_catalogue WHERE lc_code = 'M5NS-IA-1' $$, 1);
SELECT tst.expect_error($$ INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
  VALUES (tst.id('la'), 5, 'm5ns-ia-1', 'dup') $$, 'duplicate key');
SELECT tst.expect_rows($$ DELETE FROM sms_competency_catalogue WHERE lc_code = 'M5NS-IF-6' $$, 0);
SELECT tst.expect_rows($$ DELETE FROM sms_learning_areas WHERE id = $$ || tst.id('laOther'), 0);
RESET ROLE;
INSERT INTO tst.ids (name, id)
SELECT v.n, c.id FROM sms_competency_catalogue c
JOIN (VALUES ('c1','M5NS-IA-1'),('c2','M5NS-IB-2'),('c3','M5NS-IC-3'),
             ('c4','M5NS-ID-4'),('c5','M5NS-IE-5'),('cOld','M5NS-IF-6')) v(n, code)
  ON v.code = c.lc_code AND c.learning_area_id = tst.id('la');

-- a new TOS must name a learning area; subject_name is copied from it
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by)
  VALUES ('Free text', 5, '2026-2027', 1, tst.id('schoolA'), tst.id('t1')) $$, 'learning area');
SELECT tst.expect_rows($$ INSERT INTO sms_tos (learning_area_id, subject_name, grade_level, school_year, grading_period, school_id, created_by, title, exam_type)
  VALUES (tst.id('la'), 'ignored', 5, '2026-2027', 1, tst.id('schoolA'), tst.id('t1'), 'T195 TOS A', 'Summative Test') $$, 1);
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'tosA', id FROM sms_tos WHERE title = 'T195 TOS A';
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos WHERE id = tst.id('tosA') AND subject_name = 'T195 Math' $$, 1);

-- competencies must be picked from the catalogue, matching area + grade
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ INSERT INTO sms_tos_competencies (tos_id, competency_text) VALUES (tst.id('tosA'), 'typed') $$, 'competency catalogue');
SELECT tst.expect_rows($$ INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, lc_code, position)
  VALUES (tst.id('tosA'), tst.id('c1'), 'client text ignored', 'X', 0) $$, 1);
RESET ROLE;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos_competencies WHERE tos_id = tst.id('tosA')
  AND competency_text = 'Competency one' AND lc_code = 'M5NS-IA-1' $$, 1);

-- wrong grade refused
INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
VALUES (tst.id('la'), 6, 'M6-1', 'Grade six competency');
SELECT tst.expect_error($$ INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text)
  VALUES (tst.id('tosA'), (SELECT id FROM sms_competency_catalogue WHERE lc_code = 'M6-1'), 'x') $$,
  'not in this TOS');

-- a retired entry cannot be picked, but a row already holding it re-saves
INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, position)
VALUES (tst.id('tosA'), tst.id('cOld'), 'x', 9);
UPDATE sms_competency_catalogue SET is_active = false WHERE id = tst.id('cOld');
SELECT tst.expect_rows($$ UPDATE sms_tos_competencies SET no_of_days = 2 WHERE catalogue_competency_id = tst.id('cOld') $$, 1);
SELECT tst.expect_error($$ INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text)
  VALUES (tst.id('tosA'), tst.id('cOld'), 'x') $$, 'retired');
DELETE FROM sms_tos_competencies WHERE catalogue_competency_id = tst.id('cOld');

-- a pre-195 TOS (no learning area) is never re-checked on archive or author deletion
SET LOCAL session_replication_role = replica;  -- simulate a row saved before 195's triggers existed
INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by, title)
VALUES ('Legacy', 5, '2025-2026', 1, tst.id('schoolA'), tst.id('t1'), 'T195 LEGACY');
SET LOCAL session_replication_role = origin;
INSERT INTO tst.ids (name, id) SELECT 'legacy', id FROM sms_tos WHERE title = 'T195 LEGACY';
SELECT tst.expect_rows($$ UPDATE sms_tos SET is_active = false WHERE id = tst.id('legacy') $$, 1);
SELECT tst.expect_rows($$ UPDATE sms_tos SET created_by = NULL WHERE id = tst.id('legacy') $$, 1);
-- … but editing it requires the catalogue
SELECT tst.expect_error($$ UPDATE sms_tos SET title = 'edited' WHERE id = tst.id('legacy') $$, 'learning area');
```

- [ ] **Step 4: Run it to verify it fails**

Run: `psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/195_question_bank.sql 2>&1 | grep -m1 -E "ERROR|FAIL"`
Expected: `ERROR:  relation "sms_learning_areas" does not exist`.

- [ ] **Step 5: Write migration sections 1–3**

Create `supabase/migrations/195_question_bank.sql`:

```sql
-- ============================================================================
-- 195 — Division competency catalogue, Least Learned Competencies, and the
--       QA-reviewed Question Bank
--
-- Spec: docs/superpowers/specs/2026-10-01-division-question-bank-design.md
--
-- The DepEd flow this implements:
--   1. A QA-authorized teacher sees the Least Learned Competencies (LLC) of a
--      learning area + grade, pooled from every Summative Test result in the
--      division (Term Exams never count).
--   2. They write questions for those competencies; each is QA-reviewed and,
--      once approved, is in the Question Bank.
--   3. A division exam item is taken from the bank or written new.
--   4. QA reviews the questionnaire as a whole (194, unchanged in its rules).
--
-- Pooling across teachers needs to know that two TOS name the SAME
-- competency, so every TOS now picks its learning area and competencies from a
-- division catalogue (sms_learning_areas / sms_competency_catalogue). The
-- picked text and LC code are COPIED onto sms_tos_competencies, so a printed
-- TOS still reads its own row (the 112/121/152 snapshot rule).
--
-- Nothing existing is rewritten: new tables, nullable columns, no backfill, no
-- DML. 194's functions are replaced with identical signatures.
--
-- OPERATIONAL PREREQUISITE: once this is applied, saving any TOS (new, or an
-- edit to an existing one) is refused until the catalogue holds that TOS's
-- learning area and competencies. Import the catalogue (Division Office →
-- Competency Catalogue → Import) IMMEDIATELY after applying.
--
-- Before applying to production (the user's job — never an agent's), these
-- read-only counts are what the migration must leave unchanged:
--   SELECT count(*) FROM procurements.sms_tos;
--   SELECT count(*) FROM procurements.sms_tos_competencies;
--   SELECT count(*) FROM procurements.sms_exam_questions;
--   SELECT count(*) FROM procurements.sms_exam_review_events;
-- (section 12 carries the post-apply grant check)
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. Catalogue tables. No DELETE policy anywhere: entries are retired
--    (is_active = false), never removed, and ON DELETE RESTRICT protects every
--    TOS and bank question pointing at one (the 116 lesson).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_learning_areas (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL CHECK (btrim(name) <> ''),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_learning_areas_name
  ON procurements.sms_learning_areas (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS procurements.sms_competency_catalogue (
  id               BIGSERIAL PRIMARY KEY,
  learning_area_id BIGINT NOT NULL
                     REFERENCES procurements.sms_learning_areas(id) ON DELETE RESTRICT,
  grade_level      INTEGER NOT NULL CHECK (grade_level BETWEEN 0 AND 12),
  lc_code          TEXT NOT NULL CHECK (lc_code <> ''),
  competency_text  TEXT NOT NULL CHECK (btrim(competency_text) <> ''),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_by       BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (learning_area_id, grade_level, lc_code)
);
CREATE INDEX IF NOT EXISTS idx_sms_competency_catalogue_pick
  ON procurements.sms_competency_catalogue (learning_area_id, grade_level, is_active);

DROP TRIGGER IF EXISTS update_sms_learning_areas_updated_at ON procurements.sms_learning_areas;
CREATE TRIGGER update_sms_learning_areas_updated_at
  BEFORE UPDATE ON procurements.sms_learning_areas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_sms_competency_catalogue_updated_at ON procurements.sms_competency_catalogue;
CREATE TRIGGER update_sms_competency_catalogue_updated_at
  BEFORE UPDATE ON procurements.sms_competency_catalogue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- LC codes are the human key: stored trimmed, upper-cased, without spaces, so
-- " m5ns-ia-1 " and "M5NS-IA-1" are one entry. Mirrors normalizeLcCode() in
-- lib/utils/questionBank.ts.
CREATE OR REPLACE FUNCTION procurements.catalogue_normalize()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.lc_code := upper(regexp_replace(COALESCE(NEW.lc_code, ''), '\s+', '', 'g'));
  NEW.competency_text := btrim(regexp_replace(NEW.competency_text, '\s+', ' ', 'g'));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sms_competency_catalogue_normalize ON procurements.sms_competency_catalogue;
CREATE TRIGGER sms_competency_catalogue_normalize
  BEFORE INSERT OR UPDATE ON procurements.sms_competency_catalogue
  FOR EACH ROW EXECUTE FUNCTION procurements.catalogue_normalize();

-- ----------------------------------------------------------------------------
-- 2. Links on existing tables (nullable, nothing backfilled)
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_tos
  ADD COLUMN IF NOT EXISTS learning_area_id BIGINT
    REFERENCES procurements.sms_learning_areas(id) ON DELETE RESTRICT;
ALTER TABLE procurements.sms_tos_competencies
  ADD COLUMN IF NOT EXISTS catalogue_competency_id BIGINT
    REFERENCES procurements.sms_competency_catalogue(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_sms_tos_learning_area
  ON procurements.sms_tos (learning_area_id, grade_level, school_year);
CREATE INDEX IF NOT EXISTS idx_sms_tos_competencies_catalogue
  ON procurements.sms_tos_competencies (catalogue_competency_id);

-- ----------------------------------------------------------------------------
-- 3. Catalogue access and the TOS guards
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.can_manage_catalogue()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT procurements.is_exam_oversight() OR procurements.is_exam_qa();
$$;

ALTER TABLE procurements.sms_learning_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_competency_catalogue ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON procurements.sms_learning_areas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON procurements.sms_competency_catalogue TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_learning_areas_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_competency_catalogue_id_seq TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_learning_areas', 'sms_competency_catalogue'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: select" ON procurements.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: insert" ON procurements.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s: update" ON procurements.%1$I', t);
    -- Every TOS builder reads the catalogue.
    EXECUTE format($p$CREATE POLICY "%1$s: select" ON procurements.%1$I
      FOR SELECT TO authenticated USING (true)$p$, t);
    EXECUTE format($p$CREATE POLICY "%1$s: insert" ON procurements.%1$I
      FOR INSERT TO authenticated WITH CHECK (procurements.can_manage_catalogue())$p$, t);
    EXECUTE format($p$CREATE POLICY "%1$s: update" ON procurements.%1$I
      FOR UPDATE TO authenticated
      USING (procurements.can_manage_catalogue())
      WITH CHECK (procurements.can_manage_catalogue())$p$, t);
    -- No DELETE policy, deliberately.
  END LOOP;
END $$;

-- A TOS must name a catalogue learning area whenever its content is written.
-- An UPDATE that touches only bookkeeping columns — archive (is_active), the
-- review workflow (194), or the FK's ON DELETE SET NULL on created_by /
-- reviewed_by — is never checked, so a pre-195 TOS can still be archived and
-- its author can still be deleted.
CREATE OR REPLACE FUNCTION procurements.tos_guard_catalogue()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_skip   CONSTANT TEXT[] := ARRAY['is_active', 'updated_at', 'review_status',
    'submitted_at', 'reviewed_by', 'reviewed_at', 'review_comment', 'created_by'];
  v_name   TEXT;
  v_active BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - v_skip) = (to_jsonb(OLD) - v_skip) THEN
    RETURN NEW;
  END IF;
  IF NEW.learning_area_id IS NULL THEN
    RAISE EXCEPTION 'Choose a learning area from the competency catalogue.';
  END IF;
  SELECT a.name, a.is_active INTO v_name, v_active
  FROM procurements.sms_learning_areas a WHERE a.id = NEW.learning_area_id;
  IF (TG_OP = 'INSERT' OR NEW.learning_area_id IS DISTINCT FROM OLD.learning_area_id)
     AND NOT v_active THEN
    RAISE EXCEPTION 'The learning area "%" has been retired.', v_name;
  END IF;
  NEW.subject_name := v_name;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sms_tos_guard_catalogue ON procurements.sms_tos;
CREATE TRIGGER sms_tos_guard_catalogue
  BEFORE INSERT OR UPDATE ON procurements.sms_tos
  FOR EACH ROW EXECUTE FUNCTION procurements.tos_guard_catalogue();

-- Each competency row must point at a catalogue entry of its TOS's learning
-- area and grade. The entry's text and LC code are copied over the client's.
CREATE OR REPLACE FUNCTION procurements.tos_competency_guard_catalogue()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  c       RECORD;
  v_area  BIGINT;
  v_grade INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'updated_at') = (to_jsonb(OLD) - 'updated_at') THEN
    RETURN NEW;
  END IF;
  IF NEW.catalogue_competency_id IS NULL THEN
    RAISE EXCEPTION 'Pick each competency from the competency catalogue.';
  END IF;
  SELECT * INTO c FROM procurements.sms_competency_catalogue WHERE id = NEW.catalogue_competency_id;
  SELECT t.learning_area_id, t.grade_level INTO v_area, v_grade
  FROM procurements.sms_tos t WHERE t.id = NEW.tos_id;
  IF c.learning_area_id IS DISTINCT FROM v_area OR c.grade_level IS DISTINCT FROM v_grade THEN
    RAISE EXCEPTION 'Competency % is not in this TOS''s learning area and grade.', c.lc_code;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.catalogue_competency_id IS DISTINCT FROM OLD.catalogue_competency_id)
     AND NOT c.is_active THEN
    RAISE EXCEPTION 'Competency % has been retired from the catalogue.', c.lc_code;
  END IF;
  NEW.competency_text := c.competency_text;
  NEW.lc_code := c.lc_code;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sms_tos_competencies_guard_catalogue ON procurements.sms_tos_competencies;
CREATE TRIGGER sms_tos_competencies_guard_catalogue
  BEFORE INSERT OR UPDATE ON procurements.sms_tos_competencies
  FOR EACH ROW EXECUTE FUNCTION procurements.tos_competency_guard_catalogue();

-- (sections 4–12 follow in later tasks)
```

- [ ] **Step 6: Apply locally and run the 195 test**

```bash
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/migrations/195_question_bank.sql
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/195_question_bank.sql 2>&1 | grep -E "FAIL|ERROR|ROLLBACK"
```
Expected: only `ROLLBACK`.

- [ ] **Step 7: Run 194's test and watch it fail on the new guards**

Run: `psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql 2>&1 | grep -m1 -E "FAIL|ERROR"`
Expected: a `FAIL … got "Choose a learning area from the competency catalogue."` (its TOS fixtures carry no learning area).

- [ ] **Step 8: Fixture-only edit to 194's test**

(a) In `supabase/tests/194_exam_qa_review.sql`, insert immediately before the line `-- ------------------------------------------------------------- task 1 ------`:

```sql
-- Migration 195 fixtures: every TOS now names a catalogue learning area and
-- every competency a catalogue entry. Fixture-only — no assertion changed.
INSERT INTO sms_learning_areas (name) VALUES ('T194 Area');
INSERT INTO tst.ids (name, id) SELECT 'la', id FROM sms_learning_areas WHERE name = 'T194 Area';
INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
SELECT tst.id('la'), g, 'T194-G' || g, 'T194 competency grade ' || g FROM generate_series(0, 12) g;
-- The catalogue entry matching a TOS's grade. SECURITY DEFINER: callers run
-- as `authenticated` and may not be able to read the TOS.
CREATE FUNCTION tst.cat(p_tos BIGINT) RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT c.id FROM procurements.sms_competency_catalogue c
  JOIN procurements.sms_tos t ON t.id = p_tos
  WHERE c.learning_area_id = tst.id('la') AND c.grade_level = t.grade_level $$;
GRANT EXECUTE ON FUNCTION tst.cat(BIGINT) TO authenticated;
```

(b) Rewrite every TOS and competency insert mechanically:

```bash
perl -0pi -e "s/INSERT INTO sms_tos \(subject_name,(.*?)\)(\s*)VALUES \('/INSERT INTO sms_tos (learning_area_id, subject_name,\$1)\$2VALUES (tst.id('la'), '/gs; s/INSERT INTO sms_tos_competencies \(tos_id, competency_text\) VALUES \((.+?), '/INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text) VALUES (\$1, tst.cat(\$1), '/g" supabase/tests/194_exam_qa_review.sql
git diff --stat supabase/tests/194_exam_qa_review.sql
grep -c "learning_area_id, subject_name" supabase/tests/194_exam_qa_review.sql
grep -n "INSERT INTO sms_tos (subject_name\|sms_tos_competencies (tos_id, competency_text)" supabase/tests/194_exam_qa_review.sql
```
Expected: the count equals the number of `INSERT INTO sms_tos (` statements (14 at time of writing), and the last grep prints nothing. Read the diff: only `INSERT` column lists / `VALUES (` prefixes changed, no `expect_*` line touched.

- [ ] **Step 9: Both tests pass**

```bash
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql 2>&1 | grep -E "FAIL|ERROR|ROLLBACK"
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/195_question_bank.sql 2>&1 | grep -E "FAIL|ERROR|ROLLBACK"
```
Expected: `ROLLBACK` from each, nothing else.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/195_question_bank.sql supabase/tests/195_question_bank.sql supabase/tests/194_exam_qa_review.sql
git commit -m "feat(question-bank): competency catalogue and TOS catalogue guards (195, part 1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Least Learned Competencies (SQL)

**Files:**
- Modify: `supabase/migrations/195_question_bank.sql` (append section 4)
- Modify: `supabase/tests/195_question_bank.sql` (append task 2 block)

**Interfaces:**
- Consumes: Task 1 tables/columns, 194 helpers `is_division_author()`, `is_exam_qa()`, `is_exam_oversight()`.
- Produces:
  - `procurements.llc_count() RETURNS INTEGER` (= 3)
  - `procurements.can_view_llc() RETURNS BOOLEAN`
  - internal `procurements.llc_pooled_stats(p_learning_area_id BIGINT, p_grade_level INTEGER, p_school_year TEXT) RETURNS TABLE (catalogue_competency_id BIGINT, correct BIGINT, total BIGINT, mps NUMERIC, learners BIGINT, sections BIGINT, schools BIGINT, results BIGINT)`
  - internal `procurements.llc_competency_ids(p_learning_area_id BIGINT, p_grade_level INTEGER, p_school_year TEXT) RETURNS SETOF BIGINT`
  - RPC `procurements.division_llc(p_learning_area_id BIGINT, p_grade_level INTEGER, p_school_year TEXT) RETURNS TABLE (catalogue_competency_id BIGINT, lc_code TEXT, competency_text TEXT, mps NUMERIC, learners BIGINT, sections BIGINT, schools BIGINT, results BIGINT)`
  - RPC `procurements.division_llc_coverage(p_learning_area_id BIGINT, p_grade_level INTEGER, p_school_year TEXT) RETURNS TABLE (results BIGINT, schools BIGINT, learners BIGINT)`

Fixture arithmetic for the test (MC items, one item per competency):
- `tosA` (school A, private, Summative): item 1→c1, 2→c2, 3→c3, 4→c4. Learners L1 correct {1,2,3}, L2 correct {1}.
- `tosB` (school B, private by t2, Summative): item 1→c1, 2→c2, 3→c5. Learners L3 {1}, L4 {1,2,3}.
- `tosT` (school A, **Term Exam**): item 1→c1. Learner L1 correct {} (would sink c1 if counted).
- Pooled MPS: c1 4/4 = 100, c2 2/4 = 50, c3 1/2 = 50, c4 0/2 = 0, c5 1/2 = 50.
- Sorted: c4 0, c2/c3/c5 50, c1 100 → third row's MPS is 50 → LLC = {c4, c2, c3, c5} (the tie at the cut is kept), c1 excluded.

- [ ] **Step 1: Write the failing test** — append before `-- (later tasks append their sections above this line)`:

```sql
-- ------------------------------------------------------------- task 2 ------
-- tosA (from task 1) gets four items; build tosB (school B) and tosT (Term Exam)
DELETE FROM sms_tos_competencies WHERE tos_id = tst.id('tosA');
INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, position)
SELECT tst.id('tosA'), tst.id(n), 'x', p FROM (VALUES ('c1',0),('c2',1),('c3',2),('c4',3)) v(n,p);
INSERT INTO sms_tos (learning_area_id, subject_name, grade_level, school_year, grading_period, school_id, created_by, title, exam_type)
VALUES (tst.id('la'), 'x', 5, '2026-2027', 1, tst.id('schoolB'), tst.id('t2'), 'T195 TOS B', 'Summative Test'),
       (tst.id('la'), 'x', 5, '2026-2027', 1, tst.id('schoolA'), tst.id('t1'), 'T195 TOS T', 'Term Exam');
INSERT INTO tst.ids (name, id) SELECT 'tosB', id FROM sms_tos WHERE title = 'T195 TOS B';
INSERT INTO tst.ids (name, id) SELECT 'tosT', id FROM sms_tos WHERE title = 'T195 TOS T';
INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, position)
SELECT tst.id(t), tst.id(n), 'x', p FROM (VALUES ('tosB','c1',0),('tosB','c2',1),('tosB','c5',2),('tosT','c1',0)) v(t,n,p);
-- items: item k -> the k-th competency by position
INSERT INTO sms_tos_items (tos_id, competency_id, item_number, cognitive_level)
SELECT c.tos_id, c.id, c.position + 1, CASE WHEN c.position = 3 THEN 'applying' ELSE 'remembering' END
FROM sms_tos_competencies c WHERE c.tos_id IN (tst.id('tosA'), tst.id('tosB'), tst.id('tosT'));

-- exams + MC questions + results
INSERT INTO sms_exams (tos_id, school_id, created_by, title)
VALUES (tst.id('tosA'), tst.id('schoolA'), tst.id('t1'), 'T195 EXAM A'),
       (tst.id('tosB'), tst.id('schoolB'), tst.id('t2'), 'T195 EXAM B'),
       (tst.id('tosT'), tst.id('schoolA'), tst.id('t1'), 'T195 EXAM T');
INSERT INTO tst.ids (name, id) SELECT 'exA', id FROM sms_exams WHERE title = 'T195 EXAM A';
INSERT INTO tst.ids (name, id) SELECT 'exB', id FROM sms_exams WHERE title = 'T195 EXAM B';
INSERT INTO tst.ids (name, id) SELECT 'exT', id FROM sms_exams WHERE title = 'T195 EXAM T';
INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, position)
SELECT tst.id(e), k, 'multiple_choice', 'Q' || k, k
FROM (VALUES ('exA',4),('exB',3),('exT',1)) v(e,n), generate_series(1, n) k;

INSERT INTO tst.ids (name, id)
SELECT 'L' || row_number() OVER (ORDER BY id), id FROM (SELECT id FROM sms_students ORDER BY id LIMIT 4) s;
INSERT INTO sms_exam_results (exam_id, section_id, school_id, school_year)
VALUES (tst.id('exA'), (SELECT id FROM sms_sections WHERE school_id = tst.id('schoolA') ORDER BY id LIMIT 1), tst.id('schoolA'), '2026-2027'),
       (tst.id('exB'), (SELECT id FROM sms_sections WHERE school_id = tst.id('schoolB') ORDER BY id LIMIT 1), tst.id('schoolB'), '2026-2027'),
       (tst.id('exT'), (SELECT id FROM sms_sections WHERE school_id = tst.id('schoolA') ORDER BY id LIMIT 1), tst.id('schoolA'), '2026-2027');
INSERT INTO sms_exam_result_students (result_id, student_id, correct_items)
SELECT r.id, tst.id(v.l), v.items::INTEGER[]
FROM (VALUES ('exA','L1','{1,2,3}'),('exA','L2','{1}'),
             ('exB','L3','{1}'),('exB','L4','{1,2,3}'),
             ('exT','L1','{}')) v(e,l,items)
JOIN sms_exam_results r ON r.exam_id = tst.id(v.e);

-- t2 (unauthorized) may not call it; t1 (authorized), QA and division office may
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT * FROM procurements.division_llc(tst.id('la'), 5, '2026-2027') $$, 'not allowed');
RESET ROLE;
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
-- c4, c2, c3, c5 — the tie at the cut is kept; c1 (100%) and the Term Exam are out
SELECT tst.expect_count($$ SELECT count(*) FROM procurements.division_llc(tst.id('la'), 5, '2026-2027') $$, 4);
SELECT tst.expect_count($$ SELECT count(*) FROM procurements.division_llc(tst.id('la'), 5, '2026-2027')
  WHERE catalogue_competency_id = tst.id('c1') $$, 0);
SELECT tst.expect_count($$ SELECT (mps * 100)::BIGINT FROM procurements.division_llc(tst.id('la'), 5, '2026-2027')
  WHERE catalogue_competency_id = tst.id('c4') $$, 0);
SELECT tst.expect_count($$ SELECT (mps * 100)::BIGINT FROM procurements.division_llc(tst.id('la'), 5, '2026-2027')
  WHERE catalogue_competency_id = tst.id('c2') $$, 5000);
-- c5 exists only in t2's PRIVATE exam at the other school: private results count
SELECT tst.expect_count($$ SELECT schools FROM procurements.division_llc(tst.id('la'), 5, '2026-2027')
  WHERE catalogue_competency_id = tst.id('c5') $$, 1);
SELECT tst.expect_count($$ SELECT schools FROM procurements.division_llc(tst.id('la'), 5, '2026-2027')
  WHERE catalogue_competency_id = tst.id('c2') $$, 2);
-- coverage: 2 summative results, 2 schools, 4 learners
SELECT tst.expect_count($$ SELECT results * 100 + schools * 10 + learners FROM procurements.division_llc_coverage(tst.id('la'), 5, '2026-2027') $$, 224);
-- no results for that area / grade / year: empty, not an error
SELECT tst.expect_count($$ SELECT count(*) FROM procurements.division_llc(tst.id('la'), 6, '2026-2027') $$, 0);
SELECT tst.expect_count($$ SELECT count(*) FROM procurements.division_llc(tst.id('laOther'), 5, '2026-2027') $$, 0);
RESET ROLE;
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM procurements.division_llc(tst.id('la'), 5, '2026-2027') $$, 4);
-- the internal pieces are not callable by a signed-in user
SELECT tst.expect_error($$ SELECT * FROM procurements.llc_pooled_stats(1, 5, '2026-2027') $$, 'permission denied');
SELECT tst.expect_error($$ SELECT * FROM procurements.llc_competency_ids(1, 5, '2026-2027') $$, 'permission denied');
RESET ROLE;
```

- [ ] **Step 2: Run to verify it fails**

Run: `psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/195_question_bank.sql 2>&1 | grep -m1 -E "FAIL|ERROR"`
Expected: `FAIL … function procurements.division_llc(bigint, integer, unknown) does not exist`.

- [ ] **Step 3: Append section 4 to the migration** (replace the `-- (sections 4–12 follow in later tasks)` line with this block and keep the marker after it):

```sql
-- ----------------------------------------------------------------------------
-- 4. Least Learned Competencies. Pooled across EVERY Summative Test result in
--    the division — private, school-wide and division exams alike — which RLS
--    hides from any one caller, so the readers are SECURITY DEFINER and only
--    aggregates leave them (the 193 pattern). Term Exam results never count.
--    Archived TOS / exams still count: their results are real learner data.
--
--    Per catalogue competency: MPS = correct responses / (items x learners),
--    lib/utils/itemAnalysis.ts's formula, pooled. Scorable items are the
--    exam's non-essay authored questions (expanded by item_count), or — for a
--    paper exam keyed directly (132) — its keyed answer-key items.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.llc_count()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 3 $$;

CREATE OR REPLACE FUNCTION procurements.can_view_llc()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT procurements.is_division_author() OR procurements.is_exam_qa()
      OR procurements.is_exam_oversight();
$$;

CREATE OR REPLACE FUNCTION procurements.llc_pooled_stats(
  p_learning_area_id BIGINT, p_grade_level INTEGER, p_school_year TEXT)
RETURNS TABLE (catalogue_competency_id BIGINT, correct BIGINT, total BIGINT,
               mps NUMERIC, learners BIGINT, sections BIGINT, schools BIGINT,
               results BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  WITH res AS (
    SELECT r.id AS result_id, r.exam_id, r.section_id, r.school_id
    FROM procurements.sms_exam_results r
    JOIN procurements.sms_exams e ON e.id = r.exam_id
    JOIN procurements.sms_tos t ON t.id = e.tos_id
    WHERE r.school_year = p_school_year
      AND t.exam_type = 'Summative Test'
      AND t.learning_area_id = p_learning_area_id
      AND t.grade_level = p_grade_level
  ),
  q_items AS (
    SELECT q.exam_id, q.item_number + g.k AS item_number
    FROM procurements.sms_exam_questions q
    CROSS JOIN LATERAL generate_series(0, GREATEST(q.item_count, 1) - 1) AS g(k)
    WHERE q.exam_id IN (SELECT exam_id FROM res) AND q.question_type <> 'essay'
  ),
  k_items AS (
    SELECT k.exam_id, k.item_number
    FROM procurements.sms_exam_answer_keys k
    WHERE k.exam_id IN (SELECT exam_id FROM res)
      AND k.correct_answer IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM q_items qi WHERE qi.exam_id = k.exam_id)
  ),
  items AS (SELECT * FROM q_items UNION SELECT * FROM k_items),
  per_comp AS (
    SELECT i.exam_id, c.catalogue_competency_id,
           array_agg(DISTINCT i.item_number) AS item_numbers
    FROM items i
    JOIN procurements.sms_exams e ON e.id = i.exam_id
    JOIN procurements.sms_tos_items ti ON ti.tos_id = e.tos_id AND ti.item_number = i.item_number
    JOIN procurements.sms_tos_competencies c ON c.id = ti.competency_id
    JOIN procurements.sms_competency_catalogue cat ON cat.id = c.catalogue_competency_id
    WHERE cat.learning_area_id = p_learning_area_id AND cat.grade_level = p_grade_level
    GROUP BY i.exam_id, c.catalogue_competency_id
  ),
  learner_rows AS (
    SELECT res.result_id, res.section_id, res.school_id, s.student_id,
           pc.catalogue_competency_id,
           cardinality(pc.item_numbers) AS n,
           (SELECT count(*) FROM unnest(pc.item_numbers) it
            WHERE it = ANY (s.correct_items)) AS ok
    FROM res
    JOIN procurements.sms_exam_result_students s ON s.result_id = res.result_id
    JOIN per_comp pc ON pc.exam_id = res.exam_id
  )
  SELECT lr.catalogue_competency_id,
         sum(lr.ok)::BIGINT,
         sum(lr.n)::BIGINT,
         round(sum(lr.ok)::NUMERIC * 100 / NULLIF(sum(lr.n), 0), 2),
         count(DISTINCT lr.student_id)::BIGINT,
         count(DISTINCT lr.section_id)::BIGINT,
         count(DISTINCT lr.school_id)::BIGINT,
         count(DISTINCT lr.result_id)::BIGINT
  FROM learner_rows lr
  GROUP BY lr.catalogue_competency_id
  HAVING sum(lr.n) > 0;
$$;

-- The cut: every competency whose MPS is at or below the llc_count()-th
-- lowest (ties at the cut kept); fewer than llc_count() returns them all.
-- Mirrors llcCut() in lib/utils/questionBank.ts.
CREATE OR REPLACE FUNCTION procurements.llc_competency_ids(
  p_learning_area_id BIGINT, p_grade_level INTEGER, p_school_year TEXT)
RETURNS SETOF BIGINT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  WITH s AS (
    SELECT * FROM procurements.llc_pooled_stats(p_learning_area_id, p_grade_level, p_school_year)
  ), cut AS (
    SELECT s.mps FROM s ORDER BY s.mps ASC OFFSET procurements.llc_count() - 1 LIMIT 1
  )
  SELECT s.catalogue_competency_id FROM s
  WHERE NOT EXISTS (SELECT 1 FROM cut) OR s.mps <= (SELECT cut.mps FROM cut);
$$;

CREATE OR REPLACE FUNCTION procurements.division_llc(
  p_learning_area_id BIGINT, p_grade_level INTEGER, p_school_year TEXT)
RETURNS TABLE (catalogue_competency_id BIGINT, lc_code TEXT, competency_text TEXT,
               mps NUMERIC, learners BIGINT, sections BIGINT, schools BIGINT,
               results BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
BEGIN
  IF NOT procurements.can_view_llc() THEN
    RAISE EXCEPTION 'You are not allowed to view the Least Learned Competencies.';
  END IF;
  RETURN QUERY
  SELECT s.catalogue_competency_id, cat.lc_code, cat.competency_text, s.mps,
         s.learners, s.sections, s.schools, s.results
  FROM procurements.llc_pooled_stats(p_learning_area_id, p_grade_level, p_school_year) s
  JOIN procurements.sms_competency_catalogue cat ON cat.id = s.catalogue_competency_id
  WHERE s.catalogue_competency_id IN (
    SELECT procurements.llc_competency_ids(p_learning_area_id, p_grade_level, p_school_year))
  ORDER BY s.mps ASC, cat.lc_code;
END;
$$;

CREATE OR REPLACE FUNCTION procurements.division_llc_coverage(
  p_learning_area_id BIGINT, p_grade_level INTEGER, p_school_year TEXT)
RETURNS TABLE (results BIGINT, schools BIGINT, learners BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
BEGIN
  IF NOT procurements.can_view_llc() THEN
    RAISE EXCEPTION 'You are not allowed to view the Least Learned Competencies.';
  END IF;
  RETURN QUERY
  SELECT count(DISTINCT r.id)::BIGINT, count(DISTINCT r.school_id)::BIGINT,
         count(DISTINCT s.student_id)::BIGINT
  FROM procurements.sms_exam_results r
  JOIN procurements.sms_exams e ON e.id = r.exam_id
  JOIN procurements.sms_tos t ON t.id = e.tos_id
  LEFT JOIN procurements.sms_exam_result_students s ON s.result_id = r.id
  WHERE r.school_year = p_school_year
    AND t.exam_type = 'Summative Test'
    AND t.learning_area_id = p_learning_area_id
    AND t.grade_level = p_grade_level;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  procurements.llc_pooled_stats(BIGINT, INTEGER, TEXT),
  procurements.llc_competency_ids(BIGINT, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;

-- (sections 5–12 follow in later tasks)
```

- [ ] **Step 4: Apply and run both tests**

```bash
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/migrations/195_question_bank.sql
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/195_question_bank.sql 2>&1 | grep -E "FAIL|ERROR|ROLLBACK"
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql 2>&1 | grep -E "FAIL|ERROR|ROLLBACK"
```
Expected: `ROLLBACK` twice, nothing else. (The "not allowed" check passes because `t2` is not authorized; the grant to `authenticated` is added in Task 4's hardening section — until then PUBLIC still holds EXECUTE on `division_llc`, which is what lets `t1` call it here.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/195_question_bank.sql supabase/tests/195_question_bank.sql
git commit -m "feat(question-bank): pooled Least Learned Competencies RPC (195, part 2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Bank questions and their QA review (SQL)

**Files:**
- Modify: `supabase/migrations/195_question_bank.sql` (append sections 5–8)
- Modify: `supabase/tests/195_question_bank.sql` (append task 3 block)

**Interfaces:**
- Consumes: Task 2 `llc_competency_ids`; 194 `exam_review_transition`, `exam_has_approve_event`, `exam_me_id`.
- Produces:
  - tables `sms_exam_bank_questions(id, catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, answer_key, image_path, image_name, created_by, review_status, submitted_at, reviewed_by, reviewed_at, review_comment, created_at, updated_at)`, `sms_exam_bank_options(id, question_id, label, choice_text, is_correct, position, image_path, image_name, created_at, updated_at)`
  - `procurements.bank_supported_types() RETURNS TEXT[]`
  - helpers `can_contribute_bank()`, `can_browse_bank()`, `can_review_bank()`, `can_edit_bank_question(p_id BIGINT)` — all `RETURNS BOOLEAN`
  - `procurements.bank_expected_key(p_bank_id BIGINT) RETURNS TEXT` (internal)
  - RPC `procurements.bank_question_set_level(p_id BIGINT, p_level TEXT) RETURNS VOID`
  - 194 replaced (same signatures): `exam_review_table(TEXT)`, `exam_review_load(TEXT, BIGINT, OUT…)`, `exam_review_submit(TEXT, BIGINT)`, `exam_review_reopen(TEXT, BIGINT, TEXT)`; `exam_review_*` now accept entity `'question'`.
  - events: `entity_type` CHECK + `'question'`; `action` CHECK + `'set_level'`.

- [ ] **Step 1: Write the failing test** — append before the final marker:

```sql
-- ------------------------------------------------------------- task 3 ------
-- LLC for la / grade 5 / 2026-2027 is {c4, c2, c3, c5} (task 2).
-- unauthorized teacher cannot write a bank question
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ INSERT INTO sms_exam_bank_questions
  (catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, created_by)
  VALUES (tst.id('c4'), 'remembering', '2026-2027', 'multiple_choice', 'Q', tst.id('t2')) $$, 'row-level security');
RESET ROLE;

SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
-- off the list (c1 = 100%) refused; on the list allowed and lands as draft
SELECT tst.expect_error($$ INSERT INTO sms_exam_bank_questions
  (catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, created_by)
  VALUES (tst.id('c1'), 'remembering', '2026-2027', 'multiple_choice', 'Q', tst.id('t1')) $$, 'Least Learned');
SELECT tst.expect_error($$ INSERT INTO sms_exam_bank_questions
  (catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, created_by)
  VALUES (tst.id('c4'), 'remembering', '2026-2027', 'essay', 'Q', tst.id('t1')) $$, 'not accepted in the Question Bank');
SELECT tst.expect_rows($$ INSERT INTO sms_exam_bank_questions
  (catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, created_by, review_status)
  VALUES (tst.id('c4'), 'applying', '2026-2027', 'multiple_choice', '  What is 2 + 2?  ', tst.id('t1'), 'approved') $$, 1);
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'bq1', id FROM sms_exam_bank_questions WHERE question_text = 'What is 2 + 2?';
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_bank_questions WHERE id = tst.id('bq1') AND review_status = 'draft' $$, 1);

-- submit rules: needs 2-5 options with exactly one correct
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('question', tst.id('bq1')) $$, '2 to 5 choices');
INSERT INTO sms_exam_bank_options (question_id, label, choice_text, is_correct, position)
VALUES (tst.id('bq1'), 'A', '3', false, 0), (tst.id('bq1'), 'B', '4', false, 1), (tst.id('bq1'), 'C', '5', false, 2);
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('question', tst.id('bq1')) $$, 'exactly one');
UPDATE sms_exam_bank_options SET is_correct = true WHERE question_id = tst.id('bq1') AND label = 'B';
SELECT procurements.exam_review_submit('question', tst.id('bq1'));
-- frozen while submitted
SELECT tst.expect_rows($$ UPDATE sms_exam_bank_questions SET question_text = 'x' WHERE id = tst.id('bq1') $$, 0);
RESET ROLE;
-- even past RLS (as postgres), review fields move only inside the workflow
SELECT tst.expect_error($$ UPDATE sms_exam_bank_questions SET review_status = 'approved' WHERE id = tst.id('bq1') $$, 'QA review workflow');

-- other authors cannot see a pending question; QA and the division office can
SELECT tst.claims(tst.uid('mt')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_bank_questions WHERE id = tst.id('bq1') $$, 0);
RESET ROLE;
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_bank_questions WHERE id = tst.id('bq1') $$, 1);
SELECT tst.expect_error($$ SELECT procurements.exam_review_start('question', tst.id('bq1')) $$, 'Only a QA reviewer');
RESET ROLE;

-- QA: start, correct the level (audited), approve
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.bank_question_set_level(tst.id('bq1'), 'analyzing') $$, 'Start the review');
SELECT procurements.exam_review_start('question', tst.id('bq1'));
SELECT tst.expect_error($$ SELECT procurements.bank_question_set_level(tst.id('bq1'), 'thinking') $$, 'Unknown cognitive level');
SELECT procurements.bank_question_set_level(tst.id('bq1'), 'remembering');
SELECT procurements.exam_review_decide('question', tst.id('bq1'), 'approve', NULL);
RESET ROLE;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_bank_questions WHERE id = tst.id('bq1')
  AND review_status = 'approved' AND cognitive_level = 'remembering' $$, 1);
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_review_events WHERE entity_type = 'question'
  AND entity_id = tst.id('bq1') AND action = 'set_level' AND comment = 'applying → remembering' $$, 1);

-- approved: another authorized author can now see it; its author still cannot edit it
SELECT tst.claims(tst.uid('mt')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_bank_questions WHERE id = tst.id('bq1') $$, 1);
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_bank_options WHERE question_id = tst.id('bq1') $$, 3);
RESET ROLE;
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_rows($$ UPDATE sms_exam_bank_options SET choice_text = 'x' WHERE question_id = tst.id('bq1') $$, 0);
RESET ROLE;

-- self-review refused even after switching to the QA role: mt writes a TF question
SELECT tst.claims(tst.uid('mt')); SET LOCAL ROLE authenticated;
INSERT INTO sms_exam_bank_questions (catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, answer_key, created_by)
VALUES (tst.id('c2'), 'remembering', '2026-2027', 'true_false', 'The sun is a star.', 'False: ', tst.id('mt'));
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'bqTF', id FROM sms_exam_bank_questions WHERE question_text = 'The sun is a star.';
-- the TF answer is normalized to True / False
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_bank_questions WHERE id = tst.id('bqTF') AND answer_key = 'False' $$, 1);
SELECT tst.claims(tst.uid('mt')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_review_submit('question', tst.id('bqTF'));
SELECT procurements.sms_switch_active_role('qa');
SELECT tst.expect_error($$ SELECT procurements.exam_review_start('question', tst.id('bqTF')) $$, 'your own submission');
SELECT procurements.sms_switch_active_role('teacher');
RESET ROLE;

-- return with a reason, then approve
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_review_decide('question', tst.id('bqTF'), 'reject', '') $$, 'reason is required');
SELECT procurements.exam_review_decide('question', tst.id('bqTF'), 'reject', 'Ambiguous wording');
RESET ROLE;
SELECT tst.claims(tst.uid('mt')); SET LOCAL ROLE authenticated;
SELECT tst.expect_rows($$ UPDATE sms_exam_bank_questions SET question_text = 'The Sun is a star.', answer_key = 'True' WHERE id = tst.id('bqTF') $$, 1);
SELECT procurements.exam_review_submit('question', tst.id('bqTF'));
RESET ROLE;
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_review_decide('question', tst.id('bqTF'), 'approve', NULL);
RESET ROLE;

-- the competency of a question never changes
SELECT tst.expect_error($$ UPDATE sms_exam_bank_questions SET catalogue_competency_id = tst.id('c3') WHERE id = tst.id('bqTF') $$, 'cannot be changed');

-- a draft whose competency later drops off the list can still be submitted
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
INSERT INTO sms_exam_bank_questions (catalogue_competency_id, cognitive_level, source_llc_school_year, question_type, question_text, answer_key, created_by)
VALUES (tst.id('c5'), 'remembering', '2026-2027', 'true_false', 'Late draft', 'True', tst.id('t1'));
RESET ROLE;
UPDATE sms_exam_result_students SET correct_items = '{1,2,3}' WHERE student_id = tst.id('L3');  -- c5 now 100%
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_review_submit('question', (SELECT id FROM sms_exam_bank_questions WHERE question_text = 'Late draft'));
RESET ROLE;
UPDATE sms_exam_result_students SET correct_items = '{1}' WHERE student_id = tst.id('L3');  -- restore task 2's figures

-- the internal key helper is not callable by a signed-in user
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.bank_expected_key(1) $$, 'permission denied');
RESET ROLE;
```

- [ ] **Step 2: Run to verify it fails**

Run: `psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/195_question_bank.sql 2>&1 | grep -m1 -E "FAIL|ERROR"`
Expected: `FAIL … relation "sms_exam_bank_questions" does not exist`.

- [ ] **Step 3: Append sections 5–8** (replace the `-- (sections 5–12 follow in later tasks)` line; keep a `-- (sections 9–12 follow in later tasks)` marker after):

```sql
-- ----------------------------------------------------------------------------
-- 5. Bank tables. A bank question belongs to a catalogue competency, carries
--    its own cognitive level (set by the author, correctable by QA), and the
--    school year of the LLC list it was written from. Review columns are 194's.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_exam_bank_questions (
  id                      BIGSERIAL PRIMARY KEY,
  catalogue_competency_id BIGINT NOT NULL
                            REFERENCES procurements.sms_competency_catalogue(id) ON DELETE RESTRICT,
  cognitive_level         TEXT NOT NULL CHECK (cognitive_level IN (
                            'remembering', 'understanding', 'applying',
                            'analyzing', 'evaluating', 'creating')),
  source_llc_school_year  TEXT NOT NULL,
  question_type           TEXT NOT NULL CHECK (question_type IN (
                            'multiple_choice', 'true_false', 'modified_true_false',
                            'matching', 'short_answer', 'completion', 'essay')),
  question_text           TEXT,
  answer_key              TEXT,
  image_path              TEXT,
  image_name              TEXT,
  created_by              BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  review_status           TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN (
                            'draft', 'submitted', 'under_review', 'approved', 'rejected')),
  submitted_at            TIMESTAMPTZ,
  reviewed_by             BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  reviewed_at             TIMESTAMPTZ,
  review_comment          TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_exam_bank_questions_pick
  ON procurements.sms_exam_bank_questions (catalogue_competency_id, review_status, cognitive_level);
CREATE INDEX IF NOT EXISTS idx_sms_exam_bank_questions_author
  ON procurements.sms_exam_bank_questions (created_by);

CREATE TABLE IF NOT EXISTS procurements.sms_exam_bank_options (
  id          BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL
                REFERENCES procurements.sms_exam_bank_questions(id) ON DELETE CASCADE,
  label       TEXT,
  choice_text TEXT,
  is_correct  BOOLEAN NOT NULL DEFAULT false,
  position    INTEGER NOT NULL DEFAULT 0,
  image_path  TEXT,
  image_name  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_exam_bank_options_question
  ON procurements.sms_exam_bank_options (question_id, position);

DROP TRIGGER IF EXISTS update_sms_exam_bank_questions_updated_at ON procurements.sms_exam_bank_questions;
CREATE TRIGGER update_sms_exam_bank_questions_updated_at
  BEFORE UPDATE ON procurements.sms_exam_bank_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_sms_exam_bank_options_updated_at ON procurements.sms_exam_bank_options;
CREATE TRIGGER update_sms_exam_bank_options_updated_at
  BEFORE UPDATE ON procurements.sms_exam_bank_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 6. Rules in one place each, and the access helpers. Three separate
--    decisions — contribute, browse, review — each its own helper even where
--    two coincide today.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.bank_supported_types()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['multiple_choice', 'true_false']::TEXT[];
$$;

CREATE OR REPLACE FUNCTION procurements.can_contribute_bank()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT procurements.is_division_author();
$$;

CREATE OR REPLACE FUNCTION procurements.can_browse_bank()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT procurements.is_division_author() OR procurements.is_exam_qa()
      OR procurements.is_exam_oversight();
$$;

CREATE OR REPLACE FUNCTION procurements.can_review_bank()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT procurements.is_exam_qa();
$$;

CREATE OR REPLACE FUNCTION procurements.can_edit_bank_question(p_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_exam_bank_questions b
    WHERE b.id = p_id
      AND b.created_by = procurements.exam_me_id()
      AND b.review_status IN ('draft', 'rejected')
      AND procurements.can_contribute_bank());
$$;

-- The answer-sheet letter a bank question scores on: the correct option's
-- letter by position for MC, A (True) / B (False) for TF — the rule
-- deriveAnswerKeyFromQuestions() in lib/utils/examAnswerKey.ts applies.
CREATE OR REPLACE FUNCTION procurements.bank_expected_key(p_bank_id BIGINT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT CASE b.question_type
    WHEN 'true_false' THEN CASE b.answer_key WHEN 'True' THEN 'A' WHEN 'False' THEN 'B' END
    WHEN 'multiple_choice' THEN (
      SELECT chr(64 + o.rn::INT) FROM (
        SELECT op.is_correct, row_number() OVER (ORDER BY op.position, op.id) AS rn
        FROM procurements.sms_exam_bank_options op WHERE op.question_id = b.id) o
      WHERE o.is_correct LIMIT 1)
  END
  FROM procurements.sms_exam_bank_questions b WHERE b.id = p_bank_id;
$$;
REVOKE EXECUTE ON FUNCTION procurements.bank_expected_key(BIGINT) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. Guard + RLS. Insert always lands as draft; review fields move only inside
--    194's workflow flag; the competency, LLC year and author are immutable
--    (author → NULL admitted for the FK's ON DELETE SET NULL, per 194). A
--    question can only be STARTED for a competency on the current LLC list.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.bank_guard_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_area  BIGINT;
  v_grade INTEGER;
BEGIN
  NEW.question_text := NULLIF(btrim(NEW.question_text), '');
  NEW.image_path := NULLIF(btrim(NEW.image_path), '');
  NEW.answer_key := NULLIF(btrim(NEW.answer_key), '');
  IF NEW.question_type = 'true_false' THEN
    NEW.answer_key := CASE
      WHEN lower(NEW.answer_key) LIKE 'true%' THEN 'True'
      WHEN lower(NEW.answer_key) LIKE 'false%' THEN 'False' END;
  END IF;

  IF current_setting('sms.exam_review', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.review_status := 'draft';
    NEW.submitted_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_comment := NULL;
    IF NOT (NEW.question_type = ANY (procurements.bank_supported_types())) THEN
      RAISE EXCEPTION 'This question type is not accepted in the Question Bank yet.';
    END IF;
    SELECT c.learning_area_id, c.grade_level INTO v_area, v_grade
    FROM procurements.sms_competency_catalogue c WHERE c.id = NEW.catalogue_competency_id;
    IF NOT EXISTS (
      SELECT 1 FROM procurements.llc_competency_ids(v_area, v_grade, NEW.source_llc_school_year) x
      WHERE x = NEW.catalogue_competency_id) THEN
      RAISE EXCEPTION 'Questions can only be started for a competency on the Least Learned list for %.',
        NEW.source_llc_school_year;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL THEN
    RAISE EXCEPTION 'The author of a Question Bank question cannot be changed.';
  END IF;
  IF NEW.catalogue_competency_id IS DISTINCT FROM OLD.catalogue_competency_id
     OR NEW.source_llc_school_year IS DISTINCT FROM OLD.source_llc_school_year THEN
    RAISE EXCEPTION 'The competency of a Question Bank question cannot be changed; write a new question.';
  END IF;
  IF NEW.review_status  IS DISTINCT FROM OLD.review_status
  OR NEW.submitted_at   IS DISTINCT FROM OLD.submitted_at
  OR (NEW.reviewed_by   IS DISTINCT FROM OLD.reviewed_by AND NEW.reviewed_by IS NOT NULL)
  OR NEW.reviewed_at    IS DISTINCT FROM OLD.reviewed_at
  OR NEW.review_comment IS DISTINCT FROM OLD.review_comment THEN
    RAISE EXCEPTION 'Review status changes only through the QA review workflow.';
  END IF;
  IF NEW.question_type IS DISTINCT FROM OLD.question_type
     AND NOT (NEW.question_type = ANY (procurements.bank_supported_types())) THEN
    RAISE EXCEPTION 'This question type is not accepted in the Question Bank yet.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sms_exam_bank_questions_guard ON procurements.sms_exam_bank_questions;
CREATE TRIGGER sms_exam_bank_questions_guard
  BEFORE INSERT OR UPDATE ON procurements.sms_exam_bank_questions
  FOR EACH ROW EXECUTE FUNCTION procurements.bank_guard_fields();

ALTER TABLE procurements.sms_exam_bank_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_exam_bank_options ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_exam_bank_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_exam_bank_options TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_exam_bank_questions_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_exam_bank_options_id_seq TO authenticated;

DROP POLICY IF EXISTS "sms_exam_bank_questions: select" ON procurements.sms_exam_bank_questions;
DROP POLICY IF EXISTS "sms_exam_bank_questions: insert" ON procurements.sms_exam_bank_questions;
DROP POLICY IF EXISTS "sms_exam_bank_questions: update" ON procurements.sms_exam_bank_questions;
DROP POLICY IF EXISTS "sms_exam_bank_questions: delete" ON procurements.sms_exam_bank_questions;
CREATE POLICY "sms_exam_bank_questions: select" ON procurements.sms_exam_bank_questions
  FOR SELECT TO authenticated
  USING (created_by = procurements.exam_me_id()
         OR procurements.can_review_bank()
         OR procurements.is_exam_oversight()
         OR (review_status = 'approved' AND procurements.can_browse_bank()));
CREATE POLICY "sms_exam_bank_questions: insert" ON procurements.sms_exam_bank_questions
  FOR INSERT TO authenticated
  WITH CHECK (procurements.can_contribute_bank() AND created_by = procurements.exam_me_id());
CREATE POLICY "sms_exam_bank_questions: update" ON procurements.sms_exam_bank_questions
  FOR UPDATE TO authenticated
  USING (procurements.can_edit_bank_question(id))
  WITH CHECK (procurements.can_edit_bank_question(id));
CREATE POLICY "sms_exam_bank_questions: delete" ON procurements.sms_exam_bank_questions
  FOR DELETE TO authenticated
  USING (procurements.can_edit_bank_question(id)
         AND NOT procurements.exam_has_approve_event('question', id));

DROP POLICY IF EXISTS "sms_exam_bank_options: select" ON procurements.sms_exam_bank_options;
DROP POLICY IF EXISTS "sms_exam_bank_options: insert" ON procurements.sms_exam_bank_options;
DROP POLICY IF EXISTS "sms_exam_bank_options: update" ON procurements.sms_exam_bank_options;
DROP POLICY IF EXISTS "sms_exam_bank_options: delete" ON procurements.sms_exam_bank_options;
CREATE POLICY "sms_exam_bank_options: select" ON procurements.sms_exam_bank_options
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM procurements.sms_exam_bank_questions b
                 WHERE b.id = sms_exam_bank_options.question_id));
CREATE POLICY "sms_exam_bank_options: insert" ON procurements.sms_exam_bank_options
  FOR INSERT TO authenticated WITH CHECK (procurements.can_edit_bank_question(question_id));
CREATE POLICY "sms_exam_bank_options: update" ON procurements.sms_exam_bank_options
  FOR UPDATE TO authenticated
  USING (procurements.can_edit_bank_question(question_id))
  WITH CHECK (procurements.can_edit_bank_question(question_id));
CREATE POLICY "sms_exam_bank_options: delete" ON procurements.sms_exam_bank_options
  FOR DELETE TO authenticated USING (procurements.can_edit_bank_question(question_id));

-- ----------------------------------------------------------------------------
-- 8. 194's workflow learns the entity 'question'. Same signatures, so
--    CREATE OR REPLACE; 194's file is untouched. exam_review_start / _decide /
--    _withdraw / _transition need no change: is_exam_qa() is can_review_bank()
--    today and the bank table carries every column the transition writes.
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_exam_review_events
  DROP CONSTRAINT IF EXISTS sms_exam_review_events_entity_type_check;
ALTER TABLE procurements.sms_exam_review_events
  ADD CONSTRAINT sms_exam_review_events_entity_type_check
  CHECK (entity_type IN ('tos', 'exam', 'author', 'question'));
ALTER TABLE procurements.sms_exam_review_events
  DROP CONSTRAINT IF EXISTS sms_exam_review_events_action_check;
ALTER TABLE procurements.sms_exam_review_events
  ADD CONSTRAINT sms_exam_review_events_action_check
  CHECK (action IN ('authorize', 'revoke', 'submit', 'withdraw', 'start_review',
                    'approve', 'reject', 'reopen', 'set_level'));

DROP POLICY IF EXISTS "sms_exam_review_events: select" ON procurements.sms_exam_review_events;
CREATE POLICY "sms_exam_review_events: select" ON procurements.sms_exam_review_events
  FOR SELECT TO authenticated
  USING (
    procurements.is_exam_qa() OR procurements.is_exam_oversight()
    OR (entity_type = 'tos' AND EXISTS (
          SELECT 1 FROM procurements.sms_tos t
          WHERE t.id = entity_id AND t.created_by = procurements.exam_me_id()))
    OR (entity_type = 'exam' AND EXISTS (
          SELECT 1 FROM procurements.sms_exams e
          WHERE e.id = entity_id AND e.created_by = procurements.exam_me_id()))
    OR (entity_type = 'author' AND EXISTS (
          SELECT 1 FROM procurements.sms_exam_qa_authors a
          WHERE a.id = entity_id AND a.user_id = procurements.exam_me_id()))
    OR (entity_type = 'question' AND EXISTS (
          SELECT 1 FROM procurements.sms_exam_bank_questions b
          WHERE b.id = entity_id AND b.created_by = procurements.exam_me_id())));

CREATE OR REPLACE FUNCTION procurements.exam_review_table(p_entity TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_entity = 'tos' THEN RETURN 'sms_tos'; END IF;
  IF p_entity = 'exam' THEN RETURN 'sms_exams'; END IF;
  IF p_entity = 'question' THEN RETURN 'sms_exam_bank_questions'; END IF;
  RAISE EXCEPTION 'Unknown review item "%".', p_entity;
END;
$$;

-- Bank rows have no school_id: they are always division rows.
CREATE OR REPLACE FUNCTION procurements.exam_review_load(
  p_entity TEXT, p_id BIGINT,
  OUT o_status TEXT, OUT o_created_by BIGINT, OUT o_tos_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_school BIGINT;
  v_found  INT;
BEGIN
  EXECUTE format(
    'SELECT review_status, created_by, %s, %s FROM procurements.%I WHERE id = $1 FOR UPDATE',
    CASE p_entity WHEN 'question' THEN 'NULL::BIGINT' ELSE 'school_id' END,
    CASE p_entity WHEN 'exam' THEN 'tos_id' ELSE 'NULL::BIGINT' END,
    procurements.exam_review_table(p_entity))
  INTO o_status, o_created_by, v_school, o_tos_id
  USING p_id;
  GET DIAGNOSTICS v_found = ROW_COUNT;

  IF v_found = 0 THEN
    RAISE EXCEPTION 'That item does not exist.';
  END IF;
  IF v_school IS NOT NULL THEN
    RAISE EXCEPTION 'Only Division TOS and exams go through QA review.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_review_submit(p_entity TEXT, p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  r     RECORD;
  b     RECORD;
  v_bad TEXT;
  v_n   INTEGER;
BEGIN
  SELECT * INTO r FROM procurements.exam_review_load(p_entity, p_id);

  IF r.o_created_by IS DISTINCT FROM procurements.exam_me_id() THEN
    RAISE EXCEPTION 'Only the author can submit this for review.';
  END IF;
  IF p_entity = 'question' THEN
    IF NOT procurements.can_contribute_bank() THEN
      RAISE EXCEPTION 'You are not currently authorized to write Question Bank questions.';
    END IF;
  ELSIF NOT procurements.is_division_author() THEN
    RAISE EXCEPTION 'You are not currently authorized to write Division TOS or exams.';
  END IF;
  IF r.o_status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Only a draft or returned item can be submitted (this one is %).', r.o_status;
  END IF;

  IF p_entity = 'tos' THEN
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_tos_competencies c WHERE c.tos_id = p_id) THEN
      RAISE EXCEPTION 'Add at least one competency before submitting.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_tos t
                   WHERE t.id = p_id AND t.learning_area_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Choose a learning area from the competency catalogue before submitting.';
    END IF;
    SELECT c.competency_text INTO v_bad FROM procurements.sms_tos_competencies c
    WHERE c.tos_id = p_id AND c.catalogue_competency_id IS NULL
    ORDER BY c.position LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Competency "%" is not linked to the competency catalogue.', v_bad;
    END IF;
  ELSIF p_entity = 'exam' THEN
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_tos t
                   WHERE t.id = r.o_tos_id AND t.school_id IS NULL
                     AND t.review_status = 'approved') THEN
      RAISE EXCEPTION 'This exam''s TOS is not an approved Division TOS.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_exam_questions q WHERE q.exam_id = p_id) THEN
      RAISE EXCEPTION 'Add at least one question before submitting.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_exam_answer_keys k WHERE k.exam_id = p_id) THEN
      RAISE EXCEPTION 'Set the answer key before submitting.';
    END IF;
    -- (section 10 adds the bank-item checks here)
  ELSE
    SELECT * INTO b FROM procurements.sms_exam_bank_questions WHERE id = p_id;
    IF NOT (b.question_type = ANY (procurements.bank_supported_types())) THEN
      RAISE EXCEPTION 'This question type is not accepted in the Question Bank yet.';
    END IF;
    IF b.question_text IS NULL AND b.image_path IS NULL THEN
      RAISE EXCEPTION 'Write the question (or add a figure) before submitting.';
    END IF;
    IF b.question_type = 'multiple_choice' THEN
      SELECT count(*) INTO v_n FROM procurements.sms_exam_bank_options o WHERE o.question_id = p_id;
      IF v_n < 2 OR v_n > 5 THEN
        RAISE EXCEPTION 'A multiple-choice question needs 2 to 5 choices.';
      END IF;
      IF (SELECT count(*) FROM procurements.sms_exam_bank_options o
          WHERE o.question_id = p_id AND o.is_correct) <> 1 THEN
        RAISE EXCEPTION 'Mark exactly one choice as correct.';
      END IF;
      IF EXISTS (SELECT 1 FROM procurements.sms_exam_bank_options o
                 WHERE o.question_id = p_id
                   AND NULLIF(btrim(o.choice_text), '') IS NULL
                   AND NULLIF(btrim(o.image_path), '') IS NULL) THEN
        RAISE EXCEPTION 'Every choice needs text or a figure.';
      END IF;
    ELSIF b.answer_key IS NULL OR b.answer_key NOT IN ('True', 'False') THEN
      RAISE EXCEPTION 'Choose True or False as the answer.';
    END IF;
  END IF;

  PERFORM procurements.exam_review_transition(
    p_entity, p_id, 'submit', r.o_status, 'submitted', NULL, r.o_created_by);
END;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_review_reopen(
  p_entity TEXT, p_id BIGINT, p_comment TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  r RECORD;
  v_comment TEXT := NULLIF(btrim(p_comment), '');
BEGIN
  IF NOT procurements.is_exam_qa() THEN
    RAISE EXCEPTION 'Only a QA reviewer may reopen Division TOS and exams.';
  END IF;
  SELECT * INTO r FROM procurements.exam_review_load(p_entity, p_id);
  IF r.o_status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved item can be reopened.';
  END IF;
  IF v_comment IS NULL THEN
    RAISE EXCEPTION 'A reason is required to reopen an item.';
  END IF;
  IF NOT procurements.exam_has_approve_event(p_entity, p_id) THEN
    RAISE EXCEPTION 'This item predates QA review and has no author who can edit it; create a new one instead.';
  END IF;
  IF p_entity = 'exam' AND EXISTS (
       SELECT 1 FROM procurements.sms_exam_results x WHERE x.exam_id = p_id) THEN
    RAISE EXCEPTION 'Results have already been recorded against this exam; create a new set instead.';
  END IF;
  IF p_entity = 'tos' AND EXISTS (
       SELECT 1 FROM procurements.sms_exams e WHERE e.tos_id = p_id) THEN
    RAISE EXCEPTION 'An exam has been built on this TOS; create a new TOS instead.';
  END IF;
  IF p_entity = 'question' AND EXISTS (
       SELECT 1 FROM procurements.sms_exam_questions q
       WHERE q.source_bank_question_id = p_id) THEN
    RAISE EXCEPTION 'This question is used in an exam; write a new question instead.';
  END IF;

  PERFORM procurements.exam_review_transition(
    p_entity, p_id, 'reopen', r.o_status, 'draft', v_comment, r.o_created_by);
END;
$$;

-- QA corrects the cognitive level while reviewing; audited as set_level.
CREATE OR REPLACE FUNCTION procurements.bank_question_set_level(p_id BIGINT, p_level TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  r     RECORD;
  v_old TEXT;
BEGIN
  IF NOT procurements.can_review_bank() THEN
    RAISE EXCEPTION 'Only a QA reviewer may change a question''s cognitive level.';
  END IF;
  IF p_level NOT IN ('remembering', 'understanding', 'applying',
                     'analyzing', 'evaluating', 'creating') THEN
    RAISE EXCEPTION 'Unknown cognitive level "%".', p_level;
  END IF;
  SELECT * INTO r FROM procurements.exam_review_load('question', p_id);
  IF r.o_created_by = procurements.exam_me_id() THEN
    RAISE EXCEPTION 'You cannot review your own submission.';
  END IF;
  IF r.o_status <> 'under_review' THEN
    RAISE EXCEPTION 'Start the review before changing the cognitive level.';
  END IF;
  SELECT b.cognitive_level INTO v_old FROM procurements.sms_exam_bank_questions b WHERE b.id = p_id;
  IF v_old = p_level THEN
    RETURN;
  END IF;

  PERFORM set_config('sms.exam_review', 'on', true);
  UPDATE procurements.sms_exam_bank_questions
     SET cognitive_level = p_level, updated_at = NOW()
   WHERE id = p_id;
  INSERT INTO procurements.sms_exam_review_events
    (entity_type, entity_id, actor_id, action, from_status, to_status, comment)
  VALUES ('question', p_id, procurements.exam_me_id(), 'set_level',
          r.o_status, r.o_status, v_old || ' → ' || p_level);
  PERFORM set_config('sms.exam_review', 'off', true);
END;
$$;

-- (sections 9–12 follow in later tasks)
```

- [ ] **Step 4: Apply and run both tests**

```bash
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/migrations/195_question_bank.sql
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/195_question_bank.sql 2>&1 | grep -E "FAIL|ERROR|ROLLBACK"
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql 2>&1 | grep -E "FAIL|ERROR|ROLLBACK"
```
Expected: `ROLLBACK` twice, nothing else. If the events constraint names differ locally, find them with `psql "$LOCAL" -c "select conname from pg_constraint where conrelid='procurements.sms_exam_review_events'::regclass"` and use those names in the `DROP CONSTRAINT IF EXISTS` lines.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/195_question_bank.sql supabase/tests/195_question_bank.sql
git commit -m "feat(question-bank): bank questions with per-question QA review (195, part 3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Bank items inside division exams + hardening (SQL)

**Files:**
- Modify: `supabase/migrations/195_question_bank.sql` (append sections 9–12, insert the exam bank checks into `exam_review_submit`)
- Modify: `supabase/tests/195_question_bank.sql` (append task 4 block)

**Interfaces:**
- Consumes: Task 3 `bank_expected_key`, bank tables; 194 `exam_guard_tos`.
- Produces: columns `sms_exam_questions.source_bank_question_id BIGINT NULL`, `sms_exam_questions.bank_level_override BOOLEAN NOT NULL DEFAULT false`; triggers `sms_exam_questions_guard_bank_link`, `sms_exam_options_guard_bank_option`; final grants.

- [ ] **Step 1: Write the failing test** — append before the final marker:

```sql
-- ------------------------------------------------------------- task 4 ------
-- A Division TOS (approved out-of-band) with item 1 -> c4 (applying),
-- item 2 -> c2 (remembering), and a draft division exam on it.
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
INSERT INTO sms_tos (learning_area_id, subject_name, grade_level, school_year, grading_period, school_id, created_by, title, exam_type)
VALUES (tst.id('la'), 'x', 5, '2026-2027', 1, NULL, tst.id('t1'), 'T195 DIV TOS', 'Summative Test');
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'dtos', id FROM sms_tos WHERE title = 'T195 DIV TOS';
INSERT INTO sms_tos_competencies (tos_id, catalogue_competency_id, competency_text, position)
VALUES (tst.id('dtos'), tst.id('c4'), 'x', 0), (tst.id('dtos'), tst.id('c2'), 'x', 1);
INSERT INTO sms_tos_items (tos_id, competency_id, item_number, cognitive_level)
SELECT c.tos_id, c.id, c.position + 1, CASE c.position WHEN 0 THEN 'applying' ELSE 'remembering' END
FROM sms_tos_competencies c WHERE c.tos_id = tst.id('dtos');
SELECT set_config('sms.exam_review', 'on', true);
UPDATE sms_tos SET review_status = 'approved' WHERE id = tst.id('dtos');
SELECT set_config('sms.exam_review', 'off', true);
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
INSERT INTO sms_exams (tos_id, school_id, created_by, title) VALUES (tst.id('dtos'), NULL, tst.id('t1'), 'T195 DIV EXAM');
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'dexam', id FROM sms_exams WHERE title = 'T195 DIV EXAM';

-- bq1: competency c4, level 'remembering' (QA corrected), approved; correct option is B ('4')
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
-- a copy that differs from the bank question is refused
SELECT tst.expect_error($$ INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, position, source_bank_question_id)
  VALUES (tst.id('dexam'), 1, 'multiple_choice', 'What is 2 + 3?', 0, tst.id('bq1')) $$, 'cannot be edited inside the exam');
-- item 2 is c2: wrong competency
SELECT tst.expect_error($$ INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, position, source_bank_question_id)
  VALUES (tst.id('dexam'), 2, 'multiple_choice', 'What is 2 + 2?', 0, tst.id('bq1')) $$, 'different competency');
-- item 1 is c4 at 'applying'; bq1 is 'remembering': refused without the override …
SELECT tst.expect_error($$ INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, position, source_bank_question_id)
  VALUES (tst.id('dexam'), 1, 'multiple_choice', 'What is 2 + 2?', 0, tst.id('bq1')) $$, 'cognitive level');
-- … accepted with it
SELECT tst.expect_rows($$ INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, position, source_bank_question_id, bank_level_override)
  VALUES (tst.id('dexam'), 1, 'multiple_choice', 'What is 2 + 2?', 0, tst.id('bq1'), true) $$, 1);
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'eq1', id FROM sms_exam_questions WHERE exam_id = tst.id('dexam') AND item_number = 1;

SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
-- options must equal the bank's, position by position
SELECT tst.expect_error($$ INSERT INTO sms_exam_options (question_id, label, choice_text, is_correct, position)
  VALUES (tst.id('eq1'), 'A', '3', true, 0) $$, 'choices');
INSERT INTO sms_exam_options (question_id, label, choice_text, is_correct, position)
VALUES (tst.id('eq1'), 'A', '3', false, 0), (tst.id('eq1'), 'B', '4', true, 1);
-- item 2: bqTF (c2, remembering) matches exactly; the override flag is cleared
INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, answer_key, position, source_bank_question_id, bank_level_override)
VALUES (tst.id('dexam'), 2, 'true_false', 'The Sun is a star.', 'True', 1, tst.id('bqTF'), true);
RESET ROLE;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_questions WHERE exam_id = tst.id('dexam') AND item_number = 2 AND NOT bank_level_override $$, 1);

-- submit: only 2 of bq1's 3 choices copied -> refused; then the key must match
INSERT INTO sms_exam_answer_keys (exam_id, item_number, correct_answer, choice_count)
VALUES (tst.id('dexam'), 1, 'B', 3), (tst.id('dexam'), 2, 'A', 2);
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('exam', tst.id('dexam')) $$, 'Item 1: its choices');
INSERT INTO sms_exam_options (question_id, label, choice_text, is_correct, position) VALUES (tst.id('eq1'), 'C', '5', false, 2);
UPDATE sms_exam_answer_keys SET correct_answer = 'C' WHERE exam_id = tst.id('dexam') AND item_number = 1;
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('exam', tst.id('dexam')) $$, 'Item 1: the answer key');
UPDATE sms_exam_answer_keys SET correct_answer = 'B' WHERE exam_id = tst.id('dexam') AND item_number = 1;
SELECT procurements.exam_review_submit('exam', tst.id('dexam'));
RESET ROLE;

-- a bank question in use cannot be reopened
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_review_reopen('question', tst.id('bq1'), 'fix') $$, 'used in an exam');
RESET ROLE;

-- bank items are division-only: a private exam cannot link one
SELECT tst.expect_error($$ INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, position, source_bank_question_id)
  VALUES (tst.id('exA'), 9, 'true_false', 'The Sun is a star.', 9, tst.id('bqTF')) $$, 'Division exam');

-- an unapproved bank question cannot be linked
SELECT tst.expect_error($$ INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, answer_key, position, source_bank_question_id)
  VALUES (tst.id('dexam'), 3, 'true_false', 'Late draft', 'True', 2,
          (SELECT id FROM sms_exam_bank_questions WHERE question_text = 'Late draft')) $$, 'approved Question Bank');

-- an exam question without a bank link behaves exactly as before
SELECT tst.expect_rows($$ INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text, position, bank_level_override)
  VALUES (tst.id('exA'), 9, 'essay', 'Explain.', 9, true) $$, 1);
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_questions WHERE exam_id = tst.id('exA') AND item_number = 9 AND NOT bank_level_override $$, 1);

-- grants: helpers and RPCs callable by a signed-in user, internals not
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.bank_guard_fields() $$, 'permission denied');
SELECT procurements.can_view_llc();
SELECT procurements.bank_supported_types();
RESET ROLE;
SELECT tst.expect_count($$ SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'procurements' AND p.proname = 'division_llc'
    AND has_function_privilege('anon', p.oid, 'EXECUTE') $$, 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/195_question_bank.sql 2>&1 | grep -m1 -E "FAIL|ERROR"`
Expected: `ERROR: column "source_bank_question_id" of relation "sms_exam_questions" does not exist` (inside an `expect_error` that then reports `FAIL expected error like "cannot be edited…"`).

- [ ] **Step 3: Insert the exam bank checks into `exam_review_submit`** — in section 8, replace the line `    -- (section 10 adds the bank-item checks here)` with:

```sql
    -- Bank items (section 9): the guard checked each copy as it was written;
    -- here the whole set — every choice copied, and the key scoring on the
    -- bank question's correct answer.
    FOR b IN
      SELECT q.id, q.item_number, q.source_bank_question_id AS bank_id
      FROM procurements.sms_exam_questions q
      WHERE q.exam_id = p_id AND q.source_bank_question_id IS NOT NULL
      ORDER BY q.item_number
    LOOP
      IF (SELECT count(*) FROM procurements.sms_exam_options o WHERE o.question_id = b.id)
         <> (SELECT count(*) FROM procurements.sms_exam_bank_options o WHERE o.question_id = b.bank_id) THEN
        RAISE EXCEPTION 'Item %: its choices do not match its Question Bank question.', b.item_number;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM procurements.sms_exam_answer_keys k
        WHERE k.exam_id = p_id AND k.item_number = b.item_number
          AND upper(k.correct_answer) = procurements.bank_expected_key(b.bank_id)) THEN
        RAISE EXCEPTION 'Item %: the answer key does not match its Question Bank question.', b.item_number;
      END IF;
    END LOOP;
```

- [ ] **Step 4: Append sections 9–12** (replace `-- (sections 9–12 follow in later tasks)`):

```sql
-- ----------------------------------------------------------------------------
-- 9. Bank items in a division exam. The exam builder holds the exam in memory
--    and rewrites every question and option on Save, renumbering as parts
--    move, so it copies the approved bank question into its draft and the
--    database validates the copy here. A row without source_bank_question_id
--    is untouched (its override flag is simply kept false).
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_exam_questions
  ADD COLUMN IF NOT EXISTS source_bank_question_id BIGINT
    REFERENCES procurements.sms_exam_bank_questions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS bank_level_override BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_sms_exam_questions_bank
  ON procurements.sms_exam_questions (source_bank_question_id)
  WHERE source_bank_question_id IS NOT NULL;

CREATE OR REPLACE FUNCTION procurements.exam_guard_bank_link()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  b        RECORD;
  v_school BIGINT;
  v_tos    BIGINT;
  v_cat    BIGINT;
  v_level  TEXT;
BEGIN
  IF NEW.source_bank_question_id IS NULL THEN
    NEW.bank_level_override := false;
    RETURN NEW;
  END IF;

  SELECT e.school_id, e.tos_id INTO v_school, v_tos
  FROM procurements.sms_exams e WHERE e.id = NEW.exam_id;
  IF v_school IS NOT NULL THEN
    RAISE EXCEPTION 'Question Bank questions can only be used in a Division exam.';
  END IF;

  SELECT * INTO b FROM procurements.sms_exam_bank_questions WHERE id = NEW.source_bank_question_id;
  IF b.review_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Only an approved Question Bank question can be used.';
  END IF;
  IF NEW.question_type IS DISTINCT FROM b.question_type
     OR NULLIF(btrim(NEW.question_text), '') IS DISTINCT FROM b.question_text
     OR NULLIF(btrim(NEW.answer_key), '') IS DISTINCT FROM b.answer_key
     OR NULLIF(btrim(NEW.image_path), '') IS DISTINCT FROM b.image_path
     OR COALESCE(NEW.item_count, 1) <> 1 THEN
    RAISE EXCEPTION 'Item %: a Question Bank question cannot be edited inside the exam.', NEW.item_number;
  END IF;

  SELECT c.catalogue_competency_id, ti.cognitive_level INTO v_cat, v_level
  FROM procurements.sms_tos_items ti
  JOIN procurements.sms_tos_competencies c ON c.id = ti.competency_id
  WHERE ti.tos_id = v_tos AND ti.item_number = NEW.item_number;
  IF v_cat IS DISTINCT FROM b.catalogue_competency_id THEN
    RAISE EXCEPTION 'Item %: this Question Bank question is for a different competency than the TOS item.',
      NEW.item_number;
  END IF;
  IF v_level <> b.cognitive_level AND NOT NEW.bank_level_override THEN
    RAISE EXCEPTION 'Item %: the question''s cognitive level (%) differs from the TOS item (%); confirm the mismatch to use it.',
      NEW.item_number, b.cognitive_level, v_level;
  END IF;
  IF v_level = b.cognitive_level THEN
    NEW.bank_level_override := false;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sms_exam_questions_guard_bank_link ON procurements.sms_exam_questions;
CREATE TRIGGER sms_exam_questions_guard_bank_link
  BEFORE INSERT OR UPDATE ON procurements.sms_exam_questions
  FOR EACH ROW EXECUTE FUNCTION procurements.exam_guard_bank_link();

CREATE OR REPLACE FUNCTION procurements.exam_guard_bank_option()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_bank   BIGINT;
  v_item   INTEGER;
BEGIN
  SELECT q.source_bank_question_id, q.item_number INTO v_bank, v_item
  FROM procurements.sms_exam_questions q WHERE q.id = NEW.question_id;
  IF v_bank IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM procurements.sms_exam_bank_options o
    WHERE o.question_id = v_bank
      AND o.position = NEW.position
      AND NULLIF(btrim(o.choice_text), '') IS NOT DISTINCT FROM NULLIF(btrim(NEW.choice_text), '')
      AND o.is_correct = NEW.is_correct
      AND NULLIF(btrim(o.image_path), '') IS NOT DISTINCT FROM NULLIF(btrim(NEW.image_path), '')) THEN
    RAISE EXCEPTION 'Item %: the choices of a Question Bank question cannot be edited inside the exam.', v_item;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sms_exam_options_guard_bank_option ON procurements.sms_exam_options;
CREATE TRIGGER sms_exam_options_guard_bank_option
  BEFORE INSERT OR UPDATE ON procurements.sms_exam_options
  FOR EACH ROW EXECUTE FUNCTION procurements.exam_guard_bank_option();

-- ----------------------------------------------------------------------------
-- 10. (the bank-item checks of exam_review_submit live in section 8)
-- 11. Nothing else of 194 is replaced.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 12. Hardening. Internal and trigger functions: nobody but the owner (revoked
--     from authenticated too, in case production's default privileges granted
--     it — the 194 lesson). Helpers and RPCs: signed-in users only.
--
--     After applying, verify (read-only):
--       SELECT p.proname, p.proacl FROM pg_proc p
--       JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'procurements' AND p.proname IN (
--         'catalogue_normalize', 'tos_guard_catalogue', 'tos_competency_guard_catalogue',
--         'llc_pooled_stats', 'llc_competency_ids', 'bank_guard_fields',
--         'bank_expected_key', 'exam_guard_bank_link', 'exam_guard_bank_option',
--         'can_manage_catalogue', 'llc_count', 'can_view_llc', 'division_llc',
--         'division_llc_coverage', 'bank_supported_types', 'can_contribute_bank',
--         'can_browse_bank', 'can_review_bank', 'can_edit_bank_question',
--         'bank_question_set_level')
--       ORDER BY p.proname;
--     Expected: the first nine show no `authenticated=X`, `anon=X` or bare
--     `=X`; the rest show `authenticated=X` and no `anon=X` / `=X`.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  procurements.catalogue_normalize(),
  procurements.tos_guard_catalogue(),
  procurements.tos_competency_guard_catalogue(),
  procurements.llc_pooled_stats(BIGINT, INTEGER, TEXT),
  procurements.llc_competency_ids(BIGINT, INTEGER, TEXT),
  procurements.bank_guard_fields(),
  procurements.bank_expected_key(BIGINT),
  procurements.exam_guard_bank_link(),
  procurements.exam_guard_bank_option(),
  procurements.can_manage_catalogue(),
  procurements.llc_count(),
  procurements.can_view_llc(),
  procurements.division_llc(BIGINT, INTEGER, TEXT),
  procurements.division_llc_coverage(BIGINT, INTEGER, TEXT),
  procurements.bank_supported_types(),
  procurements.can_contribute_bank(),
  procurements.can_browse_bank(),
  procurements.can_review_bank(),
  procurements.can_edit_bank_question(BIGINT),
  procurements.bank_question_set_level(BIGINT, TEXT)
  FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION
  procurements.catalogue_normalize(),
  procurements.tos_guard_catalogue(),
  procurements.tos_competency_guard_catalogue(),
  procurements.llc_pooled_stats(BIGINT, INTEGER, TEXT),
  procurements.llc_competency_ids(BIGINT, INTEGER, TEXT),
  procurements.bank_guard_fields(),
  procurements.bank_expected_key(BIGINT),
  procurements.exam_guard_bank_link(),
  procurements.exam_guard_bank_option()
  FROM authenticated;

GRANT EXECUTE ON FUNCTION
  procurements.can_manage_catalogue(),
  procurements.llc_count(),
  procurements.can_view_llc(),
  procurements.division_llc(BIGINT, INTEGER, TEXT),
  procurements.division_llc_coverage(BIGINT, INTEGER, TEXT),
  procurements.bank_supported_types(),
  procurements.can_contribute_bank(),
  procurements.can_browse_bank(),
  procurements.can_review_bank(),
  procurements.can_edit_bank_question(BIGINT),
  procurements.bank_question_set_level(BIGINT, TEXT)
  TO authenticated, service_role;
```

(The earlier REVOKEs in sections 4 and 6 stay; section 12 repeats them so the whole grant picture is in one place.)

- [ ] **Step 5: Apply and run both tests**

```bash
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/migrations/195_question_bank.sql
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/195_question_bank.sql 2>&1 | grep -E "FAIL|ERROR|ROLLBACK"
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql 2>&1 | grep -E "FAIL|ERROR|ROLLBACK"
```
Expected: `ROLLBACK` twice, nothing else.

- [ ] **Step 6: Re-run the migration a second time** (idempotency): `psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/migrations/195_question_bank.sql && echo OK` → `OK`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/195_question_bank.sql supabase/tests/195_question_bank.sql
git commit -m "feat(question-bank): validate bank items in division exams, grants (195, part 4)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Shared TypeScript — types, constants, pure helpers

**Files:**
- Modify: `types/database.ts`, `lib/constants/examReview.ts`, `components/examinations/review/ReviewHistory.tsx`
- Create: `lib/constants/questionBank.ts`, `lib/utils/questionBank.ts`, `lib/utils/catalogueImport.ts`, `lib/utils/catalogueMatch.ts`, `hooks/useCatalogue.ts`
- Test: `lib/utils/__tests__/questionBank.test.ts`, `lib/utils/__tests__/catalogueImport.test.ts`, `lib/utils/__tests__/catalogueMatch.test.ts`

**Interfaces:**
- Consumes: `QuestionDraft`, `OptionDraft` from `components/examinations/ExamQuestionEditor.tsx`; `optionLetter` (check its export with `grep -rn "export function optionLetter" lib components`); `CognitiveLevel` from `lib/constants/examinations.ts`.
- Produces (exact names later tasks use):
  - types `LearningArea`, `CatalogueCompetency`, `BankQuestion`, `BankOption`, `BankQuestionWithOptions`.
  - `LLC_COUNT`, `BANK_SUPPORTED_TYPES`, `BankQuestionType`, `NEW_QUESTION_WORDING`, `LLC_COVERAGE_NOTE` from `lib/constants/questionBank.ts`.
  - from `lib/utils/questionBank.ts`: `normalizeLcCode(s: string): string`, `llcCut<T extends { mps: number }>(rows: T[], n?: number): T[]`, `type SlotInfo`, `bankSlotStatus(bank, slot): BankSlotStatus`, `partitionBankCandidates<T>(cands: T[], slot: SlotInfo): { matching: T[]; otherLevel: T[] }`, `questionSourceLabel(row): "Question Bank" | "New"`, `validateBankDraft(d: QuestionDraft): string | null`, `expectedBankKey(q: BankQuestionWithOptions): string | null`, `bankQuestionToDraft(q: BankQuestionWithOptions, levelOverride: boolean): QuestionDraft`, `type LlcRow`, `fetchLlc(areaId, grade, schoolYear)`, `fetchLlcCoverage(areaId, grade, schoolYear)`, `setBankQuestionLevel(id, level)`, `saveBankQuestion(input)`.
  - from `lib/utils/catalogueImport.ts`: `parseGrade(v: unknown): number | null`, `parseCatalogueRows(rows: unknown[][]): CatalogueImportResult`, `importCatalogue(entries): Promise<{ inserted: number; updated: number; error: string | null }>`.
  - from `lib/utils/catalogueMatch.ts`: `textSimilarity(a, b): number`, `suggestCatalogueMatch(row, candidates): MatchCandidate | null`, `MATCH_THRESHOLD`.
  - `QuestionDraft` gains `source_bank_question_id: string | null` and `bank_level_override: boolean`.
  - hooks `useLearningAreas(includeRetired?: boolean)`, `useCatalogueCompetencies(areaId: string | null, gradeLevel: number | null, includeRetired?: boolean)` each returning `{ …, loading, reload }`.

- [ ] **Step 1: Write the failing tests**

`lib/utils/__tests__/questionBank.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  bankQuestionToDraft,
  bankSlotStatus,
  expectedBankKey,
  llcCut,
  normalizeLcCode,
  partitionBankCandidates,
  questionSourceLabel,
  validateBankDraft,
  type SlotInfo,
} from "@/lib/utils/questionBank";
import type { BankQuestionWithOptions } from "@/types";

const bank = (over: Partial<BankQuestionWithOptions> = {}): BankQuestionWithOptions => ({
  id: "10",
  catalogue_competency_id: "4",
  cognitive_level: "applying",
  source_llc_school_year: "2026-2027",
  question_type: "multiple_choice",
  question_text: "What is 2 + 2?",
  answer_key: null,
  image_path: null,
  image_name: null,
  created_by: "1",
  review_status: "approved",
  submitted_at: null,
  reviewed_by: null,
  reviewed_at: null,
  review_comment: null,
  created_at: "",
  updated_at: "",
  options: [
    { id: "1", question_id: "10", label: "A", choice_text: "3", is_correct: false, position: 0, image_path: null, image_name: null },
    { id: "2", question_id: "10", label: "B", choice_text: "4", is_correct: true, position: 1, image_path: null, image_name: null },
  ],
  ...over,
});

const slot = (over: Partial<SlotInfo> = {}): SlotInfo => ({
  catalogue_competency_id: "4",
  cognitive_level: "applying",
  lc_code: "M5-1",
  competency_text: "c",
  ...over,
});

describe("normalizeLcCode", () => {
  it("trims, upper-cases and removes inner spaces", () => {
    expect(normalizeLcCode(" m5ns - ia-1 ")).toBe("M5NS-IA-1");
    expect(normalizeLcCode("")).toBe("");
  });
});

describe("llcCut", () => {
  it("keeps the lowest three and every tie at the cut", () => {
    const rows = [100, 50, 0, 50, 50].map((mps, i) => ({ id: i, mps }));
    expect(llcCut(rows).map((r) => r.mps)).toEqual([0, 50, 50, 50]);
  });
  it("returns everything when there are fewer than three", () => {
    expect(llcCut([{ mps: 40 }, { mps: 10 }]).map((r) => r.mps)).toEqual([10, 40]);
  });
  it("returns [] for no rows", () => {
    expect(llcCut([])).toEqual([]);
  });
});

describe("bankSlotStatus", () => {
  it("is ok on the same competency and level", () => {
    expect(bankSlotStatus(bank(), slot())).toBe("ok");
  });
  it("flags a level mismatch", () => {
    expect(bankSlotStatus(bank(), slot({ cognitive_level: "remembering" }))).toBe("level_mismatch");
  });
  it("flags a different competency (e.g. after the item moved)", () => {
    expect(bankSlotStatus(bank(), slot({ catalogue_competency_id: "9" }))).toBe("wrong_competency");
  });
  it("flags an item with no TOS slot or an unmapped one", () => {
    expect(bankSlotStatus(bank(), undefined)).toBe("no_slot");
    expect(bankSlotStatus(bank(), slot({ catalogue_competency_id: null }))).toBe("no_slot");
  });
});

describe("partitionBankCandidates", () => {
  it("splits same-competency questions by level and drops other competencies", () => {
    const a = bank({ id: "1" });
    const b = bank({ id: "2", cognitive_level: "remembering" });
    const c = bank({ id: "3", catalogue_competency_id: "8" });
    const out = partitionBankCandidates([a, b, c], slot());
    expect(out.matching.map((q) => q.id)).toEqual(["1"]);
    expect(out.otherLevel.map((q) => q.id)).toEqual(["2"]);
  });
});

describe("questionSourceLabel", () => {
  it("labels by the bank link", () => {
    expect(questionSourceLabel({ source_bank_question_id: "3" })).toBe("Question Bank");
    expect(questionSourceLabel({ source_bank_question_id: null })).toBe("New");
  });
});

describe("expectedBankKey", () => {
  it("is the correct option's letter by position for MC", () => {
    expect(expectedBankKey(bank())).toBe("B");
  });
  it("is A / B for True / False", () => {
    expect(expectedBankKey(bank({ question_type: "true_false", answer_key: "True", options: [] }))).toBe("A");
    expect(expectedBankKey(bank({ question_type: "true_false", answer_key: "False", options: [] }))).toBe("B");
  });
});

describe("bankQuestionToDraft / validateBankDraft", () => {
  it("copies text and options and carries the bank link", () => {
    const d = bankQuestionToDraft(bank(), true);
    expect(d.source_bank_question_id).toBe("10");
    expect(d.bank_level_override).toBe(true);
    expect(d.options.map((o) => [o.choice_text, o.is_correct])).toEqual([["3", false], ["4", true]]);
    expect(d.item_count).toBe(1);
  });
  it("mirrors the submit rules", () => {
    const d = bankQuestionToDraft(bank(), false);
    expect(validateBankDraft(d)).toBeNull();
    expect(validateBankDraft({ ...d, options: d.options.slice(0, 1) })).toMatch(/2 to 5 choices/);
    expect(validateBankDraft({ ...d, options: d.options.map((o) => ({ ...o, is_correct: false })) })).toMatch(/exactly one/);
    expect(validateBankDraft({ ...d, question_text: " ", image_path: "" })).toMatch(/Write the question/);
    const tf = bankQuestionToDraft(bank({ question_type: "true_false", answer_key: null, options: [] }), false);
    expect(validateBankDraft(tf)).toMatch(/True or False/);
  });
});
```

`lib/utils/__tests__/catalogueImport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseCatalogueRows, parseGrade } from "@/lib/utils/catalogueImport";

const HEADER = ["Learning Area", "Grade", "LC Code", "Competency"];

describe("parseGrade", () => {
  it.each([
    ["K", 0], ["Kinder", 0], ["Kindergarten", 0], ["0", 0], ["5", 5], ["Grade 5", 5],
    ["grade12", 12], [7, 7],
  ])("reads %s as %s", (input, out) => {
    expect(parseGrade(input)).toBe(out);
  });
  it.each(["", "13", "Grade X", "-1"])("rejects %s", (input) => {
    expect(parseGrade(input)).toBeNull();
  });
});

describe("parseCatalogueRows", () => {
  it("requires the header row", () => {
    const r = parseCatalogueRows([["Area", "Grade"]]);
    expect(r.entries).toEqual([]);
    expect(r.errors[0].row).toBe(1);
  });

  it("normalizes valid rows and reports bad ones with row numbers", () => {
    const r = parseCatalogueRows([
      HEADER,
      ["Mathematics", "Grade 5", " m5ns-ia-1 ", "  Visualizes   numbers "],
      ["", "5", "M5-2", "x"],
      ["Mathematics", "Grade X", "M5-3", "x"],
      ["Mathematics", "5", "", "x"],
      ["Mathematics", "5", "M5-4", ""],
      [null, null, null, null],
      ["mathematics", "5", "M5NS-IA-1", "dup"],
      ["Science", "K", "SK-1", "Senses"],
    ]);
    expect(r.entries).toEqual([
      { learningArea: "Mathematics", gradeLevel: 5, lcCode: "M5NS-IA-1", competencyText: "Visualizes numbers" },
      { learningArea: "Science", gradeLevel: 0, lcCode: "SK-1", competencyText: "Senses" },
    ]);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 8]);
    expect(r.errors[4].message).toMatch(/Duplicate of row 2/);
  });

  it("finds the columns in any order", () => {
    const r = parseCatalogueRows([
      ["Competency", "LC Code", "Grade", "Learning Area"],
      ["Adds", "M1-1", "1", "Math"],
    ]);
    expect(r.entries[0]).toEqual({ learningArea: "Math", gradeLevel: 1, lcCode: "M1-1", competencyText: "Adds" });
  });
});
```

`lib/utils/__tests__/catalogueMatch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { suggestCatalogueMatch, textSimilarity } from "@/lib/utils/catalogueMatch";

const cands = [
  { id: "1", lc_code: "M5NS-IA-1", competency_text: "Visualizes and represents fractions" },
  { id: "2", lc_code: "M5NS-IB-2", competency_text: "Adds similar fractions and mixed numbers" },
];

describe("suggestCatalogueMatch", () => {
  it("prefers an exact LC code, however it was typed", () => {
    expect(suggestCatalogueMatch({ competency_text: "anything", lc_code: " m5ns-ib-2" }, cands)?.id).toBe("2");
  });
  it("falls back to the closest text above the threshold", () => {
    expect(suggestCatalogueMatch({ competency_text: "adds similar fractions", lc_code: null }, cands)?.id).toBe("2");
  });
  it("suggests nothing for unrelated text", () => {
    expect(suggestCatalogueMatch({ competency_text: "Photosynthesis in plants", lc_code: "" }, cands)).toBeNull();
  });
});

describe("textSimilarity", () => {
  it("is 1 for the same words and 0 for none shared", () => {
    expect(textSimilarity("Adds fractions", "adds FRACTIONS!")).toBe(1);
    expect(textSimilarity("Adds fractions", "Reads poems")).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/utils/__tests__/questionBank.test.ts lib/utils/__tests__/catalogueImport.test.ts lib/utils/__tests__/catalogueMatch.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/utils/questionBank"` (and the other two).

- [ ] **Step 3: Types** — in `types/database.ts`:

Add to `Tos` (after `review_comment`):
```ts
  // Migration 195: the catalogue learning area (subject_name is copied from it).
  learning_area_id?: string | null;
```
Add to `TosCompetency` (after `lc_code`):
```ts
  // Migration 195: the catalogue entry this row was picked from.
  catalogue_competency_id?: string | null;
```
Add to `ExamQuestion` (after `part_position`):
```ts
  // Migration 195: a copy of an approved Question Bank question, validated by
  // the database; bank_level_override records an intentional level mismatch.
  source_bank_question_id?: string | null;
  bank_level_override?: boolean;
```
Append after `TosItem`:
```ts
// ============================================================================
// Migration 195 — competency catalogue and Question Bank
// ============================================================================
export interface LearningArea {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogueCompetency {
  id: string;
  learning_area_id: string;
  grade_level: number;
  lc_code: string;
  competency_text: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BankQuestion {
  id: string;
  catalogue_competency_id: string;
  cognitive_level: TosCognitiveLevel;
  source_llc_school_year: string;
  question_type: ExamQuestionKind;
  question_text: string | null;
  answer_key: string | null;
  image_path: string | null;
  image_name: string | null;
  created_by: string | null;
  review_status: ReviewStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankOption {
  id: string;
  question_id: string;
  label: string | null;
  choice_text: string | null;
  is_correct: boolean;
  position: number;
  image_path: string | null;
  image_name: string | null;
}

export interface BankQuestionWithOptions extends BankQuestion {
  options: BankOption[];
}
```
(`ExamQuestionKind` is declared below `TosItem`; TypeScript interfaces may reference it before its declaration.) Confirm `types/index.ts` re-exports `database.ts` with `grep -n "database" types/index.ts`; if it lists names explicitly, add the five new ones.

- [ ] **Step 4: Constants** — `lib/constants/examReview.ts`: change the two type lines and add the label:

```ts
export type ReviewEntity = "tos" | "exam" | "question";
```
```ts
export type ReviewAction =
  | "authorize"
  | "revoke"
  | "submit"
  | "withdraw"
  | "start_review"
  | "approve"
  | "reject"
  | "reopen"
  | "set_level";
```
and in `REVIEW_ACTION_LABEL` add `set_level: "Cognitive level corrected",`.

In `components/examinations/review/ReviewHistory.tsx` widen the prop: `entity: "tos" | "exam" | "author" | "question";`.

Create `lib/constants/questionBank.ts`:

```ts
/**
 * Question Bank (migration 195). The SQL is the enforcement —
 * `llc_count()` and `bank_supported_types()` in 195. Keep these in step.
 */
import type { ExamQuestionType } from "@/lib/constants/examinations";

/** How many least learned competencies a list shows (ties at the cut kept). */
export const LLC_COUNT = 3;

export const BANK_SUPPORTED_TYPES = ["multiple_choice", "true_false"] as const satisfies readonly ExamQuestionType[];
export type BankQuestionType = (typeof BANK_SUPPORTED_TYPES)[number];

export function isBankSupportedType(t: string): t is BankQuestionType {
  return (BANK_SUPPORTED_TYPES as readonly string[]).includes(t);
}

export const NEW_QUESTION_WORDING =
  "New question — stays in this exam only and is reviewed with the questionnaire.";

export const LLC_COVERAGE_NOTE =
  "Only Summative Test results whose TOS was built from the competency catalogue are counted.";

export const BANK_LEVEL_MISMATCH_CONFIRM =
  "Use anyway — this level mismatch is intentional";
```

(Check `ExamQuestionType` is the exported name: `grep -n "export type ExamQuestionType" lib/constants/examinations.ts`.)

- [ ] **Step 5: Extend `QuestionDraft`** — in `components/examinations/ExamQuestionEditor.tsx` add to the interface after `subitems`:

```ts
  /** Migration 195: set when this item is a copy of a Question Bank question. */
  source_bank_question_id: string | null;
  /** Migration 195: the author confirmed a cognitive-level mismatch. */
  bank_level_override: boolean;
```
Then `npx tsc --noEmit -p . 2>&1 | grep QuestionDraft` and add `source_bank_question_id: null, bank_level_override: false,` to every object literal it reports (at least `blankQuestion` in `ExamBuilderModal.tsx`; Task 9 handles load/save).

- [ ] **Step 6: `lib/utils/questionBank.ts`**

```ts
/**
 * Question Bank helpers (migration 195). The database decides every rule;
 * these mirror it so the screens only offer what will pass.
 */
import { LLC_COUNT, isBankSupportedType } from "@/lib/constants/questionBank";
import type { CognitiveLevel } from "@/lib/constants/examinations";
import type { QuestionDraft } from "@/components/examinations/ExamQuestionEditor";
import { supabase } from "@/lib/supabase/client";
import type { BankQuestionWithOptions } from "@/types";

/** Mirrors 195's catalogue_normalize(): trim, upper-case, no spaces. */
export function normalizeLcCode(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

/** Mirrors llc_competency_ids(): lowest `n` by MPS, ties at the cut kept. */
export function llcCut<T extends { mps: number }>(rows: T[], n: number = LLC_COUNT): T[] {
  const sorted = [...rows].sort((a, b) => a.mps - b.mps);
  if (sorted.length <= n) return sorted;
  const cutoff = sorted[n - 1].mps;
  return sorted.filter((r) => r.mps <= cutoff);
}

/** What a TOS item asks for, keyed by item number in the exam builder. */
export interface SlotInfo {
  catalogue_competency_id: string | null;
  cognitive_level: CognitiveLevel;
  lc_code: string | null;
  competency_text: string;
}

export type BankSlotStatus = "ok" | "level_mismatch" | "wrong_competency" | "no_slot";

/** Mirrors exam_guard_bank_link() for one item. */
export function bankSlotStatus(
  bank: { catalogue_competency_id: string; cognitive_level: string },
  slot: SlotInfo | undefined,
): BankSlotStatus {
  if (!slot || slot.catalogue_competency_id == null) return "no_slot";
  if (String(slot.catalogue_competency_id) !== String(bank.catalogue_competency_id))
    return "wrong_competency";
  return slot.cognitive_level === bank.cognitive_level ? "ok" : "level_mismatch";
}

export function partitionBankCandidates<
  T extends { catalogue_competency_id: string; cognitive_level: string },
>(cands: T[], slot: SlotInfo): { matching: T[]; otherLevel: T[] } {
  const matching: T[] = [];
  const otherLevel: T[] = [];
  for (const c of cands) {
    const s = bankSlotStatus(c, slot);
    if (s === "ok") matching.push(c);
    else if (s === "level_mismatch") otherLevel.push(c);
  }
  return { matching, otherLevel };
}

export function questionSourceLabel(row: {
  source_bank_question_id?: string | number | null;
}): "Question Bank" | "New" {
  return row.source_bank_question_id != null ? "Question Bank" : "New";
}

/** Mirrors exam_review_submit('question'): null when submittable. */
export function validateBankDraft(d: QuestionDraft): string | null {
  if (!isBankSupportedType(d.question_type))
    return "This question type is not accepted in the Question Bank yet.";
  if (!d.question_text.trim() && !d.image_path.trim())
    return "Write the question (or add a figure) before submitting.";
  if (d.question_type === "multiple_choice") {
    if (d.options.length < 2 || d.options.length > 5)
      return "A multiple-choice question needs 2 to 5 choices.";
    if (d.options.filter((o) => o.is_correct).length !== 1)
      return "Mark exactly one choice as correct.";
    if (d.options.some((o) => !o.choice_text.trim() && !o.image_path.trim()))
      return "Every choice needs text or a figure.";
    return null;
  }
  const tf = d.answer_key.trim().toLowerCase();
  if (!tf.startsWith("true") && !tf.startsWith("false"))
    return "Choose True or False as the answer.";
  return null;
}

/** Mirrors bank_expected_key(): the answer-sheet letter the item scores on. */
export function expectedBankKey(q: BankQuestionWithOptions): string | null {
  if (q.question_type === "true_false") {
    if (q.answer_key === "True") return "A";
    if (q.answer_key === "False") return "B";
    return null;
  }
  const sorted = [...q.options].sort((a, b) => a.position - b.position || Number(a.id) - Number(b.id));
  const i = sorted.findIndex((o) => o.is_correct);
  return i >= 0 ? String.fromCharCode(65 + i) : null;
}

let seq = 0;

/** The exam-builder draft for a bank question: a verbatim, locked copy. */
export function bankQuestionToDraft(
  q: BankQuestionWithOptions,
  levelOverride: boolean,
): QuestionDraft {
  const key = () => `bank_${q.id}_${Date.now()}_${seq++}`;
  return {
    key: key(),
    tos_item_id: null,
    item_count: 1,
    question_type: q.question_type,
    question_text: q.question_text ?? "",
    answer_key: q.answer_key ?? "",
    points: 1,
    image_path: q.image_path ?? "",
    image_name: q.image_name ?? "",
    options: [...q.options]
      .sort((a, b) => a.position - b.position)
      .map((o) => ({
        key: key(),
        choice_text: o.choice_text ?? "",
        is_correct: o.is_correct,
        image_path: o.image_path ?? "",
        image_name: o.image_name ?? "",
      })),
    subitems: [],
    source_bank_question_id: String(q.id),
    bank_level_override: levelOverride,
  };
}

export interface LlcRow {
  catalogue_competency_id: string;
  lc_code: string;
  competency_text: string;
  mps: number;
  learners: number;
  sections: number;
  schools: number;
  results: number;
}

export async function fetchLlc(
  areaId: string | number,
  gradeLevel: number,
  schoolYear: string,
): Promise<{ rows: LlcRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("division_llc", {
    p_learning_area_id: Number(areaId),
    p_grade_level: gradeLevel,
    p_school_year: schoolYear,
  });
  if (error) return { rows: [], error: error.message };
  const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    catalogue_competency_id: String(r.catalogue_competency_id),
    lc_code: String(r.lc_code),
    competency_text: String(r.competency_text),
    mps: Number(r.mps),
    learners: Number(r.learners),
    sections: Number(r.sections),
    schools: Number(r.schools),
    results: Number(r.results),
  }));
  return { rows: llcCut(rows), error: null };
}

export async function fetchLlcCoverage(
  areaId: string | number,
  gradeLevel: number,
  schoolYear: string,
): Promise<{ results: number; schools: number; learners: number } | null> {
  const { data, error } = await supabase.rpc("division_llc_coverage", {
    p_learning_area_id: Number(areaId),
    p_grade_level: gradeLevel,
    p_school_year: schoolYear,
  });
  const row = ((data ?? []) as Record<string, unknown>[])[0];
  if (error || !row) return null;
  return { results: Number(row.results), schools: Number(row.schools), learners: Number(row.learners) };
}

export async function setBankQuestionLevel(
  id: string | number,
  level: CognitiveLevel,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("bank_question_set_level", { p_id: Number(id), p_level: level });
  return { error: error ? error.message : null };
}

export interface SaveBankQuestionInput {
  id?: string | null;
  catalogueCompetencyId: string;
  sourceLlcSchoolYear: string;
  cognitiveLevel: CognitiveLevel;
  createdBy: string | number;
  draft: QuestionDraft;
}

/** Insert or update a bank question, then replace its options. */
export async function saveBankQuestion(
  input: SaveBankQuestionInput,
): Promise<{ id: string | null; error: string | null }> {
  const d = input.draft;
  const body = {
    cognitive_level: input.cognitiveLevel,
    question_type: d.question_type,
    question_text: d.question_text.trim() || null,
    answer_key: d.answer_key.trim() || null,
    image_path: d.image_path.trim() || null,
    image_name: d.image_name.trim() || null,
  };
  let id = input.id ?? null;
  if (id) {
    const { error } = await supabase.from("sms_exam_bank_questions").update(body).eq("id", Number(id));
    if (error) return { id, error: error.message };
  } else {
    const { data, error } = await supabase
      .from("sms_exam_bank_questions")
      .insert([{
        ...body,
        catalogue_competency_id: Number(input.catalogueCompetencyId),
        source_llc_school_year: input.sourceLlcSchoolYear,
        created_by: Number(input.createdBy),
      }])
      .select("id")
      .single();
    if (error) return { id: null, error: error.message };
    id = String(data.id);
  }
  const del = await supabase.from("sms_exam_bank_options").delete().eq("question_id", Number(id));
  if (del.error) return { id, error: del.error.message };
  if (d.question_type === "multiple_choice" && d.options.length > 0) {
    const { error } = await supabase.from("sms_exam_bank_options").insert(
      d.options.map((o, i) => ({
        question_id: Number(id),
        label: String.fromCharCode(65 + i),
        choice_text: o.choice_text.trim() || null,
        is_correct: o.is_correct,
        image_path: o.image_path.trim() || null,
        image_name: o.image_name.trim() || null,
        position: i,
      })),
    );
    if (error) return { id, error: error.message };
  }
  return { id, error: null };
}
```

- [ ] **Step 7: `lib/utils/catalogueImport.ts`**

```ts
/**
 * Competency catalogue import (migration 195). Columns, in any order:
 * Learning Area | Grade | LC Code | Competency. Nothing is ever deleted:
 * rows upsert by (learning area, grade, LC code).
 */
import { supabase } from "@/lib/supabase/client";
import { normalizeLcCode } from "@/lib/utils/questionBank";

export interface CatalogueImportEntry {
  learningArea: string;
  gradeLevel: number;
  lcCode: string;
  competencyText: string;
}

export interface CatalogueImportResult {
  entries: CatalogueImportEntry[];
  errors: { row: number; message: string }[];
}

const HEADERS = ["learning area", "grade", "lc code", "competency"] as const;

export function parseGrade(v: unknown): number | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "k" || s.startsWith("kinder")) return 0;
  const m = s.match(/^(?:grade\s*)?(\d{1,2})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 12 ? n : null;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

export function parseCatalogueRows(rows: unknown[][]): CatalogueImportResult {
  const entries: CatalogueImportEntry[] = [];
  const errors: { row: number; message: string }[] = [];
  const header = (rows[0] ?? []).map((c) => String(c ?? "").trim().toLowerCase());
  const idx = HEADERS.map((h) => header.indexOf(h));
  if (idx.some((i) => i < 0)) {
    errors.push({
      row: 1,
      message: "The first row must be the headers: Learning Area | Grade | LC Code | Competency.",
    });
    return { entries, errors };
  }

  const seen = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const rowNo = i + 1;
    const r = rows[i] ?? [];
    const [area, gradeRaw, lcRaw, text] = idx.map((j) => squash(String(r[j] ?? "")));
    if (!area && !gradeRaw && !lcRaw && !text) continue;
    const grade = parseGrade(gradeRaw);
    const lcCode = normalizeLcCode(lcRaw);
    let message: string | null = null;
    if (!area) message = "Learning Area is blank.";
    else if (grade === null) message = `Grade "${gradeRaw}" is not K or 1–12.`;
    else if (!lcCode) message = "LC Code is blank.";
    else if (!text) message = "Competency is blank.";
    if (message) {
      errors.push({ row: rowNo, message });
      continue;
    }
    const key = `${area.toLowerCase()}|${grade}|${lcCode}`;
    const prev = seen.get(key);
    if (prev !== undefined) {
      errors.push({ row: rowNo, message: `Duplicate of row ${prev} (same learning area, grade and LC code).` });
      continue;
    }
    seen.set(key, rowNo);
    entries.push({ learningArea: area, gradeLevel: grade as number, lcCode, competencyText: text });
  }
  return { entries, errors };
}

/** Create missing learning areas, then upsert every entry. */
export async function importCatalogue(
  entries: CatalogueImportEntry[],
): Promise<{ inserted: number; updated: number; error: string | null }> {
  const { data: areaRows, error: areaErr } = await supabase.from("sms_learning_areas").select("id, name");
  if (areaErr) return { inserted: 0, updated: 0, error: areaErr.message };
  const areaIds = new Map<string, number>(
    (areaRows ?? []).map((a) => [String(a.name).trim().toLowerCase(), Number(a.id)]),
  );
  const missing = [...new Set(entries.map((e) => e.learningArea))].filter(
    (n) => !areaIds.has(n.toLowerCase()),
  );
  if (missing.length > 0) {
    const { data, error } = await supabase
      .from("sms_learning_areas")
      .insert(missing.map((name) => ({ name })))
      .select("id, name");
    if (error) return { inserted: 0, updated: 0, error: error.message };
    (data ?? []).forEach((a) => areaIds.set(String(a.name).trim().toLowerCase(), Number(a.id)));
  }

  const ids = [...new Set(entries.map((e) => areaIds.get(e.learningArea.toLowerCase()) as number))];
  const { data: existing, error: exErr } = await supabase
    .from("sms_competency_catalogue")
    .select("learning_area_id, grade_level, lc_code")
    .in("learning_area_id", ids);
  if (exErr) return { inserted: 0, updated: 0, error: exErr.message };
  const known = new Set(
    (existing ?? []).map((c) => `${c.learning_area_id}|${c.grade_level}|${c.lc_code}`),
  );

  const payload = entries.map((e) => ({
    learning_area_id: areaIds.get(e.learningArea.toLowerCase()) as number,
    grade_level: e.gradeLevel,
    lc_code: e.lcCode,
    competency_text: e.competencyText,
  }));
  const updated = payload.filter((p) => known.has(`${p.learning_area_id}|${p.grade_level}|${p.lc_code}`)).length;

  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase
      .from("sms_competency_catalogue")
      .upsert(payload.slice(i, i + 500), { onConflict: "learning_area_id,grade_level,lc_code" });
    if (error) return { inserted: 0, updated: 0, error: error.message };
  }
  return { inserted: payload.length - updated, updated, error: null };
}
```

- [ ] **Step 8: `lib/utils/catalogueMatch.ts`**

```ts
/**
 * Suggestions for the TOS builder's "Map competencies" step (migration 195):
 * a free-typed competency from before the catalogue, matched to an entry.
 * A suggestion only — the teacher confirms or picks another.
 */
import { normalizeLcCode } from "@/lib/utils/questionBank";

export interface MatchCandidate {
  id: string;
  lc_code: string;
  competency_text: string;
}

export const MATCH_THRESHOLD = 0.5;

const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );

/** Jaccard similarity of the words longer than two letters. */
export function textSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  ta.forEach((t) => {
    if (tb.has(t)) shared += 1;
  });
  return shared / (ta.size + tb.size - shared);
}

export function suggestCatalogueMatch<T extends MatchCandidate>(
  row: { competency_text: string; lc_code: string | null },
  candidates: T[],
): T | null {
  const lc = normalizeLcCode(row.lc_code ?? "");
  if (lc) {
    const exact = candidates.find((c) => c.lc_code === lc);
    if (exact) return exact;
  }
  let best: T | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const s = textSimilarity(row.competency_text, c.competency_text);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return bestScore >= MATCH_THRESHOLD ? best : null;
}
```

Note for the text-fallback test: "adds similar fractions" vs "Adds similar fractions and mixed numbers" → tokens {adds, similar, fractions} vs {adds, similar, fractions, and, mixed, numbers} = 3/6 = 0.5 ≥ threshold. ✓

- [ ] **Step 9: `hooks/useCatalogue.ts`**

```ts
"use client";

import { supabase } from "@/lib/supabase/client";
import type { CatalogueCompetency, LearningArea } from "@/types";
import { useCallback, useEffect, useState } from "react";

/** The catalogue's learning areas (migration 195), alphabetical. */
export function useLearningAreas(includeRetired = false) {
  const [areas, setAreas] = useState<LearningArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      let q = supabase.from("sms_learning_areas").select("*").order("name");
      if (!includeRetired) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (!isMounted) return;
      if (error) console.error(error);
      setAreas((data as LearningArea[]) ?? []);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [includeRetired, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { areas, loading, reload };
}

/** Catalogue competencies of one learning area + grade, by LC code. */
export function useCatalogueCompetencies(
  areaId: string | null,
  gradeLevel: number | null,
  includeRetired = false,
) {
  const [competencies, setCompetencies] = useState<CatalogueCompetency[]>([]);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let isMounted = true;
    if (!areaId || gradeLevel == null) {
      setCompetencies([]);
      return;
    }
    (async () => {
      setLoading(true);
      let q = supabase
        .from("sms_competency_catalogue")
        .select("*")
        .eq("learning_area_id", Number(areaId))
        .eq("grade_level", gradeLevel)
        .order("lc_code");
      if (!includeRetired) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (!isMounted) return;
      if (error) console.error(error);
      setCompetencies((data as CatalogueCompetency[]) ?? []);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [areaId, gradeLevel, includeRetired, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { competencies, loading, reload };
}
```

- [ ] **Step 10: Run the tests, the type check and lint**

```bash
npx vitest run lib/utils/__tests__/questionBank.test.ts lib/utils/__tests__/catalogueImport.test.ts lib/utils/__tests__/catalogueMatch.test.ts
npx tsc --noEmit -p .
npx eslint lib/utils/questionBank.ts lib/utils/catalogueImport.ts lib/utils/catalogueMatch.ts lib/constants/questionBank.ts hooks/useCatalogue.ts
npm test
```
Expected: all pass; `tsc` clean (if `tsc` reports pre-existing errors unrelated to these files, compare with `git stash; npx tsc --noEmit -p . | wc -l; git stash pop` and make sure the count did not grow).

- [ ] **Step 11: Commit**

```bash
git add types/database.ts lib/constants/examReview.ts lib/constants/questionBank.ts lib/utils/questionBank.ts lib/utils/catalogueImport.ts lib/utils/catalogueMatch.ts lib/utils/__tests__/questionBank.test.ts lib/utils/__tests__/catalogueImport.test.ts lib/utils/__tests__/catalogueMatch.test.ts hooks/useCatalogue.ts components/examinations/ExamQuestionEditor.tsx components/examinations/ExamBuilderModal.tsx components/examinations/review/ReviewHistory.tsx
git commit -m "feat(question-bank): shared types, constants and pure helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Competency catalogue module (UI)

**Files:**
- Create: `components/examinations/catalogue/CataloguePicker.tsx`, `CatalogueAreas.tsx`, `CatalogueCompetencies.tsx`, `CatalogueImportDialog.tsx`, `CompetencyCatalogue.tsx`
- Create: `app/(protected)/division/competencies/page.tsx`, `app/(protected)/qa/competencies/page.tsx`
- Modify: `components/AppSidebar.tsx`

**Interfaces:**
- Consumes: `useLearningAreas`, `useCatalogueCompetencies`, `parseCatalogueRows`, `importCatalogue`, `normalizeLcCode`.
- Produces: `<CataloguePicker options value excludeIds disabled onChange placeholder />` (used in Tasks 7 and 8) and `<CompetencyCatalogue />`.

- [ ] **Step 1: `CataloguePicker.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CatalogueCompetency } from "@/types";
import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";

interface Props {
  options: CatalogueCompetency[];
  value: string | null;
  /** Entries already picked elsewhere on the same TOS. */
  excludeIds?: string[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (c: CatalogueCompetency) => void;
}

/** Search the catalogue by LC code or text; retired entries are not offered. */
export function CataloguePicker({ options, value, excludeIds = [], disabled, placeholder, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => String(o.id) === String(value));
  const choices = options.filter(
    (o) => o.is_active && (!excludeIds.includes(String(o.id)) || String(o.id) === String(value)),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-auto min-h-9 w-full justify-between whitespace-normal text-left font-normal"
        >
          <span className={selected ? "" : "text-muted-foreground"}>
            {selected ? (
              <>
                <span className="mr-2 font-mono text-xs">{selected.lc_code}</span>
                {selected.competency_text}
                {!selected.is_active && <span className="ml-2 text-xs text-amber-600">(retired)</span>}
              </>
            ) : (
              placeholder ?? "Pick a competency"
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(36rem,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search LC code or competency…" />
          <CommandList>
            <CommandEmpty>No competency in the catalogue for this learning area and grade.</CommandEmpty>
            <CommandGroup>
              {choices.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.lc_code} ${o.competency_text}`}
                  onSelect={() => {
                    onChange(o);
                    setOpen(false);
                  }}
                >
                  <span className="mr-2 font-mono text-xs">{o.lc_code}</span>
                  <span className="text-sm">{o.competency_text}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: `CatalogueAreas.tsx`** (left column: list, add, rename, retire/restore)

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase/client";
import type { LearningArea } from "@/types";
import { useState } from "react";
import toast from "react-hot-toast";

interface Props {
  areas: LearningArea[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}

export function CatalogueAreas({ areas, selectedId, onSelect, onChanged }: Props) {
  const [newName, setNewName] = useState("");
  const [rename, setRename] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = areas.find((a) => String(a.id) === String(selectedId)) ?? null;

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    if (busy) return;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return toast.error(error.message.includes("uq_sms_learning_areas_name") ? "That learning area already exists." : error.message);
    toast.success(ok);
    onChanged();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">Learning areas</p>
      <div className="max-h-[50vh] space-y-1 overflow-y-auto">
        {areas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => {
              onSelect(String(a.id));
              setRename(a.name);
            }}
            className={`w-full rounded px-2 py-1.5 text-left text-sm ${
              String(a.id) === String(selectedId) ? "bg-primary/10 font-medium" : "hover:bg-muted"
            } ${a.is_active ? "" : "text-muted-foreground line-through"}`}
          >
            {a.name}
          </button>
        ))}
        {areas.length === 0 && <p className="text-xs text-muted-foreground">No learning areas yet.</p>}
      </div>
      <div className="flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New learning area" />
        <Button
          size="sm"
          disabled={busy || !newName.trim()}
          onClick={() =>
            run(() => supabase.from("sms_learning_areas").insert([{ name: newName.trim() }]), "Learning area added").then(() =>
              setNewName(""),
            )
          }
        >
          Add
        </Button>
      </div>
      {selected && (
        <div className="space-y-2 rounded border p-2">
          <Input value={rename} onChange={(e) => setRename(e.target.value)} />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !rename.trim() || rename.trim() === selected.name}
              onClick={() =>
                run(() => supabase.from("sms_learning_areas").update({ name: rename.trim() }).eq("id", Number(selected.id)), "Renamed")
              }
            >
              Rename
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(
                  () => supabase.from("sms_learning_areas").update({ is_active: !selected.is_active }).eq("id", Number(selected.id)),
                  selected.is_active ? "Retired" : "Restored",
                )
              }
            >
              {selected.is_active ? "Retire" : "Restore"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Renaming changes the subject printed on TOS saved from now on; TOS already saved keep their copy.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `CatalogueCompetencies.tsx`** (grid for one area + grade)

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCatalogueCompetencies } from "@/hooks/useCatalogue";
import { supabase } from "@/lib/supabase/client";
import { normalizeLcCode } from "@/lib/utils/questionBank";
import { useState } from "react";
import toast from "react-hot-toast";

interface Props {
  areaId: string;
  gradeLevel: number;
}

/** Remounted (via `key`) after an import, which reloads it. */
export function CatalogueCompetencies({ areaId, gradeLevel }: Props) {
  const { competencies, loading, reload } = useCatalogueCompetencies(areaId, gradeLevel, true);
  const [lc, setLc] = useState("");
  const [text, setText] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLc, setEditLc] = useState("");
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    if (busy) return false;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("duplicate key") ? "That LC code already exists for this grade." : error.message);
      return false;
    }
    toast.success(ok);
    reload();
    return true;
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-40 py-1">LC code</th>
              <th className="py-1">Competency</th>
              <th className="w-44 py-1" />
            </tr>
          </thead>
          <tbody>
            {competencies.map((c) =>
              editId === String(c.id) ? (
                <tr key={c.id} className="border-b align-top">
                  <td className="py-1 pr-2"><Input value={editLc} onChange={(e) => setEditLc(e.target.value)} /></td>
                  <td className="py-1 pr-2"><Textarea rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} /></td>
                  <td className="space-x-1 py-1">
                    <Button
                      size="sm"
                      disabled={busy || !normalizeLcCode(editLc) || !editText.trim()}
                      onClick={async () => {
                        const ok = await run(
                          () => supabase.from("sms_competency_catalogue")
                            .update({ lc_code: editLc, competency_text: editText })
                            .eq("id", Number(c.id)),
                          "Saved",
                        );
                        if (ok) setEditId(null);
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className={`border-b align-top ${c.is_active ? "" : "text-muted-foreground"}`}>
                  <td className="py-1.5 pr-2 font-mono text-xs">{c.lc_code}</td>
                  <td className="py-1.5 pr-2">{c.competency_text}{!c.is_active && " (retired)"}</td>
                  <td className="space-x-1 py-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditId(String(c.id));
                        setEditLc(c.lc_code);
                        setEditText(c.competency_text);
                      }}
                    >
                      Fix typo
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => supabase.from("sms_competency_catalogue").update({ is_active: !c.is_active }).eq("id", Number(c.id)),
                          c.is_active ? "Retired" : "Restored",
                        )
                      }
                    >
                      {c.is_active ? "Retire" : "Restore"}
                    </Button>
                  </td>
                </tr>
              ),
            )}
            {competencies.length === 0 && (
              <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">No competencies for this grade yet.</td></tr>
            )}
          </tbody>
        </table>
      )}
      <div className="grid gap-2 rounded border p-2 sm:grid-cols-[10rem_1fr_auto]">
        <Input value={lc} onChange={(e) => setLc(e.target.value)} placeholder="LC code" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Competency" />
        <Button
          size="sm"
          disabled={busy || !normalizeLcCode(lc) || !text.trim()}
          onClick={async () => {
            const ok = await run(
              () => supabase.from("sms_competency_catalogue").insert([
                { learning_area_id: Number(areaId), grade_level: gradeLevel, lc_code: lc, competency_text: text },
              ]),
              "Competency added",
            );
            if (ok) {
              setLc("");
              setText("");
            }
          }}
        >
          Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Edits are for typos only — a TOS already saved keeps the text it was saved with. A curriculum change is a new entry; retire the old one.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: `CatalogueImportDialog.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  importCatalogue,
  parseCatalogueRows,
  type CatalogueImportResult,
} from "@/lib/utils/catalogueImport";
import { useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function CatalogueImportDialog({ isOpen, onClose, onImported }: Props) {
  const [parsed, setParsed] = useState<CatalogueImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = book.Sheets[book.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
    setParsed(parseCatalogueRows(rows));
  };

  const onImport = async () => {
    if (!parsed || busy) return;
    setBusy(true);
    const res = await importCatalogue(parsed.entries);
    setBusy(false);
    if (res.error) return toast.error(res.error);
    toast.success(`Imported: ${res.inserted} new, ${res.updated} updated.`);
    setParsed(null);
    onImported();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import competencies</DialogTitle>
          <DialogDescription>
            An Excel sheet whose first row is <b>Learning Area | Grade | LC Code | Competency</b>. New entries are
            added and existing ones (same learning area, grade and LC code) get the sheet&apos;s text. Nothing is deleted.
          </DialogDescription>
        </DialogHeader>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
        />
        {parsed && (
          <div className="space-y-2 text-sm">
            <p>
              {parsed.entries.length} valid row{parsed.entries.length === 1 ? "" : "s"}
              {parsed.errors.length > 0 && `, ${parsed.errors.length} skipped`}.
            </p>
            {parsed.errors.length > 0 && (
              <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-red-700">
                {parsed.errors.map((e) => (
                  <li key={`${e.row}-${e.message}`}>Row {e.row}: {e.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !parsed || parsed.entries.length === 0} onClick={onImport}>
            {busy ? "Importing…" : `Import ${parsed?.entries.length ?? 0} row(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: `CompetencyCatalogue.tsx`** and the two pages

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLearningAreas } from "@/hooks/useCatalogue";
import { GRADE_LEVELS, getGradeLevelLabel } from "@/lib/constants";
import { Upload } from "lucide-react";
import { useState } from "react";
import { CatalogueAreas } from "./CatalogueAreas";
import { CatalogueCompetencies } from "./CatalogueCompetencies";
import { CatalogueImportDialog } from "./CatalogueImportDialog";

/** The division competency catalogue every TOS picks from (migration 195). */
export function CompetencyCatalogue() {
  const { areas, reload } = useLearningAreas(true);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [grade, setGrade] = useState<number>(GRADE_LEVELS[0]);
  const [importOpen, setImportOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <CatalogueAreas areas={areas} selectedId={areaId} onSelect={setAreaId} onChanged={reload} />
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-48">
            <Label className="mb-1.5 block">Grade level</Label>
            <Select value={String(grade)} onValueChange={(v) => setGrade(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GRADE_LEVELS.map((g) => (
                  <SelectItem key={g} value={String(g)}>{getGradeLevelLabel(g)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" /> Import from Excel
          </Button>
        </div>
        {areaId ? (
          <CatalogueCompetencies key={`${areaId}-${grade}-${refreshKey}`} areaId={areaId} gradeLevel={grade} />
        ) : (
          <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
            Pick a learning area on the left, or import the catalogue from Excel.
          </p>
        )}
      </div>
      <CatalogueImportDialog
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          reload();
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
```

`app/(protected)/division/competencies/page.tsx` and `app/(protected)/qa/competencies/page.tsx` (identical bodies):

```tsx
"use client";

import { CompetencyCatalogue } from "@/components/examinations/catalogue/CompetencyCatalogue";
import { ListChecks } from "lucide-react";

export default function Page() {
  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ListChecks className="h-5 w-5" />
          Competency Catalogue
        </h1>
      </div>
      <div className="app__content">
        <CompetencyCatalogue />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Sidebar** — in `components/AppSidebar.tsx`, import `ListChecks` from `lucide-react` alongside the existing icons; add to `divisionBaseItems` right after the `Examinations` entry:

```ts
    {
      // Migration 195: every TOS picks its learning area and competencies here.
      title: "Competency Catalogue",
      url: "/division/competencies",
      icon: ListChecks,
      moduleName: "division_competencies",
    },
```
and extend `qaMenuItems`:

```ts
    { title: "Competency Catalogue", url: "/qa/competencies", icon: ListChecks, moduleName: "qa_competencies" },
```

- [ ] **Step 7: Verify**

```bash
npx tsc --noEmit -p . && npx eslint components/examinations/catalogue "app/(protected)/division/competencies" "app/(protected)/qa/competencies" components/AppSidebar.tsx
```
Then run the app against local (`npm run dev` — only after confirming `.env.development.local` exists: `test -f .env.development.local && echo present`), sign in locally as a division or QA user, open `/division/competencies`, add an area and a competency, import a two-row xlsx, retire and restore an entry. Expected: each action toasts success and the grid updates; a teacher account gets a row-level-security toast on Add.

- [ ] **Step 8: Commit**

```bash
git add components/examinations/catalogue "app/(protected)/division/competencies" "app/(protected)/qa/competencies" components/AppSidebar.tsx
git commit -m "feat(question-bank): competency catalogue module with Excel import

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: TOS builder picks from the catalogue

**Files:**
- Modify: `components/examinations/TosBuilderModal.tsx`
- Create: `lib/utils/tosCatalogue.ts`, `lib/utils/__tests__/tosCatalogue.test.ts`

**Interfaces:**
- Consumes: `useLearningAreas(true)`, `useCatalogueCompetencies(areaId, grade, true)`, `CataloguePicker`, `suggestCatalogueMatch`.
- Produces: `unmappedCount(rows: { catalogue_competency_id: string | null; competency_text: string }[]): number` and `catalogueSaveError(input): string | null` in `lib/utils/tosCatalogue.ts`.

- [ ] **Step 1: Failing test** `lib/utils/__tests__/tosCatalogue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { catalogueSaveError, unmappedCount } from "@/lib/utils/tosCatalogue";

describe("unmappedCount", () => {
  it("counts typed rows with no catalogue entry and ignores blank rows", () => {
    expect(unmappedCount([
      { catalogue_competency_id: "1", competency_text: "a" },
      { catalogue_competency_id: null, competency_text: "typed before 195" },
      { catalogue_competency_id: null, competency_text: "  " },
    ])).toBe(1);
  });
});

describe("catalogueSaveError", () => {
  const row = (id: string | null) => ({ catalogue_competency_id: id, competency_text: "x" });
  it("requires a learning area", () => {
    expect(catalogueSaveError({ learningAreaId: "", rows: [row("1")] })).toMatch(/learning area/);
  });
  it("requires every competency mapped", () => {
    expect(catalogueSaveError({ learningAreaId: "3", rows: [row("1"), row(null)] })).toMatch(/1 competency/);
  });
  it("refuses the same competency twice", () => {
    expect(catalogueSaveError({ learningAreaId: "3", rows: [row("1"), row("1")] })).toMatch(/twice/);
  });
  it("passes a fully mapped TOS", () => {
    expect(catalogueSaveError({ learningAreaId: "3", rows: [row("1"), row("2")] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run lib/utils/__tests__/tosCatalogue.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `lib/utils/tosCatalogue.ts`:

```ts
/**
 * TOS builder rules for the competency catalogue (migration 195). The
 * database's tos_guard_catalogue / tos_competency_guard_catalogue decide;
 * this only explains, before Save, what they would refuse.
 */
interface Row {
  catalogue_competency_id: string | null;
  competency_text: string;
}

export function unmappedCount(rows: Row[]): number {
  return rows.filter((r) => r.competency_text.trim() && !r.catalogue_competency_id).length;
}

export function catalogueSaveError(input: { learningAreaId: string; rows: Row[] }): string | null {
  if (!input.learningAreaId) return "Choose a learning area from the competency catalogue.";
  const live = input.rows.filter((r) => r.competency_text.trim() || r.catalogue_competency_id);
  const n = unmappedCount(live);
  if (n > 0) return `Map ${n} competenc${n === 1 ? "y" : "ies"} to the catalogue before saving.`;
  const ids = live.map((r) => String(r.catalogue_competency_id));
  if (new Set(ids).size !== ids.length) return "The same competency is listed twice.";
  return null;
}
```

Run the test → PASS.

- [ ] **Step 4: Wire the builder** — in `TosBuilderModal.tsx`:

(a) Imports:
```ts
import { CataloguePicker } from "@/components/examinations/catalogue/CataloguePicker";
import { useCatalogueCompetencies, useLearningAreas } from "@/hooks/useCatalogue";
import { suggestCatalogueMatch } from "@/lib/utils/catalogueMatch";
import { catalogueSaveError, unmappedCount } from "@/lib/utils/tosCatalogue";
```

(b) `CompetencyDraft` gains `catalogue_competency_id: string | null;` and `emptyCompetency()` sets it to `null`.

(c) State and hooks (next to `subjectName`):
```ts
  const [learningAreaId, setLearningAreaId] = useState<string>("");
  const { areas } = useLearningAreas(true);
  const { competencies: catalogue } = useCatalogueCompetencies(
    learningAreaId || null,
    gradeLevel === "" ? null : Number(gradeLevel),
    true,
  );
```

(d) Where `editData` is loaded (the block that calls `setSubjectName(editData.subject_name || "")`), add `setLearningAreaId(editData.learning_area_id ? String(editData.learning_area_id) : "");`, and where it resets for a new TOS add `setLearningAreaId("");`. In the competency mapping (`competency_text: c.competency_text || "", lc_code: c.lc_code || "",`) add `catalogue_competency_id: c.catalogue_competency_id ? String(c.catalogue_competency_id) : null,`.

(e) `applyTeacherSubject`: after `setGradeLevel(...)`, add:
```ts
      const area = areas.find((a) => a.is_active && a.name.trim().toLowerCase() === found.subject_name.trim().toLowerCase());
      if (area) setLearningAreaId(String(area.id));
```

(f) Replace the Subject `<Input>` block (label "Subject") with:
```tsx
            <div>
              <Label className="mb-1.5 block">
                Learning area <span className="text-red-500">*</span>
              </Label>
              <Select value={learningAreaId} onValueChange={setLearningAreaId} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="From the competency catalogue" />
                </SelectTrigger>
                <SelectContent>
                  {areas
                    .filter((a) => a.is_active || String(a.id) === learningAreaId)
                    .map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}{!a.is_active && " (retired)"}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {areas.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  The competency catalogue is empty. Ask the division office to import it.
                </p>
              )}
            </div>
```
and keep `subjectName` in sync for the preview: add `useEffect(() => { const a = areas.find((x) => String(x.id) === learningAreaId); if (a) setSubjectName(a.name); }, [areas, learningAreaId]);`.

(g) Replace each competency row's `<Textarea …competency_text…/>` with:
```tsx
                      {c.catalogue_competency_id || !c.competency_text.trim() ? (
                        <CataloguePicker
                          options={catalogue}
                          value={c.catalogue_competency_id}
                          excludeIds={competencies
                            .map((x) => x.catalogue_competency_id)
                            .filter((x): x is string => !!x)}
                          disabled={isSubmitting || !learningAreaId || gradeLevel === ""}
                          placeholder={learningAreaId ? `Competency ${idx + 1}` : "Choose a learning area first"}
                          onChange={(cat) =>
                            setCompetencies((prev) =>
                              prev.map((x, i) =>
                                i === idx
                                  ? { ...x, catalogue_competency_id: String(cat.id), competency_text: cat.competency_text, lc_code: cat.lc_code }
                                  : x,
                              ),
                            )
                          }
                        />
                      ) : (
                        <div className="space-y-1 rounded border border-amber-300 bg-amber-50 p-2">
                          <p className="text-xs text-amber-900">Typed before the catalogue — map it:</p>
                          <p className="text-sm">{c.competency_text}</p>
                          <CataloguePicker
                            options={catalogue}
                            value={null}
                            disabled={isSubmitting || !learningAreaId}
                            placeholder="Pick the matching catalogue entry"
                            onChange={(cat) =>
                              setCompetencies((prev) =>
                                prev.map((x, i) =>
                                  i === idx
                                    ? { ...x, catalogue_competency_id: String(cat.id), competency_text: cat.competency_text, lc_code: cat.lc_code }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                      )}
```

(h) Above the competency list, the map banner:
```tsx
            {unmappedCount(competencies) > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <span>
                  {unmappedCount(competencies)} competenc{unmappedCount(competencies) === 1 ? "y was" : "ies were"} typed
                  before the competency catalogue. Map each one before saving.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!learningAreaId || catalogue.length === 0}
                  onClick={() =>
                    setCompetencies((prev) =>
                      prev.map((x) => {
                        if (x.catalogue_competency_id || !x.competency_text.trim()) return x;
                        const m = suggestCatalogueMatch(x, catalogue.filter((c) => c.is_active));
                        return m
                          ? { ...x, catalogue_competency_id: String(m.id), competency_text: m.competency_text, lc_code: m.lc_code }
                          : x;
                      }),
                    )
                  }
                >
                  Apply suggestions
                </Button>
              </div>
            )}
```

(i) `onSubmit`: replace `if (!subjectName.trim()) return toast.error("Subject is required.");` with
```ts
    const catalogueError = catalogueSaveError({ learningAreaId, rows: competencies });
    if (catalogueError) return toast.error(catalogueError);
```
change `validComps` to `competencies.filter((c) => c.catalogue_competency_id)`; add `learning_area_id: Number(learningAreaId),` to `headerPayload`; add `catalogue_competency_id: Number(c.catalogue_competency_id),` to the competency `row` object.

(j) `setCompetencyField` and the `lc_code` input (if a separate LC-code input exists in the row, `grep -n "lc_code" components/examinations/TosBuilderModal.tsx`) — remove the editable LC-code input; the LC code is shown inside the picker.

- [ ] **Step 5: Verify**

```bash
npx vitest run lib/utils/__tests__/tosCatalogue.test.ts && npx tsc --noEmit -p . && npx eslint components/examinations/TosBuilderModal.tsx lib/utils/tosCatalogue.ts
```
Then in the local app (`.env.development.local` present): with a catalogue imported, create a private TOS (teacher), pick area/grade/competencies, save → success; re-open an old TOS whose competencies are free text → amber banner, Save refused with "Map N competencies…", Apply suggestions maps the LC-code matches, Save succeeds; archive an unmapped old TOS from the list → succeeds.

- [ ] **Step 6: Commit**

```bash
git add components/examinations/TosBuilderModal.tsx lib/utils/tosCatalogue.ts lib/utils/__tests__/tosCatalogue.test.ts
git commit -m "feat(question-bank): TOS builder picks learning area and competencies from the catalogue

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Least Learned page, bank question editor, Question Bank page

**Files:**
- Modify: `components/examinations/ExamQuestionEditor.tsx` (make `onRemove` optional)
- Create: `components/examinations/bank/BankQuestionModal.tsx`
- Create: `app/(protected)/teacher/examinations/division/llc/page.tsx`
- Create: `app/(protected)/teacher/examinations/division/questions/page.tsx`
- Modify: `app/(protected)/teacher/examinations/page.tsx`

**Interfaces:**
- Consumes: `fetchLlc`, `fetchLlcCoverage`, `saveBankQuestion`, `validateBankDraft`, `LLC_COVERAGE_NOTE`, `BANK_SUPPORTED_TYPES`, `useLearningAreas`, `useDivisionAuthorStatus`, `DivisionReviewActions` (entity `"question"`), `ReviewStatusBadge`, `seedForType`, `BLOOM_LEVELS`.
- Produces: `<BankQuestionModal isOpen onClose onSaved competency={{ id, lc_code, competency_text }} schoolYear editId? />`.

- [ ] **Step 1: Optional `onRemove`** — in `ExamQuestionEditor.tsx` change the prop to `onRemove?: () => void;` and wrap the remove button's JSX in `{onRemove && ( … )}` (find it with `grep -n "onRemove" components/examinations/ExamQuestionEditor.tsx`).

- [ ] **Step 2: `BankQuestionModal.tsx`**

```tsx
"use client";

import {
  ExamQuestionEditor,
  seedForType,
  type QuestionDraft,
} from "@/components/examinations/ExamQuestionEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BLOOM_LEVELS, getExamQuestionTypeLabel, type CognitiveLevel } from "@/lib/constants/examinations";
import { BANK_SUPPORTED_TYPES, type BankQuestionType } from "@/lib/constants/questionBank";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { saveBankQuestion, validateBankDraft } from "@/lib/utils/questionBank";
import type { BankOption, BankQuestion } from "@/types";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  competency: { id: string; lc_code: string; competency_text: string };
  schoolYear: string;
  /** Editing an existing draft / returned question. */
  editId?: string | null;
}

const blank = (type: BankQuestionType): QuestionDraft =>
  seedForType(
    {
      key: `bq_${Date.now()}`,
      tos_item_id: null,
      item_count: 1,
      question_type: type,
      question_text: "",
      answer_key: "",
      points: 1,
      image_path: "",
      image_name: "",
      options: [],
      subitems: [],
      source_bank_question_id: null,
      bank_level_override: false,
    },
    type,
  );

/** Write or edit one Question Bank question for a least learned competency. */
export function BankQuestionModal({ isOpen, onClose, onSaved, competency, schoolYear, editId }: Props) {
  const me = useAppSelector((s) => s.user.user?.system_user_id ?? null);
  const [level, setLevel] = useState<CognitiveLevel>(BLOOM_LEVELS[0].value);
  const [draft, setDraft] = useState<QuestionDraft>(blank("multiple_choice"));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!isOpen) return;
    if (!editId) {
      setLevel(BLOOM_LEVELS[0].value);
      setDraft(blank("multiple_choice"));
      return;
    }
    (async () => {
      const [{ data: q }, { data: opts }] = await Promise.all([
        supabase.from("sms_exam_bank_questions").select("*").eq("id", Number(editId)).maybeSingle(),
        supabase.from("sms_exam_bank_options").select("*").eq("question_id", Number(editId)).order("position"),
      ]);
      if (!isMounted || !q) return;
      const bq = q as BankQuestion;
      setLevel(bq.cognitive_level as CognitiveLevel);
      setDraft({
        ...blank(bq.question_type as BankQuestionType),
        question_text: bq.question_text ?? "",
        answer_key: bq.answer_key ?? "",
        image_path: bq.image_path ?? "",
        image_name: bq.image_name ?? "",
        options: ((opts ?? []) as BankOption[]).map((o) => ({
          key: `o_${o.id}`,
          choice_text: o.choice_text ?? "",
          is_correct: o.is_correct,
          image_path: o.image_path ?? "",
          image_name: o.image_name ?? "",
        })),
      });
    })();
    return () => {
      isMounted = false;
    };
  }, [isOpen, editId]);

  const onSave = async () => {
    if (busy || me == null) return;
    const problem = validateBankDraft(draft);
    if (problem) return toast.error(problem);
    setBusy(true);
    const res = await saveBankQuestion({
      id: editId ?? null,
      catalogueCompetencyId: competency.id,
      sourceLlcSchoolYear: schoolYear,
      cognitiveLevel: level,
      createdBy: me,
      draft,
    });
    setBusy(false);
    if (res.error) return toast.error(res.error);
    toast.success("Saved as a draft. Submit it to QA from the Question Bank.");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editId ? "Edit question" : "Write a Question Bank question"}</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{competency.lc_code}</span> — {competency.competency_text}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block">Question type</Label>
            <Select
              value={draft.question_type}
              disabled={!!editId}
              onValueChange={(v) => setDraft(blank(v as BankQuestionType))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BANK_SUPPORTED_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{getExamQuestionTypeLabel(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block">Cognitive level</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as CognitiveLevel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BLOOM_LEVELS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label} ({l.tier})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <ExamQuestionEditor
          question={draft}
          displayStart={1}
          schoolId={null}
          disabled={busy}
          onChange={setDraft}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={busy}>{busy ? "Saving…" : "Save draft"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```
(Confirm `getExamQuestionTypeLabel` and `seedForType` exports: `grep -n "export function getExamQuestionTypeLabel\|export function seedForType" -r lib components`.)

- [ ] **Step 3: LLC page** `app/(protected)/teacher/examinations/division/llc/page.tsx`

```tsx
"use client";

import { BankQuestionModal } from "@/components/examinations/bank/BankQuestionModal";
import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLearningAreas } from "@/hooks/useCatalogue";
import { useDivisionAuthorStatus } from "@/hooks/useDivisionAuthorStatus";
import { GRADE_LEVELS, getGradeLevelLabel } from "@/lib/constants";
import { QA_UNAUTHORIZED_MESSAGE } from "@/lib/constants/examReview";
import { LLC_COUNT, LLC_COVERAGE_NOTE } from "@/lib/constants/questionBank";
import { fetchLlc, fetchLlcCoverage, type LlcRow } from "@/lib/utils/questionBank";
import { getCurrentSchoolYear, getSchoolYearOptions } from "@/lib/utils/schoolYear";
import { TrendingDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const { loading: authLoading, isAuthorized } = useDivisionAuthorStatus();
  const { areas } = useLearningAreas();
  const [areaId, setAreaId] = useState("");
  const [grade, setGrade] = useState("");
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [rows, setRows] = useState<LlcRow[]>([]);
  const [coverage, setCoverage] = useState<{ results: number; schools: number; learners: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writeFor, setWriteFor] = useState<LlcRow | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!areaId || grade === "" || !isAuthorized) return;
    (async () => {
      setLoading(true);
      const [llc, cov] = await Promise.all([
        fetchLlc(areaId, Number(grade), schoolYear),
        fetchLlcCoverage(areaId, Number(grade), schoolYear),
      ]);
      if (!isMounted) return;
      setRows(llc.rows);
      setError(llc.error);
      setCoverage(cov);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [areaId, grade, schoolYear, isAuthorized]);

  return (
    <div>
      <div className="app__title">
        <Link href="/teacher/examinations" className="text-sm text-muted-foreground hover:text-foreground">
          ← Examinations
        </Link>
        <h1 className="app__title_text flex items-center gap-2">
          <TrendingDown className="h-5 w-5" />
          Least Learned Competencies
        </h1>
      </div>
      <div className="app__content space-y-4">
        {!authLoading && !isAuthorized ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {QA_UNAUTHORIZED_MESSAGE}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="mb-1.5 block">Learning area</Label>
                <Select value={areaId} onValueChange={setAreaId}>
                  <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>
                    {areas.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block">Grade level</Label>
                <Select value={grade} onValueChange={setGrade}>
                  <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>
                    {GRADE_LEVELS.map((g) => <SelectItem key={g} value={String(g)}>{getGradeLevelLabel(g)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block">School year</Label>
                <Select value={schoolYear} onValueChange={setSchoolYear}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {getSchoolYearOptions().map((sy) => <SelectItem key={sy} value={sy}>{sy}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!areaId || grade === "" ? (
              <p className="text-sm text-muted-foreground">Choose a learning area and grade level.</p>
            ) : loading ? (
              <TableSkeleton />
            ) : error ? (
              <p className="text-sm text-red-700">{error}</p>
            ) : rows.length === 0 ? (
              <div className="app__empty_state">
                <p className="app__empty_state_title">No Summative Test results yet</p>
                <p className="text-sm text-muted-foreground">{LLC_COVERAGE_NOTE}</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  The {LLC_COUNT} lowest competencies by Mean Percentage Score
                  {coverage && ` — based on ${coverage.results} Summative Test result(s) from ${coverage.schools} school(s), ${coverage.learners} learner(s)`}.
                  {" "}{LLC_COVERAGE_NOTE}
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-1">LC code</th>
                      <th className="py-1">Competency</th>
                      <th className="py-1 text-right">MPS</th>
                      <th className="py-1 text-right">Learners</th>
                      <th className="py-1 text-right">Sections</th>
                      <th className="py-1 text-right">Schools</th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.catalogue_competency_id} className="border-b">
                        <td className="py-1.5 font-mono text-xs">{r.lc_code}</td>
                        <td className="py-1.5">{r.competency_text}</td>
                        <td className="py-1.5 text-right">{r.mps.toFixed(2)}%</td>
                        <td className="py-1.5 text-right">{r.learners}</td>
                        <td className="py-1.5 text-right">{r.sections}</td>
                        <td className="py-1.5 text-right">{r.schools}</td>
                        <td className="py-1.5 text-right">
                          <Button size="sm" variant="green" onClick={() => setWriteFor(r)}>Write question</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
        {writeFor && (
          <BankQuestionModal
            isOpen
            onClose={() => setWriteFor(null)}
            onSaved={() => {}}
            competency={{ id: writeFor.catalogue_competency_id, lc_code: writeFor.lc_code, competency_text: writeFor.competency_text }}
            schoolYear={schoolYear}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Question Bank page** `app/(protected)/teacher/examinations/division/questions/page.tsx`

```tsx
"use client";

import { BankQuestionModal } from "@/components/examinations/bank/BankQuestionModal";
import { DivisionReviewActions } from "@/components/examinations/review/DivisionReviewActions";
import { ReviewHistoryDialogProvider } from "@/components/examinations/review/ReviewHistoryDialogContext";
import { ReviewStatusBadge } from "@/components/examinations/review/ReviewStatusBadge";
import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDivisionAuthorStatus } from "@/hooks/useDivisionAuthorStatus";
import { getGradeLevelLabel } from "@/lib/constants";
import { getCognitiveLevelLabel, getExamQuestionTypeLabel } from "@/lib/constants/examinations";
import { QA_UNAUTHORIZED_MESSAGE, type ReviewStatus } from "@/lib/constants/examReview";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { escapeIlikePattern } from "@/lib/utils";
import type { BankQuestion } from "@/types";
import { Library, MoreHorizontal, Pencil } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Row extends BankQuestion {
  competency: { lc_code: string; competency_text: string; grade_level: number; area: { name: string } | null } | null;
}

const TABS: { key: string; label: string; mine: boolean; statuses: ReviewStatus[] }[] = [
  { key: "mine", label: "My Questions", mine: true, statuses: ["draft", "submitted", "under_review", "approved", "rejected"] },
  { key: "approved", label: "Approved", mine: false, statuses: ["approved"] },
  { key: "pending", label: "Pending", mine: true, statuses: ["submitted", "under_review"] },
  { key: "returned", label: "Returned", mine: true, statuses: ["rejected"] },
];

export default function Page() {
  const userId = useAppSelector((s) => s.user.user?.system_user_id ?? null);
  const { loading: authLoading, isAuthorized } = useDivisionAuthorStatus();
  const [tab, setTab] = useState("mine");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editRow, setEditRow] = useState<Row | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!isAuthorized || userId == null) return;
    const t = TABS.find((x) => x.key === tab) ?? TABS[0];
    (async () => {
      setLoading(true);
      let q = supabase
        .from("sms_exam_bank_questions")
        .select("*, competency:catalogue_competency_id(lc_code, competency_text, grade_level, area:learning_area_id(name))")
        .in("review_status", t.statuses)
        .order("updated_at", { ascending: false });
      if (t.mine) q = q.eq("created_by", Number(userId));
      if (search.trim()) q = q.ilike("question_text", `%${escapeIlikePattern(search.trim())}%`);
      const { data, error } = await q;
      if (!isMounted) return;
      if (error) console.error(error);
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [tab, search, userId, isAuthorized, refreshKey]);

  return (
    <ReviewHistoryDialogProvider>
      <div>
        <div className="app__title">
          <Link href="/teacher/examinations" className="text-sm text-muted-foreground hover:text-foreground">
            ← Examinations
          </Link>
          <h1 className="app__title_text flex items-center gap-2">
            <Library className="h-5 w-5" />
            Question Bank
          </h1>
          <div className="app__title_actions">
            {isAuthorized && (
              <Button asChild variant="green" size="sm">
                <Link href="/teacher/examinations/division/llc">Write for a least learned competency</Link>
              </Button>
            )}
          </div>
        </div>
        <div className="app__content space-y-4">
          {!authLoading && !isAuthorized ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {QA_UNAUTHORIZED_MESSAGE}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList>
                    {TABS.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
                  </TabsList>
                </Tabs>
                <Input className="w-64" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search question text…" />
              </div>
              {loading ? (
                <TableSkeleton />
              ) : rows.length === 0 ? (
                <div className="app__empty_state"><p className="app__empty_state_title">No questions here</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-1">LC code</th>
                      <th className="py-1">Question</th>
                      <th className="py-1">Area · Grade</th>
                      <th className="py-1">Level</th>
                      <th className="py-1">Type</th>
                      <th className="py-1">Status</th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b align-top">
                        <td className="py-1.5 font-mono text-xs">{r.competency?.lc_code}</td>
                        <td className="max-w-md py-1.5">
                          <p className="line-clamp-2">{r.question_text ?? "(figure only)"}</p>
                          {r.review_status === "rejected" && r.review_comment && (
                            <p className="mt-1 text-xs text-red-700">QA: {r.review_comment}</p>
                          )}
                        </td>
                        <td className="py-1.5">
                          {r.competency?.area?.name} · {r.competency ? getGradeLevelLabel(r.competency.grade_level) : ""}
                        </td>
                        <td className="py-1.5">{getCognitiveLevelLabel(r.cognitive_level)}</td>
                        <td className="py-1.5">{getExamQuestionTypeLabel(r.question_type)}</td>
                        <td className="py-1.5"><ReviewStatusBadge status={r.review_status} /></td>
                        <td className="py-1.5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" aria-label="Open menu"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {String(r.created_by) === String(userId) &&
                                (r.review_status === "draft" || r.review_status === "rejected") && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => setEditRow(r)}>
                                    <Pencil className="mr-2 h-4 w-4" /> Edit
                                  </DropdownMenuItem>
                                )}
                              <DivisionReviewActions
                                entity="question"
                                row={{ id: String(r.id), created_by: r.created_by, school_id: null, review_status: r.review_status }}
                                userId={userId}
                                isAuthorizedAuthor={isAuthorized}
                                onChanged={() => setRefreshKey((k) => k + 1)}
                              />
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
          {editRow?.competency && (
            <BankQuestionModal
              isOpen
              editId={String(editRow.id)}
              onClose={() => setEditRow(null)}
              onSaved={() => setRefreshKey((k) => k + 1)}
              competency={{ id: String(editRow.catalogue_competency_id), lc_code: editRow.competency.lc_code, competency_text: editRow.competency.competency_text }}
              schoolYear={editRow.source_llc_school_year}
            />
          )}
        </div>
      </div>
    </ReviewHistoryDialogProvider>
  );
}
```
Check the provider's exported name: `grep -n "export function" components/examinations/review/ReviewHistoryDialogContext.tsx`; use that name (and how the TOS list mounts it — `grep -rn "ReviewHistoryDialog" app components | head`). If the TOS pages get the provider from a layout, mount it the same way instead of wrapping here.

- [ ] **Step 5: Hub cards** — in `app/(protected)/teacher/examinations/page.tsx`, import `Library, TrendingDown` from `lucide-react` and insert between the two existing `DIVISION_TOOLS` entries:

```ts
  {
    title: "Least Learned",
    subtitle: "From Summative Test results · division-wide",
    description:
      "See the competencies learners did worst on across the division, and write Question Bank questions for them.",
    url: "/teacher/examinations/division/llc",
    icon: TrendingDown,
  },
  {
    title: "Question Bank",
    subtitle: "QA-approved questions for division exams",
    description:
      "Your questions and their QA status, and every approved question you can use in a Division exam.",
    url: "/teacher/examinations/division/questions",
    icon: Library,
  },
```

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit -p . && npx eslint components/examinations/bank "app/(protected)/teacher/examinations" components/examinations/ExamQuestionEditor.tsx && npm test
```
Local app: as an authorized teacher with the Task 2-style fixtures loaded into the local DB (or real summative results tied to catalogue TOS), open Least Learned → rows appear → Write question → save → appears under My Questions as Draft → Submit to QA → status Submitted. As an unauthorized teacher: the notice only.

- [ ] **Step 7: Commit**

```bash
git add components/examinations/bank/BankQuestionModal.tsx components/examinations/ExamQuestionEditor.tsx "app/(protected)/teacher/examinations"
git commit -m "feat(question-bank): Least Learned page, bank question editor and Question Bank list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Exam builder uses bank questions

**Files:**
- Create: `components/examinations/bank/BankPickerDialog.tsx`
- Modify: `components/examinations/ExamBuilderModal.tsx`

**Interfaces:**
- Consumes: `bankQuestionToDraft`, `bankSlotStatus`, `partitionBankCandidates`, `SlotInfo`, `BANK_LEVEL_MISMATCH_CONFIRM`, `NEW_QUESTION_WORDING`, `isBankSupportedType`.
- Produces: `<BankPickerDialog isOpen onClose slot itemNumber onPick={(draft: QuestionDraft, meta: BankMeta) => void} />` where `type BankMeta = { catalogue_competency_id: string; cognitive_level: string }` is exported from `BankPickerDialog.tsx`.

- [ ] **Step 1: `BankPickerDialog.tsx`**

```tsx
"use client";

import type { QuestionDraft } from "@/components/examinations/ExamQuestionEditor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCognitiveLevelLabel } from "@/lib/constants/examinations";
import { BANK_LEVEL_MISMATCH_CONFIRM } from "@/lib/constants/questionBank";
import { supabase } from "@/lib/supabase/client";
import {
  bankQuestionToDraft,
  partitionBankCandidates,
  type SlotInfo,
} from "@/lib/utils/questionBank";
import type { BankOption, BankQuestionWithOptions } from "@/types";
import { format } from "date-fns";
import { useEffect, useState } from "react";

interface Row extends BankQuestionWithOptions {
  author: { name: string | null; school: { name: string | null } | null } | null;
}

/** The bank question's own competency and level, which the draft does not carry. */
export type BankMeta = { catalogue_competency_id: string; cognitive_level: string };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  slot: SlotInfo;
  itemNumber: number;
  onPick: (draft: QuestionDraft, meta: BankMeta) => void;
}

/** Approved bank questions for one exam item's competency. */
export function BankPickerDialog({ isOpen, onClose, slot, itemNumber, onPick }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!isOpen || !slot.catalogue_competency_id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("sms_exam_bank_questions")
        .select("*, options:sms_exam_bank_options(*), author:created_by(name, school:school_id(name))")
        .eq("catalogue_competency_id", Number(slot.catalogue_competency_id))
        .eq("review_status", "approved")
        .order("reviewed_at", { ascending: false });
      if (!isMounted) return;
      if (error) console.error(error);
      setRows(
        ((data ?? []) as Row[]).map((r) => ({
          ...r,
          catalogue_competency_id: String(r.catalogue_competency_id),
          options: [...((r.options ?? []) as BankOption[])].sort((a, b) => a.position - b.position),
        })),
      );
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [isOpen, slot.catalogue_competency_id]);

  const { matching, otherLevel } = partitionBankCandidates(rows, slot);
  const meta = (r: Row): BankMeta => ({
    catalogue_competency_id: String(r.catalogue_competency_id),
    cognitive_level: r.cognitive_level,
  });

  const card = (r: Row, mismatch: boolean) => (
    <div key={r.id} className="space-y-2 rounded border p-3">
      <p className="text-sm">{r.question_text ?? "(figure only)"}</p>
      {r.options.length > 0 && (
        <ol className="list-[upper-alpha] pl-6 text-sm">
          {r.options.map((o) => (
            <li key={o.id} className={o.is_correct ? "font-medium text-green-700" : ""}>{o.choice_text}</li>
          ))}
        </ol>
      )}
      {r.question_type === "true_false" && <p className="text-sm">Answer: {r.answer_key}</p>}
      <p className="text-xs text-muted-foreground">
        {getCognitiveLevelLabel(r.cognitive_level)} · {r.author?.name ?? "—"}
        {r.author?.school?.name ? `, ${r.author.school.name}` : ""}
        {r.reviewed_at ? ` · approved ${format(new Date(r.reviewed_at), "MMM d, yyyy")}` : ""}
      </p>
      {mismatch && confirmId === String(r.id) ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox onCheckedChange={(c) => c === true && onPick(bankQuestionToDraft(r, true), meta(r))} />
            {BANK_LEVEL_MISMATCH_CONFIRM}
          </label>
        </div>
      ) : (
        <Button
          size="sm"
          variant={mismatch ? "outline" : "green"}
          onClick={() => (mismatch ? setConfirmId(String(r.id)) : onPick(bankQuestionToDraft(r, false), meta(r)))}
        >
          Use for item {itemNumber}
        </Button>
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Question Bank — item {itemNumber}</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{slot.lc_code}</span> — {slot.competency_text} ·{" "}
            {getCognitiveLevelLabel(slot.cognitive_level)}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No approved questions for this competency yet. Write a new question instead.</p>
        ) : (
          <div className="space-y-4">
            {matching.length > 0 && (
              <section className="space-y-2">
                <p className="text-sm font-semibold">Same cognitive level</p>
                {matching.map((r) => card(r, false))}
              </section>
            )}
            {otherLevel.length > 0 && (
              <section className="space-y-2">
                <p className="text-sm font-semibold">Different cognitive level</p>
                {otherLevel.map((r) => card(r, true))}
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Builder — load and save the bank fields** in `ExamBuilderModal.tsx`:

(a) `blankQuestion` already got `source_bank_question_id: null, bank_level_override: false` in Task 5.

(b) In `loadExamChildren`'s draft mapping add:
```ts
      source_bank_question_id: q.source_bank_question_id ? String(q.source_bank_question_id) : null,
      bank_level_override: !!q.bank_level_override,
```

(c) In `onSubmit`'s `row` object add:
```ts
          source_bank_question_id: draft.source_bank_question_id ? Number(draft.source_bank_question_id) : null,
          bank_level_override: draft.bank_level_override,
```
Note: options are deleted and reinserted on every save; for a bank item the reinserted options are the verbatim copy, so `exam_guard_bank_option` accepts them. The builder must not trim a bank option's text differently from how `bankQuestionToDraft` copied it — it already writes `o.choice_text.trim() || null`, matching the guard's `NULLIF(btrim(…), '')`.

- [ ] **Step 3: Builder — slot map** (division mode only). Add state + loader:

```ts
  const [slots, setSlots] = useState<Map<number, SlotInfo>>(new Map());

  useEffect(() => {
    let isMounted = true;
    if (mode !== "division" || !tosId) {
      setSlots(new Map());
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("sms_tos_items")
        .select("item_number, cognitive_level, competency:competency_id(catalogue_competency_id, lc_code, competency_text)")
        .eq("tos_id", Number(tosId));
      if (!isMounted) return;
      const m = new Map<number, SlotInfo>();
      ((data ?? []) as {
        item_number: number;
        cognitive_level: CognitiveLevel;
        competency: { catalogue_competency_id: number | null; lc_code: string | null; competency_text: string } | null;
      }[]).forEach((r) =>
        m.set(r.item_number, {
          catalogue_competency_id: r.competency?.catalogue_competency_id != null ? String(r.competency.catalogue_competency_id) : null,
          cognitive_level: r.cognitive_level,
          lc_code: r.competency?.lc_code ?? null,
          competency_text: r.competency?.competency_text ?? "",
        }),
      );
      setSlots(m);
    })();
    return () => {
      isMounted = false;
    };
  }, [mode, tosId]);
```
Imports: `BankPickerDialog`, `bankSlotStatus`, `isBankSupportedType`, `NEW_QUESTION_WORDING`, `type SlotInfo`, `type CognitiveLevel`.

- [ ] **Step 4: Builder — "From Question Bank" per part, and bank item rendering**

(a) Record each part's next item number in `partViews`:
```ts
  const partViews = parts.map((part, pi) => {
    const entries = part.questions.map((q, qi) => {
      const start = running;
      running += questionItemCount(q);
      return { q, qi, start };
    });
    return { part, pi, entries, nextItem: running };
  });
```
Note: `nextItem` for part `pi` is the number a question appended to that part receives; parts after it shift by one. That shift is exactly what `bankSlotStatus` flags on later bank items.

(b) State and helpers:
```ts
  const [picker, setPicker] = useState<{ pi: number; itemNumber: number } | null>(null);
  // Each bank item's own competency + level, keyed by source_bank_question_id.
  const [bankMeta, setBankMeta] = useState<Map<string, BankMeta>>(new Map());
  const NO_META: BankMeta = { catalogue_competency_id: "", cognitive_level: "" };
  const statusOf = (q: QuestionDraft, itemNumber: number) =>
    bankSlotStatus(bankMeta.get(q.source_bank_question_id as string) ?? NO_META, slots.get(itemNumber));

  const addBankQuestion = (pi: number, draft: QuestionDraft) =>
    setParts((prev) => prev.map((p, i) => (i === pi ? { ...p, questions: [...p.questions, draft] } : p)));
```
Import `BankPickerDialog, type BankMeta` from `./bank/BankPickerDialog`. In `loadExamChildren`, right after `drafts` is built, load the meta of the bank items it contains:
```ts
    const bankIds = drafts.map((d) => d.source_bank_question_id).filter((x): x is string => !!x);
    if (bankIds.length > 0) {
      const { data: meta } = await supabase
        .from("sms_exam_bank_questions")
        .select("id, catalogue_competency_id, cognitive_level")
        .in("id", bankIds.map(Number));
      setBankMeta(
        new Map(
          (meta ?? []).map((m) => [
            String(m.id),
            { catalogue_competency_id: String(m.catalogue_competency_id), cognitive_level: String(m.cognitive_level) },
          ]),
        ),
      );
    } else {
      setBankMeta(new Map());
    }
```

(c) In the part's question list, render bank items read-only with their slot check (replace the `<ExamQuestionEditor … />` inside `entries.map`):
```tsx
                        {entries.map(({ q, qi, start }) => {
                          if (!q.source_bank_question_id) {
                            return (
                              <ExamQuestionEditor
                                key={q.key}
                                question={q}
                                displayStart={start}
                                schoolId={mode === "division" ? null : schoolId}
                                disabled={isSubmitting}
                                onChange={(nq) => updateQuestion(pi, qi, nq)}
                                onRemove={() => removeQuestion(pi, qi)}
                              />
                            );
                          }
                          const status = statusOf(q, start);
                          const slot = slots.get(start);
                          return (
                            <div key={q.key} className="space-y-1 rounded-md border border-blue-200 bg-blue-50/40 p-2">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="font-medium text-blue-900">
                                  From Question Bank{q.bank_level_override && " · Level override"}
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() => removeQuestion(pi, qi)}
                                  disabled={isSubmitting}
                                >
                                  Remove
                                </Button>
                              </div>
                              <ExamQuestionEditor question={q} displayStart={start} schoolId={null} disabled onChange={() => {}} />
                              {(status === "wrong_competency" || status === "no_slot") && (
                                <p className="text-xs text-red-700">
                                  Item {start} on the TOS is {slot?.lc_code ?? "not a catalogue competency"}, but this question
                                  is for a different competency. Move it back or remove it — Save will be refused.
                                </p>
                              )}
                              {status === "level_mismatch" && !q.bank_level_override && (
                                <p className="text-xs text-red-700">
                                  Item {start} asks for a different cognitive level. Remove it and pick it again to confirm the mismatch.
                                </p>
                              )}
                            </div>
                          );
                        })}
```

(d) Next to the existing "Add question" button of each part, in division mode and for supported types:
```tsx
                    {mode === "division" && isBankSupportedType(part.question_type) && (() => {
                      const slot = slots.get(nextItem);
                      return (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isSubmitting || !slot?.catalogue_competency_id}
                          title={
                            !slot ? `The TOS has no item ${nextItem}.`
                            : !slot.catalogue_competency_id ? "This TOS item isn't linked to the competency catalogue; the Question Bank can't be used for it."
                            : undefined
                          }
                          onClick={() => setPicker({ pi, itemNumber: nextItem })}
                        >
                          From Question Bank
                        </Button>
                      );
                    })()}
```
and change the "Add question" button's label in division mode to `New question` with a `title={NEW_QUESTION_WORDING}`. `nextItem` comes from the `partViews` destructure: `{partViews.map(({ part, pi, entries, nextItem }) => (`.

(e) Mount the dialog once, after the parts list:
```tsx
        {picker && slots.get(picker.itemNumber) && (
          <BankPickerDialog
            isOpen
            onClose={() => setPicker(null)}
            slot={slots.get(picker.itemNumber) as SlotInfo}
            itemNumber={picker.itemNumber}
            onPick={(draft, meta) => {
              setBankMeta((prev) => new Map(prev).set(draft.source_bank_question_id as string, meta));
              addBankQuestion(picker.pi, draft);
              setPicker(null);
            }}
          />
        )}
```

(f) Before saving, block a save the database would refuse:
```ts
    const misplaced = partViews.flatMap(({ entries }) =>
      entries
        .filter(({ q }) => q.source_bank_question_id)
        .filter(({ q, start }) => {
          const st = statusOf(q, start);
          return st === "wrong_competency" || st === "no_slot" || (st === "level_mismatch" && !q.bank_level_override);
        })
        .map(({ start }) => start),
    );
    if (misplaced.length > 0)
      return toast.error(`Item${misplaced.length > 1 ? "s" : ""} ${misplaced.join(", ")}: the Question Bank question no longer matches the TOS item. Move it back or remove it.`);
```
placed at the top of `onSubmit` after the existing early returns.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit -p . && npx eslint components/examinations/ExamBuilderModal.tsx components/examinations/bank && npm test
```
Local app (authorized teacher, an approved Division TOS built from catalogue competencies, at least one approved bank question for item 1's competency): New exam on the TOS → Multiple Choice part → "From Question Bank" → pick → item shows "From Question Bank", read-only → Save succeeds; set the answer key → Submit to QA succeeds. Then add a question *above* the bank item so it becomes item 2 → red warning appears and Save is refused with the item number.

- [ ] **Step 6: Commit**

```bash
git add components/examinations/bank/BankPickerDialog.tsx components/examinations/ExamBuilderModal.tsx lib/utils/questionBank.ts
git commit -m "feat(question-bank): use approved bank questions item by item in division exams

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: QA surfaces

**Files:**
- Create: `components/examinations/review/BankReviewQueueTable.tsx`, `components/examinations/review/ExamBankSourceTable.tsx`, `app/(protected)/qa/question/[id]/page.tsx`
- Modify: `app/(protected)/qa/page.tsx`, `app/(protected)/qa/exam/[id]/page.tsx`

**Interfaces:**
- Consumes: `ReviewDecisionPanel` (entity `"question"`), `ReviewHistory`, `ReviewStatusBadge`, `setBankQuestionLevel`, `questionSourceLabel`, `BLOOM_LEVELS`.

- [ ] **Step 1: `BankReviewQueueTable.tsx`**

```tsx
"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { getGradeLevelLabel } from "@/lib/constants";
import { getCognitiveLevelLabel } from "@/lib/constants/examinations";
import type { ReviewStatus } from "@/lib/constants/examReview";
import { supabase } from "@/lib/supabase/client";
import type { BankQuestion } from "@/types";
import { format } from "date-fns";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ReviewStatusBadge } from "./ReviewStatusBadge";

interface Row extends BankQuestion {
  competency: { lc_code: string; grade_level: number } | null;
  author: { name: string | null; school: { name: string | null } | null } | null;
}

export function BankReviewQueueTable({ statuses }: { statuses: ReviewStatus[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("sms_exam_bank_questions")
        .select("*, competency:catalogue_competency_id(lc_code, grade_level), author:created_by(name, school:school_id(name))")
        .in("review_status", statuses)
        .order("submitted_at", { ascending: true, nullsFirst: false });
      if (!isMounted) return;
      if (error) console.error(error);
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [statuses]);

  if (loading) return <TableSkeleton />;
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Nothing here.</p>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground">
          <th className="py-1">LC code</th>
          <th className="py-1">Question</th>
          <th className="py-1">Grade</th>
          <th className="py-1">Level</th>
          <th className="py-1">Teacher</th>
          <th className="py-1">School</th>
          <th className="py-1">Submitted</th>
          <th className="py-1">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b">
            <td className="py-1.5 font-mono text-xs">{r.competency?.lc_code}</td>
            <td className="max-w-sm py-1.5">
              <Link href={`/qa/question/${r.id}`} className="line-clamp-1 hover:underline">
                {r.question_text ?? "(figure only)"}
              </Link>
            </td>
            <td className="py-1.5">{r.competency ? getGradeLevelLabel(r.competency.grade_level) : ""}</td>
            <td className="py-1.5">{getCognitiveLevelLabel(r.cognitive_level)}</td>
            <td className="py-1.5">{r.author?.name}</td>
            <td className="py-1.5">{r.author?.school?.name ?? "—"}</td>
            <td className="py-1.5">{r.submitted_at ? format(new Date(r.submitted_at), "MMM d, yyyy") : "—"}</td>
            <td className="py-1.5"><ReviewStatusBadge status={r.review_status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: QA dashboard** — in `app/(protected)/qa/page.tsx`:

Add `const RETURNED: ReviewStatus[] = ["rejected"];`, import `BankReviewQueueTable`; extend `Counts` with `pendingQuestions: number; approvedQuestions: number;`; add to the `Promise.all`:
```ts
          supabase.from("sms_exam_bank_questions").select("id", { count: "exact", head: true }).in("review_status", PENDING),
          supabase.from("sms_exam_bank_questions").select("id", { count: "exact", head: true }).in("review_status", APPROVED),
```
(destructure as `pendingQ, approvedQ` and set `pendingQuestions: pendingQ.count ?? 0, approvedQuestions: approvedQ.count ?? 0`); add tiles `["Pending Questions", counts?.pendingQuestions]` and `["Approved Questions", counts?.approvedQuestions]`; change the grid to `lg:grid-cols-7`; add triggers/contents:
```tsx
            <TabsTrigger value="pending-questions">Pending Questions</TabsTrigger>
            <TabsTrigger value="approved-questions">Approved Questions</TabsTrigger>
            <TabsTrigger value="returned-questions">Returned Questions</TabsTrigger>
```
```tsx
          <TabsContent value="pending-questions"><BankReviewQueueTable statuses={PENDING} /></TabsContent>
          <TabsContent value="approved-questions"><BankReviewQueueTable statuses={APPROVED} /></TabsContent>
          <TabsContent value="returned-questions"><BankReviewQueueTable statuses={RETURNED} /></TabsContent>
```

- [ ] **Step 3: `app/(protected)/qa/question/[id]/page.tsx`**

```tsx
"use client";

import { ReviewDecisionPanel } from "@/components/examinations/review/ReviewDecisionPanel";
import { ReviewHistory } from "@/components/examinations/review/ReviewHistory";
import { ReviewStatusBadge } from "@/components/examinations/review/ReviewStatusBadge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getGradeLevelLabel } from "@/lib/constants";
import { BLOOM_LEVELS, getExamQuestionTypeLabel, type CognitiveLevel } from "@/lib/constants/examinations";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { examImageUrl } from "@/lib/utils/examImages";
import { setBankQuestionLevel } from "@/lib/utils/questionBank";
import type { BankOption, BankQuestion } from "@/types";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface Row extends BankQuestion {
  options: BankOption[];
  competency: { lc_code: string; competency_text: string; grade_level: number; area: { name: string } | null } | null;
  author: { name: string | null; school: { name: string | null } | null } | null;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useAppSelector((s) => s.user.user?.system_user_id ?? null);
  const [row, setRow] = useState<Row | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data } = await supabase
        .from("sms_exam_bank_questions")
        .select("*, options:sms_exam_bank_options(*), competency:catalogue_competency_id(lc_code, competency_text, grade_level, area:learning_area_id(name)), author:created_by(name, school:school_id(name))")
        .eq("id", Number(id))
        .maybeSingle();
      if (!isMounted) return;
      setRow((data as Row | null) ?? null);
      setLoaded(true);
    })();
    return () => {
      isMounted = false;
    };
  }, [id, refreshKey]);

  if (!loaded) return <div className="app__content">Loading…</div>;
  if (!row) return <div className="app__content text-muted-foreground">Not found or you do not have access.</div>;

  const canSetLevel = row.review_status === "under_review" && String(row.created_by) !== String(me);
  const options = [...(row.options ?? [])].sort((a, b) => a.position - b.position);

  return (
    <div>
      <div className="app__title">
        <Link href="/qa" className="text-sm text-muted-foreground hover:text-foreground">← QA Dashboard</Link>
        <h1 className="app__title_text flex items-center gap-3">
          Question Bank question
          <ReviewStatusBadge status={row.review_status} />
        </h1>
      </div>
      <div className="app__content grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="space-y-1 text-sm">
            <p><span className="font-mono">{row.competency?.lc_code}</span> — {row.competency?.competency_text}</p>
            <p className="text-muted-foreground">
              {row.competency?.area?.name} · {row.competency ? getGradeLevelLabel(row.competency.grade_level) : ""} ·{" "}
              {getExamQuestionTypeLabel(row.question_type)} · written from the {row.source_llc_school_year} Least Learned list
            </p>
            <p className="text-muted-foreground">
              By {row.author?.name ?? "—"}{row.author?.school?.name ? `, ${row.author.school.name}` : ""}
            </p>
          </section>
          <section className="space-y-2 rounded border p-4">
            {row.question_text && <p>{row.question_text}</p>}
            {row.image_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={examImageUrl(row.image_path)} alt={row.image_name ?? "figure"} className="max-h-60" />
            )}
            {options.length > 0 && (
              <ol className="list-[upper-alpha] pl-6">
                {options.map((o) => (
                  <li key={o.id} className={o.is_correct ? "font-semibold text-green-700" : ""}>
                    {o.choice_text}
                    {o.image_path && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={examImageUrl(o.image_path)} alt={o.image_name ?? "choice figure"} className="max-h-32" />
                    )}
                    {o.is_correct && " ✓"}
                  </li>
                ))}
              </ol>
            )}
            {row.question_type === "true_false" && <p>Answer: <b>{row.answer_key}</b></p>}
          </section>
          <section className="w-64">
            <Label className="mb-1.5 block">Cognitive level</Label>
            <Select
              value={row.cognitive_level}
              disabled={!canSetLevel}
              onValueChange={async (v) => {
                const { error } = await setBankQuestionLevel(row.id, v as CognitiveLevel);
                if (error) return toast.error(error);
                toast.success("Cognitive level corrected");
                setRefreshKey((k) => k + 1);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BLOOM_LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {!canSetLevel && row.review_status !== "approved" && (
              <p className="mt-1 text-xs text-muted-foreground">Start the review to correct it.</p>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">Decision</h2>
            <ReviewDecisionPanel
              entity="question"
              row={{ id: String(row.id), review_status: row.review_status, created_by: row.created_by }}
              onChanged={() => setRefreshKey((k) => k + 1)}
            />
          </section>
        </div>
        <section className="space-y-3">
          <h2 className="font-semibold">History</h2>
          <ReviewHistory entity="question" id={row.id} refreshKey={refreshKey} />
        </section>
      </div>
    </div>
  );
}
```
(Confirm `examImageUrl`'s export: `grep -n "export function examImageUrl" lib/utils/examImages.ts`.)

- [ ] **Step 4: `ExamBankSourceTable.tsx`** and mount on the QA exam page

```tsx
"use client";

import { supabase } from "@/lib/supabase/client";
import { questionSourceLabel } from "@/lib/utils/questionBank";
import { useEffect, useState } from "react";

interface Row {
  item_number: number;
  question_type: string;
  source_bank_question_id: number | null;
  bank_level_override: boolean;
}

/** Per item: written new for this exam, or taken from the Question Bank. */
export function ExamBankSourceTable({ examId }: { examId: string }) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data } = await supabase
        .from("sms_exam_questions")
        .select("item_number, question_type, source_bank_question_id, bank_level_override")
        .eq("exam_id", Number(examId))
        .order("item_number");
      if (isMounted) setRows((data as Row[]) ?? []);
    })();
    return () => {
      isMounted = false;
    };
  }, [examId]);

  if (rows.length === 0) return null;
  const fromBank = rows.filter((r) => r.source_bank_question_id != null).length;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {fromBank} of {rows.length} item(s) from the Question Bank; the rest were written for this exam.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-1">Item</th>
            <th className="py-1">Source</th>
            <th className="py-1">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item_number} className="border-b">
              <td className="py-1">{r.item_number}</td>
              <td className="py-1">{questionSourceLabel(r)}</td>
              <td className="py-1 text-amber-700">{r.bank_level_override ? "Level override — cognitive level differs from the TOS item" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

In `app/(protected)/qa/exam/[id]/page.tsx`, import it and add a section before "Decision":
```tsx
          <section className="space-y-3">
            <h2 className="font-semibold">Items</h2>
            <ExamBankSourceTable examId={exam.id} />
          </section>
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit -p . && npx eslint "app/(protected)/qa" components/examinations/review && npm test
```
Local app as QA: dashboard shows the two new counters and three new tabs; open a pending question → Start review → change level → Approve; history lists Submitted / Review started / Cognitive level corrected / Approved. Open a division exam with a bank item → Items table shows "Question Bank" and the override note.

- [ ] **Step 6: Commit**

```bash
git add components/examinations/review "app/(protected)/qa"
git commit -m "feat(question-bank): QA review of bank questions and item sources on exam review

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: End-to-end checks, docs, final verification

**Files:**
- Create: `e2e/question-bank.spec.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write the Playwright spec**

```ts
/**
 * Question Bank (migration 195), against the intercepted Supabase. The
 * database enforces the rules; these pin what the screens ASK it and show.
 */
import { expect, test } from "@playwright/test";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const AUTHORIZED = { sms_exam_qa_authors: [{ id: 1, user_id: TEST_USER.systemUserId, is_active: true }] };

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("Least Learned asks for the chosen area, grade and year and lists the result", async ({ page }) => {
  const mock = await installSupabaseMock(
    page,
    { ...AUTHORIZED, sms_learning_areas: [{ id: 3, name: "Mathematics", is_active: true }] },
    {
      division_llc: () => [
        { catalogue_competency_id: 41, lc_code: "M5NS-ID-4", competency_text: "Divides fractions", mps: 12.5, learners: 80, sections: 4, schools: 2, results: 4 },
      ],
      division_llc_coverage: () => [{ results: 4, schools: 2, learners: 80 }],
    },
  );
  await page.goto("/teacher/examinations/division/llc");
  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Mathematics" }).click();
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: /Grade 5/ }).click();
  await expect(page.getByText("Divides fractions")).toBeVisible();
  await expect(page.getByText("12.50%")).toBeVisible();
  const call = mock.writesTo("rpc/division_llc")[0];
  expect(call.body).toMatchObject({ p_learning_area_id: 3, p_grade_level: 5 });
  await page.getByRole("button", { name: "Write question" }).click();
  await expect(page.getByText("Write a Question Bank question")).toBeVisible();
});

test("an unauthorized teacher sees the notice on Least Learned", async ({ page }) => {
  await installSupabaseMock(page, { sms_exam_qa_authors: [], sms_learning_areas: [] });
  await page.goto("/teacher/examinations/division/llc");
  await expect(page.getByText(/not currently authorized/)).toBeVisible();
});
```
Check the grade label format first: `grep -n "export function getGradeLevelLabel" -A8 lib/constants/index.ts` and adjust `/Grade 5/` if needed.

- [ ] **Step 2: Run it** (macOS 13 needs Chrome channel — memory note):

```bash
cat > /tmp/pw-chrome.config.ts <<'EOF'
import base from "./playwright.config";
export default { ...base, use: { ...base.use, channel: "chrome" } };
EOF
cp /tmp/pw-chrome.config.ts ./pw-chrome.config.ts
npx playwright test e2e/question-bank.spec.ts e2e/division-exam-qa.spec.ts -c pw-chrome.config.ts
rm pw-chrome.config.ts
```
Expected: all pass. (`answer-key` and `scan-score` specs are known-failing on `main` in this environment — not part of this run.)

- [ ] **Step 3: CLAUDE.md** — add a row to *Notable Recent Migrations* after 194 and a line to *Key Features & Locations*:

Migrations row:
```markdown
| 195 | **Competency catalogue, Least Learned Competencies, Question Bank** — every TOS now picks its learning area and competencies from a division catalogue (`sms_learning_areas`, `sms_competency_catalogue`; division office + QA maintain it, retire-never-delete), with the picked text and LC code **copied** onto `sms_tos_competencies` (snapshot rule). `division_llc` pools every **Summative Test** result in the division — private and school exams included, so it is `SECURITY DEFINER` and returns aggregates only (193) — and returns the **3 lowest competencies by MPS, ties kept** (`llc_count()`). QA-authorized teachers write `sms_exam_bank_questions` only for a competency on that list; each is QA-reviewed through 194's `exam_review_*` with entity `'question'` (QA may correct the cognitive level, audited `set_level`). A division exam item is either a verbatim **copy** of an approved bank question (`source_bank_question_id`, validated by `exam_guard_bank_link` / `_option` — same competency required, a different cognitive level only with `bank_level_override`) or a new question that stays in that exam. Exam QA is unchanged. ⚠ **After applying, import the catalogue before anyone saves a TOS** — every TOS save is refused until its learning area and competencies exist. 194's file untouched; its test got fixture-only edits. Tests: `supabase/tests/195_question_bank.sql` |
```
Key Features row:
```markdown
| **Question Bank & LLC** | `teacher/examinations/division/{llc,questions}`, `division/competencies`, `qa/competencies`, `qa/question/[id]`, `components/examinations/{catalogue,bank}/`, `lib/utils/questionBank.ts`, migration 195 | Catalogue → TOS picks competencies → Summative results → division LLC (lowest 3) → bank question → QA → used per item in a division exam |
```
And a Critical Invariant:
```markdown
18. **A TOS competency is a catalogue entry; a bank item is a verbatim copy** (migration 195) — never write `competency_text` / `lc_code` on `sms_tos_competencies` without `catalogue_competency_id` (the guard overwrites them from the catalogue), never delete a catalogue row (retire it), and never edit a bank-linked exam question's content in place — remove it and pick again or write a new one. Only Summative Test results feed the LLC list.
```

- [ ] **Step 4: Full verification**

```bash
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/195_question_bank.sql 2>&1 | grep -E "FAIL|ERROR|ROLLBACK"
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql 2>&1 | grep -E "FAIL|ERROR|ROLLBACK"
npm test
npx tsc --noEmit -p .
npm run lint
git status --short
```
Expected: two `ROLLBACK`s, vitest green, tsc clean, lint clean, only intended files modified.

- [ ] **Step 5: Commit**

```bash
git add e2e/question-bank.spec.ts CLAUDE.md
git commit -m "test(question-bank): e2e for Least Learned; document migration 195

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand-off note to the user** (not an action on production): tell the user migration 195 is ready, that it changes no existing rows (the four header counts), that **the catalogue must be imported immediately after applying** or every TOS save is refused, and give them the section-12 grant-check query.
