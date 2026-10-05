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
SELECT 'a_' || lower(replace(title, ' ', '')), id
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
