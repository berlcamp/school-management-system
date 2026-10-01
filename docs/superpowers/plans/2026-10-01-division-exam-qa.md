# Division TOS & Examinations with QA Approval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Division-wide TOS and exams are authored only by QA-authorized teachers and reach the division only after a QA reviewer approves them, enforced in the database.

**Architecture:** One additive migration (194) adds a `qa` role, a nullable `review_status` on `sms_tos` / `sms_exams` (set only on division rows), an authorization table and an append-only audit table; it replaces the blanket `authenticated` RLS on the nine TOS/exam tables with policies that keep today's behaviour for school-level rows and gate division rows by status; every status change goes through SECURITY DEFINER workflow functions. The UI reuses the existing builders, lists and view modals, adds a `/qa` area, and splits the teacher hub into Personal/School and Division.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), Next.js 16 App Router, React 19, Redux Toolkit, shadcn/ui, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-division-exam-qa-design.md`

## Global Constraints

- **RULE 0 (CLAUDE.md): local Supabase only.** Every `psql` in this plan targets `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Never read `.env.local`, never `supabase link` / `db push`, never touch production. Applying 194 to production is the **user's** job.
- `.env.development.local` must exist before `npm run dev` / Playwright; if absent, **stop**.
- Migrations are immutable once applied anywhere but local: this plan only **creates** `supabase/migrations/194_division_exam_qa_review.sql`; it edits no earlier migration file.
- The migration file must be **re-runnable** on the local DB (each task re-applies the whole file): `CREATE OR REPLACE`, `DROP … IF EXISTS` before `CREATE`, `ADD COLUMN IF NOT EXISTS`, constraints dropped then added.
- Every SECURITY DEFINER function: `SET search_path = procurements, public` (the 138 rule).
- Caller resolution idiom (161): `sms_users WHERE user_id = auth.uid()`; role checks read the **active** `sms_users.type` (invariant 12).
- Statuses, exactly: `draft`, `submitted`, `under_review`, `approved`, `rejected`. Entities: `tos`, `exam`, `author`. Actions: `authorize`, `revoke`, `submit`, `withdraw`, `start_review`, `approve`, `reject`, `reopen`.
- Role value `qa`, label `"QA Reviewer"`.
- Unauthorized copy, verbatim: *"You are not currently authorized to create Division TOS. Please contact the Division QA administrator."*
- TypeScript: no `any`. Use `useAppSelector`/`useAppDispatch` from `@/lib/redux/hook`. Co-locate page-specific components.
- **Spec deviation (decided here, recorded in Task 1):** a multi-role QA reviewer holds `qa` **at their school** in `sms_user_roles` (written by `/division/users`' "Also works as" picker, which writes the extra roles at every school the person serves), because 163's `sms_switch_active_context` refuses a NULL school. A dedicated QA account has `type = 'qa'` and `school_id` NULL. `is_exam_qa()` reads the type only, so both behave identically.
- Commit after every task with a `feat(exams-qa): …` / `test(exams-qa): …` message ending in
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A teacher's own division draft appearing in their personal TOS / Exam lists** (today `visibleTierFilter` admits `created_by = me` regardless of tier) — expected: personal lists show only approved division rows. Pinned in Task 5 (`visibleTierFilter` tests).
2. **A teacher who is the author re-saving an approved exam from an old open tab** — expected: the save fails with a readable message, nothing changes. Pinned in Task 3 SQL test ("approved question update affects 0 rows") and Task 7 (`canEditReviewRow` hides Edit).
3. **A master teacher with the QA hat approving their own submission after switching role** — expected: refused. Pinned in Task 4 SQL test (`mt` self-approval).
4. **Revoked teacher with a draft open** — expected: edits and submit refused, approved work stays visible. Pinned in Task 4 SQL test (revoke block).
5. **A personal exam built on a division TOS that is later reopened** — expected: reopen refused while any exam references the TOS. Pinned in Task 4 SQL test (reopen TOS with exam).

---

## File Map

| File | Responsibility |
|---|---|
| `supabase/migrations/194_division_exam_qa_review.sql` (create) | Role, columns, tables, backfill, helpers, RLS, triggers, workflow functions |
| `supabase/tests/194_exam_qa_review.sql` (create) | Rolled-back scenario script against local DB |
| `lib/constants/examReview.ts` (create) | Status/action constants, labels, badge classes, transition table |
| `lib/utils/examReview.ts` (create) | RPC wrappers + pure `canEditReviewRow`, `tosConformance` |
| `lib/utils/__tests__/examReview.test.ts` (create) | vitest for the above |
| `lib/utils/examVisibility.ts` (modify) | Division clause → approved only; own-row clause school-level only |
| `lib/utils/__tests__/examVisibility.test.ts` (modify) | Updated expectations |
| `lib/constants/userTypes.ts` (modify) | `qa` label, assignable, switchable (not school-head assignable) |
| `types/database.ts` (modify) | Review fields on `Tos`/`Exam`; `ExamReviewEvent`, `ExamQaAuthor` |
| `components/SchoolIdGuard.tsx` (modify) | Admit `qa` with NULL school |
| `components/QaGuard.tsx` (create) | Route guard for `/qa` |
| `components/AppSidebar.tsx` (modify) | QA menu group; hide teacher menu for `qa` |
| `app/(protected)/division/users/AddModal.tsx` (modify) | `qa` needs no school |
| `hooks/useDivisionAuthorStatus.ts` (create) | Is the signed-in user an authorized division author |
| `components/examinations/review/ReviewStatusBadge.tsx` (create) | Status pill |
| `components/examinations/review/ReviewHistory.tsx` (create) | Event timeline for an entity |
| `components/examinations/review/DivisionReviewActions.tsx` (create) | Teacher dropdown items: Submit / Withdraw / History / Create Examination |
| `components/examinations/review/ReviewDecisionPanel.tsx` (create) | QA: Start / Approve / Reject / Reopen |
| `components/examinations/review/TosConformancePanel.tsx` (create) | QA: exam vs TOS counts |
| `components/examinations/review/ReviewQueueTable.tsx` (create) | QA queue table (TOS or exam, by status) |
| `components/examinations/TosList.tsx`, `ExamList.tsx` (modify) | Division mode: status badge, review-aware edit, extra actions slot |
| `components/examinations/TosBuilderModal.tsx`, `ExamBuilderModal.tsx` (modify) | Division TOS picker approved-only; `initialTosId` |
| `app/(protected)/teacher/examinations/page.tsx` (modify) | Two groups; unauthorized notice |
| `app/(protected)/teacher/examinations/division/tos/page.tsx` (create) | Teacher's Division TOS |
| `app/(protected)/teacher/examinations/division/exam/page.tsx` (create) | Teacher's Division Exams |
| `app/(protected)/division/examinations/tos/page.tsx`, `exam/page.tsx` (modify) | Remove Create; read-only with status |
| `app/(protected)/qa/layout.tsx`, `page.tsx`, `tos/[id]/page.tsx`, `exam/[id]/page.tsx`, `authors/page.tsx` (create) | QA area |
| `e2e/division-exam-qa.spec.ts` (create) | Browser flow |
| `CLAUDE.md`, spec (modify) | Migration row, invariant 17, spec deviation note |

---

### Task 0: Local database baseline

**Files:** none committed.

- [ ] **Step 1: Confirm the env file guard**

Run: `ls .env.development.local`
Expected: the file is listed. If missing: STOP and tell the user (CLAUDE.md rule 2).

- [ ] **Step 2: Start this project's local stack**

Run: `docker ps --format '{{.Names}}' | grep supabase_`
If another project's stack (e.g. `supabase_db_ceedo-collections`) is running, **stop and ask the user** before stopping it — ports 54321-54323 collide. Then, with migrations parked per CLAUDE.md rule 5:

```bash
mv supabase/migrations supabase/migrations.parked
npx supabase start --ignore-health-check
mv supabase/migrations.parked supabase/migrations
```

If the DB volume is empty (no `procurements.sms_users` rows), STOP: re-cloning is `~/sms-dumps/refresh.sh`, which is the user's job (rule 8).

- [ ] **Step 3: Record the baseline the migration header needs**

```bash
export LOCAL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
psql "$LOCAL" -Atc "set search_path=procurements;
select 'tos_division', count(*) from sms_tos where school_id is null
union all select 'exam_division', count(*) from sms_exams where school_id is null
union all select 'tos_total', count(*) from sms_tos
union all select 'exam_total', count(*) from sms_exams;"
psql "$LOCAL" -Atc "select tablename, policyname, cmd from pg_policies where schemaname='procurements' and tablename in ('sms_tos','sms_tos_competencies','sms_tos_items','sms_exams','sms_exam_questions','sms_exam_options','sms_exam_subitems','sms_exam_sections','sms_exam_answer_keys','sms_exam_results') order by 1,2;"
psql "$LOCAL" -c "\d procurements.sms_users" | grep -E "not null" ; psql "$LOCAL" -c "\d public.adm_notifications"
psql "$LOCAL" -Atc "select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='procurements.sms_users'::regclass and contype='f';"
```

Write the four counts and the policy list into a scratch note; Task 1 puts the counts in the header and Task 2 asserts the policy list. Note which `sms_users` columns are NOT NULL without a default (the test fixtures in Task 1 must supply them), whether `sms_users.user_id` has an FK to `auth.users`, and whether `public.adm_notifications` exists and the type of its `user_id`.

---

### Task 1: Migration — role, review columns, tables, backfill

**Files:**
- Create: `supabase/migrations/194_division_exam_qa_review.sql`
- Create: `supabase/tests/194_exam_qa_review.sql`
- Modify: `docs/superpowers/specs/2026-10-01-division-exam-qa-design.md` (§3.1 deviation note)

**Interfaces:**
- Produces: column `review_status` etc. on `sms_tos`/`sms_exams`; tables `sms_exam_qa_authors(id, user_id UNIQUE, is_active, authorized_by, authorized_at, revoked_by, revoked_at, revoke_reason, created_at, updated_at)` and `sms_exam_review_events(id, entity_type, entity_id, actor_id, action, from_status, to_status, comment, created_at)`; test helpers schema `tst` with `tst.claims(uuid)`, `tst.expect_error(text,text)`, `tst.expect_rows(text,int)`, `tst.expect_count(text,bigint)`, `tst.id(text) → bigint`, `tst.uid(text) → uuid`.

- [ ] **Step 1: Write the test script skeleton + Task 1 assertions**

Create `supabase/tests/194_exam_qa_review.sql`:

```sql
-- Migration 194 scenario test. LOCAL DATABASE ONLY.
--   psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql
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

-- Impersonate: call, then `SET LOCAL ROLE authenticated;` in the script.
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
    RAISE EXCEPTION 'FAIL expected error like "%" but got "%" for: %',
      p_like, SQLERRM, p_sql;
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
-- Two real schools from the clone; users are created here and rolled back.
-- If Task 0 found sms_users.user_id has an FK to auth.users, the auth rows
-- below satisfy it. Add any further NOT NULL sms_users column Task 0 listed.
INSERT INTO tst.ids (name, uid) VALUES
  ('qa1', '00000000-0000-4000-8000-0000000000a1'),
  ('qa2', '00000000-0000-4000-8000-0000000000a2'),
  ('t1',  '00000000-0000-4000-8000-0000000000b1'),
  ('t2',  '00000000-0000-4000-8000-0000000000b2'),
  ('mt',  '00000000-0000-4000-8000-0000000000b3'),
  ('do',  '00000000-0000-4000-8000-0000000000c1'),
  ('head','00000000-0000-4000-8000-0000000000c2');

INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@194.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id)
SELECT 'schoolA', min(id) FROM sms_schools
UNION ALL
SELECT 'schoolB', (SELECT id FROM sms_schools ORDER BY id OFFSET 1 LIMIT 1);

WITH u(name, type, school) AS (VALUES
  ('qa1', 'qa', NULL), ('qa2', 'qa', NULL),
  ('t1', 'teacher', 'schoolA'), ('t2', 'teacher', 'schoolB'),
  ('mt', 'teacher', 'schoolA'),
  ('do', 'division_type', NULL), ('head', 'school_head', 'schoolA'))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@194.test', u.type, tst.id(u.school), tst.uid(u.name), true
FROM u;

UPDATE tst.ids i SET id = s.id
FROM sms_users s WHERE s.user_id = i.uid;

-- 163: the active (type, school) pair is always in sms_user_roles; mt also
-- holds qa at school A (the multi-role reviewer).
INSERT INTO sms_user_roles (user_id, role, school_id)
SELECT s.id, s.type, s.school_id FROM sms_users s
WHERE s.user_id IN (SELECT uid FROM tst.ids WHERE uid IS NOT NULL)
ON CONFLICT DO NOTHING;
INSERT INTO sms_user_roles (user_id, role, school_id)
VALUES (tst.id('mt'), 'qa', tst.id('schoolA'));

-- ------------------------------------------------------------- task 1 ------
SELECT tst.expect_count(
  $$ SELECT count(*) FROM sms_users WHERE type = 'qa' $$, 2);
SELECT tst.expect_count(
  $$ SELECT count(*) FROM sms_tos WHERE school_id IS NULL AND review_status IS DISTINCT FROM 'approved' $$, 0);
SELECT tst.expect_count(
  $$ SELECT count(*) FROM sms_exams WHERE school_id IS NULL AND review_status IS DISTINCT FROM 'approved' $$, 0);
SELECT tst.expect_count(
  $$ SELECT count(*) FROM sms_tos WHERE school_id IS NOT NULL AND review_status IS NOT NULL $$, 0);
SELECT tst.expect_count(
  $$ SELECT count(*) FROM sms_exams WHERE school_id IS NOT NULL AND review_status IS NOT NULL $$, 0);
SELECT set_config('sms.exam_review', 'on', true);
SELECT tst.expect_error(
  $$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, review_status)
     VALUES ('X', 5, '2026-2027', 1, NULL, NULL) $$,
  'review_status_tier');
SELECT tst.expect_error(
  $$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, review_status)
     VALUES ('X', 5, '2026-2027', 1, $$ || tst.id('schoolA') || $$, 'draft') $$,
  'review_status_tier');
SELECT tst.expect_error(
  $$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, review_status)
     VALUES ('X', 5, '2026-2027', 1, NULL, 'published') $$,
  'review_status');
SELECT set_config('sms.exam_review', 'off', true);

-- (later tasks append their sections above this line)

ROLLBACK;
```

Note on `$$ … $$ || x || $$ … $$`: `tst.expect_error` takes one TEXT; concatenating dollar-quoted strings with an id is how a fixture id reaches a dynamic statement.

- [ ] **Step 2: Run it to verify it fails**

Run: `psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql`
Expected: FAIL at the `sms_users` insert with `violates check constraint "sms_users_type_check"`.

- [ ] **Step 3: Write the migration's first half**

Create `supabase/migrations/194_division_exam_qa_review.sql`. Replace `<N_TOS>` / `<N_EXAM>` with the Task 0 counts.

```sql
-- ============================================================================
-- 194 — Division TOS & examinations go through QA review
--
-- Until now a division TOS / exam (school_id NULL, 096/099) was written by the
-- division office and visible to every teacher the moment it was saved, and the
-- nine exam tables let ANY authenticated user insert, update or delete ANY row
-- (096/099's blanket policies; only the paper SELECTs were tightened, by 161).
-- From here:
--   * a new division-level role, `qa`, authorizes teachers and reviews;
--   * only a QA-authorized teacher may create a division row, and it reaches
--     the division only once a QA reviewer approves it;
--   * the division office no longer authors division rows at all;
--   * every status change goes through the exam_review_* functions below and is
--     written to sms_exam_review_events.
--
-- Private and school-wide rows (160) keep EXACTLY today's behaviour: every
-- policy below begins with `school_id IS NOT NULL OR …`, and `review_status`
-- stays NULL on them.
--
-- `review_status` is NULL for private / school-wide rows and one of
-- draft | submitted | under_review | approved | rejected for division rows, tied
-- by a CHECK. There is no separate "division available" value: that is
-- `approved`.
--
-- The only DML is the backfill: every existing division row becomes `approved`
-- (on the local clone: <N_TOS> TOS, <N_EXAM> exams). They are what teachers
-- print, scan and analyse today; nothing disappears. They become immutable,
-- which they were not before — intended. A grandfathered row has no `approve`
-- event, which is how exam_review_reopen tells it apart.
--
-- QA reviewer as a SECOND role (163): `sms_switch_active_context` refuses a
-- NULL school, so a master teacher on the QA panel holds `qa` AT THEIR SCHOOL
-- in sms_user_roles. A dedicated QA account is type 'qa' with school_id NULL.
-- is_exam_qa() reads the active type only, so both behave the same.
--
-- Before applying to production (the user's job — never an agent's):
--   SELECT count(*) FROM procurements.sms_tos   WHERE school_id IS NULL;
--   SELECT count(*) FROM procurements.sms_exams WHERE school_id IS NULL;
-- Those are the rows the backfill marks approved.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. The role (158's constraint, plus 'qa')
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_users DROP CONSTRAINT IF EXISTS sms_users_type_check;
ALTER TABLE procurements.sms_users ADD CONSTRAINT sms_users_type_check
  CHECK (type IN (
    'school_head', 'assistant_school_head', 'teacher', 'volunteer_teacher',
    'registrar', 'admin', 'super admin', 'division_admin', 'division_type',
    'librarian', 'tutor', 'guidance_counselor', 'school_nurse', 'accounting',
    'security_guard', 'utility_worker', 'qa'));

-- ----------------------------------------------------------------------------
-- 2. Review columns (identical on both tables)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_tos', 'sms_exams'] LOOP
    EXECUTE format('ALTER TABLE procurements.%I
      ADD COLUMN IF NOT EXISTS review_status TEXT,
      ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reviewed_by BIGINT
        REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS review_comment TEXT', t);

    EXECUTE format('ALTER TABLE procurements.%1$I
      DROP CONSTRAINT IF EXISTS %1$s_review_status_check', t);
    EXECUTE format('ALTER TABLE procurements.%1$I
      ADD CONSTRAINT %1$s_review_status_check CHECK (review_status IS NULL
        OR review_status IN (''draft'', ''submitted'', ''under_review'',
                             ''approved'', ''rejected''))', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Backfill — the only DML. The flag lets it pass the review-field guard
--    (section 6) when this file is re-applied after the guard exists.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('sms.exam_review', 'on', true);
  UPDATE procurements.sms_tos
     SET review_status = 'approved', reviewed_at = created_at
   WHERE school_id IS NULL AND review_status IS NULL;
  UPDATE procurements.sms_exams
     SET review_status = 'approved', reviewed_at = created_at
   WHERE school_id IS NULL AND review_status IS NULL;
  PERFORM set_config('sms.exam_review', 'off', true);
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_tos', 'sms_exams'] LOOP
    EXECUTE format('ALTER TABLE procurements.%1$I
      DROP CONSTRAINT IF EXISTS %1$s_review_status_tier', t);
    EXECUTE format('ALTER TABLE procurements.%1$I
      ADD CONSTRAINT %1$s_review_status_tier
      CHECK ((school_id IS NULL) = (review_status IS NOT NULL))', t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_sms_tos_review_status
  ON procurements.sms_tos (review_status) WHERE school_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_sms_exams_review_status
  ON procurements.sms_exams (review_status) WHERE school_id IS NULL;

-- ----------------------------------------------------------------------------
-- 4. Authorization and audit tables (FKs inline: both tables are new, so the
--    116 IF-NOT-EXISTS trap does not apply on first creation)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_exam_qa_authors (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL UNIQUE
                  REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  authorized_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by    BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  revoked_at    TIMESTAMPTZ,
  revoke_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procurements.sms_exam_review_events (
  id          BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('tos', 'exam', 'author')),
  entity_id   BIGINT NOT NULL,
  actor_id    BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL CHECK (action IN ('authorize', 'revoke', 'submit',
                'withdraw', 'start_review', 'approve', 'reject', 'reopen')),
  from_status TEXT,
  to_status   TEXT,
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_exam_review_events_entity
  ON procurements.sms_exam_review_events (entity_type, entity_id, created_at);

ALTER TABLE procurements.sms_exam_qa_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_exam_review_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON procurements.sms_exam_qa_authors TO authenticated;
GRANT SELECT ON procurements.sms_exam_review_events TO authenticated;
-- Policies: section 9. Writes: only the section-8 functions (no write policy).
```

- [ ] **Step 4: Apply and run the test**

```bash
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/migrations/194_division_exam_qa_review.sql
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql
```
Expected: migration completes; test prints `ok` lines and ends with `ROLLBACK`. Re-apply the migration once more to prove it is re-runnable: same result.

- [ ] **Step 5: Record the spec deviation**

In the spec §3.1, append to the Role bullet list:

```markdown
- **Multi-role QA (decided in planning):** `sms_switch_active_context` (163)
  refuses a NULL school, so a person who also teaches holds `qa` *at their
  school* in `sms_user_roles` — which is what `/division/users`' "Also works
  as" picker already writes. A dedicated QA account is `type = 'qa'`,
  `school_id` NULL. `is_exam_qa()` reads the active type only.
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/194_division_exam_qa_review.sql supabase/tests/194_exam_qa_review.sql docs/superpowers/specs/2026-10-01-division-exam-qa-design.md
git commit -m "feat(exams-qa): qa role, review columns, authorization and audit tables (194, part 1)"
```

---

### Task 2: Migration — helpers, main-table RLS, guard triggers

**Files:**
- Modify: `supabase/migrations/194_division_exam_qa_review.sql` (append)
- Modify: `supabase/tests/194_exam_qa_review.sql` (append a section before `ROLLBACK;`)

**Interfaces:**
- Consumes: Task 1 columns/tables.
- Produces (SQL, all `SECURITY DEFINER`, granted to `authenticated`): `exam_me_id() → BIGINT`, `exam_me_type() → TEXT`, `is_exam_qa() → BOOLEAN`, `is_exam_oversight() → BOOLEAN`, `is_division_author() → BOOLEAN`, `can_see_division_row(p_status TEXT, p_created_by BIGINT) → BOOLEAN`, `can_edit_tos(p_tos_id BIGINT) → BOOLEAN`, `can_edit_exam(p_exam_id BIGINT) → BOOLEAN`, `exam_has_approve_event(p_entity TEXT, p_id BIGINT) → BOOLEAN`. Session flag `sms.exam_review` = `'on'` admits review-field writes.

- [ ] **Step 1: Append the failing tests**

Insert before `ROLLBACK;` in the test file:

```sql
-- ------------------------------------------------------------- task 2 ------
-- t1 is authorized directly here; Task 4 replaces this with exam_qa_authorize.
INSERT INTO sms_exam_qa_authors (user_id, authorized_by) VALUES (tst.id('t1'), tst.id('qa1'));
INSERT INTO sms_exam_qa_authors (user_id, authorized_by) VALUES (tst.id('mt'), tst.id('qa1'));

-- unauthorized teacher cannot create a division TOS
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by)
     VALUES ('Science', 5, '2026-2027', 1, NULL, $$ || tst.id('t2') || $$) $$,
  'row-level security');
-- … but their private TOS still works exactly as before
SELECT tst.expect_rows(
  $$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by)
     VALUES ('Private', 5, '2026-2027', 1, $$ || tst.id('schoolB') || $$, $$ || tst.id('t2') || $$) $$, 1);
RESET ROLE;

-- division office can no longer create one
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by)
     VALUES ('Science', 5, '2026-2027', 1, NULL, $$ || tst.id('do') || $$) $$,
  'row-level security');
RESET ROLE;

-- authorized teacher can; an attempt to insert it pre-approved lands as draft
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(
  $$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by, review_status, title)
     VALUES ('Science', 5, '2026-2027', 1, NULL, $$ || tst.id('t1') || $$, 'approved', 'T1 DIV TOS') $$, 1);
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'tos1', id FROM sms_tos WHERE title = 'T1 DIV TOS';
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos WHERE id = $$ || tst.id('tos1') || $$ AND review_status = 'draft' $$, 1);

-- the author cannot write review fields or move the row between levels
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ UPDATE sms_tos SET review_status = 'approved' WHERE id = $$ || tst.id('tos1'),
  'QA review workflow');
SELECT tst.expect_error(
  $$ UPDATE sms_tos SET school_id = $$ || tst.id('schoolA') || $$ WHERE id = $$ || tst.id('tos1'),
  'division level');
SELECT tst.expect_rows($$ UPDATE sms_tos SET title = 'T1 DIV TOS v2' WHERE id = $$ || tst.id('tos1'), 1);
RESET ROLE;

-- visibility: other teacher 0, QA 1, division office 1
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos WHERE id = $$ || tst.id('tos1'), 0);
RESET ROLE;
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos WHERE id = $$ || tst.id('tos1'), 1);
RESET ROLE;
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos WHERE id = $$ || tst.id('tos1'), 1);
RESET ROLE;

-- exams cannot be built on an unapproved division TOS, even a personal one
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ INSERT INTO sms_exams (tos_id, school_id, created_by) VALUES
     ($$ || tst.id('tos1') || $$, $$ || tst.id('schoolA') || $$, $$ || tst.id('t1') || $$) $$,
  'not been approved');
RESET ROLE;

-- approve tos1 out-of-band (Task 4 adds the real function)
SELECT set_config('sms.exam_review', 'on', true);
UPDATE sms_tos SET review_status = 'approved' WHERE id = tst.id('tos1');
SELECT set_config('sms.exam_review', 'off', true);

-- a division exam on it is allowed and lands as draft
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_rows(
  $$ INSERT INTO sms_exams (tos_id, school_id, created_by, title) VALUES
     ($$ || tst.id('tos1') || $$, NULL, $$ || tst.id('t1') || $$, 'T1 DIV EXAM') $$, 1);
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'exam1', id FROM sms_exams WHERE title = 'T1 DIV EXAM';

-- a division exam on a PRIVATE TOS is refused
INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by, title)
VALUES ('Science', 5, '2026-2027', 1, tst.id('schoolA'), tst.id('t1'), 'T1 PRIVATE TOS');
INSERT INTO tst.ids (name, id) SELECT 'ptos1', id FROM sms_tos WHERE title = 'T1 PRIVATE TOS';
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ INSERT INTO sms_exams (tos_id, school_id, created_by) VALUES
     ($$ || tst.id('ptos1') || $$, NULL, $$ || tst.id('t1') || $$) $$,
  'approved Division TOS');
RESET ROLE;

-- results cannot be recorded against an unapproved division exam
SELECT tst.expect_error(
  $$ INSERT INTO sms_exam_results (exam_id, section_id, school_id, school_year)
     VALUES ($$ || tst.id('exam1') || $$,
             (SELECT id FROM sms_sections WHERE school_id = $$ || tst.id('schoolA') || $$ LIMIT 1),
             $$ || tst.id('schoolA') || $$, '2026-2027') $$,
  'not been approved');
```

- [ ] **Step 2: Run to verify it fails**

Run: `psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql`
Expected: `FAIL expected error like "row-level security" but it succeeded` on the t2 division insert (096's blanket policy still admits it).

- [ ] **Step 3: Append helpers, policies and triggers to the migration**

Append to `194_division_exam_qa_review.sql`. In the policy-drop block, the drop is **generic** (every policy on the table), because the live schema and the migration files are known to disagree (116, 157); Task 0's policy list is what was there.

```sql
-- ----------------------------------------------------------------------------
-- 5. Helpers. SECURITY DEFINER so a policy can call them without recursing
--    through RLS; search_path pinned (138). All read the ACTIVE role (163).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.exam_me_id()
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT u.id FROM procurements.sms_users u
  WHERE u.user_id = auth.uid() AND u.is_active LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_me_type()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT u.type FROM procurements.sms_users u
  WHERE u.user_id = auth.uid() AND u.is_active LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION procurements.is_exam_qa()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT COALESCE(procurements.exam_me_type() IN ('qa', 'super admin'), false);
$$;

CREATE OR REPLACE FUNCTION procurements.is_exam_oversight()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT COALESCE(procurements.exam_me_type()
    IN ('division_admin', 'division_type', 'super admin'), false);
$$;

CREATE OR REPLACE FUNCTION procurements.is_division_author()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT COALESCE(procurements.exam_me_type() IN ('teacher', 'volunteer_teacher'), false)
     AND EXISTS (
       SELECT 1 FROM procurements.sms_exam_qa_authors a
       WHERE a.user_id = procurements.exam_me_id() AND a.is_active);
$$;

CREATE OR REPLACE FUNCTION procurements.can_see_division_row(
  p_status TEXT, p_created_by BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT p_status = 'approved'
      OR p_created_by = procurements.exam_me_id()
      OR procurements.is_exam_qa()
      OR procurements.is_exam_oversight();
$$;

CREATE OR REPLACE FUNCTION procurements.can_edit_tos(p_tos_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_tos t
    WHERE t.id = p_tos_id
      AND (t.school_id IS NOT NULL
           OR (t.created_by = procurements.exam_me_id()
               AND t.review_status IN ('draft', 'rejected')
               AND procurements.is_division_author())));
$$;

CREATE OR REPLACE FUNCTION procurements.can_edit_exam(p_exam_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_exams e
    WHERE e.id = p_exam_id
      AND (e.school_id IS NOT NULL
           OR (e.created_by = procurements.exam_me_id()
               AND e.review_status IN ('draft', 'rejected')
               AND procurements.is_division_author())));
$$;

CREATE OR REPLACE FUNCTION procurements.exam_has_approve_event(
  p_entity TEXT, p_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_exam_review_events ev
    WHERE ev.entity_type = p_entity AND ev.entity_id = p_id
      AND ev.action = 'approve');
$$;

GRANT EXECUTE ON FUNCTION
  procurements.exam_me_id(), procurements.exam_me_type(),
  procurements.is_exam_qa(), procurements.is_exam_oversight(),
  procurements.is_division_author(),
  procurements.can_see_division_row(TEXT, BIGINT),
  procurements.can_edit_tos(BIGINT), procurements.can_edit_exam(BIGINT),
  procurements.exam_has_approve_event(TEXT, BIGINT)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Guard triggers
-- ----------------------------------------------------------------------------
-- Review fields are written only by the exam_review_* functions (section 8),
-- which set the transaction-local flag. A new division row always starts as a
-- draft whatever the client sent. A row never crosses the division boundary:
-- otherwise a private exam could be moved into the division unreviewed.
CREATE OR REPLACE FUNCTION procurements.exam_guard_review_fields()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = procurements, public AS $$
BEGIN
  IF current_setting('sms.exam_review', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.school_id IS NULL THEN
      NEW.review_status := 'draft';
    ELSE
      NEW.review_status := NULL;
    END IF;
    NEW.submitted_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_comment := NULL;
    RETURN NEW;
  END IF;

  IF (OLD.school_id IS NULL) <> (NEW.school_id IS NULL) THEN
    RAISE EXCEPTION 'A TOS or exam cannot be moved into or out of the division level.';
  END IF;

  IF NEW.review_status  IS DISTINCT FROM OLD.review_status
  OR NEW.submitted_at   IS DISTINCT FROM OLD.submitted_at
  OR NEW.reviewed_by    IS DISTINCT FROM OLD.reviewed_by
  OR NEW.reviewed_at    IS DISTINCT FROM OLD.reviewed_at
  OR NEW.review_comment IS DISTINCT FROM OLD.review_comment THEN
    RAISE EXCEPTION 'Review status changes only through the QA review workflow.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_tos_guard_review_fields ON procurements.sms_tos;
CREATE TRIGGER sms_tos_guard_review_fields
  BEFORE INSERT OR UPDATE ON procurements.sms_tos
  FOR EACH ROW EXECUTE FUNCTION procurements.exam_guard_review_fields();

DROP TRIGGER IF EXISTS sms_exams_guard_review_fields ON procurements.sms_exams;
CREATE TRIGGER sms_exams_guard_review_fields
  BEFORE INSERT OR UPDATE ON procurements.sms_exams
  FOR EACH ROW EXECUTE FUNCTION procurements.exam_guard_review_fields();

-- Any exam on a division TOS needs that TOS approved; a division exam needs a
-- division TOS. SECURITY DEFINER: the caller may not be able to SELECT the TOS.
CREATE OR REPLACE FUNCTION procurements.exam_guard_tos()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_school BIGINT;
  v_status TEXT;
BEGIN
  SELECT t.school_id, t.review_status INTO v_school, v_status
  FROM procurements.sms_tos t WHERE t.id = NEW.tos_id;

  IF NEW.school_id IS NULL AND (NOT FOUND OR v_school IS NOT NULL) THEN
    RAISE EXCEPTION 'A Division exam must be built on an approved Division TOS.';
  END IF;

  IF FOUND AND v_school IS NULL AND v_status <> 'approved' THEN
    RAISE EXCEPTION 'This TOS has not been approved by QA yet.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_exams_guard_tos ON procurements.sms_exams;
CREATE TRIGGER sms_exams_guard_tos
  BEFORE INSERT OR UPDATE OF tos_id, school_id ON procurements.sms_exams
  FOR EACH ROW EXECUTE FUNCTION procurements.exam_guard_tos();

CREATE OR REPLACE FUNCTION procurements.exam_guard_result_release()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM procurements.sms_exams e
    WHERE e.id = NEW.exam_id AND e.school_id IS NULL
      AND e.review_status <> 'approved') THEN
    RAISE EXCEPTION 'This Division exam has not been approved by QA yet.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_exam_results_guard_release ON procurements.sms_exam_results;
CREATE TRIGGER sms_exam_results_guard_release
  BEFORE INSERT ON procurements.sms_exam_results
  FOR EACH ROW EXECUTE FUNCTION procurements.exam_guard_result_release();

-- ----------------------------------------------------------------------------
-- 7. Main-table policies. Every one begins `school_id IS NOT NULL OR …`, which
--    is 096/099's `authenticated` rule unchanged for private / school rows.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t   TEXT;
  pol RECORD;
  fn  TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_tos', 'sms_exams'] LOOP
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE schemaname = 'procurements' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON procurements.%I', pol.policyname, t);
    END LOOP;

    fn := CASE t WHEN 'sms_tos' THEN 'can_edit_tos' ELSE 'can_edit_exam' END;

    EXECUTE format($p$CREATE POLICY "%1$s: select" ON procurements.%1$I
      FOR SELECT TO authenticated
      USING (school_id IS NOT NULL
             OR procurements.can_see_division_row(review_status, created_by))$p$, t);

    EXECUTE format($p$CREATE POLICY "%1$s: insert" ON procurements.%1$I
      FOR INSERT TO authenticated
      WITH CHECK (school_id IS NOT NULL
             OR (procurements.is_division_author()
                 AND created_by = procurements.exam_me_id()
                 AND review_status = 'draft'))$p$, t);

    EXECUTE format($p$CREATE POLICY "%1$s: update" ON procurements.%1$I
      FOR UPDATE TO authenticated
      USING (school_id IS NOT NULL OR procurements.%2$I(id))
      WITH CHECK (school_id IS NOT NULL OR procurements.%2$I(id))$p$, t, fn);

    EXECUTE format($p$CREATE POLICY "%1$s: delete" ON procurements.%1$I
      FOR DELETE TO authenticated
      USING (school_id IS NOT NULL
             OR (procurements.%2$I(id)
                 AND NOT procurements.exam_has_approve_event(%3$L, id)))$p$,
      t, fn, CASE t WHEN 'sms_tos' THEN 'tos' ELSE 'exam' END);
  END LOOP;
END $$;
```

- [ ] **Step 4: Apply and run**

```bash
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/migrations/194_division_exam_qa_review.sql
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql
```
Expected: all `ok`, ends in `ROLLBACK`. If the results insert fails for a different reason (no section at school A on the clone), pick `schoolA` as a school that has sections: change the fixture to `SELECT 'schoolA', min(school_id) FROM sms_sections`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/194_division_exam_qa_review.sql supabase/tests/194_exam_qa_review.sql
git commit -m "feat(exams-qa): RLS and guard triggers gate division TOS/exams by review status (194, part 2)"
```

---

### Task 3: Migration — child tables, paper read gate, release-code manager

**Files:**
- Modify: `supabase/migrations/194_division_exam_qa_review.sql` (append)
- Modify: `supabase/tests/194_exam_qa_review.sql` (append before `ROLLBACK;`)

**Interfaces:**
- Consumes: Task 2 helpers.
- Produces: `exam_id_of_question(p_question_id BIGINT) → BIGINT`; replaced `can_read_exam_paper(BIGINT)` and `can_manage_exam(BIGINT)` (same signatures as 161).

- [ ] **Step 1: Append the failing tests**

```sql
-- ------------------------------------------------------------- task 3 ------
-- tos1 is approved: its competencies are frozen for the author
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ INSERT INTO sms_tos_competencies (tos_id, competency_text) VALUES ($$ || tst.id('tos1') || $$, 'C1') $$,
  'row-level security');
-- the draft exam on it is editable by its author
SELECT tst.expect_rows(
  $$ INSERT INTO sms_exam_questions (exam_id, item_number, question_text) VALUES ($$ || tst.id('exam1') || $$, 1, 'Q1') $$, 1);
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'q1', id FROM sms_exam_questions WHERE exam_id = tst.id('exam1');

-- another teacher can neither read nor write the unapproved paper
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_questions WHERE exam_id = $$ || tst.id('exam1'), 0);
SELECT tst.expect_error(
  $$ INSERT INTO sms_exam_options (question_id, label, choice_text) VALUES ($$ || tst.id('q1') || $$, 'A', 'x') $$,
  'row-level security');
RESET ROLE;

-- QA can read it
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_questions WHERE exam_id = $$ || tst.id('exam1'), 1);
-- release code is not manageable before approval
SELECT tst.expect_count($$ SELECT count(*) FROM (SELECT 1 WHERE procurements.can_manage_exam($$ || tst.id('exam1') || $$)) x $$, 0);
RESET ROLE;

-- approve exam1 out-of-band; now the paper is frozen and readable to all
SELECT set_config('sms.exam_review', 'on', true);
UPDATE sms_exams SET review_status = 'approved' WHERE id = tst.id('exam1');
SELECT set_config('sms.exam_review', 'off', true);

SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_rows($$ UPDATE sms_exam_questions SET question_text = 'changed' WHERE id = $$ || tst.id('q1'), 0);
SELECT tst.expect_rows($$ UPDATE sms_exams SET title = 'changed' WHERE id = $$ || tst.id('exam1'), 0);
-- the author does NOT hold the release code on a division exam (decision 2)
SELECT tst.expect_count($$ SELECT count(*) FROM (SELECT 1 WHERE procurements.can_manage_exam($$ || tst.id('exam1') || $$)) x $$, 0);
RESET ROLE;
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_questions WHERE exam_id = $$ || tst.id('exam1'), 1);
RESET ROLE;
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM (SELECT 1 WHERE procurements.can_manage_exam($$ || tst.id('exam1') || $$)) x $$, 1);
RESET ROLE;
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM (SELECT 1 WHERE procurements.can_manage_exam($$ || tst.id('exam1') || $$)) x $$, 1);
RESET ROLE;

-- unchanged: a private exam's author manages it and edits its paper
INSERT INTO sms_exams (tos_id, school_id, created_by, title)
VALUES (tst.id('ptos1'), tst.id('schoolA'), tst.id('t1'), 'T1 PRIVATE EXAM');
INSERT INTO tst.ids (name, id) SELECT 'pexam1', id FROM sms_exams WHERE title = 'T1 PRIVATE EXAM';
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM (SELECT 1 WHERE procurements.can_manage_exam($$ || tst.id('pexam1') || $$)) x $$, 1);
SELECT tst.expect_rows(
  $$ INSERT INTO sms_exam_questions (exam_id, item_number, question_text) VALUES ($$ || tst.id('pexam1') || $$, 1, 'PQ1') $$, 1);
SELECT tst.expect_rows(
  $$ INSERT INTO sms_tos_competencies (tos_id, competency_text) VALUES ($$ || tst.id('ptos1') || $$, 'PC1') $$, 1);
RESET ROLE;
```

- [ ] **Step 2: Run to verify it fails**

Run: `psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql`
Expected: FAIL on the first competency insert (`expected error like "row-level security" but it succeeded`).

- [ ] **Step 3: Append to the migration**

```sql
-- ----------------------------------------------------------------------------
-- 8a. Child tables. Writes follow the parent's edit rule, so an approved TOS or
--     exam is frozen down to its last option and answer-key row. Reads: TOS
--     children follow the parent's SELECT policy (the EXISTS runs under it);
--     the five paper tables keep 161's can_read_exam_paper, extended below.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.exam_id_of_question(p_question_id BIGINT)
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT q.exam_id FROM procurements.sms_exam_questions q WHERE q.id = p_question_id;
$$;
GRANT EXECUTE ON FUNCTION procurements.exam_id_of_question(BIGINT) TO authenticated, service_role;

DO $$
DECLARE
  t     TEXT;
  pol   RECORD;
  ref   TEXT;
  check_expr TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_tos_competencies', 'sms_tos_items',
    'sms_exam_questions', 'sms_exam_sections', 'sms_exam_answer_keys',
    'sms_exam_options', 'sms_exam_subitems'] LOOP

    FOR pol IN SELECT policyname FROM pg_policies
               WHERE schemaname = 'procurements' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON procurements.%I', pol.policyname, t);
    END LOOP;

    IF t IN ('sms_tos_competencies', 'sms_tos_items') THEN
      check_expr := 'procurements.can_edit_tos(tos_id)';
      EXECUTE format($p$CREATE POLICY "%1$s: select" ON procurements.%1$I
        FOR SELECT TO authenticated
        USING (EXISTS (SELECT 1 FROM procurements.sms_tos t
                       WHERE t.id = %1$I.tos_id))$p$, t);
    ELSE
      ref := CASE WHEN t IN ('sms_exam_options', 'sms_exam_subitems')
                  THEN 'procurements.exam_id_of_question(question_id)'
                  ELSE 'exam_id' END;
      check_expr := format('procurements.can_edit_exam(%s)', ref);
      -- 161's read gate, re-created verbatim in shape.
      EXECUTE format($p$CREATE POLICY "%1$s: select" ON procurements.%1$I
        FOR SELECT TO authenticated
        USING (procurements.can_read_exam_paper(%2$s))$p$, t, ref);
    END IF;

    EXECUTE format($p$CREATE POLICY "%1$s: insert" ON procurements.%1$I
      FOR INSERT TO authenticated WITH CHECK (%2$s)$p$, t, check_expr);
    EXECUTE format($p$CREATE POLICY "%1$s: update" ON procurements.%1$I
      FOR UPDATE TO authenticated USING (%2$s) WITH CHECK (%2$s)$p$, t, check_expr);
    EXECUTE format($p$CREATE POLICY "%1$s: delete" ON procurements.%1$I
      FOR DELETE TO authenticated USING (%2$s)$p$, t, check_expr);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 8b. can_read_exam_paper (161), extended: an unapproved division exam is
--     readable only by its author, QA and the division office — before any
--     release-code branch. The rest is 161's body unchanged.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.can_read_exam_paper(p_exam_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_school BIGINT;
  v_status TEXT;
  v_author BIGINT;
BEGIN
  SELECT e.school_id, e.review_status, e.created_by
    INTO v_school, v_status, v_author
  FROM procurements.sms_exams e WHERE e.id = p_exam_id;

  IF FOUND AND v_school IS NULL AND v_status <> 'approved' THEN
    RETURN v_author = procurements.exam_me_id()
        OR procurements.is_exam_qa()
        OR procurements.is_exam_oversight();
  END IF;

  RETURN
    NOT EXISTS (
      SELECT 1 FROM procurements.sms_exam_release_codes c
      WHERE c.exam_id = p_exam_id)
    OR EXISTS (
      SELECT 1 FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
        AND u.type IN ('division_admin', 'super admin', 'division_type'))
    OR procurements.can_manage_exam(p_exam_id)
    OR EXISTS (
      SELECT 1
      FROM procurements.sms_exam_unlocks x
      JOIN procurements.sms_users u ON u.id = x.user_id
      WHERE x.exam_id = p_exam_id AND u.user_id = auth.uid());
END;
$$;

-- ----------------------------------------------------------------------------
-- 8c. can_manage_exam (161), replaced, same signature. A division exam's code
--     is held by the division office and QA, and only once it is approved
--     (decision 2). The author branch now applies to school-level exams only.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.can_manage_exam(p_exam_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM procurements.sms_exams e
    CROSS JOIN LATERAL (
      SELECT u.id, u.type, u.school_id
      FROM procurements.sms_users u
      WHERE u.user_id = auth.uid()
      LIMIT 1
    ) me
    WHERE e.id = p_exam_id
      AND (
        (e.school_id IS NULL
          AND e.review_status = 'approved'
          AND me.type IN ('division_admin', 'super admin', 'division_type', 'qa'))
        OR (e.school_id IS NOT NULL AND me.id = e.created_by)
        OR (e.school_id IS NOT NULL
            AND e.is_school_shared
            AND me.school_id = e.school_id
            AND me.type IN ('school_head', 'assistant_school_head', 'admin'))
      )
  );
$$;

COMMENT ON FUNCTION procurements.can_manage_exam IS
  'True when the signed-in user may set, read or clear this exam''s release code: for an APPROVED division exam the division office and QA (194); for a school-level exam its author, plus school_head / assistant_school_head / admin at the school for a school-wide exam (160).';
```

- [ ] **Step 4: Apply and run**

```bash
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/migrations/194_division_exam_qa_review.sql
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql
```
Expected: all `ok`, `ROLLBACK`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/194_division_exam_qa_review.sql supabase/tests/194_exam_qa_review.sql
git commit -m "feat(exams-qa): freeze approved papers, gate unapproved reads, release code to QA and division office (194, part 3)"
```

---

### Task 4: Migration — workflow functions, audit policies, notifications

**Files:**
- Modify: `supabase/migrations/194_division_exam_qa_review.sql` (append)
- Modify: `supabase/tests/194_exam_qa_review.sql` (append before `ROLLBACK;`; also replace Task 2's two direct `INSERT INTO sms_exam_qa_authors` lines — see Step 1)

**Interfaces:**
- Produces (RPCs callable by `authenticated`, all `RETURNS VOID`):
  - `exam_qa_authorize(p_user_id BIGINT)`
  - `exam_qa_revoke(p_user_id BIGINT, p_reason TEXT)`
  - `exam_review_submit(p_entity TEXT, p_id BIGINT)`
  - `exam_review_withdraw(p_entity TEXT, p_id BIGINT)`
  - `exam_review_start(p_entity TEXT, p_id BIGINT)`
  - `exam_review_decide(p_entity TEXT, p_id BIGINT, p_decision TEXT, p_comment TEXT)`
  - `exam_review_reopen(p_entity TEXT, p_id BIGINT, p_comment TEXT)`
- Internal (EXECUTE revoked from PUBLIC): `exam_review_load`, `exam_review_transition`, `exam_review_notify`.

- [ ] **Step 1: Append the failing tests**

Replace Task 2's two lines

```sql
INSERT INTO sms_exam_qa_authors (user_id, authorized_by) VALUES (tst.id('t1'), tst.id('qa1'));
INSERT INTO sms_exam_qa_authors (user_id, authorized_by) VALUES (tst.id('mt'), tst.id('qa1'));
```

with

```sql
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_qa_authorize(tst.id('t1'));
SELECT procurements.exam_qa_authorize(tst.id('mt'));
RESET ROLE;
```

Then append before `ROLLBACK;`:

```sql
-- ------------------------------------------------------------- task 4 ------
-- authorization
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_qa_authorize($$ || tst.id('t2') || $$) $$, 'Only a QA reviewer');
SELECT tst.expect_error(
  $$ INSERT INTO sms_exam_review_events (entity_type, entity_id, action) VALUES ('tos', 1, 'approve') $$,
  'row-level security');
RESET ROLE;
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_qa_authorize($$ || tst.id('head') || $$) $$, 'Only an active teacher');
SELECT tst.expect_error($$ SELECT procurements.exam_qa_authorize($$ || tst.id('t1') || $$) $$, 'already authorized');
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_review_events WHERE entity_type = 'author' AND action = 'authorize' $$, 2);
RESET ROLE;

-- a fresh draft TOS through the whole cycle
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by, title)
VALUES ('Math', 6, '2026-2027', 1, NULL, tst.id('t1'), 'T1 TOS 2');
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'tos2', id FROM sms_tos WHERE title = 'T1 TOS 2';

SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('tos', $$ || tst.id('tos2') || $$) $$, 'Only the author');
RESET ROLE;
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('tos', $$ || tst.id('tos2') || $$) $$, 'at least one competency');
INSERT INTO sms_tos_competencies (tos_id, competency_text) VALUES (tst.id('tos2'), 'Fractions');
SELECT procurements.exam_review_submit('tos', tst.id('tos2'));
SELECT procurements.exam_review_withdraw('tos', tst.id('tos2'));
SELECT procurements.exam_review_submit('tos', tst.id('tos2'));
-- frozen while submitted
SELECT tst.expect_rows($$ UPDATE sms_tos SET title = 'x' WHERE id = $$ || tst.id('tos2'), 0);
RESET ROLE;

SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_review_start('tos', tst.id('tos2'));
RESET ROLE;
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_review_withdraw('tos', $$ || tst.id('tos2') || $$) $$, 'not started reviewing');
RESET ROLE;

SELECT tst.claims(tst.uid('qa2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_review_decide('tos', $$ || tst.id('tos2') || $$, 'reject', '  ') $$, 'reason is required');
SELECT procurements.exam_review_decide('tos', tst.id('tos2'), 'reject', 'Item distribution does not match the budget of work');
RESET ROLE;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos WHERE id = $$ || tst.id('tos2') || $$ AND review_status = 'rejected' AND review_comment LIKE 'Item distribution%' AND reviewed_by = $$ || tst.id('qa2'), 1);

-- the author revises and resubmits; the rejection stays in history
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_rows($$ UPDATE sms_tos SET title = 'T1 TOS 2 rev' WHERE id = $$ || tst.id('tos2'), 1);
SELECT procurements.exam_review_submit('tos', tst.id('tos2'));
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_review_events WHERE entity_type = 'tos' AND entity_id = $$ || tst.id('tos2'), 6);
RESET ROLE;
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_review_events WHERE entity_type = 'tos' AND entity_id = $$ || tst.id('tos2'), 0);
RESET ROLE;

SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_review_decide('tos', tst.id('tos2'), 'approve', NULL);
RESET ROLE;

-- self-review: mt authors as a teacher, then switches to the qa hat
SELECT tst.claims(tst.uid('mt')); SET LOCAL ROLE authenticated;
INSERT INTO sms_exams (tos_id, school_id, created_by, title) VALUES (tst.id('tos2'), NULL, tst.id('mt'), 'MT EXAM');
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'mtexam', id FROM sms_exams WHERE title = 'MT EXAM';
SELECT tst.claims(tst.uid('mt')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_review_submit('exam', $$ || tst.id('mtexam') || $$) $$, 'at least one question');
INSERT INTO sms_exam_questions (exam_id, item_number, question_text) VALUES (tst.id('mtexam'), 1, 'MQ1');
SELECT procurements.exam_review_submit('exam', tst.id('mtexam'));
SELECT procurements.sms_switch_active_role('qa');
SELECT tst.expect_error($$ SELECT procurements.exam_review_decide('exam', $$ || tst.id('mtexam') || $$, 'approve', NULL) $$, 'your own submission');
SELECT tst.expect_error($$ SELECT procurements.exam_review_start('exam', $$ || tst.id('mtexam') || $$) $$, 'your own submission');
RESET ROLE;

-- reopen rules
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_review_reopen('tos', $$ || tst.id('tos2') || $$, 'fix') $$, 'exam has been built');
SELECT procurements.exam_review_decide('exam', tst.id('mtexam'), 'approve', 'Good');
SELECT procurements.exam_review_reopen('exam', tst.id('mtexam'), 'Typo in item 1');
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exams WHERE id = $$ || tst.id('mtexam') || $$ AND review_status = 'draft' $$, 1);
-- grandfathered rows (approved by the backfill, no approve event) cannot be reopened
SELECT tst.expect_error(
  $$ SELECT procurements.exam_review_reopen('tos', (SELECT id FROM sms_tos WHERE school_id IS NULL AND id NOT IN ($$ || tst.id('tos1') || $$, $$ || tst.id('tos2') || $$) LIMIT 1), 'x') $$,
  'predates QA review');
-- private rows are not in the workflow
SELECT tst.expect_error($$ SELECT procurements.exam_review_start('tos', $$ || tst.id('ptos1') || $$) $$, 'Only Division');
RESET ROLE;

-- revocation freezes drafts but keeps approved work
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_qa_revoke($$ || tst.id('t1') || $$, '') $$, 'reason is required');
SELECT procurements.exam_qa_revoke(tst.id('t1'), 'Moved to another assignment');
RESET ROLE;
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by)
     VALUES ('Sci', 5, '2026-2027', 1, NULL, $$ || tst.id('t1') || $$) $$,
  'row-level security');
SELECT tst.expect_count($$ SELECT count(*) FROM sms_tos WHERE id = $$ || tst.id('tos2'), 1);
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_qa_authors WHERE user_id = $$ || tst.id('t1') || $$ AND NOT is_active $$, 1);
RESET ROLE;
-- re-authorize reactivates the same row
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_qa_authorize(tst.id('t1'));
SELECT tst.expect_count($$ SELECT count(*) FROM sms_exam_qa_authors WHERE user_id = $$ || tst.id('t1') || $$ AND is_active AND revoked_at IS NULL $$, 1);
RESET ROLE;
```


- [ ] **Step 2: Run to verify it fails**

Run: `psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql`
Expected: ERROR `function procurements.exam_qa_authorize(bigint) does not exist`.

- [ ] **Step 3: Append the workflow functions**

If Task 0 found **no** `public.adm_notifications`, keep `exam_review_notify` as written — it checks `to_regclass` and does nothing. If it exists and `user_id` is not BIGINT, change the `u.id` casts in `exam_review_notify` to that type.

```sql
-- ----------------------------------------------------------------------------
-- 9. Audit and authorization reads
-- ----------------------------------------------------------------------------
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
          WHERE a.id = entity_id AND a.user_id = procurements.exam_me_id())));

DROP POLICY IF EXISTS "sms_exam_qa_authors: select" ON procurements.sms_exam_qa_authors;
CREATE POLICY "sms_exam_qa_authors: select" ON procurements.sms_exam_qa_authors
  FOR SELECT TO authenticated
  USING (procurements.is_exam_qa() OR procurements.is_exam_oversight()
         OR user_id = procurements.exam_me_id());

-- ----------------------------------------------------------------------------
-- 10. Workflow. The only writers of review fields and of the audit table.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.exam_review_table(p_entity TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_entity = 'tos' THEN RETURN 'sms_tos'; END IF;
  IF p_entity = 'exam' THEN RETURN 'sms_exams'; END IF;
  RAISE EXCEPTION 'Unknown review item "%".', p_entity;
END;
$$;

-- Locks and returns the row; refuses anything that is not a division row.
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
    'SELECT review_status, created_by, school_id, %s FROM procurements.%I WHERE id = $1 FOR UPDATE',
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

CREATE OR REPLACE FUNCTION procurements.exam_review_notify(
  p_entity TEXT, p_id BIGINT, p_action TEXT, p_author BIGINT, p_comment TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_what TEXT := CASE p_entity WHEN 'tos' THEN 'Division TOS' ELSE 'Division exam' END;
BEGIN
  IF to_regclass('public.adm_notifications') IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    IF p_action = 'submit' THEN
      INSERT INTO public.adm_notifications
        (user_id, type, title, message, entity_type, entity_id, is_read)
      SELECT u.id, 'approval_request', v_what || ' submitted for review',
             'A ' || v_what || ' is waiting in the QA queue.',
             p_entity, p_id::TEXT, false
      FROM procurements.sms_users u
      WHERE u.is_active
        AND (u.type = 'qa' OR EXISTS (
          SELECT 1 FROM procurements.sms_user_roles r
          WHERE r.user_id = u.id AND r.role = 'qa'));
    ELSIF p_action IN ('approve', 'reject', 'reopen') AND p_author IS NOT NULL THEN
      INSERT INTO public.adm_notifications
        (user_id, type, title, message, entity_type, entity_id, is_read)
      VALUES (p_author,
        CASE p_action WHEN 'approve' THEN 'approval_approved'
                      WHEN 'reject'  THEN 'approval_rejected'
                      ELSE 'approval_returned' END,
        v_what || ' ' || CASE p_action WHEN 'approve' THEN 'approved'
                                      WHEN 'reject' THEN 'returned with comments'
                                      ELSE 'reopened for correction' END,
        COALESCE(p_comment, ''), p_entity, p_id::TEXT, false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Best-effort: a notification must never undo a decision.
    RAISE NOTICE 'exam_review_notify skipped: %', SQLERRM;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_review_transition(
  p_entity TEXT, p_id BIGINT, p_action TEXT,
  p_from TEXT, p_to TEXT, p_comment TEXT, p_author BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE v_me BIGINT := procurements.exam_me_id();
BEGIN
  PERFORM set_config('sms.exam_review', 'on', true);

  EXECUTE format($u$
    UPDATE procurements.%I SET
      review_status  = $2,
      submitted_at   = CASE WHEN $3 = 'submit' THEN NOW() ELSE submitted_at END,
      reviewed_by    = CASE WHEN $3 = 'submit' THEN NULL
                            WHEN $3 IN ('start_review', 'approve', 'reject', 'reopen') THEN $4
                            ELSE reviewed_by END,
      reviewed_at    = CASE WHEN $3 = 'submit' THEN NULL
                            WHEN $3 IN ('approve', 'reject', 'reopen') THEN NOW()
                            ELSE reviewed_at END,
      review_comment = CASE WHEN $3 = 'submit' THEN NULL
                            WHEN $3 IN ('approve', 'reject', 'reopen') THEN $5
                            ELSE review_comment END,
      updated_at     = NOW()
    WHERE id = $1 $u$, procurements.exam_review_table(p_entity))
  USING p_id, p_to, p_action, v_me, p_comment;

  INSERT INTO procurements.sms_exam_review_events
    (entity_type, entity_id, actor_id, action, from_status, to_status, comment)
  VALUES (p_entity, p_id, v_me, p_action, p_from, p_to, p_comment);

  PERFORM set_config('sms.exam_review', 'off', true);
  PERFORM procurements.exam_review_notify(p_entity, p_id, p_action, p_author, p_comment);
END;
$$;

REVOKE EXECUTE ON FUNCTION procurements.exam_review_table(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION procurements.exam_review_load(TEXT, BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION procurements.exam_review_notify(TEXT, BIGINT, TEXT, BIGINT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION procurements.exam_review_transition(TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC;

-- --- authorization ----------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.exam_qa_authorize(p_user_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  v_id   BIGINT;
  v_prev BOOLEAN;
BEGIN
  IF NOT procurements.is_exam_qa() THEN
    RAISE EXCEPTION 'Only a QA reviewer may authorize teachers.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM procurements.sms_users u
    WHERE u.id = p_user_id AND u.is_active
      AND (u.type IN ('teacher', 'volunteer_teacher') OR EXISTS (
        SELECT 1 FROM procurements.sms_user_roles r
        WHERE r.user_id = u.id AND r.role IN ('teacher', 'volunteer_teacher')))) THEN
    RAISE EXCEPTION 'Only an active teacher can be authorized to write Division TOS.';
  END IF;

  SELECT a.id, a.is_active INTO v_id, v_prev
  FROM procurements.sms_exam_qa_authors a WHERE a.user_id = p_user_id FOR UPDATE;

  IF v_prev THEN
    RAISE EXCEPTION 'That teacher is already authorized.';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO procurements.sms_exam_qa_authors (user_id, authorized_by)
    VALUES (p_user_id, procurements.exam_me_id())
    RETURNING id INTO v_id;
  ELSE
    UPDATE procurements.sms_exam_qa_authors
       SET is_active = true, authorized_by = procurements.exam_me_id(),
           authorized_at = NOW(), revoked_by = NULL, revoked_at = NULL,
           revoke_reason = NULL, updated_at = NOW()
     WHERE id = v_id;
  END IF;

  INSERT INTO procurements.sms_exam_review_events
    (entity_type, entity_id, actor_id, action, from_status, to_status)
  VALUES ('author', v_id, procurements.exam_me_id(), 'authorize',
          CASE WHEN v_prev IS NULL THEN NULL ELSE 'revoked' END, 'active');
END;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_qa_revoke(p_user_id BIGINT, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE v_id BIGINT;
BEGIN
  IF NOT procurements.is_exam_qa() THEN
    RAISE EXCEPTION 'Only a QA reviewer may revoke an authorization.';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to revoke an authorization.';
  END IF;

  UPDATE procurements.sms_exam_qa_authors
     SET is_active = false, revoked_by = procurements.exam_me_id(),
         revoked_at = NOW(), revoke_reason = btrim(p_reason), updated_at = NOW()
   WHERE user_id = p_user_id AND is_active
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'That teacher is not currently authorized.';
  END IF;

  INSERT INTO procurements.sms_exam_review_events
    (entity_type, entity_id, actor_id, action, from_status, to_status, comment)
  VALUES ('author', v_id, procurements.exam_me_id(), 'revoke', 'active', 'revoked', btrim(p_reason));
END;
$$;

-- --- review -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.exam_review_submit(p_entity TEXT, p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM procurements.exam_review_load(p_entity, p_id);

  IF r.o_created_by IS DISTINCT FROM procurements.exam_me_id() THEN
    RAISE EXCEPTION 'Only the author can submit this for review.';
  END IF;
  IF NOT procurements.is_division_author() THEN
    RAISE EXCEPTION 'You are not currently authorized to write Division TOS or exams.';
  END IF;
  IF r.o_status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Only a draft or returned item can be submitted (this one is %).', r.o_status;
  END IF;

  IF p_entity = 'tos' THEN
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_tos_competencies c WHERE c.tos_id = p_id) THEN
      RAISE EXCEPTION 'Add at least one competency before submitting.';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_tos t
                   WHERE t.id = r.o_tos_id AND t.school_id IS NULL
                     AND t.review_status = 'approved') THEN
      RAISE EXCEPTION 'This exam''s TOS is not an approved Division TOS.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM procurements.sms_exam_questions q WHERE q.exam_id = p_id) THEN
      RAISE EXCEPTION 'Add at least one question before submitting.';
    END IF;
  END IF;

  PERFORM procurements.exam_review_transition(
    p_entity, p_id, 'submit', r.o_status, 'submitted', NULL, r.o_created_by);
END;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_review_withdraw(p_entity TEXT, p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM procurements.exam_review_load(p_entity, p_id);
  IF r.o_created_by IS DISTINCT FROM procurements.exam_me_id() THEN
    RAISE EXCEPTION 'Only the author can withdraw this.';
  END IF;
  IF r.o_status <> 'submitted' THEN
    RAISE EXCEPTION 'Only a submitted item that QA has not started reviewing can be withdrawn.';
  END IF;
  PERFORM procurements.exam_review_transition(
    p_entity, p_id, 'withdraw', r.o_status, 'draft', NULL, r.o_created_by);
END;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_review_start(p_entity TEXT, p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE r RECORD;
BEGIN
  IF NOT procurements.is_exam_qa() THEN
    RAISE EXCEPTION 'Only a QA reviewer may review Division TOS and exams.';
  END IF;
  SELECT * INTO r FROM procurements.exam_review_load(p_entity, p_id);
  IF r.o_created_by = procurements.exam_me_id() THEN
    RAISE EXCEPTION 'You cannot review your own submission.';
  END IF;
  IF r.o_status <> 'submitted' THEN
    RAISE EXCEPTION 'Only a submitted item can be taken for review (this one is %).', r.o_status;
  END IF;
  PERFORM procurements.exam_review_transition(
    p_entity, p_id, 'start_review', r.o_status, 'under_review', NULL, r.o_created_by);
END;
$$;

CREATE OR REPLACE FUNCTION procurements.exam_review_decide(
  p_entity TEXT, p_id BIGINT, p_decision TEXT, p_comment TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
DECLARE
  r RECORD;
  v_comment TEXT := NULLIF(btrim(p_comment), '');
BEGIN
  IF NOT procurements.is_exam_qa() THEN
    RAISE EXCEPTION 'Only a QA reviewer may review Division TOS and exams.';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Decision must be approve or reject.';
  END IF;
  SELECT * INTO r FROM procurements.exam_review_load(p_entity, p_id);
  IF r.o_created_by = procurements.exam_me_id() THEN
    RAISE EXCEPTION 'You cannot review your own submission.';
  END IF;
  IF r.o_status NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'Only a submitted item can be decided (this one is %).', r.o_status;
  END IF;
  IF p_decision = 'reject' AND v_comment IS NULL THEN
    RAISE EXCEPTION 'A reason is required to return an item.';
  END IF;
  IF p_entity = 'exam' AND p_decision = 'approve' AND NOT EXISTS (
       SELECT 1 FROM procurements.sms_tos t
       WHERE t.id = r.o_tos_id AND t.school_id IS NULL AND t.review_status = 'approved') THEN
    RAISE EXCEPTION 'This exam does not reference an approved Division TOS.';
  END IF;

  PERFORM procurements.exam_review_transition(
    p_entity, p_id, p_decision, r.o_status,
    CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
    v_comment, r.o_created_by);
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

  PERFORM procurements.exam_review_transition(
    p_entity, p_id, 'reopen', r.o_status, 'draft', v_comment, r.o_created_by);
END;
$$;

GRANT EXECUTE ON FUNCTION
  procurements.exam_qa_authorize(BIGINT),
  procurements.exam_qa_revoke(BIGINT, TEXT),
  procurements.exam_review_submit(TEXT, BIGINT),
  procurements.exam_review_withdraw(TEXT, BIGINT),
  procurements.exam_review_start(TEXT, BIGINT),
  procurements.exam_review_decide(TEXT, BIGINT, TEXT, TEXT),
  procurements.exam_review_reopen(TEXT, BIGINT, TEXT)
  TO authenticated, service_role;
```

- [ ] **Step 4: Apply and run**

```bash
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/migrations/194_division_exam_qa_review.sql
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql
```
Expected: all `ok`, `ROLLBACK`. If the "grandfathered" reopen assertion errors with `That item does not exist` the clone has no other division TOS — replace that assertion with a fixture: insert a division TOS as postgres with the flag on and `review_status = 'approved'` and no event, then reopen it.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/194_division_exam_qa_review.sql supabase/tests/194_exam_qa_review.sql
git commit -m "feat(exams-qa): QA workflow functions, audit trail and authorization (194, part 4)"
```

---

### Task 5: TypeScript domain — constants, RPC wrappers, visibility filter, role

**Files:**
- Create: `lib/constants/examReview.ts`, `lib/utils/examReview.ts`, `lib/utils/__tests__/examReview.test.ts`
- Modify: `lib/utils/examVisibility.ts`, `lib/utils/__tests__/examVisibility.test.ts`, `lib/constants/userTypes.ts`, `types/database.ts`

**Interfaces:**
- Produces:
  - `type ReviewStatus = "draft" | "submitted" | "under_review" | "approved" | "rejected"`; `type ReviewEntity = "tos" | "exam"`; `type ReviewAction = "authorize" | "revoke" | "submit" | "withdraw" | "start_review" | "approve" | "reject" | "reopen"`
  - `REVIEW_STATUS_LABEL`, `REVIEW_STATUS_BADGE_CLASS`, `REVIEW_ACTION_LABEL`, `EDITABLE_REVIEW_STATUSES`, `QA_UNAUTHORIZED_MESSAGE`
  - `canEditReviewRow(row: ReviewRow, reader: { userId: string | number | null; isAuthorizedAuthor: boolean }): boolean`
  - `availableAuthorActions(row: ReviewRow, userId, isAuthorizedAuthor): ("submit" | "withdraw")[]`
  - `tosConformance(input: { tosItems: { id: string|number; competency_id: string|number; cognitive_level: string }[]; competencies: { id: string|number; competency_text: string }[]; questions: { tos_item_id: string|number|null; item_count: number }[] }): ConformanceRow[]` where `ConformanceRow = { competencyId: string; competency: string; planned: number; covered: number }`
  - RPC wrappers returning `Promise<{ error: string | null }>`: `submitForReview`, `withdrawFromReview`, `startReview`, `decideReview`, `reopenReview`, `authorizeTeacher`, `revokeTeacher`
  - `Tos` / `Exam` gain `review_status?: ReviewStatus | null; submitted_at?: string | null; reviewed_by?: string | null; reviewed_at?: string | null; review_comment?: string | null`; new `ExamReviewEvent`, `ExamQaAuthor`.

- [ ] **Step 1: Write the failing tests**

`lib/utils/__tests__/examReview.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  availableAuthorActions,
  canEditReviewRow,
  tosConformance,
} from "@/lib/utils/examReview";

const mine = { created_by: "7", school_id: null };

describe("canEditReviewRow", () => {
  it("lets an authorized author edit a draft or a returned item", () => {
    for (const s of ["draft", "rejected"] as const) {
      expect(
        canEditReviewRow({ ...mine, review_status: s }, { userId: 7, isAuthorizedAuthor: true }),
      ).toBe(true);
    }
  });

  it("freezes submitted, under review and approved items, even for the author", () => {
    for (const s of ["submitted", "under_review", "approved"] as const) {
      expect(
        canEditReviewRow({ ...mine, review_status: s }, { userId: 7, isAuthorizedAuthor: true }),
      ).toBe(false);
    }
  });

  it("refuses a revoked author and anyone who is not the author", () => {
    expect(
      canEditReviewRow({ ...mine, review_status: "draft" }, { userId: 7, isAuthorizedAuthor: false }),
    ).toBe(false);
    expect(
      canEditReviewRow({ ...mine, review_status: "draft" }, { userId: 8, isAuthorizedAuthor: true }),
    ).toBe(false);
  });
});

describe("availableAuthorActions", () => {
  it("offers submit on draft/rejected and withdraw only while submitted", () => {
    expect(availableAuthorActions({ ...mine, review_status: "draft" }, 7, true)).toEqual(["submit"]);
    expect(availableAuthorActions({ ...mine, review_status: "rejected" }, 7, true)).toEqual(["submit"]);
    expect(availableAuthorActions({ ...mine, review_status: "submitted" }, 7, true)).toEqual(["withdraw"]);
    expect(availableAuthorActions({ ...mine, review_status: "under_review" }, 7, true)).toEqual([]);
    expect(availableAuthorActions({ ...mine, review_status: "draft" }, 7, false)).toEqual([]);
  });
});

describe("tosConformance", () => {
  it("counts planned TOS items and question coverage per competency", () => {
    const rows = tosConformance({
      competencies: [
        { id: 1, competency_text: "Fractions" },
        { id: 2, competency_text: "Decimals" },
      ],
      tosItems: [
        { id: 10, competency_id: 1, cognitive_level: "remembering" },
        { id: 11, competency_id: 1, cognitive_level: "applying" },
        { id: 12, competency_id: 2, cognitive_level: "remembering" },
      ],
      questions: [
        { tos_item_id: 10, item_count: 1 },
        { tos_item_id: 11, item_count: 1 },
        { tos_item_id: 11, item_count: 1 },
        { tos_item_id: null, item_count: 3 },
      ],
    });
    expect(rows).toEqual([
      { competencyId: "1", competency: "Fractions", planned: 2, covered: 3 },
      { competencyId: "2", competency: "Decimals", planned: 1, covered: 0 },
      { competencyId: "unplaced", competency: "Not linked to a TOS item", planned: 0, covered: 3 },
    ]);
  });
});
```

Update `lib/utils/__tests__/examVisibility.test.ts` — replace the `visibleTierFilter` describe block with:

```ts
describe("visibleTierFilter", () => {
  it("admits approved division rows, the school's shared rows, and my own school-level rows", () => {
    // A division row I authored is NOT admitted by authorship: my drafts live
    // on the Division pages, and the personal lists must only ever show what
    // QA has approved (migration 194).
    expect(visibleTierFilter("7", "2")).toBe(
      "and(school_id.is.null,review_status.eq.approved),and(school_id.eq.2,is_school_shared.is.true),and(school_id.not.is.null,created_by.eq.7)",
    );
  });

  it("omits the school clause when the reader has no school", () => {
    expect(visibleTierFilter("7", null)).toBe(
      "and(school_id.is.null,review_status.eq.approved),and(school_id.not.is.null,created_by.eq.7)",
    );
  });

  it("drops the shared half for the super admin, so the school's private rows show", () => {
    expect(visibleTierFilter("7", "2", "super admin")).toBe(
      "and(school_id.is.null,review_status.eq.approved),school_id.eq.2,and(school_id.not.is.null,created_by.eq.7)",
    );
    expect(visibleTierFilter("7", "2", "teacher")).toBe(visibleTierFilter("7", "2"));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/utils/__tests__/examReview.test.ts lib/utils/__tests__/examVisibility.test.ts`
Expected: FAIL — `Cannot find module '@/lib/utils/examReview'` and the old filter string mismatches.

- [ ] **Step 3: Implement**

`lib/constants/examReview.ts`:

```ts
/**
 * QA review of Division TOS and exams (migration 194).
 *
 * The SQL is the enforcement — `exam_review_*` in 194 decide every transition.
 * This file mirrors its vocabulary for the screens, the way `classRecord.ts`
 * mirrors 173. Keep the two in step.
 */

export const REVIEW_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type ReviewEntity = "tos" | "exam";

export type ReviewAction =
  | "authorize"
  | "revoke"
  | "submit"
  | "withdraw"
  | "start_review"
  | "approve"
  | "reject"
  | "reopen";

/** An author may edit only while the item is a draft or has been returned. */
export const EDITABLE_REVIEW_STATUSES: readonly ReviewStatus[] = ["draft", "rejected"];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Returned",
};

export const REVIEW_STATUS_BADGE_CLASS: Record<ReviewStatus, string> = {
  draft: "bg-gray-100 text-gray-800",
  submitted: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export const REVIEW_ACTION_LABEL: Record<ReviewAction, string> = {
  authorize: "Authorized",
  revoke: "Authorization revoked",
  submit: "Submitted for review",
  withdraw: "Withdrawn",
  start_review: "Review started",
  approve: "Approved",
  reject: "Returned",
  reopen: "Reopened for correction",
};

export const QA_UNAUTHORIZED_MESSAGE =
  "You are not currently authorized to create Division TOS. Please contact the Division QA administrator.";
```

`lib/utils/examReview.ts`:

```ts
import {
  EDITABLE_REVIEW_STATUSES,
  type ReviewEntity,
  type ReviewStatus,
} from "@/lib/constants/examReview";
import { supabase } from "@/lib/supabase/client";

export interface ReviewRow {
  created_by?: string | number | null;
  school_id?: string | number | null;
  review_status?: ReviewStatus | null;
}

interface AuthorReader {
  userId: string | number | null;
  isAuthorizedAuthor: boolean;
}

function isAuthor(row: ReviewRow, userId: string | number | null): boolean {
  return userId != null && row.created_by != null && String(row.created_by) === String(userId);
}

/** Mirrors `can_edit_tos` / `can_edit_exam` (194) for a division row. */
export function canEditReviewRow(row: ReviewRow, reader: AuthorReader): boolean {
  return (
    reader.isAuthorizedAuthor &&
    isAuthor(row, reader.userId) &&
    row.review_status != null &&
    EDITABLE_REVIEW_STATUSES.includes(row.review_status)
  );
}

export function availableAuthorActions(
  row: ReviewRow,
  userId: string | number | null,
  isAuthorizedAuthor: boolean,
): ("submit" | "withdraw")[] {
  if (!isAuthor(row, userId)) return [];
  if (row.review_status === "submitted") return ["withdraw"];
  if (isAuthorizedAuthor && (row.review_status === "draft" || row.review_status === "rejected"))
    return ["submit"];
  return [];
}

export interface ConformanceRow {
  competencyId: string;
  competency: string;
  planned: number;
  covered: number;
}

interface ConformanceInput {
  competencies: { id: string | number; competency_text: string }[];
  tosItems: { id: string | number; competency_id: string | number; cognitive_level: string }[];
  questions: { tos_item_id: string | number | null; item_count: number }[];
}

/**
 * How the exam's questions land on the TOS, per competency. Reported to QA,
 * never enforced: a mismatch can be deliberate (an essay covering several
 * items). A question with no TOS item is shown as its own row.
 */
export function tosConformance(input: ConformanceInput): ConformanceRow[] {
  const itemToCompetency = new Map(
    input.tosItems.map((i) => [String(i.id), String(i.competency_id)]),
  );
  const rows = input.competencies.map((c) => ({
    competencyId: String(c.id),
    competency: c.competency_text,
    planned: input.tosItems.filter((i) => String(i.competency_id) === String(c.id)).length,
    covered: 0,
  }));
  const byId = new Map(rows.map((r) => [r.competencyId, r]));
  let unplaced = 0;
  for (const q of input.questions) {
    const comp = q.tos_item_id == null ? undefined : itemToCompetency.get(String(q.tos_item_id));
    const row = comp ? byId.get(comp) : undefined;
    if (row) row.covered += q.item_count;
    else unplaced += q.item_count;
  }
  if (unplaced > 0)
    rows.push({
      competencyId: "unplaced",
      competency: "Not linked to a TOS item",
      planned: 0,
      covered: unplaced,
    });
  return rows;
}

async function call(fn: string, args: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc(fn, args);
  return { error: error ? error.message : null };
}

export const submitForReview = (entity: ReviewEntity, id: string | number) =>
  call("exam_review_submit", { p_entity: entity, p_id: Number(id) });
export const withdrawFromReview = (entity: ReviewEntity, id: string | number) =>
  call("exam_review_withdraw", { p_entity: entity, p_id: Number(id) });
export const startReview = (entity: ReviewEntity, id: string | number) =>
  call("exam_review_start", { p_entity: entity, p_id: Number(id) });
export const decideReview = (
  entity: ReviewEntity,
  id: string | number,
  decision: "approve" | "reject",
  comment: string,
) =>
  call("exam_review_decide", {
    p_entity: entity,
    p_id: Number(id),
    p_decision: decision,
    p_comment: comment,
  });
export const reopenReview = (entity: ReviewEntity, id: string | number, comment: string) =>
  call("exam_review_reopen", { p_entity: entity, p_id: Number(id), p_comment: comment });
export const authorizeTeacher = (userId: string | number) =>
  call("exam_qa_authorize", { p_user_id: Number(userId) });
export const revokeTeacher = (userId: string | number, reason: string) =>
  call("exam_qa_revoke", { p_user_id: Number(userId), p_reason: reason });
```

`lib/utils/examVisibility.ts` — replace the body of `visibleTierFilter` and its doc paragraph's first line:

```ts
/**
 * The PostgREST `.or()` filter for what a teacher-side list may show:
 * APPROVED division rows (194), this school's shared rows, and the reader's
 * own school-level rows. A division row the reader authored is not admitted by
 * authorship — drafts live on the Division pages, and RLS would return them
 * here otherwise.
 * (keep the remaining paragraphs of the existing comment unchanged)
 */
export function visibleTierFilter(
  userId: string | number | null,
  schoolId: string | number | null,
  readerType?: string | null,
): string {
  const clauses = ["and(school_id.is.null,review_status.eq.approved)"];
  if (schoolId != null) {
    clauses.push(
      seesEveryRowAtSchool(readerType)
        ? `school_id.eq.${schoolId}`
        : `and(school_id.eq.${schoolId},is_school_shared.is.true)`,
    );
  }
  if (userId != null) clauses.push(`and(school_id.not.is.null,created_by.eq.${userId})`);
  return clauses.join(",");
}
```

`lib/constants/userTypes.ts`:
- Add `qa: "QA Reviewer",` to `USER_TYPE_LABELS`.
- Change `DIVISION_ASSIGNABLE_USER_TYPES` to `["division_type", "qa", ...SCHOOL_STAFF_USER_TYPES] as const`.
- Replace `SWITCHABLE_USER_TYPES` and `SCHOOL_HEAD_ASSIGNABLE_USER_TYPES`:

```ts
/**
 * … (existing comment) …
 *
 * `qa` (migration 194) is the one division role that may be held as an extra
 * hat: a master teacher on the division's QA panel holds it at their school and
 * switches into it. It is never a school head's to hand out.
 */
export const SWITCHABLE_USER_TYPES: readonly string[] = [
  ...SCHOOL_STAFF_USER_TYPES.filter(
    (type) => !(LOGIN_DISABLED_USER_TYPES as readonly string[]).includes(type),
  ),
  "qa",
];

export function canSwitchToRole(type?: string | null): boolean {
  if (!type) return false;
  return SWITCHABLE_USER_TYPES.includes(type);
}

export const SCHOOL_HEAD_ASSIGNABLE_USER_TYPES = SWITCHABLE_USER_TYPES.filter(
  (type) => type !== "school_head" && type !== "assistant_school_head" && type !== "qa",
);
```

Run `npx tsc --noEmit -p .` after this edit; any consumer typed against `SchoolStaffUserType[]` from these two constants needs `as string` widening at the call site — fix each one the compiler names, nothing else.

- Add `export function isQaRole(type?: string | null): boolean { return type === "qa"; }`.

`types/database.ts` — add to both `Tos` and `Exam`:

```ts
  // Migration 194: QA review of division rows. NULL on private / school-wide
  // rows; set on every division row.
  review_status?: ReviewStatus | null;
  submitted_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_comment?: string | null;
```

with `import type { ReviewStatus, ReviewAction } from "@/lib/constants/examReview";` at the top, and append:

```ts
export interface ExamReviewEvent {
  id: string;
  entity_type: "tos" | "exam" | "author";
  entity_id: string;
  actor_id: string | null;
  action: ReviewAction;
  from_status: string | null;
  to_status: string | null;
  comment: string | null;
  created_at: string;
}

export interface ExamQaAuthor {
  id: string;
  user_id: string;
  is_active: boolean;
  authorized_by: string | null;
  authorized_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}
```

Check `types/index.ts` re-exports `database.ts` (`export * from "./database"`); if not, add the two names.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run lib/utils/__tests__ && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/constants/examReview.ts lib/utils/examReview.ts lib/utils/__tests__/examReview.test.ts lib/utils/examVisibility.ts lib/utils/__tests__/examVisibility.test.ts lib/constants/userTypes.ts types/database.ts
git commit -m "feat(exams-qa): review constants, RPC wrappers, approved-only division filter, qa role"
```

---

### Task 6: Accounts and navigation — QA can sign in and find their area

**Files:**
- Modify: `components/SchoolIdGuard.tsx`, `app/(protected)/division/users/AddModal.tsx:73`, `components/AppSidebar.tsx`
- Create: `components/QaGuard.tsx`, `app/(protected)/qa/layout.tsx`

**Interfaces:**
- Consumes: `isQaRole` (Task 5).
- Produces: `<QaGuard>` (renders children for `qa` / `super admin`, else redirects `/home`); `/qa` route segment.

- [ ] **Step 1: SchoolIdGuard admits `qa`**

In `components/SchoolIdGuard.tsx`, change the division check to:

```tsx
  // division_admin, division_type, super admin and the QA reviewer (194)
  // operate above school level
  if (
    user.type === "division_admin" ||
    user.type === "division_type" ||
    user.type === "super admin" ||
    user.type === "qa"
  ) {
```

- [ ] **Step 2: A QA account needs no school**

`app/(protected)/division/users/AddModal.tsx` line 73:

```ts
const DIVISION_TYPES = ["division_type", "qa"] as const;
```

- [ ] **Step 3: QaGuard and layout**

`components/QaGuard.tsx`:

```tsx
"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** The QA area (194). The database refuses every QA action to anyone else;
 *  this only keeps the screens honest. */
export function QaGuard({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.user.user);
  const router = useRouter();
  const isAllowed = user?.type === "qa" || user?.type === "super admin";

  useEffect(() => {
    if (user && !isAllowed) router.replace("/home");
  }, [user, isAllowed, router]);

  if (!user || !isAllowed) return null;
  return <>{children}</>;
}
```

`app/(protected)/qa/layout.tsx`:

```tsx
"use client";

import { QaGuard } from "@/components/QaGuard";

export default function QaLayout({ children }: { children: React.ReactNode }) {
  return <QaGuard>{children}</QaGuard>;
}
```

- [ ] **Step 4: Sidebar group**

In `components/AppSidebar.tsx`:
- after `const isSupportRole = …` add `const isQa = isQaRole(userType);` (import from `@/lib/constants/userTypes`) and `import { ClipboardCheck } from "lucide-react";` alongside the existing lucide imports.
- change `showTeacherMenu` to add `!isQa &&`.
- after `divisionOfficeMenuItems` add:

```tsx
  const qaMenuItems: ModuleItem[] = [
    { title: "QA Dashboard", url: "/qa", icon: ClipboardCheck, moduleName: "qa_dashboard" },
    { title: "Authorized Teachers", url: "/qa/authors", icon: Users, moduleName: "qa_authors" },
  ];
  const showQaMenu = isQa || isSuperAdmin;
```

- render a group for `showQaMenu`, copying the JSX of the existing division-office group (find it with `grep -n "divisionOfficeMenuItems.map" components/AppSidebar.tsx`), substituting `qaMenuItems` and the label `"Quality Assurance"`. Use `getIsActive(item.url, qaMenuItems.map((i) => i.url))` so `/qa` is not active on `/qa/authors`.

- [ ] **Step 5: Role switcher check**

Run: `grep -n "canSwitchToRole\|SWITCHABLE" components/RoleSwitcher.tsx`. The switcher reads `sms_user_roles` at the active school and filters with `canSwitchToRole`; with `qa` now switchable, a master teacher holding `(qa, their school)` sees it. No code change unless the switcher hard-codes a list — if it does, replace that list with `canSwitchToRole`.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: clean. Manual on local (`npm run dev`, `.env.development.local` present): as super admin create a user of type QA Reviewer with no school at `/division/users`; sign in as them via the local Supabase Studio magic link or the project's normal local login; the sidebar shows **Quality Assurance** and no Teacher Menu; `/qa` renders (empty page until Task 10).

- [ ] **Step 7: Commit**

```bash
git add components/SchoolIdGuard.tsx components/QaGuard.tsx components/AppSidebar.tsx "app/(protected)/qa/layout.tsx" "app/(protected)/division/users/AddModal.tsx" components/RoleSwitcher.tsx
git commit -m "feat(exams-qa): QA accounts sign in without a school and get their own menu"
```

---

### Task 7: Shared review components; review-aware TosList / ExamList

**Files:**
- Create: `hooks/useDivisionAuthorStatus.ts`, `components/examinations/review/ReviewStatusBadge.tsx`, `components/examinations/review/ReviewHistory.tsx`, `components/examinations/review/DivisionReviewActions.tsx`
- Modify: `components/examinations/TosList.tsx`, `components/examinations/ExamList.tsx`

**Interfaces:**
- Consumes: Task 5 constants/utils.
- Produces:
  - `useDivisionAuthorStatus(): { loading: boolean; isAuthorized: boolean }`
  - `<ReviewStatusBadge status={ReviewStatus | null | undefined} />`
  - `<ReviewHistory entity={"tos" | "exam"} id={string | number} refreshKey?={number} />`
  - `<DivisionReviewActions entity row userId isAuthorizedAuthor onChanged={() => void} onCreateExam?={(tosId: string) => void} />` — renders `DropdownMenuItem`s
  - `TosList` / `ExamList` props gain `isAuthorizedAuthor?: boolean` and `renderReviewActions?: (item) => React.ReactNode`. In `mode="division"`: status badge shown; Edit/Delete only when `canEditReviewRow`.

- [ ] **Step 1: Hook**

`hooks/useDivisionAuthorStatus.ts`:

```ts
"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { isTeacherRole } from "@/lib/constants/userTypes";
import { useEffect, useState } from "react";

/**
 * Whether the signed-in user is a QA-authorized Division author right now
 * (194's `is_division_author()`): a teacher role AND an active
 * sms_exam_qa_authors row. The database decides; this only shapes the screen.
 */
export function useDivisionAuthorStatus() {
  const user = useAppSelector((state) => state.user.user);
  const [state, setState] = useState({ loading: true, isAuthorized: false });

  useEffect(() => {
    let isMounted = true;
    if (!user?.id || !isTeacherRole(user.type)) {
      setState({ loading: false, isAuthorized: false });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("sms_exam_qa_authors")
        .select("id")
        .eq("user_id", Number(user.id))
        .eq("is_active", true)
        .maybeSingle();
      if (isMounted) setState({ loading: false, isAuthorized: !!data });
    })();
    return () => {
      isMounted = false;
    };
  }, [user?.id, user?.type]);

  return state;
}
```

- [ ] **Step 2: Badge and history**

`components/examinations/review/ReviewStatusBadge.tsx`:

```tsx
import {
  REVIEW_STATUS_BADGE_CLASS,
  REVIEW_STATUS_LABEL,
  type ReviewStatus,
} from "@/lib/constants/examReview";

export function ReviewStatusBadge({ status }: { status?: ReviewStatus | null }) {
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${REVIEW_STATUS_BADGE_CLASS[status]}`}
    >
      {REVIEW_STATUS_LABEL[status]}
    </span>
  );
}
```

`components/examinations/review/ReviewHistory.tsx`:

```tsx
"use client";

import { REVIEW_ACTION_LABEL } from "@/lib/constants/examReview";
import { supabase } from "@/lib/supabase/client";
import type { ExamReviewEvent } from "@/types";
import { format } from "date-fns";
import { useEffect, useState } from "react";

interface Row extends ExamReviewEvent {
  actor: { name: string | null } | null;
}

/** The audit trail of one TOS, exam or authorization, oldest first. */
export function ReviewHistory({
  entity,
  id,
  refreshKey = 0,
}: {
  entity: "tos" | "exam" | "author";
  id: string | number;
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("sms_exam_review_events")
        .select("*, actor:actor_id(name)")
        .eq("entity_type", entity)
        .eq("entity_id", Number(id))
        .order("created_at", { ascending: true });
      if (!isMounted) return;
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [entity, id, refreshKey]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading history…</p>;
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">No review activity yet.</p>;

  return (
    <ol className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} className="border-l-2 border-muted pl-3">
          <div className="text-sm font-medium">
            {REVIEW_ACTION_LABEL[r.action]}
            <span className="ml-2 font-normal text-muted-foreground">
              {r.actor?.name ?? "—"} · {format(new Date(r.created_at), "MMM d, yyyy h:mm a")}
            </span>
          </div>
          {r.comment && <p className="mt-0.5 text-sm text-muted-foreground">{r.comment}</p>}
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 3: Teacher actions**

`components/examinations/review/DivisionReviewActions.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { ReviewEntity } from "@/lib/constants/examReview";
import {
  availableAuthorActions,
  submitForReview,
  withdrawFromReview,
  type ReviewRow,
} from "@/lib/utils/examReview";
import { FilePlus2, History, Send, Undo2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { ReviewHistory } from "./ReviewHistory";

interface Props {
  entity: ReviewEntity;
  row: ReviewRow & { id: string };
  userId: string | number | null;
  isAuthorizedAuthor: boolean;
  onChanged: () => void;
  /** TOS only: shown on an approved TOS for an authorized author. */
  onCreateExam?: (tosId: string) => void;
}

export function DivisionReviewActions({
  entity,
  row,
  userId,
  isAuthorizedAuthor,
  onChanged,
  onCreateExam,
}: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const actions = availableAuthorActions(row, userId, isAuthorizedAuthor);

  const run = async (fn: () => Promise<{ error: string | null }>, ok: string) => {
    if (busy) return;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return toast.error(error);
    toast.success(ok);
    onChanged();
  };

  return (
    <>
      {actions.includes("submit") && (
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => run(() => submitForReview(entity, row.id), "Submitted to QA")}
        >
          <Send className="mr-2 h-4 w-4" />
          Submit to QA
        </DropdownMenuItem>
      )}
      {actions.includes("withdraw") && (
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => run(() => withdrawFromReview(entity, row.id), "Withdrawn")}
        >
          <Undo2 className="mr-2 h-4 w-4" />
          Withdraw
        </DropdownMenuItem>
      )}
      {entity === "tos" && onCreateExam && isAuthorizedAuthor && row.review_status === "approved" && (
        <DropdownMenuItem className="cursor-pointer" onClick={() => onCreateExam(row.id)}>
          <FilePlus2 className="mr-2 h-4 w-4" />
          Create Examination
        </DropdownMenuItem>
      )}
      <DropdownMenuItem className="cursor-pointer" onClick={() => setHistoryOpen(true)}>
        <History className="mr-2 h-4 w-4" />
        Review history
      </DropdownMenuItem>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review history</DialogTitle>
          </DialogHeader>
          <ReviewHistory entity={entity} id={row.id} />
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

(Check `components/ui/dialog.tsx` exports these names: `grep -n "^export" components/ui/dialog.tsx`; adjust imports to what exists.)

- [ ] **Step 4: TosList review mode**

In `components/examinations/TosList.tsx`:
- extend props:

```tsx
interface TosListProps {
  mode: "division" | "teacher";
  userId: string | number | null;
  schoolId: number | null;
  /** Division mode (194): may this reader edit their own draft / returned rows. */
  isAuthorizedAuthor?: boolean;
  /** Division mode: extra dropdown items per row (submit, history, …). */
  renderReviewActions?: (item: Tos) => React.ReactNode;
}
```

- replace `canEdit`:

```tsx
  // Division rows are edited only by their QA-authorized author while a draft
  // or returned (194 enforces this; the division office no longer authors).
  // School-side is unchanged: the author, plus the school head on a
  // school-wide row (160/161).
  const canEdit = (item: Tos) =>
    mode === "division"
      ? canEditReviewRow(item, { userId, isAuthorizedAuthor: !!isAuthorizedAuthor })
      : canManageTieredRow(item, { userId, schoolId, type: userType });
```

- in the Title cell, after the teacher-mode tier badge, add `{mode === "division" && <div className="mt-0.5"><ReviewStatusBadge status={item.review_status} /></div>}` and, when `item.review_status === "rejected" && item.review_comment`, `<p className="mt-0.5 text-xs text-red-700">QA: {item.review_comment}</p>`.
- inside `<DropdownMenuContent>`, after the View item, add `{renderReviewActions?.(item)}`.
- update the file header comment's division bullet to: `division mode: status badge; a row is editable only by its QA-authorized author while draft/returned (194).`
- imports: `canEditReviewRow` from `@/lib/utils/examReview`, `ReviewStatusBadge` from `./review/ReviewStatusBadge`.

- [ ] **Step 5: ExamList review mode**

Apply the same four changes to `components/examinations/ExamList.tsx` (its row type is `ExamRow`, its `canEdit` is at line 83, its tier badge at line 185, its dropdown content contains the "View" and workspace `Link` items at lines 237-251 — insert `{renderReviewActions?.(item)}` after the workspace link item):

```tsx
interface ExamListProps {
  mode: "division" | "teacher";
  userId: string | number | null;
  schoolId: number | null;
  isAuthorizedAuthor?: boolean;
  renderReviewActions?: (item: ExamRow) => React.ReactNode;
}
```

```tsx
  const canEdit = (item: ExamRow) =>
    mode === "division"
      ? canEditReviewRow(item, { userId, isAuthorizedAuthor: !!isAuthorizedAuthor })
      : canManageTieredRow(item, { userId, schoolId, type: userType });
```

(`ExamRow` must carry `review_status`, `review_comment`, `created_by`, `school_id` — the page's `select("*, tos:…")` already returns them; add the fields to the `ExamRow` type if it is declared narrowly.)

Also check the workspace link: `grep -n "workspaceBase" components/examinations/ExamList.tsx`. In division mode it points at `/division/examinations/exam`; Task 8 passes teachers through `mode="division"` too, so make the base a prop: `workspaceBase?: string` defaulting to the current expression.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit -p . && npm run lint && npx vitest run`
Expected: clean / PASS. The division office pages still compile (they pass no new props; with `isAuthorizedAuthor` undefined they get no Edit/Delete — intended).

- [ ] **Step 7: Commit**

```bash
git add hooks/useDivisionAuthorStatus.ts components/examinations/review components/examinations/TosList.tsx components/examinations/ExamList.tsx
git commit -m "feat(exams-qa): status badges, review history and author actions on division lists"
```

---

### Task 8: Teacher — Division TOS and Division Exams

**Files:**
- Modify: `app/(protected)/teacher/examinations/page.tsx`, `components/examinations/TosBuilderModal.tsx`, `components/examinations/ExamBuilderModal.tsx`
- Create: `app/(protected)/teacher/examinations/division/tos/page.tsx`, `app/(protected)/teacher/examinations/division/exam/page.tsx`

**Interfaces:**
- Consumes: Task 7 components and hook.
- Produces: `ExamBuilderModal` prop `initialTosId?: string | null`; teacher routes above. Query param `?createFromTos=<id>` on the exam page opens the builder preselected.

- [ ] **Step 1: Builders**

`ExamBuilderModal.tsx`:
- add `initialTosId?: string | null;` to `ExamBuilderModalProps` and destructure it.
- in the TOS-options query, division mode lists **approved** division TOS only:

```tsx
      query =
        mode === "division"
          ? query.is("school_id", null).eq("review_status", "approved")
          : query.or(visibleTierFilter(userId, schoolId));
```

- where a new (non-edit) form is initialised (find `setTosId(` in the `isOpen` reset effect), use `setTosId(editData?.tos_id ? String(editData.tos_id) : (initialTosId ?? ""))`.

`TosBuilderModal.tsx`: no query change. Saving still sends `school_id: null` in division mode; the trigger sets `review_status = 'draft'`. Confirm the insert's `.select().single()` still returns (it does: the author can SELECT their own draft).

- [ ] **Step 2: Division TOS page**

`app/(protected)/teacher/examinations/division/tos/page.tsx`:

```tsx
"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { TosBuilderModal } from "@/components/examinations/TosBuilderModal";
import { TosList } from "@/components/examinations/TosList";
import { DivisionReviewActions } from "@/components/examinations/review/DivisionReviewActions";
import { Button } from "@/components/ui/button";
import { useDivisionAuthorStatus } from "@/hooks/useDivisionAuthorStatus";
import { QA_UNAUTHORIZED_MESSAGE } from "@/lib/constants/examReview";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { FileSpreadsheet, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * The teacher's Division TOS (194): their own division rows in every status,
 * plus every approved division TOS. Creating one requires QA authorization,
 * which the database also enforces.
 */
export default function Page() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const list = useAppSelector((state) => state.list.value);
  const user = useAppSelector((state) => state.user.user);
  const userId = user?.id ?? null;
  const { loading: authLoading, isAuthorized } = useDivisionAuthorStatus();
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    dispatch(addList([]));
    (async () => {
      if (userId == null) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("sms_tos")
        .select("*")
        .is("school_id", null)
        .or(`review_status.eq.approved,created_by.eq.${userId}`)
        .order("created_at", { ascending: false });
      if (!isMounted) return;
      if (error) console.error(error);
      dispatch(addList(data ?? []));
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [dispatch, userId, refreshKey, modalOpen]);

  return (
    <div>
      <div className="app__title">
        <Link
          href="/teacher/examinations"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Examinations
        </Link>
        <h1 className="app__title_text flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Division TOS
        </h1>
        <div className="app__title_actions">
          {isAuthorized && (
            <Button variant="green" size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Create Division TOS
            </Button>
          )}
        </div>
      </div>
      <div className="app__content space-y-4">
        {!authLoading && !isAuthorized && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {QA_UNAUTHORIZED_MESSAGE}
          </div>
        )}
        {loading ? (
          <TableSkeleton />
        ) : list.length === 0 ? (
          <div className="app__empty_state">
            <p className="app__empty_state_title">No Division TOS yet</p>
          </div>
        ) : (
          <TosList
            mode="division"
            userId={userId}
            schoolId={null}
            isAuthorizedAuthor={isAuthorized}
            renderReviewActions={(item) => (
              <DivisionReviewActions
                entity="tos"
                row={item}
                userId={userId}
                isAuthorizedAuthor={isAuthorized}
                onChanged={() => setRefreshKey((k) => k + 1)}
                onCreateExam={(tosId) =>
                  router.push(`/teacher/examinations/division/exam?createFromTos=${tosId}`)
                }
              />
            )}
          />
        )}
        <TosBuilderModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          mode="division"
          schoolId={null}
          userId={userId}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Division Exams page**

`app/(protected)/teacher/examinations/division/exam/page.tsx` — same shape as Step 2 with these differences:
- query `sms_exams` with `.select("*, tos:tos_id!inner(subject_name, grade_level, exam_type, grading_period, school_year, title)")`, `.is("school_id", null)`, `.or(\`review_status.eq.approved,created_by.eq.${userId}\`)`.
- title "Division Exams", icon `FileText`, button "Create Division Exam" (only when `isAuthorized`).
- read `createFromTos` with `useSearchParams()`; when present and `isAuthorized`, open the builder with `initialTosId={createFromTos}` (wrap the page body in `<Suspense>` as Next requires for `useSearchParams`).
- render `<ExamList mode="division" userId={userId} schoolId={null} isAuthorizedAuthor={isAuthorized} workspaceBase="/teacher/examinations/exam" renderReviewActions={(item) => <DivisionReviewActions entity="exam" row={item} userId={userId} isAuthorizedAuthor={isAuthorized} onChanged={() => setRefreshKey((k) => k + 1)} />} />`
- `<ExamBuilderModal isOpen={modalOpen} onClose={() => setModalOpen(false)} mode="division" schoolId={null} userId={userId} initialTosId={createFromTos} />`

Write the full file out (copy Step 2's file and apply exactly the differences above).

- [ ] **Step 4: Hub groups**

In `app/(protected)/teacher/examinations/page.tsx`:
- rename `TOOLS` → `PERSONAL_TOOLS` (content unchanged) and add:

```tsx
const DIVISION_TOOLS: ExamTool[] = [
  {
    title: "Division TOS",
    subtitle: "Authored for the whole division · QA reviewed",
    description:
      "Write a TOS for every school in the division. It becomes available once a QA reviewer approves it.",
    url: "/teacher/examinations/division/tos",
    icon: FileSpreadsheet,
  },
  {
    title: "Division Exams",
    subtitle: "Built from an approved Division TOS",
    description:
      "Build an exam from an approved Division TOS and submit it to QA for division-wide release.",
    url: "/teacher/examinations/division/exam",
    icon: FileText,
  },
];
```

- extract the card-grid JSX into a local `function ToolGrid({ tools }: { tools: ExamTool[] })` (the existing `.map` body moved verbatim), and render:

```tsx
      <div className="app__content space-y-8">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Personal / School
          </h2>
          <ToolGrid tools={PERSONAL_TOOLS} />
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Division
          </h2>
          {!loading && !isAuthorized && (
            <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {QA_UNAUTHORIZED_MESSAGE}
            </p>
          )}
          <ToolGrid tools={DIVISION_TOOLS} />
        </section>
      </div>
```

with `const { loading, isAuthorized } = useDivisionAuthorStatus();` inside `Page`. The Division cards stay clickable for everyone: an unauthorized teacher can still browse approved division material there.

- [ ] **Step 5: Verify on local**

Run: `npx tsc --noEmit -p . && npm run lint`. Then `npm run dev` (confirm `.env.development.local` exists first). As super admin on local, authorize a local teacher through SQL **on local only**:

```bash
psql "$LOCAL" -c "set search_path=procurements; insert into sms_exam_qa_authors(user_id) select id from sms_users where type='teacher' and is_active order by id limit 1 on conflict do nothing returning user_id;"
```

Sign in as that teacher: the hub shows two groups; Division TOS lets them create a TOS that lists as **Draft**; Submit moves it to **Submitted** and Edit disappears. Sign in as a different teacher: the notice text shows and the Create button does not.

- [ ] **Step 6: Commit**

```bash
git add "app/(protected)/teacher/examinations" components/examinations/TosBuilderModal.tsx components/examinations/ExamBuilderModal.tsx
git commit -m "feat(exams-qa): teacher Division TOS and Division Exams pages"
```

---

### Task 9: Division office — read-only oversight

**Files:**
- Modify: `app/(protected)/division/examinations/tos/page.tsx`, `app/(protected)/division/examinations/exam/page.tsx`, `app/(protected)/division/examinations/page.tsx`

- [ ] **Step 1: Remove authoring**

In both `tos/page.tsx` and `exam/page.tsx`: delete the Create button, the `modalAddOpen` state and the `<TosBuilderModal …/>` / `<ExamBuilderModal …/>` mount and their imports. Add a status filter next to the existing filter:

```tsx
const [status, setStatus] = useState<ReviewStatus | "all">("all");
// in fetchData, after the existing filters:
if (status !== "all") query = query.eq("review_status", status);
```

rendered as a `Select` (shadcn, `components/ui/select.tsx`) with "All statuses" + `REVIEW_STATUSES.map(s => REVIEW_STATUS_LABEL[s])`; add `status` to the effect deps and reset `page` to 1 on change.

Pass history to the lists:

```tsx
<TosList
  mode="division"
  userId={user?.id ?? null}
  schoolId={null}
  renderReviewActions={(item) => (
    <DivisionReviewActions
      entity="tos"
      row={item}
      userId={user?.id ?? null}
      isAuthorizedAuthor={false}
      onChanged={() => {}}
    />
  )}
/>
```

(`isAuthorizedAuthor={false}` with a non-author `userId` yields only the "Review history" item.) Do the same for `ExamList` with `entity="exam"`.

- [ ] **Step 2: Hub copy**

In `app/(protected)/division/examinations/page.tsx`, change the TOS / exam card descriptions to say they are authored by QA-authorized teachers and approved by QA; the division office views them and controls release codes. Keep the cards and links.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p . && npm run lint`. On local as `division_type`: no Create button; drafts, submitted and approved rows all list with badges; history opens; the exam workspace for an approved division exam still shows the release-code card (it uses `can_manage_exam`, now true for approved division exams).

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/division/examinations"
git commit -m "feat(exams-qa): division office views division TOS/exams read-only with status and history"
```

---

### Task 10: QA dashboard and queues

**Files:**
- Create: `components/examinations/review/ReviewQueueTable.tsx`, `app/(protected)/qa/page.tsx`

**Interfaces:**
- Produces: `<ReviewQueueTable entity={"tos" | "exam"} statuses={ReviewStatus[]} />` — fetches and renders, row click → `/qa/{entity}/{id}`.

- [ ] **Step 1: Queue table**

`components/examinations/review/ReviewQueueTable.tsx`:

```tsx
"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { getGradeLevelLabel } from "@/lib/constants";
import type { ReviewEntity, ReviewStatus } from "@/lib/constants/examReview";
import { supabase } from "@/lib/supabase/client";
import { generateTosTitle } from "@/lib/utils/tos";
import { format } from "date-fns";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ReviewStatusBadge } from "./ReviewStatusBadge";

interface TosLike {
  title: string | null;
  subject_name: string;
  grade_level: number;
  exam_type: string;
  grading_period: number;
  school_year: string;
}

interface QueueRow {
  id: string;
  title: string | null;
  version_label?: string;
  review_status: ReviewStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  subject_name?: string;
  grade_level?: number;
  exam_type?: string;
  grading_period?: number;
  school_year?: string;
  tos?: TosLike | null;
  author: { name: string | null; school: { name: string | null } | null } | null;
}

export function ReviewQueueTable({
  entity,
  statuses,
}: {
  entity: ReviewEntity;
  statuses: ReviewStatus[];
}) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const authorSelect = "author:created_by(name, school:school_id(name))";
      const { data, error } =
        entity === "tos"
          ? await supabase
              .from("sms_tos")
              .select(`*, ${authorSelect}`)
              .is("school_id", null)
              .in("review_status", statuses)
              .order("submitted_at", { ascending: true, nullsFirst: false })
          : await supabase
              .from("sms_exams")
              .select(
                `*, ${authorSelect}, tos:tos_id(title, subject_name, grade_level, exam_type, grading_period, school_year)`,
              )
              .is("school_id", null)
              .in("review_status", statuses)
              .order("submitted_at", { ascending: true, nullsFirst: false });
      if (!isMounted) return;
      if (error) console.error(error);
      setRows((data as QueueRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [entity, statuses]);

  if (loading) return <TableSkeleton />;
  if (rows.length === 0)
    return <p className="py-8 text-center text-sm text-muted-foreground">Nothing here.</p>;

  const tosOf = (r: QueueRow): TosLike =>
    entity === "tos" ? (r as unknown as TosLike) : (r.tos as TosLike);

  return (
    <div className="app__table_container">
      <div className="app__table_wrapper">
        <table className="app__table">
          <thead className="app__table_thead">
            <tr>
              <th className="app__table_th">{entity === "tos" ? "TOS" : "Exam"}</th>
              {entity === "exam" && <th className="app__table_th">TOS</th>}
              <th className="app__table_th">Subject</th>
              <th className="app__table_th">Grade Level</th>
              <th className="app__table_th">Teacher</th>
              <th className="app__table_th">School</th>
              <th className="app__table_th">Submitted</th>
              <th className="app__table_th">Status</th>
              <th className="app__table_th_right">Action</th>
            </tr>
          </thead>
          <tbody className="app__table_tbody">
            {rows.map((r) => {
              const t = tosOf(r);
              return (
                <tr key={r.id} className="app__table_tr">
                  <td className="app__table_td">
                    {entity === "tos"
                      ? r.title?.trim() || generateTosTitle(t)
                      : `${r.title?.trim() || generateTosTitle(t)} · ${r.version_label ?? ""}`}
                  </td>
                  {entity === "exam" && (
                    <td className="app__table_td">{t?.title?.trim() || (t ? generateTosTitle(t) : "—")}</td>
                  )}
                  <td className="app__table_td">{t?.subject_name ?? "—"}</td>
                  <td className="app__table_td">
                    {t ? getGradeLevelLabel(t.grade_level) : "—"}
                  </td>
                  <td className="app__table_td">{r.author?.name ?? "—"}</td>
                  <td className="app__table_td">{r.author?.school?.name ?? "—"}</td>
                  <td className="app__table_td">
                    {r.submitted_at ? format(new Date(r.submitted_at), "MMM d, yyyy") : "—"}
                  </td>
                  <td className="app__table_td">
                    <ReviewStatusBadge status={r.review_status} />
                  </td>
                  <td className="app__table_td_actions">
                    <Link
                      href={`/qa/${entity}/${r.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {r.review_status === "approved" ? "Open" : "Review"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

(`statuses` must be a stable reference — define the arrays as module constants in the page.)

- [ ] **Step 2: Dashboard page**

`app/(protected)/qa/page.tsx`:

```tsx
"use client";

import { ReviewQueueTable } from "@/components/examinations/review/ReviewQueueTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReviewStatus } from "@/lib/constants/examReview";
import { supabase } from "@/lib/supabase/client";
import { ClipboardCheck } from "lucide-react";
import { useEffect, useState } from "react";

const PENDING: ReviewStatus[] = ["submitted", "under_review"];
const APPROVED: ReviewStatus[] = ["approved"];

interface Counts {
  pendingTos: number;
  pendingExams: number;
  authors: number;
  approvedTos: number;
  approvedExams: number;
}

async function countOf(table: "sms_tos" | "sms_exams", statuses: ReviewStatus[]) {
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .is("school_id", null)
    .in("review_status", statuses);
  return count ?? 0;
}

export default function Page() {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const [pendingTos, pendingExams, approvedTos, approvedExams, authorsRes] =
        await Promise.all([
          countOf("sms_tos", PENDING),
          countOf("sms_exams", PENDING),
          countOf("sms_tos", APPROVED),
          countOf("sms_exams", APPROVED),
          supabase
            .from("sms_exam_qa_authors")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true),
        ]);
      if (!isMounted) return;
      setCounts({
        pendingTos,
        pendingExams,
        approvedTos,
        approvedExams,
        authors: authorsRes.count ?? 0,
      });
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const tiles: [string, number | undefined][] = [
    ["Pending TOS", counts?.pendingTos],
    ["Pending Exams", counts?.pendingExams],
    ["Authorized Teachers", counts?.authors],
    ["Approved TOS", counts?.approvedTos],
    ["Approved Exams", counts?.approvedExams],
  ];

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          QA Dashboard
        </h1>
      </div>
      <div className="app__content space-y-6">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {tiles.map(([label, value]) => (
            <Card key={label}>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{value ?? "—"}</CardContent>
            </Card>
          ))}
        </div>
        <Tabs defaultValue="pending-tos">
          <TabsList>
            <TabsTrigger value="pending-tos">Pending TOS</TabsTrigger>
            <TabsTrigger value="pending-exams">Pending Exams</TabsTrigger>
            <TabsTrigger value="approved-tos">Approved TOS</TabsTrigger>
            <TabsTrigger value="approved-exams">Approved Exams</TabsTrigger>
          </TabsList>
          <TabsContent value="pending-tos">
            <ReviewQueueTable entity="tos" statuses={PENDING} />
          </TabsContent>
          <TabsContent value="pending-exams">
            <ReviewQueueTable entity="exam" statuses={PENDING} />
          </TabsContent>
          <TabsContent value="approved-tos">
            <ReviewQueueTable entity="tos" statuses={APPROVED} />
          </TabsContent>
          <TabsContent value="approved-exams">
            <ReviewQueueTable entity="exam" statuses={APPROVED} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
```

(Confirm `components/ui/tabs.tsx` exists: `ls components/ui/tabs.tsx`. If not, use the pattern another page uses for tabs — `grep -rln "TabsTrigger" app | head -1` — before adding a new primitive.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p . && npm run lint`. On local as the QA user: counters show; the submitted TOS from Task 8 appears in Pending TOS with teacher and school.

- [ ] **Step 4: Commit**

```bash
git add components/examinations/review/ReviewQueueTable.tsx "app/(protected)/qa/page.tsx"
git commit -m "feat(exams-qa): QA dashboard with counters and review queues"
```

---

### Task 11: QA review pages

**Files:**
- Create: `components/examinations/review/ReviewDecisionPanel.tsx`, `components/examinations/review/TosConformancePanel.tsx`, `app/(protected)/qa/tos/[id]/page.tsx`, `app/(protected)/qa/exam/[id]/page.tsx`

**Interfaces:**
- Produces: `<ReviewDecisionPanel entity row={{ id, review_status, created_by }} onChanged />`; `<TosConformancePanel examId tosId />`.

- [ ] **Step 1: Decision panel**

`components/examinations/review/ReviewDecisionPanel.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewEntity, ReviewStatus } from "@/lib/constants/examReview";
import { useAppSelector } from "@/lib/redux/hook";
import { decideReview, reopenReview, startReview } from "@/lib/utils/examReview";
import { useState } from "react";
import toast from "react-hot-toast";

interface Props {
  entity: ReviewEntity;
  row: { id: string; review_status: ReviewStatus; created_by: string | null };
  onChanged: () => void;
}

/**
 * QA's decisions. Every rule shown here is also enforced by 194's
 * exam_review_* functions; the panel only avoids offering what would fail.
 */
export function ReviewDecisionPanel({ entity, row, onChanged }: Props) {
  const me = useAppSelector((s) => s.user.user?.id);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwn = me != null && String(row.created_by) === String(me);

  const run = async (fn: () => Promise<{ error: string | null }>, ok: string) => {
    if (busy) return;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return toast.error(error);
    toast.success(ok);
    setComment("");
    onChanged();
  };

  if (isOwn)
    return (
      <p className="text-sm text-muted-foreground">
        You authored this, so another QA reviewer must decide it.
      </p>
    );

  const pending = row.review_status === "submitted" || row.review_status === "under_review";

  return (
    <div className="space-y-3">
      {(pending || row.review_status === "approved") && (
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            row.review_status === "approved"
              ? "Reason for reopening (required)"
              : "Comments for the author (required to return)"
          }
          rows={3}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {row.review_status === "submitted" && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => run(() => startReview(entity, row.id), "Review started")}
          >
            Start review
          </Button>
        )}
        {pending && (
          <>
            <Button
              variant="green"
              size="sm"
              disabled={busy}
              onClick={() => run(() => decideReview(entity, row.id, "approve", comment), "Approved")}
            >
              Approve
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy || !comment.trim()}
              onClick={() =>
                run(() => decideReview(entity, row.id, "reject", comment), "Returned to the author")
              }
            >
              Return with comments
            </Button>
          </>
        )}
        {row.review_status === "approved" && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !comment.trim()}
            onClick={() => run(() => reopenReview(entity, row.id, comment), "Reopened")}
          >
            Reopen for correction
          </Button>
        )}
      </div>
    </div>
  );
}
```

(Verify `components/ui/textarea.tsx` exists and `Button` has a `green` variant — the TOS page uses `variant="green"`, so it does.)

- [ ] **Step 2: Conformance panel**

`components/examinations/review/TosConformancePanel.tsx`:

```tsx
"use client";

import { supabase } from "@/lib/supabase/client";
import { tosConformance, type ConformanceRow } from "@/lib/utils/examReview";
import { useEffect, useState } from "react";

/** Exam questions against the approved TOS, per competency. Informational. */
export function TosConformancePanel({ examId, tosId }: { examId: string; tosId: string }) {
  const [rows, setRows] = useState<ConformanceRow[] | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const [comps, items, qs] = await Promise.all([
        supabase.from("sms_tos_competencies").select("id, competency_text, position").eq("tos_id", Number(tosId)).order("position"),
        supabase.from("sms_tos_items").select("id, competency_id, cognitive_level").eq("tos_id", Number(tosId)),
        supabase.from("sms_exam_questions").select("tos_item_id, item_count").eq("exam_id", Number(examId)),
      ]);
      if (!isMounted) return;
      setRows(
        tosConformance({
          competencies: comps.data ?? [],
          tosItems: items.data ?? [],
          questions: qs.data ?? [],
        }),
      );
    })();
    return () => {
      isMounted = false;
    };
  }, [examId, tosId]);

  if (!rows) return <p className="text-sm text-muted-foreground">Comparing with the TOS…</p>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-1">Competency</th>
          <th className="py-1 text-right">TOS items</th>
          <th className="py-1 text-right">Exam items</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.competencyId} className={r.planned !== r.covered ? "text-amber-800" : ""}>
            <td className="py-1">{r.competency}</td>
            <td className="py-1 text-right">{r.planned}</td>
            <td className="py-1 text-right">{r.covered}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: TOS review page**

`app/(protected)/qa/tos/[id]/page.tsx`:

```tsx
"use client";

import { TosViewModal } from "@/components/examinations/TosViewModal";
import { ReviewDecisionPanel } from "@/components/examinations/review/ReviewDecisionPanel";
import { ReviewHistory } from "@/components/examinations/review/ReviewHistory";
import { ReviewStatusBadge } from "@/components/examinations/review/ReviewStatusBadge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import { generateTosTitle } from "@/lib/utils/tos";
import type { Tos } from "@/types";
import Link from "next/link";
import { use, useEffect, useState } from "react";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tos, setTos] = useState<Tos | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data } = await supabase.from("sms_tos").select("*").eq("id", Number(id)).single();
      if (isMounted) setTos((data as Tos) ?? null);
    })();
    return () => {
      isMounted = false;
    };
  }, [id, refreshKey]);

  if (!tos) return <div className="app__content">Loading…</div>;

  return (
    <div>
      <div className="app__title">
        <Link href="/qa" className="text-sm text-muted-foreground hover:text-foreground">
          ← QA Dashboard
        </Link>
        <h1 className="app__title_text flex items-center gap-3">
          {tos.title?.trim() || generateTosTitle(tos)}
          <ReviewStatusBadge status={tos.review_status} />
        </h1>
        <div className="app__title_actions">
          <Button variant="outline" size="sm" onClick={() => setViewOpen(true)}>
            View blueprint
          </Button>
        </div>
      </div>
      <div className="app__content grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-3">
          <h2 className="font-semibold">Decision</h2>
          {tos.review_status && (
            <ReviewDecisionPanel
              entity="tos"
              row={{ id: tos.id, review_status: tos.review_status, created_by: tos.created_by }}
              onChanged={() => setRefreshKey((k) => k + 1)}
            />
          )}
        </section>
        <section className="space-y-3">
          <h2 className="font-semibold">History</h2>
          <ReviewHistory entity="tos" id={tos.id} refreshKey={refreshKey} />
        </section>
      </div>
      <TosViewModal isOpen={viewOpen} tos={tos} onClose={() => setViewOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 4: Exam review page**

`app/(protected)/qa/exam/[id]/page.tsx` — same structure as Step 3, with:
- load `sms_exams` `select("*")` into `exam: Exam`.
- title `exam.title?.trim() || \`Exam · ${exam.version_label}\``.
- "View exam" button opening `<ExamViewModal isOpen exam={exam} onClose />` (it already offers the answer-key toggle).
- a "TOS conformance" section rendering `<TosConformancePanel examId={exam.id} tosId={exam.tos_id} />` above Decision.
- when `exam.review_status === "approved"`, render `<ExamReleaseCodeCard examId={exam.id} onSealedChange={() => {}} />` in a "Release code" section (decision 2). Check its props with `grep -n "interface\|Props" components/examinations/ExamReleaseCodeCard.tsx` and pass exactly those.
- `ReviewDecisionPanel entity="exam"`, `ReviewHistory entity="exam"`.

Write the full file out.

- [ ] **Step 5: Verify on local**

Run: `npx tsc --noEmit -p . && npm run lint`. As QA on local: open the submitted TOS → View blueprint shows the TOS; Start review → badge Under review; Return without comment is disabled; Return with comment → teacher's Division TOS page shows Returned + the comment; teacher resubmits; QA approves; teacher's row offers **Create Examination**, which opens the builder preselected. Build an exam, submit; QA sees conformance and approves; the release-code card appears.

- [ ] **Step 6: Commit**

```bash
git add components/examinations/review "app/(protected)/qa/tos" "app/(protected)/qa/exam"
git commit -m "feat(exams-qa): QA review pages with blueprint, conformance, decisions and history"
```

---

### Task 12: QA — Authorized Teachers

**Files:**
- Create: `app/(protected)/qa/authors/page.tsx`

- [ ] **Step 1: Page**

```tsx
"use client";

import { ReviewHistory } from "@/components/examinations/review/ReviewHistory";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase/client";
import { escapeIlikePattern } from "@/lib/utils";
import { authorizeTeacher, revokeTeacher } from "@/lib/utils/examReview";
import type { ExamQaAuthor } from "@/types";
import { Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface TeacherRow {
  id: string;
  name: string;
  school_id: string | null;
  school: { name: string | null } | null;
}

/**
 * Who may write Division TOS and exams (194). Authorize / revoke go through
 * exam_qa_authorize / exam_qa_revoke, which check the role and write the audit
 * trail; nothing here writes a table directly.
 */
export default function Page() {
  const [keyword, setKeyword] = useState("");
  const [schoolId, setSchoolId] = useState<string>("all");
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [authors, setAuthors] = useState<Map<string, ExamQaAuthor>>(new Map());
  const [revokeTarget, setRevokeTarget] = useState<TeacherRow | null>(null);
  const [reason, setReason] = useState("");
  const [historyFor, setHistoryFor] = useState<ExamQaAuthor | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    supabase
      .from("sms_schools")
      .select("id, name")
      .order("name")
      .then(({ data }) => setSchools((data as { id: string; name: string }[]) ?? []));
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      let q = supabase
        .from("sms_users")
        .select("id, name, school_id, school:school_id(name)")
        .in("type", ["teacher", "volunteer_teacher"])
        .eq("is_active", true)
        .order("name")
        .limit(200);
      if (keyword) q = q.ilike("name", `%${escapeIlikePattern(keyword)}%`);
      if (schoolId !== "all") q = q.eq("school_id", Number(schoolId));
      const [{ data: t }, { data: a }] = await Promise.all([
        q,
        supabase.from("sms_exam_qa_authors").select("*"),
      ]);
      if (!isMounted) return;
      setTeachers((t as TeacherRow[]) ?? []);
      setAuthors(new Map(((a as ExamQaAuthor[]) ?? []).map((r) => [String(r.user_id), r])));
    })();
    return () => {
      isMounted = false;
    };
  }, [keyword, schoolId, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const authorize = async (t: TeacherRow) => {
    const { error } = await authorizeTeacher(t.id);
    if (error) return toast.error(error);
    toast.success(`${t.name} may now write Division TOS`);
    refresh();
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    const { error } = await revokeTeacher(revokeTarget.id, reason);
    if (error) return toast.error(error);
    toast.success("Authorization revoked");
    setRevokeTarget(null);
    setReason("");
    refresh();
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <Users className="h-5 w-5" />
          Authorized Teachers
        </h1>
        <div className="app__title_actions gap-2">
          <Input
            placeholder="Search teacher"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="h-9 w-56"
          />
          <select
            className="h-9 rounded-md border px-2 text-sm"
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
          >
            <option value="all">All schools</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="app__content">
        <div className="app__table_container">
          <div className="app__table_wrapper">
            <table className="app__table">
              <thead className="app__table_thead">
                <tr>
                  <th className="app__table_th">Teacher</th>
                  <th className="app__table_th">School</th>
                  <th className="app__table_th">Division TOS Access</th>
                  <th className="app__table_th_right">Action</th>
                </tr>
              </thead>
              <tbody className="app__table_tbody">
                {teachers.map((t) => {
                  const a = authors.get(String(t.id));
                  const active = !!a?.is_active;
                  return (
                    <tr key={t.id} className="app__table_tr">
                      <td className="app__table_td">{t.name}</td>
                      <td className="app__table_td">{t.school?.name ?? "—"}</td>
                      <td className="app__table_td">
                        {active ? "✓ Authorized" : a ? "✗ Revoked" : "✗ Not authorized"}
                      </td>
                      <td className="app__table_td_actions">
                        <div className="flex justify-end gap-2">
                          {a && (
                            <Button variant="ghost" size="sm" onClick={() => setHistoryFor(a)}>
                              History
                            </Button>
                          )}
                          {active ? (
                            <Button variant="outline" size="sm" onClick={() => setRevokeTarget(t)}>
                              Revoke
                            </Button>
                          ) : (
                            <Button variant="green" size="sm" onClick={() => authorize(t)}>
                              Authorize
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {revokeTarget?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Their drafts freeze; anything already approved stays published.
          </p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={!reason.trim()} onClick={revoke}>
              Revoke
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Authorization history</DialogTitle>
          </DialogHeader>
          {historyFor && <ReviewHistory entity="author" id={historyFor.id} refreshKey={refreshKey} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

Note: listing only users whose **active** type is a teacher role misses a master teacher currently switched into another hat. That matches `exam_qa_authorize`'s own rule only partly (it also accepts a teacher role held in `sms_user_roles`); acceptable for the list — a QA reviewer searching for someone not shown can ask them to switch back to Teacher. Leave a one-line comment saying so above the query.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p . && npm run lint`. On local as QA: authorize a teacher (row flips to ✓, History shows "Authorized"); revoke without reason is disabled; revoke with reason → ✗ Revoked; the teacher's Division TOS page shows the notice and their draft has no Edit.

- [ ] **Step 3: Commit**

```bash
git add "app/(protected)/qa/authors"
git commit -m "feat(exams-qa): QA authorizes and revokes Division authors with history"
```

---

### Task 13: End-to-end flow

**Files:**
- Create: `e2e/division-exam-qa.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
/**
 * Division TOS through QA (migration 194), against the intercepted Supabase.
 * The database is what enforces the workflow; these tests pin what the screens
 * ASK it to do and what they show back.
 */

import { expect, test } from "@playwright/test";
import { installSupabaseMock, seedSession, TEST_USER } from "./support/supabaseMock";

const QA_MESSAGE =
  "You are not currently authorized to create Division TOS. Please contact the Division QA administrator.";

const DRAFT_TOS = {
  id: 7101,
  title: "Science 5 Q1 Division TOS",
  subject_name: "Science",
  grade_level: 5,
  school_year: "2026-2027",
  grading_period: 1,
  exam_type: "Quarterly Examination",
  total_items: 40,
  total_days: 40,
  school_id: null,
  is_school_shared: false,
  created_by: TEST_USER.systemUserId,
  is_active: true,
  review_status: "draft",
  review_comment: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

test.beforeEach(async ({ context, baseURL }) => {
  await seedSession(context, baseURL as string);
});

test("an unauthorized teacher sees the notice and no Create button", async ({ page }) => {
  await installSupabaseMock(page, { sms_exam_qa_authors: [], sms_tos: [] });
  await page.goto("/teacher/examinations/division/tos");
  await expect(page.getByText(QA_MESSAGE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Division TOS" })).toHaveCount(0);
});

test("an authorized author submits a draft to QA", async ({ page }) => {
  const mock = await installSupabaseMock(
    page,
    {
      sms_exam_qa_authors: [{ id: 1, user_id: TEST_USER.systemUserId, is_active: true }],
      sms_tos: [DRAFT_TOS],
    },
    { exam_review_submit: () => null },
  );
  await page.goto("/teacher/examinations/division/tos");
  await expect(page.getByText("Science 5 Q1 Division TOS")).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Submit to QA" }).click();
  const calls = mock.writesTo("rpc/exam_review_submit");
  expect(calls).toHaveLength(1);
  expect(calls[0].body).toEqual({ p_entity: "tos", p_id: 7101 });
});

test("a returned TOS shows QA's reason to its author", async ({ page }) => {
  await installSupabaseMock(page, {
    sms_exam_qa_authors: [{ id: 1, user_id: TEST_USER.systemUserId, is_active: true }],
    sms_tos: [
      { ...DRAFT_TOS, review_status: "rejected", review_comment: "Item distribution does not match" },
    ],
  });
  await page.goto("/teacher/examinations/division/tos");
  await expect(page.getByText("Returned")).toBeVisible();
  await expect(page.getByText("QA: Item distribution does not match")).toBeVisible();
});

test("QA returns a submission with a reason", async ({ page }) => {
  const mock = await installSupabaseMock(
    page,
    {
      sms_users: [
        {
          id: TEST_USER.systemUserId,
          user_id: TEST_USER.authId,
          email: TEST_USER.email,
          name: "QA Reviewer",
          type: "qa",
          school_id: null,
          is_active: true,
        },
      ],
      sms_tos: [{ ...DRAFT_TOS, review_status: "submitted", created_by: 999 }],
      sms_exam_review_events: [],
    },
    { exam_review_decide: () => null },
  );
  await page.goto("/qa/tos/7101");
  await expect(page.getByRole("button", { name: "Return with comments" })).toBeDisabled();
  await page.getByPlaceholder("Comments for the author (required to return)").fill("Item distribution does not match");
  await page.getByRole("button", { name: "Return with comments" }).click();
  const calls = mock.writesTo("rpc/exam_review_decide");
  expect(calls[0].body).toEqual({
    p_entity: "tos",
    p_id: 7101,
    p_decision: "reject",
    p_comment: "Item distribution does not match",
  });
});
```

Check the mock's filter support for `.or(...)` with `and(...)` clauses and `.in(...)`: `grep -n "\"or\"\|in\.\|parseFilter" e2e/support/supabaseMock.ts`. If `.or()` is not interpreted, the mock returns all rows of the table, which these fixtures tolerate (each table holds exactly the rows the page should show).

- [ ] **Step 2: Run**

Run: `npm run test:e2e -- e2e/division-exam-qa.spec.ts`
Expected: 4 passed. (The suite starts its own server on 3123 against an unreachable Supabase host — no database is touched.)

- [ ] **Step 3: Commit**

```bash
git add e2e/division-exam-qa.spec.ts
git commit -m "test(exams-qa): browser flow for authorization notice, submit and QA return"
```

---

### Task 14: Documentation and full verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md**

Add to the Key Features table:

```markdown
| **Division exam QA** | `qa/`, `teacher/examinations/division/`, `components/examinations/review/`, `lib/constants/examReview.ts`, `lib/utils/examReview.ts`, migration 194 | Division TOS/exams are written by QA-authorized teachers and released to the division only on QA approval; the division office views them and holds release codes but no longer authors |
```

Add to the user-roles list: `- **QA reviewers** (`qa`, migration 194) — division-level; authorize teachers to write Division TOS/exams and approve or return them. Held as a primary role (no school) or as an extra role at a school (163).`

Add a 194 row to Notable Recent Migrations summarising: the `qa` role; `review_status` on `sms_tos`/`sms_exams` tied to `school_id IS NULL` by CHECK; the backfill count; the nine tables' RLS replaced with `school_id IS NOT NULL OR …` (school-level behaviour unchanged); `can_read_exam_paper` / `can_manage_exam` replaced with the same signatures; `exam_review_*` / `exam_qa_*` as the only writers; audit in `sms_exam_review_events`; reopen refused once results exist / an exam is built / the row is grandfathered.

Add invariant 17:

```markdown
17. **A division TOS or exam's visibility is its `review_status`, and only the `exam_review_*` functions change it** (migration 194) — a division row (`school_id IS NULL`) is visible division-wide only when `approved`; drafts are seen by their author, QA and the division office. Never write `review_status` from the client or a new trigger, never add a policy that admits division rows by authorship alone, and never let a row cross `school_id NULL ↔ set` (the guard trigger refuses it). New division rows come only from QA-authorized teachers; the division office does not author.
```

- [ ] **Step 2: Full verification**

```bash
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/migrations/194_division_exam_qa_review.sql
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql
npx vitest run
npx tsc --noEmit -p .
npm run lint
npm run test:e2e
```

Expected: every command succeeds. Then the manual regression on local, as a teacher with no authorization: create, edit, share school-wide and delete a **personal** TOS and exam; print; open an existing (grandfathered) division exam and scan into it — all behave exactly as before.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: division exam QA workflow (migration 194)"
```

- [ ] **Step 4: Hand-off note for the user (do not apply anything)**

Report: the migration file path; the backfill counts from Task 0; that it replaces the policies on nine tables and two functions; the pre-apply count queries in its header; that applying it to production is theirs to do.
