-- Migration 237 scenario test. LOCAL DATABASE ONLY.
--   psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/237_division_authors_any_role.sql
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
CREATE FUNCTION tst.expect(p_sql TEXT, p_want TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  EXECUTE p_sql INTO v;
  IF v IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'FAIL expected %, got % for: %', p_want, v, p_sql;
  END IF;
  RAISE NOTICE 'ok  = %: %', v, left(p_sql, 80);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tst TO authenticated;

-- ---------------------------------------------------------------- fixtures --
INSERT INTO tst.ids (name, uid) VALUES
  ('qa',     '00000000-0000-4000-8000-000000237a01'),
  ('t1',     '00000000-0000-4000-8000-000000237b01'),
  ('t2',     '00000000-0000-4000-8000-000000237b02'),
  ('head',   '00000000-0000-4000-8000-000000237c01'),
  ('reg',    '00000000-0000-4000-8000-000000237c02'),
  ('do',     '00000000-0000-4000-8000-000000237c03'),
  ('region', '00000000-0000-4000-8000-000000237d01'),
  ('viewer', '00000000-0000-4000-8000-000000237d02'),
  ('guard',  '00000000-0000-4000-8000-000000237d03');
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@237.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id) SELECT 'schoolA', min(id) FROM sms_schools;

WITH u(name, type, school) AS (VALUES
  ('qa', 'qa', NULL), ('t1', 'teacher', 'schoolA'), ('t2', 'teacher', 'schoolA'),
  ('head', 'school_head', 'schoolA'), ('reg', 'registrar', 'schoolA'),
  ('do', 'division_type', NULL), ('region', 'region_account', NULL),
  ('viewer', 'sbfp_viewer', NULL), ('guard', 'security_guard', 'schoolA'))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@237.test', u.type, tst.id(u.school), tst.uid(u.name), true FROM u;
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;

INSERT INTO sms_learning_areas (name) VALUES ('T237 Area');
INSERT INTO tst.ids (name, id) SELECT 'la', id FROM sms_learning_areas WHERE name = 'T237 Area';

-- ===================================================== 1. any role authors ==
SELECT tst.claims(tst.uid('qa')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_qa_authorize(tst.id('head'));
SELECT procurements.exam_qa_authorize(tst.id('reg'));
SELECT procurements.exam_qa_authorize(tst.id('do'));
SELECT procurements.exam_qa_authorize(tst.id('t1'));
-- Accounts that cannot sign in, and the view-only partner accounts, are refused.
SELECT tst.expect_error($$ SELECT procurements.exam_qa_authorize(tst.id('region')) $$, 'view-only');
SELECT tst.expect_error($$ SELECT procurements.exam_qa_authorize(tst.id('viewer')) $$, 'view-only');
SELECT tst.expect_error($$ SELECT procurements.exam_qa_authorize(tst.id('guard')) $$, 'view-only');
SELECT tst.expect_error($$ SELECT procurements.exam_qa_authorize(tst.id('head')) $$, 'already authorized');
RESET ROLE;

-- A school head, acting as school head, writes a division TOS; it lands as draft.
SELECT tst.claims(tst.uid('head')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT procurements.is_division_author()::text $$, 'true');
SELECT tst.expect_rows(
  $$ INSERT INTO sms_tos (learning_area_id, subject_name, grade_level, school_year, grading_period, school_id, created_by, review_status, title)
     VALUES (tst.id('la'), 'Science', 5, '2026-2027', 1, NULL, tst.id('head'), 'approved', 'T237 HEAD TOS') $$, 1);
RESET ROLE;
SELECT tst.expect($$ SELECT review_status FROM sms_tos WHERE title = 'T237 HEAD TOS' $$, 'draft');

-- The division office, once authorized, may author too (reverses 194, by decision).
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT procurements.is_division_author()::text $$, 'true');
SELECT tst.expect_rows(
  $$ INSERT INTO sms_tos (learning_area_id, subject_name, grade_level, school_year, grading_period, school_id, created_by, title)
     VALUES (tst.id('la'), 'Math', 6, '2026-2027', 1, NULL, tst.id('do'), 'T237 DO TOS') $$, 1);
RESET ROLE;

-- An unauthorized teacher still cannot.
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT procurements.is_division_author()::text $$, 'false');
SELECT tst.expect_error(
  $$ INSERT INTO sms_tos (learning_area_id, subject_name, grade_level, school_year, grading_period, school_id, created_by)
     VALUES (tst.id('la'), 'Science', 5, '2026-2027', 1, NULL, tst.id('t2')) $$,
  'row-level security');
RESET ROLE;

-- Authorized, then moved into a view-only type: the right stops working.
SELECT set_config('request.jwt.claims', '', true);  -- a fixture edit, as nobody
UPDATE sms_users SET type = 'region_account', school_id = NULL WHERE id = tst.id('reg');
SELECT tst.claims(tst.uid('reg')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT procurements.is_division_author()::text $$, 'false');
RESET ROLE;

-- ============================================ 2. competency access, separate ==
-- t2 is NOT an author, yet may be let in to the catalogue.
SELECT tst.claims(tst.uid('qa')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_qa_set_competency_access(tst.id('t2'), true);
SELECT tst.expect_error($$ SELECT procurements.exam_qa_set_competency_access(tst.id('viewer'), true) $$, 'view-only');
RESET ROLE;

SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT procurements.can_add_catalogue_competency()::text $$, 'true');
SELECT tst.expect($$ SELECT procurements.is_division_author()::text $$, 'false');
INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
VALUES (tst.id('la'), 5, 'T237-A', 'Contributor entry');
-- No write policy on the grant table: nobody grants themselves.
SELECT tst.expect_rows($$ UPDATE sms_competency_contributors SET is_active = true WHERE user_id = tst.id('t2') $$, 0);
SELECT tst.expect_error($$ SELECT procurements.exam_qa_set_competency_access(tst.id('t2'), true) $$, 'Only a QA reviewer');
-- Sees their own grant, nobody else's.
SELECT tst.expect($$ SELECT count(*)::text FROM sms_competency_contributors $$, '1');
RESET ROLE;
SELECT tst.expect($$ SELECT added_by_teacher::text FROM sms_competency_catalogue WHERE lc_code = 'T237-A' $$, 'true');

-- t1 is an author WITHOUT competency access: cannot add.
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT procurements.can_add_catalogue_competency()::text $$, 'false');
SELECT tst.expect_error($$ INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
  VALUES (tst.id('la'), 5, 'T237-B', 'Author only') $$, 'row-level security');
RESET ROLE;

-- Revoking authorship leaves competency access alone, and the reverse.
SELECT tst.claims(tst.uid('qa')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_qa_set_competency_access(tst.id('t1'), true);
SELECT procurements.exam_qa_revoke(tst.id('t1'), 'test');
RESET ROLE;
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT procurements.is_division_author()::text $$, 'false');
SELECT tst.expect($$ SELECT procurements.can_add_catalogue_competency()::text $$, 'true');
RESET ROLE;

SELECT tst.claims(tst.uid('qa')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_qa_set_competency_access(tst.id('t2'), false);
-- Withdrawing twice is not an error.
SELECT procurements.exam_qa_set_competency_access(tst.id('t2'), false);
RESET ROLE;
SELECT tst.expect($$ SELECT (is_active::text || '/' || (revoked_by = tst.id('qa'))::text)
  FROM sms_competency_contributors WHERE user_id = tst.id('t2') $$, 'false/true');
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT procurements.can_add_catalogue_competency()::text $$, 'false');
RESET ROLE;

-- The head may hold competency access too, in their own role.
SELECT tst.claims(tst.uid('qa')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_qa_set_competency_access(tst.id('head'), true);
RESET ROLE;
SELECT tst.claims(tst.uid('head')); SET LOCAL ROLE authenticated;
INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
VALUES (tst.id('la'), 6, 'T237-C', 'Head entry');
RESET ROLE;

\echo '237: all checks passed'
ROLLBACK;
