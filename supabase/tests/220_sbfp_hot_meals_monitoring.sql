-- Migration 220 scenario test (SBFP hot meals + monitoring). LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/220_sbfp_hot_meals_monitoring.sql
-- Requires 209-212 and 220. Everything runs in one transaction that is rolled back at the end.
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
  ('hA',    '00000000-0000-4000-8000-0000000220a1'),
  ('focal', '00000000-0000-4000-8000-0000000220a2'),
  ('advA',  '00000000-0000-4000-8000-0000000220a3'),
  ('tB',    '00000000-0000-4000-8000-0000000220b1'),
  ('div',   '00000000-0000-4000-8000-0000000220d1');

INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@220.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id)
SELECT 'schoolA', min(id) FROM sms_schools
UNION ALL
SELECT 'schoolB', (SELECT id FROM sms_schools ORDER BY id OFFSET 1 LIMIT 1);

WITH u(name, type, school) AS (VALUES
  ('hA', 'school_head', 'schoolA'), ('focal', 'teacher', 'schoolA'),
  ('advA', 'teacher', 'schoolA'), ('tB', 'teacher', 'schoolB'),
  ('div', 'division_admin', NULL))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT u.name, u.name || '@220.test', u.type, tst.id(u.school), tst.uid(u.name), true
FROM u;
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;

-- Two sections at school A: one advised by the focal person, one by advA.
INSERT INTO sms_sections (name, grade_level, school_year, school_id, section_adviser_id, is_active)
VALUES ('SBFP-220-F', 3, '2209-2100', tst.id('schoolA'), tst.id('focal'), true),
       ('SBFP-220-A', 3, '2209-2100', tst.id('schoolA'), tst.id('advA'), true);
INSERT INTO tst.ids (name, id)
SELECT CASE name WHEN 'SBFP-220-F' THEN 'secF' ELSE 'secA' END, id
  FROM sms_sections WHERE name IN ('SBFP-220-F', 'SBFP-220-A');

INSERT INTO sms_students (lrn, first_name, last_name, date_of_birth, gender, school_id)
VALUES ('220000000001', 'Uno', 'Test', '2017-01-01', 'male', tst.id('schoolA')),
       ('220000000002', 'Dos', 'Test', '2017-02-01', 'female', tst.id('schoolA'));
INSERT INTO tst.ids (name, id)
SELECT CASE lrn WHEN '220000000001' THEN 'st1' ELSE 'st2' END, id
  FROM sms_students WHERE lrn IN ('220000000001', '220000000002');


-- The school head opens the programme (209's path).
SELECT tst.claims(tst.uid('hA'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_programs (school_id, school_year) VALUES (tst.id('schoolA'), '2098-2099');
RESET ROLE;
INSERT INTO tst.ids (name, id)
SELECT 'prog', id FROM sms_sbfp_programs WHERE school_year = '2098-2099' AND school_id = tst.id('schoolA');
INSERT INTO sms_sbfp_beneficiaries (program_id, student_id, section_id)
VALUES (tst.id('prog'), tst.id('st1'), tst.id('secA'));
INSERT INTO tst.ids (name, id)
SELECT 'ben1', id FROM sms_sbfp_beneficiaries WHERE program_id = tst.id('prog');

-- ------------------------------------------------------ hot meals (220a) --
SELECT tst.claims(tst.uid('hA'));
SET LOCAL ROLE authenticated;
-- Hot meals may omit the grade level; NFP and milk may not.
INSERT INTO sms_sbfp_deliveries (program_id, component, delivered_on)
VALUES (tst.id('prog'), 'hot_meals', '2098-07-01');
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_deliveries (program_id, component) VALUES (%s, 'nfp') $$,
  tst.id('prog')), 'grade_required');
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_deliveries (program_id, component, grade_level) VALUES (%s, 'soup', 1) $$,
  tst.id('prog')), 'component_check');
INSERT INTO sms_sbfp_deliveries (program_id, component, grade_level)
VALUES (tst.id('prog'), 'milk', 1);
RESET ROLE;
INSERT INTO tst.ids (name, id)
SELECT CASE component WHEN 'hot_meals' THEN 'hot' ELSE 'milk' END, id
  FROM sms_sbfp_deliveries WHERE program_id = tst.id('prog');

SELECT tst.claims(tst.uid('hA'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_delivery_meals (delivery_id, kind, quantity, unit, viand_name, servings)
VALUES (tst.id('hot'), 'new', 3, 'pot', 'Lugaw', 80),
       (tst.id('hot'), 'rejected', 1, 'tray', 'Adobo', 10);
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_delivery_meals (delivery_id, kind, viand_name) VALUES (%s, 'new', 'x') $$,
  tst.id('milk')), 'only to a Hot Meals delivery');
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_delivery_meals (delivery_id, kind, viand_name) VALUES (%s, 'new', ' ') $$,
  tst.id('hot')), 'check constraint');
SELECT tst.expect_error(format(
  $$ UPDATE sms_sbfp_deliveries SET component = 'nfp', grade_level = 1 WHERE id = %s $$,
  tst.id('hot')), 'Remove the viand lines');
RESET ROLE;

-- A teacher (not a manager) cannot touch deliveries or their lines.
SELECT tst.claims(tst.uid('advA'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_delivery_meals (delivery_id, kind, viand_name) VALUES (%s, 'new', 'x') $$,
  tst.id('hot')), 'row-level security');
SELECT tst.expect_rows(format(
  $$ UPDATE sms_sbfp_delivery_meals SET servings = 1 WHERE delivery_id = %s $$, tst.id('hot')), 0);
SELECT tst.expect_count(format(
  $$ SELECT count(*) FROM sms_sbfp_delivery_meals WHERE delivery_id = %s $$, tst.id('hot')), 2);
RESET ROLE;

-- ------------------------------------------------- kitchens + questions --
SELECT tst.claims(tst.uid('hA'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_kitchens (school_id) VALUES (%s) $$, tst.id('schoolB')),
  'row-level security');
SELECT tst.expect_error(
  $$ INSERT INTO sms_sbfp_quality_questions (code, kind, prompt) VALUES ('x220', 'face', 'x') $$,
  'row-level security');
RESET ROLE;

SELECT tst.claims(tst.uid('div'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_kitchens (school_id) VALUES (tst.id('schoolB'))
ON CONFLICT (school_id) DO NOTHING;
INSERT INTO sms_sbfp_quality_questions (code, kind, prompt, sort_order)
VALUES ('t220', 'face', 'Test question', 99);
-- No DELETE policy: questions are retired.
SELECT tst.expect_rows($$ DELETE FROM sms_sbfp_quality_questions WHERE code = 't220' $$, 0);
RESET ROLE;
INSERT INTO tst.ids (name, id)
SELECT 'kB', id FROM sms_sbfp_kitchens WHERE school_id = tst.id('schoolB');
INSERT INTO tst.ids (name, id)
SELECT 'q', id FROM sms_sbfp_quality_questions WHERE code = 't220';

-- ------------------------------------------------------------ daily logs --
-- A teacher of the school files; the author is stamped from auth.uid().
SELECT tst.claims(tst.uid('advA'));
SET LOCAL ROLE authenticated;
INSERT INTO sms_sbfp_kitchen_logs (program_id, kitchen_id, target_school_ids, hygiene_checklist, created_by)
VALUES (tst.id('prog'), tst.id('kB'), ARRAY[tst.id('schoolA')], '{"hairnets": true}', tst.id('hA'));
INSERT INTO sms_sbfp_dispatch_logs (program_id, vehicle_type, departed_at)
VALUES (tst.id('prog'), 'Bao-Bao', '10:15:00');
INSERT INTO sms_sbfp_receiving_logs (program_id, sets_expected, sets_received, total_beneficiaries)
VALUES (tst.id('prog'), 10, 9, 1);
INSERT INTO sms_sbfp_quality_responses (program_id, beneficiary_id, answers)
VALUES (tst.id('prog'), tst.id('ben1'), jsonb_build_object(tst.id('q')::text, 5));
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_receiving_logs (program_id, food_condition) VALUES (%s, '[]') $$,
  tst.id('prog')), 'check constraint');
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_receiving_logs (program_id, sets_damaged) VALUES (%s, -1) $$,
  tst.id('prog')), 'check constraint');
RESET ROLE;
SELECT tst.expect_count($$ SELECT count(*) FROM sms_sbfp_kitchen_logs
  WHERE created_by = tst.id('advA') $$, 1);

-- The quality response's learner must belong to the programme.
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_quality_responses (program_id, beneficiary_id) VALUES (%s, -1) $$,
  tst.id('prog')), 'not a beneficiary');

-- An answered question keeps its kind.
SELECT tst.claims(tst.uid('div'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format(
  $$ UPDATE sms_sbfp_quality_questions SET kind = 'text' WHERE id = %s $$, tst.id('q')),
  'already has answers');
SELECT tst.expect_rows(format(
  $$ UPDATE sms_sbfp_quality_questions SET is_active = false WHERE id = %s $$, tst.id('q')), 1);
RESET ROLE;

-- Another teacher of the school files but cannot edit advA's entry; the head can.
SELECT tst.claims(tst.uid('focal'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows($$ UPDATE sms_sbfp_dispatch_logs SET weather = 'Fair' $$, 0);
SELECT tst.expect_rows($$ DELETE FROM sms_sbfp_receiving_logs $$, 0);
RESET ROLE;
SELECT tst.claims(tst.uid('hA'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_rows($$ UPDATE sms_sbfp_dispatch_logs SET weather = 'Fair' $$, 1);
SELECT tst.expect_error(format(
  $$ UPDATE sms_sbfp_kitchen_logs SET program_id = -1 WHERE program_id = %s $$, tst.id('prog')),
  'cannot be moved');
RESET ROLE;

-- A teacher at another school, and the division office, file nothing here.
SELECT tst.claims(tst.uid('tB'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_kitchen_logs (program_id) VALUES (%s) $$, tst.id('prog')),
  'row-level security');
SELECT tst.expect_count($$ SELECT count(*) FROM sms_sbfp_receiving_logs $$, 1);
RESET ROLE;
SELECT tst.claims(tst.uid('div'));
SET LOCAL ROLE authenticated;
SELECT tst.expect_error(format(
  $$ INSERT INTO sms_sbfp_quality_responses (program_id) VALUES (%s) $$, tst.id('prog')),
  'row-level security');
RESET ROLE;

-- Removing the beneficiary keeps the evaluation, anonymously.
DELETE FROM sms_sbfp_beneficiaries WHERE id = tst.id('ben1');
SELECT tst.expect_count($$ SELECT count(*) FROM sms_sbfp_quality_responses
  WHERE beneficiary_id IS NULL AND program_id = tst.id('prog') $$, 1);

-- ------------------------------------------------------------- grants ------
SELECT tst.expect_count($$ SELECT count(*) FROM information_schema.routine_privileges
  WHERE routine_schema = 'procurements' AND grantee IN ('anon', 'PUBLIC')
    AND routine_name LIKE 'sbfp_%' $$, 0);

\echo 'ALL 220 ASSERTIONS PASSED'
ROLLBACK;
