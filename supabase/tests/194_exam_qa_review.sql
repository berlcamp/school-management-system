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
  'review_status_check');
SELECT set_config('sms.exam_review', 'off', true);

-- ------------------------------------------------------------- task 2 ------
-- t1 and mt are authorized through the real RPC (section 10).
SELECT tst.claims(tst.uid('qa1')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_qa_authorize(tst.id('t1'));
SELECT procurements.exam_qa_authorize(tst.id('mt'));
RESET ROLE;

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

-- ---------------------------------------------------- task 4: hardening ----
-- private rows keep 096's rule: any authenticated user may update / delete
INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by, title)
VALUES ('Throwaway', 5, '2026-2027', 1, tst.id('schoolA'), tst.id('t1'), 'T1 THROWAWAY PRIVATE');
INSERT INTO tst.ids (name, id) SELECT 'ptos2', id FROM sms_tos WHERE title = 'T1 THROWAWAY PRIVATE';
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect_rows($$ UPDATE sms_tos SET title = 'renamed by t2' WHERE id = $$ || tst.id('ptos2'), 1);
SELECT tst.expect_rows($$ DELETE FROM sms_tos WHERE id = $$ || tst.id('ptos2'), 1);
RESET ROLE;

-- the author may delete an own draft division TOS, but cannot hand it to someone else
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by, title)
VALUES ('Draft', 6, '2026-2027', 2, NULL, tst.id('t1'), 'T1 DRAFT DEL');
INSERT INTO sms_tos (subject_name, grade_level, school_year, grading_period, school_id, created_by, title)
VALUES ('Draft', 6, '2026-2027', 3, NULL, tst.id('t1'), 'T1 DRAFT KEEP');
RESET ROLE;
INSERT INTO tst.ids (name, id) SELECT 'dtos_del', id FROM sms_tos WHERE title = 'T1 DRAFT DEL';
INSERT INTO tst.ids (name, id) SELECT 'dtos_keep', id FROM sms_tos WHERE title = 'T1 DRAFT KEEP';
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_rows($$ DELETE FROM sms_tos WHERE id = $$ || tst.id('dtos_del'), 1);
SELECT tst.expect_error(
  $$ UPDATE sms_tos SET created_by = $$ || tst.id('mt') || $$ WHERE id = $$ || tst.id('dtos_keep'),
  'cannot be changed');
RESET ROLE;

-- a reopened exam (draft again, but with an approve event) is editable and
-- not deletable by its author: mt switches back to the teacher hat
SELECT tst.claims(tst.uid('mt')); SET LOCAL ROLE authenticated;
SELECT procurements.sms_switch_active_role('teacher');
SELECT tst.expect_rows($$ UPDATE sms_exams SET title = 'MT EXAM fixed' WHERE id = $$ || tst.id('mtexam'), 1);
SELECT tst.expect_rows($$ DELETE FROM sms_exams WHERE id = $$ || tst.id('mtexam'), 0);
RESET ROLE;

-- anon cannot call the helpers
GRANT USAGE ON SCHEMA tst TO anon;
GRANT EXECUTE ON FUNCTION tst.expect_error(TEXT, TEXT) TO anon;
SET LOCAL ROLE anon;
SELECT tst.expect_error($$ SELECT procurements.can_edit_tos(1) $$, 'permission denied');
RESET ROLE;

-- ------------------------------------------------- review follow-ups ------
-- a result cannot be moved onto an unapproved division exam by re-pointing
-- exam_id (the trigger fires on UPDATE OF exam_id, not only on INSERT).
-- mtexam is a draft again (reopened above); pexam1 is private.
INSERT INTO sms_exam_results (exam_id, section_id, school_id, school_year)
VALUES (tst.id('pexam1'),
        (SELECT id FROM sms_sections WHERE school_id = tst.id('schoolA') LIMIT 1),
        tst.id('schoolA'), '2026-2027');
INSERT INTO tst.ids (name, id)
SELECT 'res1', id FROM sms_exam_results WHERE exam_id = tst.id('pexam1');
SELECT tst.expect_error(
  $$ UPDATE sms_exam_results SET exam_id = $$ || tst.id('mtexam') || $$ WHERE id = $$ || tst.id('res1'),
  'not been approved');

-- the FK's ON DELETE SET NULL must get through the review-field guard:
-- created_by -> NULL on a division row, and reviewed_by -> NULL alone.
-- Run as postgres, which is what the RI action does.
SELECT tst.expect_rows($$ UPDATE sms_tos SET created_by = NULL WHERE id = $$ || tst.id('dtos_keep'), 1);
SELECT tst.expect_error(
  $$ UPDATE sms_tos SET created_by = $$ || tst.id('mt') || $$ WHERE id = $$ || tst.id('dtos_keep'),
  'cannot be changed');
SELECT tst.expect_rows($$ UPDATE sms_tos SET reviewed_by = NULL WHERE id = $$ || tst.id('tos2'), 1);
SELECT tst.expect_error(
  $$ UPDATE sms_tos SET reviewed_by = $$ || tst.id('qa2') || $$ WHERE id = $$ || tst.id('tos2'),
  'QA review workflow');
SELECT tst.expect_error(
  $$ UPDATE sms_tos SET reviewed_by = NULL, review_comment = 'x' WHERE id = $$ || tst.id('tos2'),
  'QA review workflow');

-- the internal / trigger functions are not callable by a signed-in user
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_review_table('tos') $$, 'permission denied');
SELECT tst.expect_error(
  $$ SELECT procurements.exam_review_transition('tos', 1, 'approve', 'submitted', 'approved', NULL, NULL) $$,
  'permission denied');
RESET ROLE;

-- (later tasks append their sections above this line)

ROLLBACK;
