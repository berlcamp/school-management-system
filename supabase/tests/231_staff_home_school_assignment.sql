-- Tests for migration 231. One transaction, rolled back.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/231_staff_home_school_assignment.sql
BEGIN;

DO $$
DECLARE
  v_missing INT;
BEGIN
  SELECT count(*) INTO v_missing
  FROM procurements.sms_users u
  WHERE u.school_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM procurements.sms_schools s WHERE s.id = u.school_id)
    AND NOT EXISTS (SELECT 1 FROM procurements.sms_user_schools us
                    WHERE us.user_id = u.id AND us.school_id = u.school_id);
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'FAIL backfill: % users still lack their home-school assignment', v_missing;
  END IF;
  RAISE NOTICE 'ok: backfill complete';
END $$;

-- A school head adds a teacher on /staff (plain sms_users INSERT), then gives
-- them an extra role — the path that used to fail.
DO $$
DECLARE
  v_head   procurements.sms_users%ROWTYPE;
  v_new_id BIGINT;
BEGIN
  SELECT * INTO v_head FROM procurements.sms_users
  WHERE type = 'school_head' AND is_active AND user_id IS NOT NULL AND school_id IS NOT NULL
  LIMIT 1;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_head.user_id, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO procurements.sms_users (name, email, type, school_id)
  VALUES ('Test 231', 'test-231@example.invalid', 'teacher', v_head.school_id)
  RETURNING id INTO v_new_id;

  IF NOT EXISTS (SELECT 1 FROM procurements.sms_user_schools
                 WHERE user_id = v_new_id AND school_id = v_head.school_id) THEN
    RAISE EXCEPTION 'FAIL trigger: no assignment created on insert';
  END IF;

  INSERT INTO procurements.sms_user_roles (user_id, role, school_id)
  VALUES (v_new_id, 'school_nurse', v_head.school_id);

  -- Still refused at a school the head is not in.
  BEGIN
    INSERT INTO procurements.sms_user_roles (user_id, role, school_id)
    VALUES (v_new_id, 'school_nurse',
            (SELECT id FROM procurements.sms_schools WHERE id <> v_head.school_id LIMIT 1));
    RAISE EXCEPTION 'FAIL scope: role at another school was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  RESET ROLE;
  RAISE NOTICE 'ok: new staff gets assignment, extra role saves, other school refused';
END $$;

ROLLBACK;
