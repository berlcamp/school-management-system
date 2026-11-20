-- Migration 236 scenario test. LOCAL DATABASE ONLY.
--   psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/236_teacher_competencies_and_division_release.sql
-- Everything runs in one transaction that is rolled back at the end.
-- Needs one approved division TOS on the clone (194's backfill leaves one).
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
  ('qa',    '00000000-0000-4000-8000-000000236a01'),
  ('t1',    '00000000-0000-4000-8000-000000236b01'),
  ('t2',    '00000000-0000-4000-8000-000000236b02'),
  ('tA',    '00000000-0000-4000-8000-000000236b03'),
  ('tB',    '00000000-0000-4000-8000-000000236b04'),
  ('do',    '00000000-0000-4000-8000-000000236c01'),
  ('headA', '00000000-0000-4000-8000-000000236c02');
INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@236.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id)
SELECT 'schoolA', min(id) FROM sms_schools
UNION ALL
SELECT 'schoolB', (SELECT id FROM sms_schools ORDER BY id OFFSET 1 LIMIT 1);

WITH u(name, type, school) AS (VALUES
  ('qa', 'qa', NULL), ('t1', 'teacher', 'schoolA'), ('t2', 'teacher', 'schoolB'),
  ('tA', 'teacher', 'schoolA'), ('tB', 'teacher', 'schoolB'),
  ('do', 'division_type', NULL), ('headA', 'school_head', 'schoolA'))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@236.test', u.type, tst.id(u.school), tst.uid(u.name), true FROM u;
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;
INSERT INTO sms_user_roles (user_id, role, school_id)
SELECT s.id, s.type, s.school_id FROM sms_users s
WHERE s.user_id IN (SELECT uid FROM tst.ids WHERE uid IS NOT NULL)
ON CONFLICT DO NOTHING;

INSERT INTO sms_learning_areas (name) VALUES ('T236 Area');
INSERT INTO tst.ids (name, id) SELECT 'la', id FROM sms_learning_areas WHERE name = 'T236 Area';
INSERT INTO sms_learning_areas (name, is_active) VALUES ('T236 Retired', false);
INSERT INTO tst.ids (name, id) SELECT 'la_old', id FROM sms_learning_areas WHERE name = 'T236 Retired';

-- An approved division exam by t2, built on the clone's approved division TOS.
INSERT INTO tst.ids (name, id)
SELECT 'tos', id FROM sms_tos WHERE school_id IS NULL AND review_status = 'approved' ORDER BY id LIMIT 1;
DO $$ BEGIN
  IF tst.id('tos') IS NULL THEN RAISE EXCEPTION 'No approved division TOS on this clone.'; END IF;
END $$;
SELECT set_config('sms.exam_review', 'on', true);
INSERT INTO sms_exams (tos_id, title, school_id, created_by, review_status)
VALUES (tst.id('tos'), 'T236 exam', NULL, tst.id('t2'), 'approved');
SELECT set_config('sms.exam_review', 'off', true);
INSERT INTO tst.ids (name, id) SELECT 'exam', id FROM sms_exams WHERE title = 'T236 exam';
-- One question, so the paper gate is observable through RLS.
INSERT INTO sms_exam_questions (exam_id, item_number, question_type, question_text)
VALUES (tst.id('exam'), 1, 'multiple_choice', 'T236 Q1');

-- =========================================================== PART A ======
-- t1 is authorized through the real RPC; t2 is not.
SELECT tst.claims(tst.uid('qa')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_qa_authorize(tst.id('t1'));
-- (Since 237 competency access no longer requires authorship: see 237's test.)
RESET ROLE;

-- Authorized, switch off: cannot add.
SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
  VALUES (tst.id('la'), 5, 'T236-A', 'Teacher entry') $$, 'row-level security');
SELECT tst.expect_error($$ SELECT procurements.exam_qa_set_competency_access(tst.id('t1'), true) $$,
  'Only a QA reviewer');
-- No write policy on the authors table: a teacher cannot flip it themselves.
SELECT tst.expect_rows($$ UPDATE sms_exam_qa_authors SET may_add_competencies = true
  WHERE user_id = tst.id('t1') $$, 0);
RESET ROLE;

SELECT tst.claims(tst.uid('qa')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_qa_set_competency_access(tst.id('t1'), true);
-- A manager's entry is not a teacher's, even when it claims to be.
INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text, added_by_teacher)
VALUES (tst.id('la'), 5, 'T236-QA', 'QA entry', true);
RESET ROLE;
SELECT tst.expect($$ SELECT added_by_teacher::text FROM sms_competency_catalogue WHERE lc_code = 'T236-QA' $$, 'false');

SELECT tst.claims(tst.uid('t1')); SET LOCAL ROLE authenticated;
INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
VALUES (tst.id('la'), 5, 'T236-A', 'Teacher entry');
-- Retired entry, retired area: refused.
SELECT tst.expect_error($$ INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text, is_active)
  VALUES (tst.id('la'), 5, 'T236-B', 'Retired', false) $$, 'row-level security');
SELECT tst.expect_error($$ INSERT INTO sms_competency_catalogue (learning_area_id, grade_level, lc_code, competency_text)
  VALUES (tst.id('la_old'), 5, 'T236-C', 'Old area') $$, 'row-level security');
-- Add only: no edit, no retire, no new learning area.
SELECT tst.expect_rows($$ UPDATE sms_competency_catalogue SET competency_text = 'x' WHERE lc_code = 'T236-A' $$, 0);
SELECT tst.expect_error($$ INSERT INTO sms_learning_areas (name) VALUES ('T236 teacher area') $$, 'row-level security');
RESET ROLE;
SELECT tst.expect($$ SELECT added_by_teacher::text || '/' || (created_by = tst.id('t1'))::text
  FROM sms_competency_catalogue WHERE lc_code = 'T236-A' $$, 'true/true');

-- The flag survives a manager's typo fix.
SELECT tst.claims(tst.uid('qa')); SET LOCAL ROLE authenticated;
UPDATE sms_competency_catalogue SET competency_text = 'Teacher entry, fixed', added_by_teacher = false
WHERE lc_code = 'T236-A';
RESET ROLE;
SELECT tst.expect($$ SELECT added_by_teacher::text FROM sms_competency_catalogue WHERE lc_code = 'T236-A' $$, 'true');

-- Revoking clears the switch; re-authorizing starts with it off.
SELECT tst.claims(tst.uid('qa')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_qa_revoke(tst.id('t1'), 'test');
SELECT procurements.exam_qa_authorize(tst.id('t1'));
RESET ROLE;
SELECT tst.expect($$ SELECT may_add_competencies::text FROM sms_exam_qa_authors WHERE user_id = tst.id('t1') $$, 'false');

-- =========================================================== PART B ======
-- Approved but unpublished: hidden from teachers and the school head, seen by
-- its author, QA and the division office.
SELECT tst.claims(tst.uid('tA')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT count(*)::text FROM sms_exams WHERE id = tst.id('exam') $$, '0');
SELECT tst.expect($$ SELECT procurements.can_read_exam_paper(tst.id('exam'))::text $$, 'false');
RESET ROLE;
SELECT tst.claims(tst.uid('headA')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT count(*)::text FROM sms_exams WHERE id = tst.id('exam') $$, '0');
RESET ROLE;
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT count(*)::text FROM sms_exams WHERE id = tst.id('exam') $$, '1');
RESET ROLE;
SELECT tst.claims(tst.uid('qa')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT count(*)::text FROM sms_exam_questions WHERE exam_id = tst.id('exam') $$, '1');
-- QA does not publish or hold the code.
SELECT tst.expect_error($$ SELECT procurements.exam_division_set_published(tst.id('exam'), true) $$,
  'Only the division office');
SELECT tst.expect_error($$ SELECT procurements.exam_get_release_code(tst.id('exam')) $$, 'may not read');
RESET ROLE;

-- Only the RPC moves is_published.
SELECT tst.expect_error($$ UPDATE sms_exams SET is_published = true WHERE id = tst.id('exam') $$,
  'only by the division office');

-- No passcode before publishing.
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_division_set_passcode(tst.id('exam'), 'ABC123') $$,
  'before setting its passcode');
SELECT procurements.exam_division_set_published(tst.id('exam'), true);
RESET ROLE;

-- Published, no passcode: every teacher sees it and reads the paper.
SELECT tst.claims(tst.uid('tB')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT count(*)::text FROM sms_exams WHERE id = tst.id('exam') $$, '1');
SELECT tst.expect($$ SELECT count(*)::text FROM sms_exam_questions WHERE exam_id = tst.id('exam') $$, '1');
RESET ROLE;

-- Passcode: exactly 6 letters or digits.
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT tst.expect_error($$ SELECT procurements.exam_division_set_passcode(tst.id('exam'), 'ABC12') $$, 'exactly 6');
SELECT tst.expect_error($$ SELECT procurements.exam_division_set_passcode(tst.id('exam'), 'ABC-12') $$, 'exactly 6');
SELECT procurements.exam_division_set_passcode(tst.id('exam'), 'abc123');
SELECT tst.expect($$ SELECT procurements.exam_get_release_code(tst.id('exam')) $$, 'ABC123');
RESET ROLE;

-- Listed but locked for both schools; a teacher cannot redeem it themselves.
SELECT tst.claims(tst.uid('tA')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT count(*)::text FROM sms_exams WHERE id = tst.id('exam') $$, '1');
SELECT tst.expect($$ SELECT count(*)::text FROM sms_exam_questions WHERE exam_id = tst.id('exam') $$, '0');
SELECT tst.expect_error($$ SELECT procurements.exam_unlock(tst.id('exam'), 'ABC123') $$, 'school head');
SELECT tst.expect_error($$ SELECT procurements.exam_school_unlock(tst.id('exam'), 'ABC123') $$, 'Only a school head');
RESET ROLE;
-- The author of an approved exam is gated like anyone (194, decision 2).
SELECT tst.claims(tst.uid('t2')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT procurements.can_read_exam_paper(tst.id('exam'))::text $$, 'false');
RESET ROLE;

-- School A's head: a wrong code says only false; the right one opens school A.
SELECT tst.claims(tst.uid('headA')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT procurements.exam_school_unlock(tst.id('exam'), 'ZZZ999')::text $$, 'false');
SELECT tst.expect($$ SELECT procurements.exam_school_unlock(tst.id('exam'), ' abc123 ')::text $$, 'true');
SELECT tst.expect($$ SELECT count(*)::text FROM sms_exam_school_unlocks WHERE exam_id = tst.id('exam') $$, '1');
RESET ROLE;
SELECT tst.claims(tst.uid('tA')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT count(*)::text FROM sms_exam_questions WHERE exam_id = tst.id('exam') $$, '1');
RESET ROLE;
SELECT tst.claims(tst.uid('tB')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT count(*)::text FROM sms_exam_questions WHERE exam_id = tst.id('exam') $$, '0');
-- Another school's unlocks are not visible.
SELECT tst.expect($$ SELECT count(*)::text FROM sms_exam_school_unlocks WHERE exam_id = tst.id('exam') $$, '0');
RESET ROLE;

-- Unpublishing hides it again but keeps the passcode and the school unlock.
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_division_set_published(tst.id('exam'), false);
RESET ROLE;
SELECT tst.claims(tst.uid('tA')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT count(*)::text FROM sms_exams WHERE id = tst.id('exam') $$, '0');
SELECT tst.expect($$ SELECT procurements.can_read_exam_paper(tst.id('exam'))::text $$, 'false');
RESET ROLE;
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_division_set_published(tst.id('exam'), true);
RESET ROLE;
SELECT tst.claims(tst.uid('tA')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT procurements.can_read_exam_paper(tst.id('exam'))::text $$, 'true');
RESET ROLE;

-- Clearing the passcode drops the school unlocks; the exam is open again.
SELECT tst.claims(tst.uid('do')); SET LOCAL ROLE authenticated;
SELECT procurements.exam_division_set_passcode(tst.id('exam'), '');
SELECT tst.expect($$ SELECT count(*)::text FROM sms_exam_school_unlocks WHERE exam_id = tst.id('exam') $$, '0');
-- The 161 setter refuses a division exam.
SELECT tst.expect_error($$ SELECT procurements.exam_set_release_code(tst.id('exam'), 'ABCD1234') $$, 'school passcode');
RESET ROLE;
SELECT tst.claims(tst.uid('tB')); SET LOCAL ROLE authenticated;
SELECT tst.expect($$ SELECT procurements.can_read_exam_paper(tst.id('exam'))::text $$, 'true');
RESET ROLE;

-- Leaving `approved` unpublishes it.
SELECT set_config('sms.exam_review', 'on', true);
UPDATE sms_exams SET review_status = 'under_review' WHERE id = tst.id('exam');
SELECT set_config('sms.exam_review', 'off', true);
SELECT tst.expect($$ SELECT is_published::text FROM sms_exams WHERE id = tst.id('exam') $$, 'false');

-- Privileges: internal functions are not callable by clients.
SELECT tst.expect($$ SELECT has_function_privilege('authenticated',
  'procurements.exam_division_release_load(bigint)', 'EXECUTE')::text $$, 'false');

\echo '236: all scenarios passed'
ROLLBACK;
