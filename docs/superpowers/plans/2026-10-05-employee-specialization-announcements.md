# Employee Specialization, Division Announcements & Specialization Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move position/sex/specialization off the `/staff` modal onto each employee's `/profile` (with a three-part specialization), add a division announcements module that feeds the notification bell, and add a division + school Employee Specialization report.

**Architecture:** Migration 198 adds two nullable `sms_users` columns and two announcement tables whose visibility is decided in SQL (one targeting predicate shared by RLS, the bell RPCs and the read-count stats). The bell is rewired from the non-existent `public.adm_notifications` to two `SECURITY INVOKER` RPCs. The report follows the Staff-by-Position precedent: it reads `sms_users` directly (001's SELECT policy admits any authenticated user) and aggregates in a pure TypeScript util shared by a division page and a school page.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres RLS, PostgREST RPC), React Hook Form + Zod, shadcn/ui, vitest, jsPDF/HTML print via `lib/pdf/reportShell`.

**Spec:** `docs/superpowers/specs/2026-10-05-employee-specialization-announcements-design.md`

## Global Constraints

- **LOCAL DATABASE ONLY** (CLAUDE.md Rule 0). Every `psql` targets `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Never read `.env.local`. Migration 198 is handed to the user; an agent never applies it to production.
- Migrations are additive and immutable: new file `supabase/migrations/198_employee_specialization_announcements.sql`; guard with `IF NOT EXISTS` / `DROP POLICY IF EXISTS`.
- All SMS tables live in schema `procurements`; the browser client (`@/lib/supabase/client`) already targets it.
- No `any` types. Lists fetched with an `isMounted` flag. `school_id` compared with `Number()`.
- Part 1/2 values: list **code**, or `other:<typed text>` (trimmed, ≤ 120 chars). Part 3 = `sms_users.learning_area`, plain `LEARNING_AREAS` codes only (no `other:` text — the Teaching Specialization report keys on the code).
- Every list includes **General** and **Other (specify)**; graduate list also **None / not yet pursued**.
- Audience values exactly: `all` | `teachers` | `school_heads`. Teachers = `teacher`, `volunteer_teacher`. School heads = `school_head`, `assistant_school_head`.
- Author roles exactly: `division_admin`, `division_type`, `super admin`.
- Login-disabled types (`accounting`, `security_guard`, `utility_worker`) are excluded from announcement target counts.
- Editing a staff record on `/staff` must never write `position`, `gender` or `learning_area`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do not stage the user's unrelated modified files (`components/examinations/catalogue/*`, `.impeccable/`).

## Review Focus

1. **Editing a staff record after the fields are removed** — a school admin edits only an email; the person's sex, position and specialization must be unchanged. Pinned in Task 3 (payload has no such keys; verified by a local DB before/after check).
2. **A user who is an announcement author is also a recipient** — a division admin's bell must show only announcements targeted at *them*, not every announcement RLS lets them read. Pinned in Task 1 (inbox count for `div` vs. RLS select count).
3. **Marking read twice / clicking an already-read item** — must not error (primary key conflict). Pinned in Task 1 (`ON CONFLICT DO NOTHING` insert twice) and Task 5 (`upsert … ignoreDuplicates`).
4. **"Other" with blank text** — saving Other with no text must be refused, not stored as `other:`. Pinned in Task 2 (`encodeMajor` returns null) and Task 4 (form validation).
5. **Archived announcement still linked from an open dropdown** — clicking it after archive must not crash; the read insert is refused by RLS and the click still navigates. Pinned in Task 1 (read insert on archived refused) and Task 5 (errors swallowed, navigation proceeds).

---

### Task 1: Migration 198 — columns, announcement tables, RLS, RPCs (SQL test first)

**Files:**
- Create: `supabase/tests/198_announcements.sql`
- Create: `supabase/migrations/198_employee_specialization_announcements.sql`

**Interfaces:**
- Produces (SQL, schema `procurements`):
  - columns `sms_users.undergrad_major TEXT`, `sms_users.graduate_major TEXT`
  - table `sms_announcements(id BIGINT, title TEXT, body TEXT, audience TEXT, school_id BIGINT NULL, link_path TEXT NULL, created_by BIGINT NULL, created_at, updated_at, archived_at TIMESTAMPTZ NULL)`
  - table `sms_announcement_reads(announcement_id BIGINT, user_id BIGINT, read_at)` PK `(announcement_id, user_id)`
  - `announcement_inbox(p_limit INT DEFAULT 20) RETURNS TABLE(id BIGINT, title TEXT, body TEXT, link_path TEXT, created_at TIMESTAMPTZ, is_read BOOLEAN)`
  - `announcement_unread_count() RETURNS BIGINT`
  - `announcement_read_stats() RETURNS TABLE(announcement_id BIGINT, read_count BIGINT, target_count BIGINT)` — author roles only

- [ ] **Step 1: Write the failing SQL test**

Create `supabase/tests/198_announcements.sql`:

```sql
-- Migration 198 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/198_announcements.sql
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
-- Manual checks (Tasks 5-6) may have left announcements on the clone; clear
-- them inside this transaction so the counts below are exact. Rolled back.
DELETE FROM sms_announcements;

INSERT INTO tst.ids (name, uid) VALUES
  ('div', '00000000-0000-4000-8000-000000000198'),
  ('tA',  '00000000-0000-4000-8000-0000000001a1'),
  ('tB',  '00000000-0000-4000-8000-0000000001b1'),
  ('hA',  '00000000-0000-4000-8000-0000000001a2');

INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@198.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id)
SELECT 'schoolA', min(id) FROM sms_schools
UNION ALL
SELECT 'schoolB', (SELECT id FROM sms_schools ORDER BY id OFFSET 1 LIMIT 1);

WITH u(name, type, school) AS (VALUES
  ('div', 'division_admin', NULL), ('tA', 'teacher', 'schoolA'),
  ('tB', 'teacher', 'schoolB'), ('hA', 'school_head', 'schoolA'))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@198.test', u.type, tst.id(u.school), tst.uid(u.name), true
FROM u;

UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;

-- --------------------------------------------------------------- columns ---
SELECT tst.expect_count($$ SELECT count(*) FROM information_schema.columns
  WHERE table_schema = 'procurements' AND table_name = 'sms_users'
    AND column_name IN ('undergrad_major', 'graduate_major') $$, 2);

-- ------------------------------------------------------------ authoring ---
SELECT tst.claims(tst.uid('tA'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(
  $$ INSERT INTO sms_announcements (title, body) VALUES ('x', 'y') $$,
  'row-level security');
RESET ROLE;

SELECT tst.claims(tst.uid('div'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_announcements (title, body, audience, created_by)
VALUES ('All', 'Update your specialization', 'all', NULL);
INSERT INTO sms_announcements (title, body, audience, school_id)
VALUES ('Teachers B', 'b', 'teachers', tst.id('schoolB'));
INSERT INTO sms_announcements (title, body, audience)
VALUES ('Heads', 'h', 'school_heads');
SELECT tst.expect_error(
  $$ INSERT INTO sms_announcements (title, body, link_path) VALUES ('x', 'y', '//evil.example') $$,
  'check constraint');
SELECT tst.expect_error(
  $$ INSERT INTO sms_announcements (title, body) VALUES ('  ', 'y') $$,
  'check constraint');
RESET ROLE;

INSERT INTO tst.ids (name, id)
SELECT 'a_' || lower(split_part(title, ' ', 1)) || coalesce(nullif(split_part(title, ' ', 2), ''), ''), id
FROM sms_announcements WHERE title IN ('All', 'Teachers B', 'Heads');
-- a_all, a_teachersb, a_heads

-- created_by is stamped from the caller, never from the payload
SELECT tst.expect_count(
  $$ SELECT count(*) FROM sms_announcements WHERE created_by = $$ || tst.id('div'), 3);

-- ------------------------------------------------------------- targeting ---
SELECT tst.claims(tst.uid('tA'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_announcements $$, 1);
SELECT tst.expect_count($$ SELECT announcement_unread_count() $$, 1);
SELECT tst.expect_count($$ SELECT count(*) FROM announcement_inbox(20) $$, 1);
-- a teacher cannot edit
SELECT tst.expect_rows($$ UPDATE sms_announcements SET title = 'hacked' $$, 0);
RESET ROLE;

SELECT tst.claims(tst.uid('tB'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT announcement_unread_count() $$, 2);
RESET ROLE;

SELECT tst.claims(tst.uid('hA'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT announcement_unread_count() $$, 2);
RESET ROLE;

-- an author reads every row through RLS, but the bell shows only what targets them
SELECT tst.claims(tst.uid('div'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_announcements $$, 3);
SELECT tst.expect_count($$ SELECT announcement_unread_count() $$, 1);
-- author cannot re-assign authorship
UPDATE sms_announcements SET created_by = tst.id('tA') WHERE id = tst.id('a_all');
RESET ROLE;
SELECT tst.expect_count(
  $$ SELECT created_by FROM sms_announcements WHERE id = $$ || tst.id('a_all'), tst.id('div'));

-- ------------------------------------------------------------------ reads ---
SELECT tst.claims(tst.uid('tA'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows($$ INSERT INTO sms_announcement_reads (announcement_id, user_id)
  VALUES ($$ || tst.id('a_all') || ', ' || tst.id('tA') || $$) ON CONFLICT DO NOTHING $$, 1);
-- second click is a no-op, not an error
SELECT tst.expect_rows($$ INSERT INTO sms_announcement_reads (announcement_id, user_id)
  VALUES ($$ || tst.id('a_all') || ', ' || tst.id('tA') || $$) ON CONFLICT DO NOTHING $$, 0);
SELECT tst.expect_count($$ SELECT announcement_unread_count() $$, 0);
SELECT tst.expect_count($$ SELECT count(*) FROM announcement_inbox(20) WHERE is_read $$, 1);
-- not targeted at tA
SELECT tst.expect_error($$ INSERT INTO sms_announcement_reads (announcement_id, user_id)
  VALUES ($$ || tst.id('a_teachersb') || ', ' || tst.id('tA') || ')', 'row-level security');
-- not as somebody else
SELECT tst.expect_error($$ INSERT INTO sms_announcement_reads (announcement_id, user_id)
  VALUES ($$ || tst.id('a_all') || ', ' || tst.id('tB') || ')', 'row-level security');
RESET ROLE;

SELECT tst.claims(tst.uid('tB'));
SET LOCAL ROLE authenticated;
-- tB cannot see tA's read row
SELECT tst.expect_count($$ SELECT count(*) FROM sms_announcement_reads $$, 0);
RESET ROLE;

-- ------------------------------------------------------------------ stats ---
SELECT tst.claims(tst.uid('tA'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT * FROM announcement_read_stats() $$, 'division office');
RESET ROLE;

SELECT tst.claims(tst.uid('div'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT read_count FROM announcement_read_stats()
  WHERE announcement_id = $$ || tst.id('a_all'), 1);
RESET ROLE;
-- target count for "teachers at school B" = active teachers + volunteer teachers there
SELECT tst.expect_count(
  $$ SELECT target_count - (SELECT count(*) FROM sms_users WHERE is_active
       AND school_id = $$ || tst.id('schoolB') || $$
       AND type IN ('teacher', 'volunteer_teacher'))
     FROM (SELECT * FROM announcement_read_stats_unchecked()) s
     WHERE announcement_id = $$ || tst.id('a_teachersb'), 0);

-- --------------------------------------------------------------- archive ---
SELECT tst.claims(tst.uid('div'));
SET LOCAL ROLE authenticated;
UPDATE sms_announcements SET archived_at = now() WHERE id = tst.id('a_all');
RESET ROLE;

SELECT tst.claims(tst.uid('tB'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_count($$ SELECT announcement_unread_count() $$, 1);
-- a stale dropdown click on the archived one is refused, not crashed
SELECT tst.expect_error($$ INSERT INTO sms_announcement_reads (announcement_id, user_id)
  VALUES ($$ || tst.id('a_all') || ', ' || tst.id('tB') || ')', 'row-level security');
RESET ROLE;

-- ---------------------------------------------------------- privileges ----
SELECT tst.expect_count($$ SELECT count(*) FROM information_schema.routine_privileges
  WHERE routine_schema = 'procurements' AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    AND routine_name IN ('announcement_stamp', 'announcement_read_stats_unchecked') $$, 0);

\echo 'ALL 198 ASSERTIONS PASSED'
ROLLBACK;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/198_announcements.sql`
Expected: FAIL at the columns assertion (`FAIL expected 2, got 0`). If the DB is down: `docker start supabase_db_school-management` (see memory note on local quirks).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/198_employee_specialization_announcements.sql`:

```sql
-- ============================================================================
-- 198. Employee specialization + division announcements
-- ============================================================================
--
-- WHY
-- ---
-- (a) The division needs every employee's academic and work specialization,
--     answered by the employee on /profile rather than typed by a school admin.
--     Part 3 ("specialization at DepEd") is 146's `learning_area`, so its 205
--     existing answers and the Teaching Specialization report carry over.
--     Parts 1-2 are two new nullable TEXT columns, app-validated against
--     lib/constants/employeeMajors.ts per the 119/132 precedent: a value is a
--     list code or 'other:<typed text>'.
-- (b) The notification bell read `public.adm_notifications`, which no migration
--     creates and which is absent from the schema — it has always shown 0. This
--     adds division announcements as the bell's source.
--
-- DESIGN
-- ------
-- No fan-out: posting writes one row, not one per employee. Unread = targeted
-- announcements minus the caller's read rows, so staff added later still see
-- live announcements. Targeting is ONE predicate, `announcement_targets`, used
-- by RLS, by the inbox RPCs and by the read-count stats, so the three cannot
-- disagree. It reads the caller's ACTIVE type and school (134/163 —
-- invariants 12-13), never "any assigned role".
-- Authors: division_admin, division_type, super admin. Announcements are
-- archived, never deleted (no DELETE policy).
--
-- WHAT IS NOT CHANGED
-- -------------------
-- No existing table, policy, trigger or function is touched; no row modified.
-- Two nullable columns on sms_users; two new tables; new functions only.
-- ============================================================================

ALTER TABLE procurements.sms_users ADD COLUMN IF NOT EXISTS undergrad_major TEXT;
ALTER TABLE procurements.sms_users ADD COLUMN IF NOT EXISTS graduate_major TEXT;

CREATE TABLE IF NOT EXISTS procurements.sms_announcements (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  body        TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  audience    TEXT NOT NULL DEFAULT 'all'
              CHECK (audience IN ('all', 'teachers', 'school_heads')),
  school_id   BIGINT REFERENCES procurements.sms_schools(id) ON DELETE CASCADE,
  link_path   TEXT CHECK (link_path IS NULL
                          OR (link_path LIKE '/%' AND link_path NOT LIKE '//%')),
  created_by  BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sms_announcements_live_idx
  ON procurements.sms_announcements (created_at DESC) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS procurements.sms_announcement_reads (
  announcement_id BIGINT NOT NULL
    REFERENCES procurements.sms_announcements(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL
    REFERENCES procurements.sms_users(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS sms_announcement_reads_user_idx
  ON procurements.sms_announcement_reads (user_id);

-- ---------------------------------------------------------------- helpers --

-- The one targeting rule. Pure, so RLS, inbox and stats share it exactly.
CREATE OR REPLACE FUNCTION procurements.announcement_targets(
  p_audience TEXT, p_school_id BIGINT, p_user_type TEXT, p_user_school BIGINT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT (p_school_id IS NULL OR p_school_id = p_user_school)
     AND CASE p_audience
           WHEN 'all'          THEN true
           WHEN 'teachers'     THEN p_user_type IN ('teacher', 'volunteer_teacher')
           WHEN 'school_heads' THEN p_user_type IN ('school_head', 'assistant_school_head')
           ELSE false
         END;
$$;

CREATE OR REPLACE FUNCTION procurements.announcement_me_id()
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT u.id FROM procurements.sms_users u
  WHERE u.user_id = auth.uid() AND u.is_active LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION procurements.announcement_is_author()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT COALESCE((
    SELECT u.type IN ('division_admin', 'division_type', 'super admin')
    FROM procurements.sms_users u
    WHERE u.user_id = auth.uid() AND u.is_active LIMIT 1), false);
$$;

CREATE OR REPLACE FUNCTION procurements.announcement_targets_me(
  p_audience TEXT, p_school_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public AS $$
  SELECT COALESCE((
    SELECT procurements.announcement_targets(p_audience, p_school_id, u.type, u.school_id)
    FROM procurements.sms_users u
    WHERE u.user_id = auth.uid() AND u.is_active LIMIT 1), false);
$$;

-- created_by / created_at come from the caller, never the payload.
CREATE OR REPLACE FUNCTION procurements.announcement_stamp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = procurements, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(procurements.announcement_me_id(), NEW.created_by);
    NEW.created_at := now();
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sms_announcements_stamp ON procurements.sms_announcements;
CREATE TRIGGER sms_announcements_stamp
  BEFORE INSERT OR UPDATE ON procurements.sms_announcements
  FOR EACH ROW EXECUTE FUNCTION procurements.announcement_stamp();

-- -------------------------------------------------------------------- RLS --
ALTER TABLE procurements.sms_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements.sms_announcement_reads ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON procurements.sms_announcements TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_announcements_id_seq TO authenticated;
GRANT SELECT, INSERT ON procurements.sms_announcement_reads TO authenticated;

DROP POLICY IF EXISTS "sms_announcements: select" ON procurements.sms_announcements;
CREATE POLICY "sms_announcements: select" ON procurements.sms_announcements
  FOR SELECT TO authenticated
  USING (procurements.announcement_is_author()
         OR (archived_at IS NULL
             AND procurements.announcement_targets_me(audience, school_id)));

DROP POLICY IF EXISTS "sms_announcements: insert" ON procurements.sms_announcements;
CREATE POLICY "sms_announcements: insert" ON procurements.sms_announcements
  FOR INSERT TO authenticated
  WITH CHECK (procurements.announcement_is_author());

DROP POLICY IF EXISTS "sms_announcements: update" ON procurements.sms_announcements;
CREATE POLICY "sms_announcements: update" ON procurements.sms_announcements
  FOR UPDATE TO authenticated
  USING (procurements.announcement_is_author())
  WITH CHECK (procurements.announcement_is_author());

DROP POLICY IF EXISTS "sms_announcement_reads: select" ON procurements.sms_announcement_reads;
CREATE POLICY "sms_announcement_reads: select" ON procurements.sms_announcement_reads
  FOR SELECT TO authenticated
  USING (user_id = procurements.announcement_me_id()
         OR procurements.announcement_is_author());

DROP POLICY IF EXISTS "sms_announcement_reads: insert" ON procurements.sms_announcement_reads;
CREATE POLICY "sms_announcement_reads: insert" ON procurements.sms_announcement_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = procurements.announcement_me_id()
    AND EXISTS (
      SELECT 1 FROM procurements.sms_announcements a
      WHERE a.id = announcement_id
        AND a.archived_at IS NULL
        AND procurements.announcement_targets_me(a.audience, a.school_id)));

-- ------------------------------------------------------------------ inbox --
-- SECURITY INVOKER: RLS applies, and the explicit targeting filter keeps an
-- author's bell to what is addressed to them rather than everything they manage.
CREATE OR REPLACE FUNCTION procurements.announcement_inbox(p_limit INT DEFAULT 20)
RETURNS TABLE (id BIGINT, title TEXT, body TEXT, link_path TEXT,
               created_at TIMESTAMPTZ, is_read BOOLEAN)
LANGUAGE sql STABLE SET search_path = procurements, public AS $$
  SELECT a.id, a.title, a.body, a.link_path, a.created_at,
         EXISTS (SELECT 1 FROM procurements.sms_announcement_reads r
                 WHERE r.announcement_id = a.id
                   AND r.user_id = procurements.announcement_me_id())
  FROM procurements.sms_announcements a
  WHERE a.archived_at IS NULL
    AND procurements.announcement_targets_me(a.audience, a.school_id)
  ORDER BY a.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

CREATE OR REPLACE FUNCTION procurements.announcement_unread_count()
RETURNS BIGINT LANGUAGE sql STABLE SET search_path = procurements, public AS $$
  SELECT count(*) FROM procurements.sms_announcements a
  WHERE a.archived_at IS NULL
    AND procurements.announcement_targets_me(a.audience, a.school_id)
    AND NOT EXISTS (SELECT 1 FROM procurements.sms_announcement_reads r
                    WHERE r.announcement_id = a.id
                      AND r.user_id = procurements.announcement_me_id());
$$;

-- ------------------------------------------------------------------ stats --
-- Unchecked body is internal (revoked below); the public wrapper guards it.
CREATE OR REPLACE FUNCTION procurements.announcement_read_stats_unchecked()
RETURNS TABLE (announcement_id BIGINT, read_count BIGINT, target_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = procurements, public AS $$
  SELECT a.id,
         (SELECT count(*) FROM procurements.sms_announcement_reads r
          WHERE r.announcement_id = a.id)::BIGINT,
         (SELECT count(*) FROM procurements.sms_users u
          WHERE u.is_active
            AND u.type NOT IN ('accounting', 'security_guard', 'utility_worker')
            AND procurements.announcement_targets(a.audience, a.school_id, u.type, u.school_id))::BIGINT
  FROM procurements.sms_announcements a;
$$;

CREATE OR REPLACE FUNCTION procurements.announcement_read_stats()
RETURNS TABLE (announcement_id BIGINT, read_count BIGINT, target_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = procurements, public AS $$
BEGIN
  IF NOT procurements.announcement_is_author() THEN
    RAISE EXCEPTION 'Only the division office may view announcement statistics.'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM procurements.announcement_read_stats_unchecked();
END $$;

-- ------------------------------------------------------------- privileges --
REVOKE EXECUTE ON FUNCTION procurements.announcement_stamp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION procurements.announcement_read_stats_unchecked() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION procurements.announcement_read_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION procurements.announcement_inbox(INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION procurements.announcement_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.announcement_read_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.announcement_inbox(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.announcement_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.announcement_targets(TEXT, BIGINT, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.announcement_targets_me(TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.announcement_me_id() TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.announcement_is_author() TO authenticated;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4: Apply locally and run the test**

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/migrations/198_employee_specialization_announcements.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/198_announcements.sql
```
Expected: last line `ALL 198 ASSERTIONS PASSED`, then `ROLLBACK`. Re-run the migration file once more: it must succeed again (idempotent).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/198_employee_specialization_announcements.sql supabase/tests/198_announcements.sql
git commit -m "feat(db): migration 198 — employee majors columns, division announcements"
```

---

### Task 2: Majors constants + extended learning areas

**Files:**
- Create: `lib/constants/employeeMajors.ts`
- Modify: `lib/constants/learningAreas.ts` (add three codes)
- Modify: `lib/constants/index.ts:52-54` (re-exports)
- Test: `lib/constants/__tests__/employeeMajors.test.ts`

**Interfaces:**
- Produces:
  - `interface MajorOption { code: string; label: string; group: string }`
  - `UNDERGRAD_MAJORS: readonly MajorOption[]`, `GRADUATE_MAJORS: readonly MajorOption[]`
  - `OTHER_CODE = "other"`, `OTHER_PREFIX = "other:"`, `OTHER_TEXT_MAX = 120`
  - `encodeMajor(code: string | null | undefined, otherText?: string): string | null`
  - `decodeMajor(value: string | null | undefined): { code: string | null; otherText: string }`
  - `majorLabel(list: readonly MajorOption[], value: string | null | undefined): string` — `"—"` for blank, `"Other: <text>"` for other
  - `majorGroupCode(value: string | null | undefined): string | null` — `other:x` → `"other"`
  - `LEARNING_AREAS` gains `general`, `sped`, `als`

- [ ] **Step 1: Write the failing test**

`lib/constants/__tests__/employeeMajors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  GRADUATE_MAJORS,
  UNDERGRAD_MAJORS,
  OTHER_TEXT_MAX,
  decodeMajor,
  encodeMajor,
  majorGroupCode,
  majorLabel,
} from "../employeeMajors";
import { LEARNING_AREAS } from "../learningAreas";

describe("major lists", () => {
  it.each([
    ["undergrad", UNDERGRAD_MAJORS],
    ["graduate", GRADUATE_MAJORS],
  ])("%s codes are unique and carry General and Other", (_, list) => {
    const codes = list.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain("general");
    expect(codes).toContain("other");
    expect(codes.every((c) => !c.includes(":"))).toBe(true);
  });

  it("graduate list offers None", () => {
    expect(GRADUATE_MAJORS.map((m) => m.code)).toContain("none");
  });

  it("learning areas add general, sped and als without dropping old codes", () => {
    const codes = LEARNING_AREAS.map((a) => a.code);
    for (const c of ["filipino", "english", "math", "science", "ap", "esp",
      "mapeh", "tle", "mt", "kinder", "other", "general", "sped", "als"]) {
      expect(codes).toContain(c);
    }
    expect(codes[codes.length - 1]).toBe("other");
  });
});

describe("encode / decode", () => {
  it("passes a listed code through", () => {
    expect(encodeMajor("bsed_math")).toBe("bsed_math");
    expect(decodeMajor("bsed_math")).toEqual({ code: "bsed_math", otherText: "" });
  });

  it("stores Other with its trimmed text", () => {
    expect(encodeMajor("other", "  AB Psychology ")).toBe("other:AB Psychology");
    expect(decodeMajor("other:AB Psychology")).toEqual({
      code: "other",
      otherText: "AB Psychology",
    });
  });

  it("refuses Other with blank text", () => {
    expect(encodeMajor("other", "   ")).toBeNull();
    expect(encodeMajor("other")).toBeNull();
  });

  it("caps Other text", () => {
    const long = "x".repeat(OTHER_TEXT_MAX + 30);
    expect(encodeMajor("other", long)).toBe(`other:${"x".repeat(OTHER_TEXT_MAX)}`);
  });

  it("blank is null", () => {
    expect(encodeMajor("")).toBeNull();
    expect(encodeMajor(null)).toBeNull();
    expect(decodeMajor(null)).toEqual({ code: null, otherText: "" });
  });
});

describe("labels and grouping", () => {
  it("labels listed, other and blank", () => {
    expect(majorLabel(UNDERGRAD_MAJORS, "bsed_english")).toBe("BSEd – English");
    expect(majorLabel(UNDERGRAD_MAJORS, "other:AB Psychology")).toBe(
      "Other: AB Psychology",
    );
    expect(majorLabel(UNDERGRAD_MAJORS, null)).toBe("—");
  });

  it("an unknown stored code prints as itself", () => {
    expect(majorLabel(UNDERGRAD_MAJORS, "retired_code")).toBe("retired_code");
  });

  it("groups every Other answer together", () => {
    expect(majorGroupCode("other:AB Psychology")).toBe("other");
    expect(majorGroupCode("bsed_math")).toBe("bsed_math");
    expect(majorGroupCode("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/constants/__tests__/employeeMajors.test.ts`
Expected: FAIL — `Cannot find module '../employeeMajors'`.

- [ ] **Step 3: Implement**

`lib/constants/employeeMajors.ts`:

```ts
/**
 * Employee majors (migration 198) — parts 1 and 2 of the /profile
 * Specialization section. Part 3, the specialization at DepEd, is
 * `sms_users.learning_area` and lives in ./learningAreas.
 *
 * Sources: CHED CMO 74-82 s.2017 teacher-education PSGs (BEEd, BECEd, BSNEd,
 * BTLEd, BPEd, BCAEd; BSEd majors English, Filipino, Mathematics, Science,
 * Social Studies, Values Education), the pre-2017 BSEd/BEEd majors serving
 * teachers still hold, and the MAEd/MEd/EdD/PhD majors Philippine graduate
 * schools offer. Free TEXT, app-validated (119/132 precedent): revising a list
 * is a change here, never a migration. A stored code no longer listed still
 * prints as itself rather than disappearing.
 *
 * Stored value: the code, or `other:<typed text>` when the person picked Other.
 */

export interface MajorOption {
  code: string;
  label: string;
  group: string;
}

export const OTHER_CODE = "other";
export const OTHER_PREFIX = "other:";
export const OTHER_TEXT_MAX = 120;

const G_GENERAL = "General";
const G_ELEM = "Elementary / Early Childhood Education";
const G_SEC = "Secondary Education (BSEd)";
const G_TECH = "Technology, PE, Arts & Library Education";
const G_NON = "Non-Education Degree";
const G_OTHER = "Other";

export const UNDERGRAD_MAJORS: readonly MajorOption[] = [
  { code: "general", label: "General Education (BEEd General Curriculum)", group: G_GENERAL },
  { code: "beed_ece", label: "BEEd – Pre-school / Early Childhood", group: G_ELEM },
  { code: "beed_sped", label: "BEEd – Special Education", group: G_ELEM },
  { code: "beed_english", label: "BEEd – Content Area: English", group: G_ELEM },
  { code: "beed_filipino", label: "BEEd – Content Area: Filipino", group: G_ELEM },
  { code: "beed_math", label: "BEEd – Content Area: Mathematics", group: G_ELEM },
  { code: "beed_science", label: "BEEd – Content Area: Science", group: G_ELEM },
  { code: "beed_social_studies", label: "BEEd – Content Area: Social Studies", group: G_ELEM },
  { code: "beced", label: "BECEd – Early Childhood Education", group: G_ELEM },
  { code: "bsned", label: "BSNEd – Special Needs Education", group: G_ELEM },
  { code: "bsed_english", label: "BSEd – English", group: G_SEC },
  { code: "bsed_filipino", label: "BSEd – Filipino", group: G_SEC },
  { code: "bsed_math", label: "BSEd – Mathematics", group: G_SEC },
  { code: "bsed_science", label: "BSEd – Science (General)", group: G_SEC },
  { code: "bsed_biology", label: "BSEd – Biological Science", group: G_SEC },
  { code: "bsed_physical_science", label: "BSEd – Physical Science", group: G_SEC },
  { code: "bsed_social_studies", label: "BSEd – Social Studies", group: G_SEC },
  { code: "bsed_values", label: "BSEd – Values Education", group: G_SEC },
  { code: "bsed_mapeh", label: "BSEd – MAPEH", group: G_SEC },
  { code: "bsed_tle", label: "BSEd – Technology and Livelihood Education", group: G_SEC },
  { code: "bsed_religious", label: "BSEd – Religious Education", group: G_SEC },
  { code: "btled_he", label: "BTLEd – Home Economics", group: G_TECH },
  { code: "btled_ia", label: "BTLEd – Industrial Arts", group: G_TECH },
  { code: "btled_ict", label: "BTLEd – Information and Communication Technology", group: G_TECH },
  { code: "btvted", label: "BTVTEd – Technical-Vocational Teacher Education", group: G_TECH },
  { code: "bped", label: "BPEd – Physical Education", group: G_TECH },
  { code: "bcaed", label: "BCAEd – Culture and Arts Education", group: G_TECH },
  { code: "blis", label: "Library and Information Science", group: G_TECH },
  { code: "non_nursing", label: "Nursing / Allied Health", group: G_NON },
  { code: "non_business", label: "Business / Accountancy", group: G_NON },
  { code: "non_engineering", label: "Engineering / Industrial Technology", group: G_NON },
  { code: "non_it", label: "Information Technology / Computer Science", group: G_NON },
  { code: "non_agriculture", label: "Agriculture / Forestry", group: G_NON },
  { code: "non_arts_sciences", label: "Arts and Sciences (AB / BS)", group: G_NON },
  { code: "non_criminology", label: "Criminology", group: G_NON },
  { code: OTHER_CODE, label: "Other (specify)", group: G_OTHER },
];

const G_MA = "Master's / Graduate Major";
const G_DOC = "Doctorate";

export const GRADUATE_MAJORS: readonly MajorOption[] = [
  { code: "none", label: "None / not yet pursued", group: G_GENERAL },
  { code: "general", label: "General Education", group: G_GENERAL },
  { code: "ed_management", label: "Educational Management / Administration and Supervision", group: G_MA },
  { code: "guidance", label: "Guidance and Counseling", group: G_MA },
  { code: "english", label: "English / Language Teaching", group: G_MA },
  { code: "filipino", label: "Filipino", group: G_MA },
  { code: "math", label: "Mathematics Education", group: G_MA },
  { code: "science", label: "Science Education", group: G_MA },
  { code: "social_studies", label: "Social Studies", group: G_MA },
  { code: "values", label: "Values Education", group: G_MA },
  { code: "mapeh", label: "MAPEH / Physical Education", group: G_MA },
  { code: "tle", label: "TLE / Home Economics", group: G_MA },
  { code: "reading", label: "Reading", group: G_MA },
  { code: "sped", label: "Special Education", group: G_MA },
  { code: "ece", label: "Early Childhood Education", group: G_MA },
  { code: "ict", label: "ICT / Computer Education", group: G_MA },
  { code: "library", label: "Library Science", group: G_MA },
  { code: "public_admin", label: "Public Administration", group: G_MA },
  { code: "nursing", label: "Nursing / Health", group: G_MA },
  { code: "doc_ed_management", label: "Doctorate – Educational Management (EdD / PhD)", group: G_DOC },
  { code: "doc_other", label: "Doctorate – Other field", group: G_DOC },
  { code: OTHER_CODE, label: "Other (specify)", group: G_OTHER },
];

/** The value to store, or null when nothing (or an empty Other) was chosen. */
export function encodeMajor(
  code: string | null | undefined,
  otherText?: string,
): string | null {
  if (!code) return null;
  if (code !== OTHER_CODE) return code;
  const text = (otherText ?? "").trim().slice(0, OTHER_TEXT_MAX);
  return text ? `${OTHER_PREFIX}${text}` : null;
}

export function decodeMajor(value: string | null | undefined): {
  code: string | null;
  otherText: string;
} {
  if (!value) return { code: null, otherText: "" };
  if (value.startsWith(OTHER_PREFIX)) {
    return { code: OTHER_CODE, otherText: value.slice(OTHER_PREFIX.length) };
  }
  return { code: value, otherText: "" };
}

/** Group key for the report: every Other answer counts together. */
export function majorGroupCode(value: string | null | undefined): string | null {
  return decodeMajor(value).code;
}

export function majorLabel(
  list: readonly MajorOption[],
  value: string | null | undefined,
): string {
  const { code, otherText } = decodeMajor(value);
  if (!code) return "—";
  if (code === OTHER_CODE) return otherText ? `Other: ${otherText}` : "Other";
  return list.find((m) => m.code === code)?.label ?? code;
}

/** Distinct groups in list order, for a grouped <Select>. */
export function majorGroups(list: readonly MajorOption[]): string[] {
  return Array.from(new Set(list.map((m) => m.group)));
}
```

In `lib/constants/learningAreas.ts`, replace the array so `other` stays last:

```ts
export const LEARNING_AREAS: LearningArea[] = [
  { code: "general", label: "General Education" },
  { code: "filipino", label: "Filipino" },
  { code: "english", label: "English" },
  { code: "math", label: "Mathematics" },
  { code: "science", label: "Science" },
  { code: "ap", label: "Araling Panlipunan" },
  { code: "esp", label: "Edukasyon sa Pagpapakatao" },
  { code: "mapeh", label: "MAPEH" },
  { code: "tle", label: "TLE / EPP" },
  { code: "mt", label: "Mother Tongue" },
  { code: "kinder", label: "Kindergarten" },
  { code: "sped", label: "Special Education (SPED)" },
  { code: "als", label: "Alternative Learning System (ALS)" },
  { code: "other", label: "Other" },
];
```

In `lib/constants/index.ts` after line 54 add:

```ts
export {
  GRADUATE_MAJORS,
  UNDERGRAD_MAJORS,
  OTHER_CODE,
  OTHER_TEXT_MAX,
  decodeMajor,
  encodeMajor,
  majorGroupCode,
  majorGroups,
  majorLabel,
} from "./employeeMajors";
export type { MajorOption } from "./employeeMajors";
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/constants/__tests__/employeeMajors.test.ts`
Expected: PASS (all). Then `npx vitest run` — full suite still green.

- [ ] **Step 5: Commit**

```bash
git add lib/constants/employeeMajors.ts lib/constants/learningAreas.ts lib/constants/index.ts lib/constants/__tests__/employeeMajors.test.ts
git commit -m "feat(constants): employee major lists; General, SPED, ALS specializations"
```

---

### Task 3: Remove Position, Sex and Teaching Specialization from the `/staff` modal

**Files:**
- Modify: `app/(protected)/staff/AddModal.tsx`

**Interfaces:**
- Consumes: nothing new. Produces: nothing.

- [ ] **Step 1: Record a before-snapshot on local** (the regression check for Review Focus #1)

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -Atc \
 "select id, gender, position, learning_area from procurements.sms_users where gender is not null and learning_area is not null and position is not null order by id limit 1;"
```
Note the id and values.

- [ ] **Step 2: Edit `AddModal.tsx`**
  - `FormSchema`: delete the `position`, `gender` (with its comment) and `learning_area` (with its comment) keys.
  - Delete `initialPosition` (lines ~102-104).
  - Both `defaultValues` (useForm) and the `form.reset({...})` in the `isOpen` effect: delete the `position`, `gender`, `learning_area` lines.
  - `newData` in `onSubmit`: delete `position`, `gender`, and the `learning_area` entry with its comment. Add above `newData`:
    ```ts
      // Position, sex and specialization are the employee's own to keep, on
      // /profile (migration 198). They are left out of this payload entirely —
      // writing null here would erase what the person entered.
    ```
  - JSX: delete the `position` `FormField`, the Sex comment + `gender` `FormField`, and the Teaching Specialization comment + conditional `learning_area` `FormField`.
  - Imports from `@/lib/constants`: remove `LEARNING_AREAS`, `TEACHER_POSITIONS`, `matchTeacherPosition` (keep `Input` — name/email/employee_id still use it; remove any other import ESLint now reports unused).

- [ ] **Step 3: Verify**

Run: `npx eslint "app/(protected)/staff/AddModal.tsx" && npx tsc --noEmit -p .`
Expected: no errors.
Run: `grep -nE "position|gender|learning_area" "app/(protected)/staff/AddModal.tsx"` — Expected: only the new comment and `staff_category_code` lines, no form fields or payload keys.

- [ ] **Step 4: Manual regression on local** — `npm run dev` (confirm `.env.development.local` exists first; stop if not). Sign in on the local stack as a school admin, open `/staff`, edit the person from Step 1, change nothing but the Employee ID, save. Re-run the Step 1 query: gender/position/learning_area unchanged.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/staff/AddModal.tsx"
git commit -m "feat(staff): position, sex and specialization leave the staff modal"
```

---

### Task 4: `/profile` — Sex field and Specialization card

**Files:**
- Modify: `app/(protected)/profile/page.tsx`
- Create: `app/(protected)/profile/components/SpecializationCard.tsx`

**Interfaces:**
- Consumes: `UNDERGRAD_MAJORS`, `GRADUATE_MAJORS`, `LEARNING_AREAS`, `OTHER_CODE`, `OTHER_TEXT_MAX`, `encodeMajor`, `decodeMajor`, `majorGroups` from `@/lib/constants` (Task 2); columns `undergrad_major`, `graduate_major` (Task 1).
- Produces: anchor `id="specialization"` on the card (the announcement link preset in Task 6 targets `/profile#specialization`).

- [ ] **Step 1: Sex on My Details** — in `page.tsx`:
  - `FormSchema`: add `gender: z.enum(["male", "female"]).optional(),`
  - `ProfileRow`: add `gender: string | null;`
  - `defaultValues`: add `gender: undefined`.
  - select string: `"name, email, position, employee_id, phone, type, gender"`.
  - `form.reset`: add `gender: (row.gender as FormType["gender"]) ?? undefined,`
  - update payload and `setProfile` merge: add `gender: values.gender ?? null,`
  - Update the doc comment: "Only the five descriptive fields below…".
  - Add imports `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from `@/components/ui/select`.
  - Insert after the `position` FormField:

```tsx
                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sex</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value ?? ""}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full sm:w-48">
                              <SelectValue placeholder="Select sex" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Used by the division&apos;s personnel and specialization
                          reports.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
```
  - After the My Details `</Card>`, render `{systemUserId != null && <SpecializationCard userId={systemUserId} />}` and import it.

- [ ] **Step 2: Create `SpecializationCard.tsx`**

```tsx
"use client";

/**
 * The three-part specialization (migration 198), kept by the employee:
 * (1) undergraduate major, (2) graduate major, (3) specialization at DepEd —
 * the last being 146's `learning_area`, so the Teaching Specialization report
 * reads it unchanged. Its own form and Save so it can be updated from the
 * announcement link without touching My Details.
 */

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GRADUATE_MAJORS,
  LEARNING_AREAS,
  MajorOption,
  OTHER_CODE,
  OTHER_TEXT_MAX,
  UNDERGRAD_MAJORS,
  decodeMajor,
  encodeMajor,
  majorGroups,
} from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { GraduationCap, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface MajorState {
  code: string;
  otherText: string;
}

const EMPTY: MajorState = { code: "", otherText: "" };

const toState = (value: string | null): MajorState => {
  const { code, otherText } = decodeMajor(value);
  return { code: code ?? "", otherText };
};

function MajorSelect({
  id,
  label,
  hint,
  list,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  list: readonly MajorOption[];
  value: MajorState;
  onChange: (next: MajorState) => void;
  disabled: boolean;
}) {
  const known = !value.code || list.some((m) => m.code === value.code);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value.code}
        onValueChange={(code) => onChange({ code, otherText: value.otherText })}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {majorGroups(list).map((group) => (
            <SelectGroup key={group}>
              <SelectLabel>{group}</SelectLabel>
              {list
                .filter((m) => m.group === group)
                .map((m) => (
                  <SelectItem key={m.code} value={m.code}>
                    {m.label}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
          {!known && (
            <SelectItem value={value.code}>{value.code} (current)</SelectItem>
          )}
        </SelectContent>
      </Select>
      {value.code === OTHER_CODE && (
        <Input
          aria-label={`${label} — specify`}
          placeholder="Type your major"
          maxLength={OTHER_TEXT_MAX}
          value={value.otherText}
          onChange={(e) => onChange({ code: OTHER_CODE, otherText: e.target.value })}
          disabled={disabled}
        />
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function SpecializationCard({ userId }: { userId: number }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [undergrad, setUndergrad] = useState<MajorState>(EMPTY);
  const [graduate, setGraduate] = useState<MajorState>(EMPTY);
  const [learningArea, setLearningArea] = useState("");
  const [saved, setSaved] = useState("");

  const snapshot = (u: MajorState, g: MajorState, l: string) =>
    JSON.stringify([u, g, l]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sms_users")
      .select("undergrad_major, graduate_major, learning_area")
      .eq("id", userId)
      .single();
    setLoading(false);
    if (error || !data) {
      toast.error("Failed to load your specialization.");
      return;
    }
    const u = toState(data.undergrad_major as string | null);
    const g = toState(data.graduate_major as string | null);
    const l = (data.learning_area as string | null) ?? "";
    setUndergrad(u);
    setGraduate(g);
    setLearningArea(l);
    setSaved(snapshot(u, g, l));
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) await load();
    })();
    return () => {
      isMounted = false;
    };
  }, [load]);

  // Arriving from an announcement link: bring the card into view once loaded.
  useEffect(() => {
    if (!loading && window.location.hash === "#specialization") {
      document.getElementById("specialization")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [loading]);

  const dirty = snapshot(undergrad, graduate, learningArea) !== saved;

  const onSave = async () => {
    if (saving) return;
    for (const [state, name] of [
      [undergrad, "undergraduate major"],
      [graduate, "graduate major"],
    ] as const) {
      if (state.code === OTHER_CODE && !state.otherText.trim()) {
        toast.error(`Type your ${name}, or pick it from the list.`);
        return;
      }
    }
    setSaving(true);
    const { error } = await supabase
      .from("sms_users")
      .update({
        undergrad_major: encodeMajor(undergrad.code, undergrad.otherText),
        graduate_major: encodeMajor(graduate.code, graduate.otherText),
        learning_area: learningArea || null,
      })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      toast.error("Failed to save your specialization.");
      return;
    }
    setSaved(snapshot(undergrad, graduate, learningArea));
    toast.success("Specialization updated.");
  };

  return (
    <Card id="specialization" className="scroll-mt-20">
      <CardHeader className="border-b">
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="h-4 w-4" /> Specialization
        </CardTitle>
        <CardDescription>
          Reported to the Schools Division Office. Pick &ldquo;General&rdquo; if
          your major was general education, or &ldquo;Other&rdquo; to type it.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-5">
            <MajorSelect
              id="undergrad-major"
              label="1. Major in college (undergraduate)"
              hint="Your bachelor's degree major."
              list={UNDERGRAD_MAJORS}
              value={undergrad}
              onChange={setUndergrad}
              disabled={saving}
            />
            <MajorSelect
              id="graduate-major"
              label="2. Major in graduate school"
              hint="Master's or doctorate major. Pick “None” if you have not enrolled in one."
              list={GRADUATE_MAJORS}
              value={graduate}
              onChange={setGraduate}
              disabled={saving}
            />
            <div className="space-y-1.5">
              <Label htmlFor="work-specialization">
                3. Specialization at DepEd
              </Label>
              <Select
                value={learningArea}
                onValueChange={setLearningArea}
                disabled={saving}
              >
                <SelectTrigger id="work-specialization" className="w-full">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {LEARNING_AREAS.map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The learning area you mainly teach or handle in your current
                post.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" onClick={onSave} disabled={saving || !dirty}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Save Specialization
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={saving || !dirty}
                onClick={() => load()}
              >
                Discard
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

  Confirm `SelectGroup` and `SelectLabel` are exported from `components/ui/select.tsx` (`grep -n "SelectGroup\|SelectLabel" components/ui/select.tsx`); they are standard shadcn exports.

- [ ] **Step 3: Verify**

Run: `npx eslint "app/(protected)/profile" && npx tsc --noEmit -p .` — Expected: clean.
Manual (local only): open `/profile#specialization`; card scrolls into view. Pick Other with blank text → toast refusal, nothing saved. Pick `BSEd – Mathematics`, `Other: MA Psychology`, `Mathematics` → save → local DB shows `bsed_math`, `other:MA Psychology`, `math`. Set Sex → Save Changes → `gender` stored.

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/profile"
git commit -m "feat(profile): sex and three-part specialization, self-maintained"
```

---

### Task 5: Bell reads announcements

**Files:**
- Create: `lib/announcements/index.ts`
- Modify: `components/notifications/NotificationBell.tsx`, `NotificationDropdown.tsx`, `NotificationItem.tsx`
- Delete: `lib/notifications/service.ts`, `lib/notifications/index.ts`

**Interfaces:**
- Consumes: RPCs `announcement_inbox`, `announcement_unread_count`; table `sms_announcement_reads` (Task 1).
- Produces:
  - `interface InboxAnnouncement { id: number; title: string; body: string; link_path: string | null; created_at: string; is_read: boolean }`
  - `fetchInbox(limit?: number): Promise<InboxAnnouncement[]>`
  - `fetchUnreadCount(): Promise<number>`
  - `markAnnouncementRead(announcementId: number, userId: number): Promise<void>`
  - `markAllAnnouncementsRead(ids: number[], userId: number): Promise<void>`
  - window event name `ANNOUNCEMENTS_CHANGED = "sms:announcements-changed"` (dropdown fires, bell refreshes count)

- [ ] **Step 1: Confirm nothing else imports the old service**

Run: `grep -rn "lib/notifications" app components lib --include=*.ts --include=*.tsx`
Expected: only the three bell components. If anything else appears, stop and report.

- [ ] **Step 2: Create `lib/announcements/index.ts`**

```ts
/**
 * Division announcements for the notification bell (migration 198).
 * Visibility and unread state are decided in SQL; these are thin readers.
 * Errors are logged and swallowed — a broken bell must never break a page.
 */

import { supabase } from "@/lib/supabase/client";

export const ANNOUNCEMENTS_CHANGED = "sms:announcements-changed";

export interface InboxAnnouncement {
  id: number;
  title: string;
  body: string;
  link_path: string | null;
  created_at: string;
  is_read: boolean;
}

export async function fetchInbox(limit = 20): Promise<InboxAnnouncement[]> {
  const { data, error } = await supabase.rpc("announcement_inbox", {
    p_limit: limit,
  });
  if (error) {
    console.error("Failed to load announcements:", error);
    return [];
  }
  return ((data ?? []) as InboxAnnouncement[]).map((a) => ({
    ...a,
    id: Number(a.id),
  }));
}

export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc("announcement_unread_count");
  if (error) {
    console.error("Failed to count announcements:", error);
    return 0;
  }
  return Number(data ?? 0);
}

export async function markAllAnnouncementsRead(
  ids: number[],
  userId: number,
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("sms_announcement_reads")
    .upsert(
      ids.map((announcement_id) => ({ announcement_id, user_id: userId })),
      { onConflict: "announcement_id,user_id", ignoreDuplicates: true },
    );
  if (error) console.error("Failed to mark announcements read:", error);
  window.dispatchEvent(new Event(ANNOUNCEMENTS_CHANGED));
}

export async function markAnnouncementRead(
  announcementId: number,
  userId: number,
): Promise<void> {
  await markAllAnnouncementsRead([announcementId], userId);
}
```

- [ ] **Step 3: Rewrite the three components**

`NotificationBell.tsx` — replace the import of `getUnreadCount` with `import { ANNOUNCEMENTS_CHANGED, fetchUnreadCount } from "@/lib/announcements";` and replace the polling effect body:

```tsx
  useEffect(() => {
    if (!user?.system_user_id) return;
    let isMounted = true;

    const loadUnreadCount = async () => {
      const count = await fetchUnreadCount();
      if (isMounted) setUnreadCount(count);
    };

    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000); // Refresh every 30 seconds
    window.addEventListener(ANNOUNCEMENTS_CHANGED, loadUnreadCount);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener(ANNOUNCEMENTS_CHANGED, loadUnreadCount);
    };
  }, [user?.system_user_id]);
```
Add `aria-label="Announcements"` to the bell `Button`.

`NotificationDropdown.tsx` — full replacement:

```tsx
/**
 * Notification Dropdown — the caller's division announcements (migration 198).
 */

"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  InboxAnnouncement,
  fetchInbox,
  markAllAnnouncementsRead,
} from "@/lib/announcements";
import { useCallback, useEffect, useState } from "react";
import { NotificationItem } from "./NotificationItem";

interface NotificationDropdownProps {
  userId: number;
  onClose: () => void;
}

export function NotificationDropdown({
  userId,
  onClose,
}: NotificationDropdownProps) {
  const [items, setItems] = useState<InboxAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await fetchInbox(20);
    setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetchInbox(20).then((data) => {
      if (!isMounted) return;
      setItems(data);
      setLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [userId]);

  const unreadIds = items.filter((a) => !a.is_read).map((a) => a.id);

  const markAll = async () => {
    await markAllAnnouncementsRead(unreadIds, userId);
    await load();
  };

  return (
    <Card className="absolute right-0 top-12 w-96 max-w-[calc(100vw-2rem)] z-50 shadow-lg">
      <CardContent className="p-0">
        <div className="p-4 border-b flex items-center justify-between gap-2">
          <h3 className="font-semibold">Announcements</h3>
          {unreadIds.length > 0 && (
            <Button variant="ghost" size="sm" onClick={markAll}>
              Mark all as read
            </Button>
          )}
        </div>
        <ScrollArea className="h-96">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              No announcements
            </div>
          ) : (
            <div className="divide-y">
              {items.map((a) => (
                <NotificationItem
                  key={a.id}
                  announcement={a}
                  userId={userId}
                  onRead={load}
                  onNavigate={onClose}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
```

`NotificationItem.tsx` — full replacement:

```tsx
/**
 * One announcement in the bell. Clicking marks it read and, when it carries a
 * link, follows it. A failed read (e.g. archived meanwhile) never blocks the
 * navigation — the error is logged inside markAnnouncementRead.
 */

"use client";

import { InboxAnnouncement, markAnnouncementRead } from "@/lib/announcements";
import { useRouter } from "next/navigation";

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface NotificationItemProps {
  announcement: InboxAnnouncement;
  userId: number;
  onRead: () => void;
  onNavigate: () => void;
}

export function NotificationItem({
  announcement,
  userId,
  onRead,
  onNavigate,
}: NotificationItemProps) {
  const router = useRouter();

  const handleClick = async () => {
    if (!announcement.is_read) {
      await markAnnouncementRead(announcement.id, userId);
      onRead();
    }
    if (announcement.link_path) {
      onNavigate();
      router.push(announcement.link_path);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`block w-full text-left p-4 hover:bg-accent transition-colors ${
        !announcement.is_read ? "bg-accent/50" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{announcement.title}</p>
          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line line-clamp-4">
            {announcement.body}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {formatTimeAgo(new Date(announcement.created_at))}
            {announcement.link_path && " · Open"}
          </p>
        </div>
        {!announcement.is_read && (
          <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
        )}
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Delete the dead service**

```bash
git rm lib/notifications/service.ts lib/notifications/index.ts
```
Leave `Notification` / `NotificationType` in `types/database.ts` (harmless; may be referenced by generated types).

- [ ] **Step 5: Verify**

Run: `npx eslint components/notifications lib/announcements && npx tsc --noEmit -p .` — clean.
Manual (local): as a teacher, with an `all` announcement inserted locally via psql (`INSERT INTO procurements.sms_announcements (title, body, link_path) VALUES ('Test', 'Please update', '/profile#specialization');`), badge shows 1; open, click → navigates to `/profile#specialization`, badge drops to 0 without waiting 30 s; click it again → no error in console.

- [ ] **Step 6: Commit**

```bash
git add lib/announcements components/notifications
git commit -m "feat(notifications): bell shows division announcements; drop dead adm_notifications service"
```

---

### Task 6: `/division/announcements` page + sidebar

**Files:**
- Create: `app/(protected)/division/announcements/page.tsx`
- Create: `app/(protected)/division/announcements/components/AnnouncementModal.tsx`
- Modify: `components/AppSidebar.tsx` (division base items + `Megaphone` import)

**Interfaces:**
- Consumes: table `sms_announcements`, RPC `announcement_read_stats` (Task 1); `SchoolFilter`, `ALL_SCHOOLS`, `SchoolOption` from `@/components/division-reports/SchoolFilter`.
- Produces: `PROFILE_SPECIALIZATION_LINK = "/profile#specialization"` (exported from the modal file).

- [ ] **Step 1: Create the modal** `components/AnnouncementModal.tsx`:

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ALL_SCHOOLS,
  SchoolFilter,
} from "@/components/division-reports/SchoolFilter";
import { supabase } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export const PROFILE_SPECIALIZATION_LINK = "/profile#specialization";

export type Audience = "all" | "teachers" | "school_heads";

export const AUDIENCE_LABELS: Record<Audience, string> = {
  all: "All employees",
  teachers: "Teachers only",
  school_heads: "School heads only",
};

export interface AnnouncementRow {
  id: number;
  title: string;
  body: string;
  audience: Audience;
  school_id: number | null;
  link_path: string | null;
  created_at: string;
  archived_at: string | null;
}

type LinkChoice = "none" | "specialization" | "custom";

const linkChoiceOf = (path: string | null): LinkChoice =>
  !path ? "none" : path === PROFILE_SPECIALIZATION_LINK ? "specialization" : "custom";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editData: AnnouncementRow | null;
}

export function AnnouncementModal({ isOpen, onClose, onSaved, editData }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [schoolId, setSchoolId] = useState<string>(ALL_SCHOOLS);
  const [linkChoice, setLinkChoice] = useState<LinkChoice>("specialization");
  const [customPath, setCustomPath] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(editData?.title ?? "Update your specialization");
    setBody(
      editData?.body ??
        "Please open My Profile and fill in your Specialization: your college major, your graduate major, and your specialization at DepEd.",
    );
    setAudience(editData?.audience ?? "all");
    setSchoolId(editData?.school_id != null ? String(editData.school_id) : ALL_SCHOOLS);
    const choice = editData ? linkChoiceOf(editData.link_path) : "specialization";
    setLinkChoice(choice);
    setCustomPath(choice === "custom" ? (editData?.link_path ?? "") : "");
  }, [isOpen, editData]);

  const linkPath =
    linkChoice === "none"
      ? null
      : linkChoice === "specialization"
        ? PROFILE_SPECIALIZATION_LINK
        : customPath.trim() || null;

  const save = async () => {
    if (saving) return;
    if (!title.trim() || !body.trim()) {
      toast.error("Title and message are required.");
      return;
    }
    if (linkChoice === "custom" && (!linkPath || !linkPath.startsWith("/") || linkPath.startsWith("//"))) {
      toast.error("A link must be a page in this system, starting with /.");
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      body: body.trim(),
      audience,
      school_id: schoolId === ALL_SCHOOLS ? null : Number(schoolId),
      link_path: linkPath,
    };
    const { error } = editData
      ? await supabase.from("sms_announcements").update(payload).eq("id", editData.id)
      : await supabase.from("sms_announcements").insert(payload);
    setSaving(false);
    if (error) {
      console.error("Failed to save announcement:", error);
      toast.error("Failed to save the announcement.");
      return;
    }
    toast.success(editData ? "Announcement updated." : "Announcement posted.");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Announcement" : "New Announcement"}</DialogTitle>
          <DialogDescription>
            Appears in the notification bell of every employee it is addressed to.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ann-title">Title</Label>
            <Input id="ann-title" value={title} maxLength={150}
              onChange={(e) => setTitle(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-body">Message</Label>
            <Textarea id="ann-body" rows={5} value={body}
              onChange={(e) => setBody(e.target.value)} disabled={saving} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Send to</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as Audience)} disabled={saving}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
                    <SelectItem key={a} value={a}>{AUDIENCE_LABELS[a]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <SchoolFilter value={schoolId} onChange={setSchoolId} allowAll label="School" />
          </div>
          <div className="space-y-1.5">
            <Label>Link</Label>
            <Select value={linkChoice} onValueChange={(v) => setLinkChoice(v as LinkChoice)} disabled={saving}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No link</SelectItem>
                <SelectItem value="specialization">My Profile → Specialization</SelectItem>
                <SelectItem value="custom">Another page…</SelectItem>
              </SelectContent>
            </Select>
            {linkChoice === "custom" && (
              <Input placeholder="/teacher/grades" value={customPath}
                onChange={(e) => setCustomPath(e.target.value)} disabled={saving} />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {editData ? "Save" : "Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```
(Check `components/ui/textarea.tsx` exists: `ls components/ui/textarea.tsx`; if not, use `<textarea className="w-full rounded-md border px-3 py-2 text-sm">`.)

- [ ] **Step 2: Create the page** `page.tsx`:

```tsx
"use client";

/**
 * Division announcements (migration 198). Posting writes one row; who sees it
 * is decided in SQL by audience + optional school. Archive, never delete.
 * Route sits under /division, so DivisionGuard already limits it to the three
 * author roles, which are also the only ones RLS lets write.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase/client";
import { format } from "date-fns";
import { Archive, ArchiveRestore, Megaphone, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  AUDIENCE_LABELS,
  AnnouncementModal,
  AnnouncementRow,
} from "./components/AnnouncementModal";

interface Stats {
  read: number;
  target: number;
}

export default function Page() {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [schools, setSchools] = useState<Map<number, string>>(new Map());
  const [stats, setStats] = useState<Map<number, Stats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const [annRes, statRes, schoolRes] = await Promise.all([
        supabase
          .from("sms_announcements")
          .select("id, title, body, audience, school_id, link_path, created_at, archived_at")
          .order("created_at", { ascending: false }),
        supabase.rpc("announcement_read_stats"),
        supabase.from("sms_schools").select("id, name"),
      ]);
      if (!isMounted) return;
      if (annRes.error) toast.error("Failed to load announcements.");
      setRows(((annRes.data ?? []) as AnnouncementRow[]).map((r) => ({
        ...r,
        id: Number(r.id),
        school_id: r.school_id == null ? null : Number(r.school_id),
      })));
      const s = new Map<number, Stats>();
      for (const r of (statRes.data ?? []) as {
        announcement_id: number; read_count: number; target_count: number;
      }[]) {
        s.set(Number(r.announcement_id), {
          read: Number(r.read_count),
          target: Number(r.target_count),
        });
      }
      setStats(s);
      setSchools(new Map(((schoolRes.data ?? []) as { id: number; name: string }[])
        .map((x) => [Number(x.id), x.name])));
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  const toggleArchive = async (row: AnnouncementRow) => {
    const { error } = await supabase
      .from("sms_announcements")
      .update({ archived_at: row.archived_at ? null : new Date().toISOString() })
      .eq("id", row.id);
    if (error) {
      toast.error("Failed to update the announcement.");
      return;
    }
    toast.success(row.archived_at ? "Announcement restored." : "Announcement archived.");
    reload();
  };

  return (
    <div>
      <div className="app__title flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="app__title_text flex items-center gap-2">
            <Megaphone className="h-5 w-5" /> Announcements
          </h1>
          <p className="text-sm text-muted-foreground">
            Posted to the notification bell of the employees you address.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New Announcement
        </Button>
      </div>

      <div className="app__content">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No announcements yet. Post one to reach every employee&apos;s bell.
          </p>
        ) : (
          <div className="app__table_shell">
            <div className="app__table_wrapper">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left font-medium">Announcement</th>
                    <th className="text-left font-medium">Sent to</th>
                    <th className="text-left font-medium">Posted</th>
                    <th className="text-right font-medium">Read</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = stats.get(r.id);
                    return (
                      <tr key={r.id} className={r.archived_at ? "opacity-60" : ""}>
                        <td>
                          <div className="font-medium flex items-center gap-2">
                            {r.title}
                            {r.archived_at && <Badge variant="outline" className="text-[10px]">Archived</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">
                            {r.body}
                          </div>
                        </td>
                        <td>
                          {AUDIENCE_LABELS[r.audience]}
                          <div className="text-xs text-muted-foreground">
                            {r.school_id == null ? "All schools" : (schools.get(r.school_id) ?? "—")}
                          </div>
                        </td>
                        <td className="whitespace-nowrap">
                          {format(new Date(r.created_at), "MMM d, yyyy")}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          {st ? `${st.read} of ${st.target}` : "—"}
                        </td>
                        <td>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" aria-label="Edit"
                              onClick={() => { setEditing(r); setModalOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon"
                              aria-label={r.archived_at ? "Restore" : "Archive"}
                              onClick={() => toggleArchive(r)}>
                              {r.archived_at ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AnnouncementModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={reload}
        editData={editing}
      />
    </div>
  );
}
```

- [ ] **Step 3: Sidebar** — in `components/AppSidebar.tsx`, add `Megaphone` to the `lucide-react` import and insert into `divisionBaseItems` after the "School Reports" entry:

```tsx
    {
      // Migration 198: posts to every addressed employee's notification bell.
      title: "Announcements",
      url: "/division/announcements",
      icon: Megaphone,
      moduleName: "division_announcements",
    },
```

- [ ] **Step 4: Verify**

`npx eslint "app/(protected)/division/announcements" components/AppSidebar.tsx && npx tsc --noEmit -p .` — clean.
Manual (local): as division_admin post the default "Update your specialization" to All employees → row shows "0 of N"; sign in as a teacher → bell shows it; click → profile; back as admin → "1 of N". Archive → teacher's badge drops on next poll. A teacher visiting `/division/announcements` is redirected by `DivisionGuard`.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/division/announcements" components/AppSidebar.tsx
git commit -m "feat(division): announcements module"
```

---

### Task 7: Specialization report util (pure aggregation, tested)

**Files:**
- Create: `lib/utils/employeeSpecialization.ts`
- Test: `lib/utils/__tests__/employeeSpecialization.test.ts`

**Interfaces:**
- Consumes: `UNDERGRAD_MAJORS`, `GRADUATE_MAJORS`, `LEARNING_AREAS`, `majorGroupCode`, `majorLabel`, `getLearningAreaLabel`, `DIVISION_USER_TYPES` from `@/lib/constants`.
- Produces:
  - `type SpecializationPart = "undergrad" | "graduate" | "work"`
  - `SPECIALIZATION_PARTS: { key: SpecializationPart; title: string }[]`
  - `interface SpecializationStaff { id: number; name: string; gender: string | null; type: string | null; school_id: number; school_name: string; undergrad_major: string | null; graduate_major: string | null; learning_area: string | null }`
  - `interface SpecializationCountRow { code: string; label: string; male: number; female: number; unrecorded: number; total: number }`
  - `NOT_ANSWERED_CODE = "__none"`
  - `buildSpecializationCounts(staff, part): SpecializationCountRow[]` — list order, unanswered last, zero rows omitted
  - `isIncomplete(p: SpecializationStaff): boolean`
  - `partLabel(part, p): string`
  - `specializationExportRows(staff, divisionWide: boolean): Record<string, string>[]`
  - `fetchSpecializationStaff(schoolId: string | number | null): Promise<SpecializationStaff[]>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  NOT_ANSWERED_CODE,
  SpecializationStaff,
  buildSpecializationCounts,
  isIncomplete,
  partLabel,
  specializationExportRows,
} from "../employeeSpecialization";

const person = (o: Partial<SpecializationStaff>): SpecializationStaff => ({
  id: 1, name: "A", gender: null, type: "teacher", school_id: 1,
  school_name: "S1", undergrad_major: null, graduate_major: null,
  learning_area: null, ...o,
});

describe("buildSpecializationCounts", () => {
  const staff = [
    person({ id: 1, gender: "male", undergrad_major: "bsed_math" }),
    person({ id: 2, gender: "female", undergrad_major: "bsed_math" }),
    person({ id: 3, gender: null, undergrad_major: "other:AB Psych" }),
    person({ id: 4, gender: "female", undergrad_major: "other:BS Bio" }),
    person({ id: 5, gender: "male" }),
    person({ id: 6, gender: "female", undergrad_major: "general" }),
  ];

  it("counts by sex, groups every Other together, puts unanswered last", () => {
    const rows = buildSpecializationCounts(staff, "undergrad");
    expect(rows.map((r) => r.code)).toEqual([
      "general", "bsed_math", "other", NOT_ANSWERED_CODE,
    ]);
    const math = rows.find((r) => r.code === "bsed_math")!;
    expect([math.male, math.female, math.unrecorded, math.total]).toEqual([1, 1, 0, 2]);
    const other = rows.find((r) => r.code === "other")!;
    expect([other.female, other.unrecorded, other.total]).toEqual([1, 1, 2]);
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(staff.length);
  });

  it("keeps an unlisted stored code as its own row, before Other", () => {
    const rows = buildSpecializationCounts(
      [person({ undergrad_major: "retired_code" }), person({ id: 2, undergrad_major: "other:x" })],
      "undergrad",
    );
    expect(rows.map((r) => r.code)).toEqual(["retired_code", "other"]);
    expect(rows[0].label).toBe("retired_code");
  });

  it("reads part 3 from learning_area", () => {
    const rows = buildSpecializationCounts(
      [person({ learning_area: "math" }), person({ id: 2, learning_area: "general" })],
      "work",
    );
    expect(rows.map((r) => r.code)).toEqual(["general", "math"]);
    expect(rows[1].label).toBe("Mathematics");
  });
});

describe("roster helpers", () => {
  it("incomplete when any part is blank", () => {
    expect(isIncomplete(person({ undergrad_major: "general", graduate_major: "none", learning_area: "math" }))).toBe(false);
    expect(isIncomplete(person({ undergrad_major: "general", graduate_major: "none" }))).toBe(true);
  });

  it("labels Other with the typed text", () => {
    expect(partLabel("graduate", person({ graduate_major: "other:MA Psych" }))).toBe("Other: MA Psych");
  });

  it("export carries School only division-wide", () => {
    const p = person({ undergrad_major: "bsed_math", gender: "male" });
    expect(Object.keys(specializationExportRows([p], true)[0])).toContain("School");
    expect(Object.keys(specializationExportRows([p], false)[0])).not.toContain("School");
    expect(specializationExportRows([p], false)[0]["Sex"]).toBe("Male");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/utils/__tests__/employeeSpecialization.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `lib/utils/employeeSpecialization.ts`:

```ts
/**
 * Employee Specialization report (migration 198): who holds which
 * undergraduate major, graduate major and DepEd specialization, by sex, at one
 * school or division-wide, plus who has not answered.
 *
 * Same membership as Staff by Position (lib/utils/positionSummary.ts): active
 * school-level accounts, division-office roles excluded, `school_id` = active
 * school (134). No RPC: 001's SELECT policy lets any authenticated user read
 * `sms_users`.
 */

import {
  DIVISION_USER_TYPES,
  GRADUATE_MAJORS,
  LEARNING_AREAS,
  MajorOption,
  OTHER_CODE,
  UNDERGRAD_MAJORS,
  getLearningAreaLabel,
  majorGroupCode,
  majorLabel,
} from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";

export type SpecializationPart = "undergrad" | "graduate" | "work";

export const SPECIALIZATION_PARTS: { key: SpecializationPart; title: string }[] = [
  { key: "undergrad", title: "Major in College (Undergraduate)" },
  { key: "graduate", title: "Major in Graduate School" },
  { key: "work", title: "Specialization at DepEd" },
];

export const NOT_ANSWERED_CODE = "__none";
const NOT_ANSWERED_LABEL = "Not yet answered";

export interface SpecializationStaff {
  id: number;
  name: string;
  gender: string | null;
  type: string | null;
  school_id: number;
  school_name: string;
  undergrad_major: string | null;
  graduate_major: string | null;
  learning_area: string | null;
}

export interface SpecializationCountRow {
  code: string;
  label: string;
  male: number;
  female: number;
  unrecorded: number;
  total: number;
}

const WORK_OPTIONS: MajorOption[] = LEARNING_AREAS.map((a) => ({
  code: a.code,
  label: a.label,
  group: "",
}));

function optionsFor(part: SpecializationPart): readonly MajorOption[] {
  return part === "undergrad"
    ? UNDERGRAD_MAJORS
    : part === "graduate"
      ? GRADUATE_MAJORS
      : WORK_OPTIONS;
}

function rawValue(part: SpecializationPart, p: SpecializationStaff): string | null {
  return part === "undergrad"
    ? p.undergrad_major
    : part === "graduate"
      ? p.graduate_major
      : p.learning_area;
}

export function partLabel(part: SpecializationPart, p: SpecializationStaff): string {
  const value = rawValue(part, p);
  if (part === "work") return value ? getLearningAreaLabel(value) : "—";
  return majorLabel(optionsFor(part), value);
}

export function isIncomplete(p: SpecializationStaff): boolean {
  return !p.undergrad_major || !p.graduate_major || !p.learning_area;
}

export function buildSpecializationCounts(
  staff: SpecializationStaff[],
  part: SpecializationPart,
): SpecializationCountRow[] {
  const options = optionsFor(part);
  const rows = new Map<string, SpecializationCountRow>();

  for (const p of staff) {
    const code = majorGroupCode(rawValue(part, p)) ?? NOT_ANSWERED_CODE;
    let row = rows.get(code);
    if (!row) {
      const listed = options.find((o) => o.code === code);
      row = {
        code,
        label:
          code === NOT_ANSWERED_CODE
            ? NOT_ANSWERED_LABEL
            : code === OTHER_CODE
              ? "Other"
              : (listed?.label ?? code),
        male: 0,
        female: 0,
        unrecorded: 0,
        total: 0,
      };
      rows.set(code, row);
    }
    if (p.gender === "male") row.male += 1;
    else if (p.gender === "female") row.female += 1;
    else row.unrecorded += 1;
    row.total += 1;
  }

  // List order; an unlisted stored code just before Other; Other, then unanswered, last.
  const rank = (code: string): number => {
    if (code === NOT_ANSWERED_CODE) return options.length + 2;
    if (code === OTHER_CODE) return options.length + 1;
    const i = options.findIndex((o) => o.code === code);
    return i === -1 ? options.length : i;
  };
  return Array.from(rows.values()).sort(
    (a, b) => rank(a.code) - rank(b.code) || a.label.localeCompare(b.label),
  );
}

const sexWord = (g: string | null) =>
  g === "male" ? "Male" : g === "female" ? "Female" : "";

export function specializationExportRows(
  staff: SpecializationStaff[],
  divisionWide: boolean,
): Record<string, string>[] {
  return staff.map((p) => ({
    ...(divisionWide ? { School: p.school_name } : {}),
    Name: p.name,
    Sex: sexWord(p.gender),
    "Major in College": partLabel("undergrad", p).replace(/^—$/, ""),
    "Major in Graduate School": partLabel("graduate", p).replace(/^—$/, ""),
    "Specialization at DepEd": partLabel("work", p).replace(/^—$/, ""),
  }));
}

const PAGE = 1000;

export async function fetchSpecializationStaff(
  schoolId: string | number | null,
): Promise<SpecializationStaff[]> {
  let schoolQuery = supabase.from("sms_schools").select("id, name").eq("is_active", true);
  if (schoolId !== null) schoolQuery = schoolQuery.eq("id", Number(schoolId));
  const { data: schools, error: schoolError } = await schoolQuery;
  if (schoolError) throw new Error(schoolError.message);
  const schoolNames = new Map<number, string>(
    (schools ?? []).map((s) => [Number(s.id), s.name as string]),
  );
  if (schoolNames.size === 0) return [];

  const excluded = `(${DIVISION_USER_TYPES.map((t) => `"${t}"`).join(",")})`;
  const staff: SpecializationStaff[] = [];

  // PostgREST caps a response at 1,000 rows; a division's staff exceeds that.
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("sms_users")
      .select("id, name, gender, type, school_id, undergrad_major, graduate_major, learning_area")
      .eq("is_active", true)
      .not("school_id", "is", null)
      .not("type", "in", excluded)
      .order("id")
      .range(from, from + PAGE - 1);
    if (schoolId !== null) query = query.eq("school_id", Number(schoolId));
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    for (const u of data ?? []) {
      const sid = Number(u.school_id);
      const schoolName = schoolNames.get(sid);
      if (schoolName === undefined) continue; // inactive school
      staff.push({
        id: Number(u.id),
        name: (u.name as string) ?? "",
        gender: (u.gender as string | null) ?? null,
        type: (u.type as string | null) ?? null,
        school_id: sid,
        school_name: schoolName,
        undergrad_major: (u.undergrad_major as string | null) ?? null,
        graduate_major: (u.graduate_major as string | null) ?? null,
        learning_area: (u.learning_area as string | null) ?? null,
      });
    }
    if (!data || data.length < PAGE) break;
  }

  return staff.sort(
    (a, b) => a.school_name.localeCompare(b.school_name) || a.name.localeCompare(b.name),
  );
}
```

  Check `lib/constants/index.ts` re-exports `OTHER_CODE` and `DIVISION_USER_TYPES` (Task 2 added the former; confirm the latter with `grep -n DIVISION_USER_TYPES lib/constants/index.ts`).

- [ ] **Step 4: Run tests** — `npx vitest run lib/utils/__tests__/employeeSpecialization.test.ts` → PASS; `npx vitest run` → all green.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/employeeSpecialization.ts lib/utils/__tests__/employeeSpecialization.test.ts
git commit -m "feat(reports): employee specialization aggregation"
```

---

### Task 8: Report view, PDF, division + school pages, index links

**Files:**
- Create: `components/reports/EmployeeSpecializationView.tsx`
- Create: `lib/pdf/generateEmployeeSpecialization.ts`; Modify: `lib/pdf/index.ts` (export)
- Create: `app/(protected)/division/reports/employee-specialization/page.tsx`
- Create: `app/(protected)/school-reports/employee-specialization/page.tsx`
- Modify: `app/(protected)/division/reports/page.tsx` (card after "Teaching Specialization"), `app/(protected)/school-reports/page.tsx` (card after "Staff by Position / Designation")

**Interfaces:**
- Consumes: everything Task 7 produces; `DivisionReportShell`, `EmptyReportState`, `SchoolFilter`, `ALL_SCHOOLS`, `SchoolOption`; `ReportShell`, `ReportAccessDenied`, `ReportNeedsSchool`, `useCanViewReports`; `useReportSchool`; `useSchoolSettings`; `buildReportDocument`, `esc`, `fetchDivisionHeader`, `fetchReportSchool` from `@/lib/pdf/reportShell`; `printHTMLContent` from `@/lib/pdf/utils`; `exportExcel`, `exportCsv`.
- Produces: `EmployeeSpecializationView({ staff, divisionWide }: { staff: SpecializationStaff[]; divisionWide: boolean })`; `generateEmployeeSpecializationPrint(params: { schoolId: string | number | null; staff: SpecializationStaff[]; withRoster: boolean; preparedBy: string; principalName: string | null; principalTitle: string | null }): Promise<void>`

- [ ] **Step 1: View component** `components/reports/EmployeeSpecializationView.tsx`:

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  SPECIALIZATION_PARTS,
  SpecializationStaff,
  buildSpecializationCounts,
  isIncomplete,
  partLabel,
} from "@/lib/utils/employeeSpecialization";
import { useMemo, useState } from "react";

const sexLetter = (g: string | null) => (g === "male" ? "M" : g === "female" ? "F" : "—");

export function EmployeeSpecializationView({
  staff,
  divisionWide,
}: {
  staff: SpecializationStaff[];
  divisionWide: boolean;
}) {
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  const counts = useMemo(
    () => SPECIALIZATION_PARTS.map((p) => ({ ...p, rows: buildSpecializationCounts(staff, p.key) })),
    [staff],
  );
  const missing = useMemo(() => staff.filter(isIncomplete).length, [staff]);
  const roster = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter(
      (p) =>
        (!onlyMissing || isIncomplete(p)) &&
        (!q || p.name.toLowerCase().includes(q) || p.school_name.toLowerCase().includes(q)),
    );
  }, [staff, search, onlyMissing]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {staff.length} employee{staff.length === 1 ? "" : "s"} · {missing} not yet fully updated.
      </p>

      <div className="grid gap-4 xl:grid-cols-3">
        {counts.map((part) => (
          <div key={part.key} className="space-y-2">
            <h3 className="text-sm font-semibold">{part.title}</h3>
            <div className="app__table_shell">
              <div className="app__table_wrapper">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left font-medium">Major / Specialization</th>
                      <th className="text-right font-medium w-10">M</th>
                      <th className="text-right font-medium w-10">F</th>
                      <th className="text-right font-medium w-12">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {part.rows.map((r) => (
                      <tr key={r.code}>
                        <td>{r.label}</td>
                        <td className="text-right">{r.male}</td>
                        <td className="text-right">{r.female}</td>
                        <td className="text-right font-medium">{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Totals include employees whose sex is not recorded, so M + F may be less than Total.
      </p>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-sm font-semibold">Employees</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder={divisionWide ? "Search name or school" : "Search name"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64"
            />
            <div className="flex items-center gap-2">
              <Switch id="only-missing" checked={onlyMissing} onCheckedChange={setOnlyMissing} />
              <Label htmlFor="only-missing" className="text-sm">Not yet updated</Label>
            </div>
          </div>
        </div>
        <div className="app__table_shell">
          <div className="app__table_wrapper">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left font-medium w-8">#</th>
                  {divisionWide && <th className="text-left font-medium">School</th>}
                  <th className="text-left font-medium">Name</th>
                  <th className="text-center font-medium w-12">Sex</th>
                  <th className="text-left font-medium">College Major</th>
                  <th className="text-left font-medium">Graduate Major</th>
                  <th className="text-left font-medium">DepEd Specialization</th>
                </tr>
              </thead>
              <tbody>
                {roster.length === 0 ? (
                  <tr>
                    <td colSpan={divisionWide ? 7 : 6} className="py-6 text-center text-muted-foreground">
                      No employees match.
                    </td>
                  </tr>
                ) : (
                  roster.map((p, i) => (
                    <tr key={p.id}>
                      <td className="text-muted-foreground">{i + 1}</td>
                      {divisionWide && <td>{p.school_name}</td>}
                      <td className="font-medium">{p.name}</td>
                      <td className="text-center">{sexLetter(p.gender)}</td>
                      <td>{partLabel("undergrad", p)}</td>
                      <td>{partLabel("graduate", p)}</td>
                      <td>{partLabel("work", p)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: PDF** `lib/pdf/generateEmployeeSpecialization.ts`:

```ts
/**
 * Printable: Employee Specialization — three count tables (college major,
 * graduate major, DepEd specialization) by sex, optionally with the roster.
 */

import {
  buildReportDocument,
  esc,
  fetchDivisionHeader,
  fetchReportSchool,
} from "@/lib/pdf/reportShell";
import { printHTMLContent } from "@/lib/pdf/utils";
import {
  SPECIALIZATION_PARTS,
  SpecializationStaff,
  buildSpecializationCounts,
  partLabel,
} from "@/lib/utils/employeeSpecialization";
import { format } from "date-fns";

export interface EmployeeSpecializationPrintParams {
  /** null = division-wide. */
  schoolId: string | number | null;
  staff: SpecializationStaff[];
  withRoster: boolean;
  preparedBy: string;
  principalName: string | null;
  principalTitle: string | null;
}

export async function generateEmployeeSpecializationPrint(
  params: EmployeeSpecializationPrintParams,
): Promise<void> {
  const { schoolId, staff, withRoster, preparedBy, principalName, principalTitle } = params;
  const divisionWide = schoolId === null;
  const school = divisionWide ? await fetchDivisionHeader() : await fetchReportSchool(schoolId);

  const tables = SPECIALIZATION_PARTS.map((part) => {
    const rows = buildSpecializationCounts(staff, part.key);
    return `<h3 style="font-size:10pt; margin:10px 0 4px;">${esc(part.title)}</h3>
<table class="report" style="width:80%; margin:0 auto 8px;">
  <thead><tr><th>Major / Specialization</th><th style="width:10%">Male</th>
  <th style="width:10%">Female</th><th style="width:10%">Total</th></tr></thead>
  <tbody>
    ${rows
      .map(
        (r) => `<tr><td>${esc(r.label)}</td><td class="ctr">${r.male}</td>
<td class="ctr">${r.female}</td><td class="ctr"><b>${r.total}</b></td></tr>`,
      )
      .join("\n")}
    <tr class="subtotal"><td>TOTAL</td>
      <td class="ctr">${rows.reduce((s, r) => s + r.male, 0)}</td>
      <td class="ctr">${rows.reduce((s, r) => s + r.female, 0)}</td>
      <td class="ctr">${staff.length}</td></tr>
  </tbody>
</table>`;
  }).join("\n");

  const roster = withRoster
    ? `<h3 style="font-size:10pt; margin:14px 0 4px;">Employees</h3>
<table class="report" style="width:100%;">
  <thead><tr><th style="width:4%">#</th>${divisionWide ? "<th>School</th>" : ""}
  <th>Name</th><th style="width:5%">Sex</th><th>College Major</th>
  <th>Graduate Major</th><th>DepEd Specialization</th></tr></thead>
  <tbody>
    ${staff
      .map(
        (p, i) => `<tr><td class="ctr">${i + 1}</td>${
          divisionWide ? `<td>${esc(p.school_name)}</td>` : ""
        }<td>${esc(p.name)}</td><td class="ctr">${
          p.gender === "male" ? "M" : p.gender === "female" ? "F" : "—"
        }</td><td>${esc(partLabel("undergrad", p))}</td><td>${esc(
          partLabel("graduate", p),
        )}</td><td>${esc(partLabel("work", p))}</td></tr>`,
      )
      .join("\n")}
  </tbody>
</table>`
    : "";

  const body =
    staff.length > 0
      ? `${tables}${roster}
<p style="font-size:8pt; font-style:italic;">Active staff records only. Answers are
entered by each employee on My Profile. Division office accounts are not counted.</p>`
      : `<p class="empty">No active staff records.</p>`;

  printHTMLContent(
    buildReportDocument({
      school,
      title: "Employee Specialization",
      subtitle: `As of ${format(new Date(), "MMMM d, yyyy")}${divisionWide ? " — All Schools" : ""}`,
      body,
      preparedBy,
      principalName,
      principalTitle,
    }),
  );
}
```
Append to `lib/pdf/index.ts`:
```ts
export { generateEmployeeSpecializationPrint, type EmployeeSpecializationPrintParams } from "./generateEmployeeSpecialization";
```

- [ ] **Step 3: Division page** `app/(protected)/division/reports/employee-specialization/page.tsx`:

```tsx
"use client";

/**
 * Employee Specialization — every employee's college major, graduate major and
 * DepEd specialization (migration 198), by sex, division-wide or at one school,
 * with who has not answered yet. See lib/utils/employeeSpecialization.ts.
 */

import {
  DivisionReportShell,
  EmptyReportState,
} from "@/components/division-reports/DivisionReportShell";
import {
  ALL_SCHOOLS,
  SchoolFilter,
  SchoolOption,
} from "@/components/division-reports/SchoolFilter";
import { EmployeeSpecializationView } from "@/components/reports/EmployeeSpecializationView";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { generateEmployeeSpecializationPrint } from "@/lib/pdf";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { exportCsv } from "@/lib/utils/exportCsv";
import { exportExcel } from "@/lib/utils/exportExcel";
import {
  SpecializationStaff,
  fetchSpecializationStaff,
  specializationExportRows,
} from "@/lib/utils/employeeSpecialization";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [schoolId, setSchoolId] = useState<string>(ALL_SCHOOLS);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [staff, setStaff] = useState<SpecializationStaff[]>([]);
  const [loading, setLoading] = useState(false);
  const [withRoster, setWithRoster] = useState(false);
  const [schoolHead, setSchoolHead] = useState<{ name: string; position: string | null } | null>(null);

  const handleSchoolsLoaded = useCallback((options: SchoolOption[]) => setSchools(options), []);
  const isDivisionWide = schoolId === ALL_SCHOOLS;

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchSpecializationStaff(isDivisionWide ? null : schoolId);
        if (isMounted) setStaff(data);
      } catch (err) {
        if (!isMounted) return;
        toast.error(err instanceof Error ? err.message : "Failed to load the report");
        setStaff([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [schoolId, isDivisionWide]);

  useEffect(() => {
    let isMounted = true;
    if (isDivisionWide) {
      setSchoolHead(null);
      return;
    }
    supabase
      .from("sms_users")
      .select("name, position")
      .eq("school_id", Number(schoolId))
      .eq("type", "school_head")
      .eq("is_active", true)
      .limit(1)
      .then(({ data, error }) => {
        if (!isMounted || error) return;
        const head = data?.[0];
        setSchoolHead(head ? { name: head.name as string, position: head.position as string | null } : null);
      });
    return () => {
      isMounted = false;
    };
  }, [schoolId, isDivisionWide]);

  const schoolName = isDivisionWide ? "All Schools" : (schools.find((s) => s.id === schoolId)?.name ?? "");
  const rows = () => specializationExportRows(staff, isDivisionWide);
  const activeFilters = isDivisionWide
    ? []
    : [{ label: `School: ${schoolName}`, onClear: () => setSchoolId(ALL_SCHOOLS) }];

  return (
    <DivisionReportShell
      title="Employee Specialization"
      description="College major, graduate major and DepEd specialization of every employee, by sex — and who has not answered yet."
      loading={loading}
      recordCount={staff.length}
      exportDisabled={staff.length === 0}
      onExportCsv={() => {
        const data = rows();
        exportCsv(data, Object.keys(data[0] ?? {}), "employee_specialization.csv");
      }}
      onExportExcel={() => exportExcel(rows(), "employee_specialization.xlsx", "Employees")}
      onPrint={async () => {
        try {
          await generateEmployeeSpecializationPrint({
            schoolId: isDivisionWide ? null : schoolId,
            staff,
            withRoster,
            preparedBy: user?.name ?? "",
            principalName: schoolHead?.name ?? null,
            principalTitle: schoolHead?.position ?? "School Head",
          });
        } catch (err) {
          console.error("Error printing employee specialization:", err);
          toast.error("Failed to generate the printout");
        }
      }}
      activeFilters={activeFilters}
      onClearFilters={activeFilters.length > 0 ? () => setSchoolId(ALL_SCHOOLS) : undefined}
      filterBar={
        <>
          <SchoolFilter value={schoolId} onChange={setSchoolId} allowAll onLoaded={handleSchoolsLoaded} />
          <div className="flex items-center gap-2 self-end pb-2">
            <Switch id="with-roster" checked={withRoster} onCheckedChange={setWithRoster} />
            <Label htmlFor="with-roster" className="text-sm">Print names</Label>
          </div>
        </>
      }
    >
      {staff.length === 0 ? (
        <EmptyReportState message={loading ? "Loading…" : "No active staff records."} />
      ) : (
        <EmployeeSpecializationView staff={staff} divisionWide={isDivisionWide} />
      )}
    </DivisionReportShell>
  );
}
```
Check `exportCsv`'s signature first (`sed -n 1,15p lib/utils/exportCsv.ts`) and match its header argument shape — Staff by Position passes `(rows, headers, filename)`; if `headers` is `{ key, label }[]` rather than `string[]`, map `Object.keys(...)` to that shape.

- [ ] **Step 4: School page** `app/(protected)/school-reports/employee-specialization/page.tsx`:

```tsx
"use client";

/**
 * Employee Specialization — this school's own cut of the division report.
 * Pinned to the active school by ReportSchoolContext (164).
 */

import { EmployeeSpecializationView } from "@/components/reports/EmployeeSpecializationView";
import { useReportSchool } from "@/components/reports/ReportSchoolContext";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { generateEmployeeSpecializationPrint } from "@/lib/pdf";
import { useAppSelector } from "@/lib/redux/hook";
import {
  SpecializationStaff,
  fetchSpecializationStaff,
} from "@/lib/utils/employeeSpecialization";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  ReportAccessDenied,
  ReportNeedsSchool,
  ReportShell,
  useCanViewReports,
} from "../components/ReportShell";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const canView = useCanViewReports();
  const { schoolId } = useReportSchool();
  const [staff, setStaff] = useState<SpecializationStaff[]>([]);
  const [loading, setLoading] = useState(false);
  const [withRoster, setWithRoster] = useState(true);
  const { settings } = useSchoolSettings(Boolean(schoolId), schoolId);

  useEffect(() => {
    let isMounted = true;
    if (!canView || !schoolId) {
      setStaff([]);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const data = await fetchSpecializationStaff(schoolId);
        if (isMounted) setStaff(data);
      } catch (err) {
        console.error("Error loading employee specialization:", err);
        if (!isMounted) return;
        toast.error(err instanceof Error ? err.message : "Failed to load the report");
        setStaff([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [canView, schoolId]);

  if (!canView) return <ReportAccessDenied />;
  if (!schoolId) return <ReportNeedsSchool />;

  return (
    <ReportShell
      title="Employee Specialization"
      description="College major, graduate major and DepEd specialization of this school's employees, by sex."
      onPrint={async () => {
        try {
          await generateEmployeeSpecializationPrint({
            schoolId,
            staff,
            withRoster,
            preparedBy: user?.name ?? "",
            principalName: settings.principal_name,
            principalTitle: settings.principal_title,
          });
        } catch (err) {
          console.error("Error printing employee specialization:", err);
          toast.error("Failed to generate PDF");
        }
      }}
      printDisabled={loading || staff.length === 0}
      filters={
        <div className="flex items-center justify-end gap-2">
          <Switch id="with-roster" checked={withRoster} onCheckedChange={setWithRoster} />
          <Label htmlFor="with-roster" className="text-sm">Print names</Label>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : staff.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No active staff records for this school.</p>
      ) : (
        <EmployeeSpecializationView staff={staff} divisionWide={false} />
      )}
    </ReportShell>
  );
}
```

- [ ] **Step 5: Index cards**
  - `app/(protected)/division/reports/page.tsx`, after the "Teaching Specialization" entry:
    ```tsx
      {
        title: "Employee Specialization",
        description:
          "College major, graduate major and DepEd specialization of every employee, by sex — with who has not answered. Printable.",
        href: "/division/reports/employee-specialization",
        icon: GraduationCap,
        available: true,
      },
    ```
  - `app/(protected)/school-reports/page.tsx`, after "Staff by Position / Designation":
    ```tsx
      {
        title: "Employee Specialization",
        description:
          "Each employee's college major, graduate major and DepEd specialization, counted by sex, with who has not answered yet.",
        href: "/school-reports/employee-specialization",
        icon: GraduationCap,
      },
    ```
  - Add `GraduationCap` to each file's `lucide-react` import.

- [ ] **Step 6: Verify**

`npx eslint components/reports/EmployeeSpecializationView.tsx lib/pdf/generateEmployeeSpecialization.ts "app/(protected)/division/reports" "app/(protected)/school-reports" && npx tsc --noEmit -p .` — clean.
Manual (local): division report "All Schools" loads (>1,000 staff → pagination works; compare count to `select count(*) from procurements.sms_users where is_active and school_id is not null and type not in ('super admin','division_admin','division_type')` restricted to active schools); totals per table equal employee count; "Not yet updated" filter narrows; Excel export opens; Print renders three tables (+ roster when toggled). School report as a school head shows only their school.

- [ ] **Step 7: Commit**

```bash
git add components/reports/EmployeeSpecializationView.tsx lib/pdf/generateEmployeeSpecialization.ts lib/pdf/index.ts "app/(protected)/division/reports" "app/(protected)/school-reports"
git commit -m "feat(reports): employee specialization report, division and school"
```

---

### Task 9: Document and verify the whole branch

**Files:**
- Modify: `CLAUDE.md` (migration table row 198; Key Features rows for Announcements and Employee Specialization)
- Modify: `docs/superpowers/specs/2026-10-05-employee-specialization-announcements-design.md` (section 4: no RPC — direct `sms_users` read per Staff-by-Position; bell via `announcement_inbox` / `announcement_unread_count`)

- [ ] **Step 1: CLAUDE.md** — add to *Key Features & Locations*:

```
| **Division announcements** | `division/announcements/`, `lib/announcements/`, `components/notifications/`, migration 198 | One row per announcement, never fanned out; audience `all`/`teachers`/`school_heads` + optional school, decided in SQL by `announcement_targets` (shared by RLS, the bell RPCs and the read stats). Archive, never delete. The bell previously read a non-existent `adm_notifications` table |
| **Employee specialization** | `profile/components/SpecializationCard.tsx`, `lib/constants/employeeMajors.ts`, `lib/utils/employeeSpecialization.ts`, `division/reports/employee-specialization`, `school-reports/employee-specialization`, migration 198 | Self-maintained on /profile: undergrad major, graduate major (`other:<text>` for Other), DepEd specialization = 146's `learning_area`. Position, sex and specialization are no longer on the /staff modal, and its save never writes them |
```
and to *Notable Recent Migrations*:
```
| 198 | **Employee specialization + division announcements** — `sms_users.undergrad_major` / `graduate_major` (nullable TEXT, app-validated against `lib/constants/employeeMajors.ts`; value = code or `other:<text>`); part 3 reuses 146's `learning_area`, so existing answers and the Teaching Specialization report are untouched (adds `general`, `sped`, `als` codes in the app only). `sms_announcements` + `sms_announcement_reads`, RLS: authors = division_admin / division_type / super admin; recipients by active type + active school (invariants 12-13). `announcement_inbox`, `announcement_unread_count` (INVOKER), `announcement_read_stats` (DEFINER, author-guarded). Two nullable columns, two tables, new functions; no existing object touched, no DML. Tests: `supabase/tests/198_announcements.sql` |
```

- [ ] **Step 2: Full verification**

```bash
npx vitest run
npm run lint
npx tsc --noEmit -p .
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/198_announcements.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/194_exam_qa_review.sql
```
Expected: all pass; 198 prints `ALL 198 ASSERTIONS PASSED`. Do **not** run `npm run build` against anything but the local env; if run, it only compiles.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-05-employee-specialization-announcements-design.md
git commit -m "docs: migration 198, announcements and employee specialization"
```

- [ ] **Step 4: Hand-off to the user** — report: migration file path, what it changes (2 nullable columns, 2 tables, 7 functions, 7 policies), rows touched on apply (**0**), and that applying it to production is theirs to do; until applied, the profile Specialization save and the bell will error/show 0 in production, so deploy the app **after** the migration.
