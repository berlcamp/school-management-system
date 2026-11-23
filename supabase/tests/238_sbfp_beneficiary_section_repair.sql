-- Migration 238 scenario test. LOCAL DATABASE ONLY.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/238_sbfp_beneficiary_section_repair.sql
-- Everything runs in one transaction that is rolled back at the end.
\set ON_ERROR_STOP 1
BEGIN;
SET search_path TO procurements, public;

CREATE TEMP TABLE ids (name TEXT PRIMARY KEY, id BIGINT);
INSERT INTO ids SELECT 'school', min(id) FROM sms_schools;
INSERT INTO ids SELECT 'other_school', min(id) FROM sms_schools WHERE id > (SELECT id FROM ids WHERE name = 'school');
INSERT INTO ids SELECT 'actor', min(id) FROM sms_users;

INSERT INTO sms_sbfp_programs (school_id, school_year)
VALUES ((SELECT id FROM ids WHERE name = 'school'), '2098-2099');
INSERT INTO ids SELECT 'prog', id FROM sms_sbfp_programs
 WHERE school_id = (SELECT id FROM ids WHERE name = 'school') AND school_year = '2098-2099';

-- Two sections of the school (K "Dove", SNED) and one at another school.
INSERT INTO sms_sections (name, grade_level, school_year, school_id)
VALUES ('T238 Dove', 0, '2098-2099', (SELECT id FROM ids WHERE name = 'school')),
       ('T238 SNED', -1, '2098-2099', (SELECT id FROM ids WHERE name = 'school')),
       ('T238 Away', 0, '2098-2099', (SELECT id FROM ids WHERE name = 'other_school'));
INSERT INTO ids SELECT 'dove', id FROM sms_sections WHERE name = 'T238 Dove';
INSERT INTO ids SELECT 'sned', id FROM sms_sections WHERE name = 'T238 SNED';
INSERT INTO ids SELECT 'away', id FROM sms_sections WHERE name = 'T238 Away';

-- Learners: k (Dove, saved under Dove), s (SNED, saved under Dove: the bug),
-- gone (dropped, saved under Dove), elsewhere (enrolled only at another school).
INSERT INTO sms_students (lrn, first_name, last_name, date_of_birth, gender, school_id)
SELECT 'T238' || n, n, 'T238', '2020-01-01', 'male', (SELECT id FROM ids WHERE name = 'school')
  FROM unnest(ARRAY['k','s','gone','elsewhere']) n;
INSERT INTO ids SELECT first_name, id FROM sms_students WHERE last_name = 'T238';

INSERT INTO sms_enrollments (student_id, section_id, school_id, school_year, grade_level, enrolled_by, status, enrollment_status)
VALUES
 ((SELECT id FROM ids WHERE name='k'),    (SELECT id FROM ids WHERE name='dove'), (SELECT id FROM ids WHERE name='school'), '2098-2099', 0, (SELECT id FROM ids WHERE name='actor'), 'approved', 'active'),
 ((SELECT id FROM ids WHERE name='s'),    (SELECT id FROM ids WHERE name='sned'), (SELECT id FROM ids WHERE name='school'), '2098-2099', -1, (SELECT id FROM ids WHERE name='actor'), 'approved', 'active'),
 ((SELECT id FROM ids WHERE name='gone'), (SELECT id FROM ids WHERE name='dove'), (SELECT id FROM ids WHERE name='school'), '2098-2099', 0, (SELECT id FROM ids WHERE name='actor'), 'approved', 'dropped'),
 ((SELECT id FROM ids WHERE name='elsewhere'), (SELECT id FROM ids WHERE name='away'), (SELECT id FROM ids WHERE name='other_school'), '2098-2099', 0, (SELECT id FROM ids WHERE name='actor'), 'approved', 'active');

INSERT INTO sms_sbfp_beneficiaries (program_id, student_id, section_id)
SELECT (SELECT id FROM ids WHERE name='prog'), id, (SELECT id FROM ids WHERE name='dove')
  FROM ids WHERE name IN ('k','s','gone','elsewhere');

\i supabase/migrations/238_sbfp_beneficiary_section_repair.sql
-- Re-running changes nothing.
\i supabase/migrations/238_sbfp_beneficiary_section_repair.sql

DO $$
DECLARE
  v_dove BIGINT := (SELECT id FROM ids WHERE name='dove');
  v_sned BIGINT := (SELECT id FROM ids WHERE name='sned');
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['k','gone','elsewhere'] LOOP
    IF (SELECT b.section_id FROM procurements.sms_sbfp_beneficiaries b
         WHERE b.student_id = (SELECT id FROM ids WHERE name=f)) <> v_dove THEN
      RAISE EXCEPTION 'FAIL % should stay under Dove', f;
    END IF;
  END LOOP;
  IF (SELECT b.section_id FROM procurements.sms_sbfp_beneficiaries b
       WHERE b.student_id = (SELECT id FROM ids WHERE name='s')) <> v_sned THEN
    RAISE EXCEPTION 'FAIL SNED learner not moved to SNED';
  END IF;
  RAISE NOTICE 'ok  SNED learner moved; Dove, dropped and other-school learners untouched';
END $$;

\echo 'ALL 238 ASSERTIONS PASSED'
ROLLBACK;
