-- Migration 218 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/218_helpdesk.sql
-- Everything runs in one transaction that is rolled back at the end.
\set ON_ERROR_STOP 1
BEGIN;
SET search_path TO procurements, public;

CREATE SCHEMA tst;
GRANT USAGE ON SCHEMA tst TO authenticated, anon, service_role;
CREATE TABLE tst.ids (name TEXT PRIMARY KEY, id BIGINT, uid UUID);
GRANT SELECT, INSERT, UPDATE ON tst.ids TO authenticated, service_role;
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
CREATE FUNCTION tst.expect_count(p_sql TEXT, p_n BIGINT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE c BIGINT;
BEGIN
  EXECUTE p_sql INTO c;
  IF c IS DISTINCT FROM p_n THEN
    RAISE EXCEPTION 'FAIL expected %, got % for: %', p_n, c, p_sql;
  END IF;
  RAISE NOTICE 'ok  = %: %', c, left(p_sql, 90);
END $$;
CREATE FUNCTION tst.expect_text(p_sql TEXT, p_v TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  EXECUTE p_sql INTO v;
  IF v IS DISTINCT FROM p_v THEN
    RAISE EXCEPTION 'FAIL expected "%", got "%" for: %', p_v, v, p_sql;
  END IF;
  RAISE NOTICE 'ok  = %: %', v, left(p_sql, 90);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tst TO authenticated, anon, service_role;

-- ---------------------------------------------------------------- fixtures --
UPDATE sms_helpdesk_settings SET is_enabled = FALSE;
DELETE FROM sms_helpdesk_staff;

INSERT INTO tst.ids (name, uid) VALUES
  ('sa',  '00000000-0000-4000-8000-000000000218'),
  ('div', '00000000-0000-4000-8000-0000000002d1'),
  ('tA',  '00000000-0000-4000-8000-0000000002e1'),
  ('tB',  '00000000-0000-4000-8000-0000000002e2'),
  ('tC',  '00000000-0000-4000-8000-0000000002e3'),
  ('acc', '00000000-0000-4000-8000-0000000002e4');

INSERT INTO auth.users (id, email, aud, role)
SELECT uid, name || '@218.test', 'authenticated', 'authenticated' FROM tst.ids;

INSERT INTO tst.ids (name, id) SELECT 'schoolA', min(id) FROM sms_schools;

WITH u(name, type, school) AS (VALUES
  ('sa', 'super admin', 'schoolA'), ('div', 'division_admin', NULL),
  ('tA', 'teacher', 'schoolA'), ('tB', 'teacher', 'schoolA'),
  ('tC', 'teacher', 'schoolA'), ('acc', 'accounting', 'schoolA'))
INSERT INTO sms_users (name, email, type, school_id, user_id, is_active)
SELECT 'User ' || u.name, u.name || '@218.test', u.type, tst.id(u.school), tst.uid(u.name), true
FROM u;
UPDATE tst.ids i SET id = s.id FROM sms_users s WHERE s.user_id = i.uid;

-- ------------------------------------------------------------- the switch --
SET LOCAL ROLE anon;
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_helpdesk_settings WHERE NOT is_enabled$$, 1);
SELECT tst.expect_error($$SELECT procurements.helpdesk_set_enabled(true)$$, 'permission denied');
SELECT tst.expect_error($$SELECT procurements.helpdesk_public_create('{}'::jsonb, 'x')$$, 'permission denied');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT tst.claims(tst.uid('tA'));
SELECT tst.expect_error($$SELECT procurements.helpdesk_create_ticket('Cannot log in', 'account_login', 'Help')$$, 'turned off');
SELECT tst.expect_error($$SELECT procurements.helpdesk_set_enabled(true)$$, 'Only a super admin');
SELECT tst.claims(tst.uid('div'));
SELECT tst.expect_error($$SELECT procurements.helpdesk_set_enabled(true)$$, 'Only a super admin');
SELECT tst.claims(tst.uid('sa'));
SELECT procurements.helpdesk_set_enabled(true);
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_helpdesk_settings WHERE is_enabled$$, 1);

-- ---------------------------------------------------- tickets and threads --
SELECT tst.claims(tst.uid('tA'));
SELECT tst.expect_error($$SELECT procurements.helpdesk_create_ticket('Hi', 'account_login', 'Help')$$, 'Subject must be');
SELECT tst.expect_error($$SELECT procurements.helpdesk_create_ticket('Cannot log in', 'nope', 'Help')$$, 'Choose a category');
UPDATE tst.ids SET id = (procurements.helpdesk_create_ticket('Grades not saving', 'grades', 'The class record will not post.')->>'id')::BIGINT
  WHERE name = 'tA';
-- tst.ids.id for tA is now the ticket id; keep the user id under another name.
INSERT INTO tst.ids (name, id) SELECT 'ticket', id FROM tst.ids WHERE name = 'tA';
RESET ROLE;
UPDATE tst.ids SET id = (SELECT id FROM sms_users WHERE user_id = tst.uid('tA')) WHERE name = 'tA';
SELECT tst.expect_text($$SELECT submitter_type || '/' || source || '/' || status FROM procurements.sms_helpdesk_tickets WHERE id = tst.id('ticket')$$, 'teacher/app/open');

SET LOCAL ROLE authenticated;
SELECT tst.claims(tst.uid('tA'));
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_helpdesk_tickets$$, 1);
SELECT tst.expect_error($$SELECT procurements.helpdesk_update_ticket(tst.id('ticket'), 'closed')$$, 'access');
SELECT tst.expect_error($$SELECT procurements.helpdesk_post_message(tst.id('ticket'), 'note', true)$$, 'Only staff');
SELECT tst.expect_error($$INSERT INTO procurements.sms_helpdesk_tickets (reference_code, subject, category, source, submitter_name, submitter_email) VALUES ('HD-X', 'Direct insert', 'other', 'app', 'x', 'x')$$, 'permission denied');

SELECT tst.claims(tst.uid('tB'));
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_helpdesk_tickets$$, 0);
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_helpdesk_messages$$, 0);
SELECT tst.expect_error($$SELECT procurements.helpdesk_post_message(tst.id('ticket'), 'me too')$$, 'access');
SELECT tst.expect_error($$SELECT procurements.helpdesk_staff_list()$$, 'access');

-- Division admin answers: internal note, then a reply that resolves.
SELECT tst.claims(tst.uid('div'));
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_helpdesk_tickets WHERE needs_attention$$, 1);
SELECT procurements.helpdesk_post_message(tst.id('ticket'), 'Checking the logs.', true);
SELECT tst.expect_text($$SELECT status FROM procurements.sms_helpdesk_tickets WHERE id = tst.id('ticket')$$, 'open');
SELECT procurements.helpdesk_post_message(tst.id('ticket'), 'Fixed, please try again.', false, 'resolved');
SELECT tst.expect_text($$SELECT status || '/' || last_message_by || '/' || (resolved_at IS NOT NULL) FROM procurements.sms_helpdesk_tickets WHERE id = tst.id('ticket')$$, 'resolved/staff/true');
SELECT tst.expect_error($$SELECT procurements.helpdesk_update_ticket(tst.id('ticket'), NULL, tst.id('tB'))$$, 'only be assigned');
SELECT procurements.helpdesk_update_ticket(tst.id('ticket'), NULL, tst.id('sa'));
SELECT tst.expect_count($$SELECT count(*) FROM procurements.helpdesk_staff_list() WHERE name IN ('User sa', 'User div')$$, 2);
SELECT tst.expect_count($$SELECT count(*) FROM procurements.helpdesk_staff_list() WHERE name = 'User tB'$$, 0);

-- The submitter sees the reply but not the note; replying reopens.
SELECT tst.claims(tst.uid('tA'));
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_helpdesk_messages$$, 2);
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_helpdesk_messages WHERE is_internal$$, 0);
SELECT procurements.helpdesk_post_message(tst.id('ticket'), 'Still broken.');
SELECT tst.expect_text($$SELECT status || '/' || (resolved_at IS NULL) FROM procurements.sms_helpdesk_tickets WHERE id = tst.id('ticket')$$, 'open/true');

-- A file not in storage is never recorded.
SELECT tst.expect_error($$SELECT procurements.helpdesk_attach_to_message((SELECT max(id) FROM procurements.sms_helpdesk_messages), jsonb_build_array(jsonb_build_object('path', tst.id('ticket') || '/a.png', 'name', 'a.png')))$$, 'not an image or PDF');
SELECT tst.expect_error($$SELECT procurements.helpdesk_attach_to_message((SELECT max(id) FROM procurements.sms_helpdesk_messages), jsonb_build_array(jsonb_build_object('path', '999/a.png', 'name', 'a.png')))$$, 'not allowed');

-- Storage folder access follows the ticket.
SELECT tst.expect_count($$SELECT count(*) FROM (SELECT 1 WHERE procurements.helpdesk_storage_allowed(tst.id('ticket') || '/x.png')) s$$, 1);
SELECT tst.expect_count($$SELECT count(*) FROM (SELECT 1 WHERE procurements.helpdesk_storage_writable(tst.id('ticket') || '/x.png')) s$$, 0);
SELECT tst.claims(tst.uid('tB'));
SELECT tst.expect_count($$SELECT count(*) FROM (SELECT 1 WHERE procurements.helpdesk_storage_allowed(tst.id('ticket') || '/x.png')) s$$, 0);

-- ---------------------------------------------------------- staff list --
SELECT tst.claims(tst.uid('div'));
SELECT tst.expect_error($$SELECT procurements.helpdesk_set_staff(tst.id('tC'), true)$$, 'Only a super admin');
SELECT tst.claims(tst.uid('sa'));
SELECT tst.expect_error($$SELECT procurements.helpdesk_set_staff(tst.id('acc'), true)$$, 'cannot be added');
SELECT procurements.helpdesk_set_staff(tst.id('tC'), true);
SELECT tst.claims(tst.uid('tC'));
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_helpdesk_tickets$$, 1);
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_helpdesk_messages WHERE is_internal$$, 1);
SELECT procurements.helpdesk_update_ticket(tst.id('ticket'), NULL, tst.id('tC'));
SELECT tst.claims(tst.uid('sa'));
SELECT procurements.helpdesk_set_staff(tst.id('tC'), false);
SELECT tst.claims(tst.uid('tC'));
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_helpdesk_tickets$$, 0);

-- ------------------------------------------------------- closed and off --
SELECT tst.claims(tst.uid('div'));
SELECT procurements.helpdesk_update_ticket(tst.id('ticket'), 'closed');
SELECT tst.claims(tst.uid('tA'));
SELECT tst.expect_error($$SELECT procurements.helpdesk_post_message(tst.id('ticket'), 'Hello?')$$, 'was closed');
SELECT tst.claims(tst.uid('div'));
SELECT procurements.helpdesk_update_ticket(tst.id('ticket'), 'open');
SELECT tst.claims(tst.uid('sa'));
SELECT procurements.helpdesk_set_enabled(false);
SELECT tst.claims(tst.uid('tA'));
SELECT tst.expect_error($$SELECT procurements.helpdesk_post_message(tst.id('ticket'), 'Hello?')$$, 'turned off');
-- Turning it off hides nothing from the database: the ticket is still theirs.
SELECT tst.expect_count($$SELECT count(*) FROM procurements.sms_helpdesk_tickets$$, 1);
SELECT tst.claims(tst.uid('div'));
SELECT tst.expect_error($$SELECT procurements.helpdesk_update_ticket(tst.id('ticket'), 'resolved')$$, 'turned off');
RESET ROLE;

-- ------------------------------------------------------------- public --
SET LOCAL ROLE service_role;
SELECT tst.expect_text($$SELECT procurements.helpdesk_public_create('{"name":"Ana","email":"ana@example.com","category":"other","subject":"Public question","body":"Hello"}'::jsonb, 'ip1')->>'error'$$, 'The Help Desk is turned off.');
RESET ROLE;
UPDATE sms_helpdesk_settings SET is_enabled = TRUE;
SET LOCAL ROLE service_role;
SELECT tst.expect_text($$SELECT procurements.helpdesk_public_create('{"name":"Ana","email":"bad","category":"other","subject":"Public question","body":"Hello"}'::jsonb, 'ip1')->>'error'$$, 'Enter a valid email address.');
CREATE TEMP TABLE pub AS
  SELECT procurements.helpdesk_public_create('{"name":"Ana Cruz","email":"Ana@Example.com","contact":"0917","school_office":"Bayugan NHS","category":"enrollment","subject":"Public question","body":"Hello"}'::jsonb, 'ip1') AS r;
GRANT SELECT ON pub TO authenticated;
SELECT tst.expect_text($$SELECT (r->>'ok') FROM pub$$, 'true');
SELECT tst.expect_text($$SELECT procurements.helpdesk_public_thread((SELECT r->>'reference_code' FROM pub), 'other@example.com', 'ip1')->>'ok'$$, 'false');
SELECT tst.expect_text($$SELECT jsonb_array_length(procurements.helpdesk_public_thread(lower((SELECT r->>'reference_code' FROM pub)), 'ana@example.com', 'ip1')->'messages')::text$$, '1');
SELECT tst.expect_text($$SELECT procurements.helpdesk_public_reply((SELECT r->>'reference_code' FROM pub), 'ana@example.com', 'More details', 'ip1')->>'status'$$, 'open');
-- Five creates per IP per hour.
SELECT procurements.helpdesk_public_create(jsonb_build_object('name','Bo','email','bo' || g || '@example.com','category','other','subject','Question ' || g,'body','x'), 'ip2') FROM generate_series(1, 5) g;
SELECT tst.expect_text($$SELECT procurements.helpdesk_public_create('{"name":"Bo","email":"bo9@example.com","category":"other","subject":"Question 9","body":"x"}'::jsonb, 'ip2')->>'rate_limited'$$, 'true');
-- Three open public concerns per email.
SELECT procurements.helpdesk_public_create(jsonb_build_object('name','Cy','email','cy@example.com','category','other','subject','Question ' || g,'body','x'), 'ip3' || g) FROM generate_series(1, 3) g;
SELECT tst.expect_text($$SELECT procurements.helpdesk_public_create('{"name":"Cy","email":"cy@example.com","category":"other","subject":"Question 4","body":"x"}'::jsonb, 'ip39')->>'error'$$, 'You already have 3 open concerns. Please wait for a reply or follow up on one of them.');
RESET ROLE;

-- The internal note never leaves through the public thread.
SET LOCAL ROLE authenticated;
SELECT tst.claims(tst.uid('div'));
SELECT procurements.helpdesk_post_message((SELECT id FROM procurements.sms_helpdesk_tickets WHERE reference_code = (SELECT r->>'reference_code' FROM pub)), 'Internal only', true);
SELECT procurements.helpdesk_post_message((SELECT id FROM procurements.sms_helpdesk_tickets WHERE reference_code = (SELECT r->>'reference_code' FROM pub)), 'Here is the answer.');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT tst.expect_text($$SELECT jsonb_array_length(procurements.helpdesk_public_thread((SELECT r->>'reference_code' FROM pub), 'ana@example.com', 'ip4')->'messages')::text$$, '3');
SELECT tst.expect_text($$SELECT procurements.helpdesk_public_thread((SELECT r->>'reference_code' FROM pub), 'ana@example.com', 'ip4')->'messages'->2->>'author_name'$$, 'Help Desk · User');
RESET ROLE;

\echo 'ALL 218 CHECKS PASSED'
ROLLBACK;
