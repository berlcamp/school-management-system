-- Tests for migration 232. One transaction, rolled back.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -v ON_ERROR_STOP=1 -f supabase/tests/232_role_menu_access.sql
BEGIN;

DO $$
DECLARE
  v_super procurements.sms_users%ROWTYPE;
  v_head  procurements.sms_users%ROWTYPE;
  v_n     INT;
BEGIN
  SELECT * INTO v_super FROM procurements.sms_users
  WHERE type = 'super admin' AND user_id IS NOT NULL LIMIT 1;
  SELECT * INTO v_head FROM procurements.sms_users
  WHERE type = 'school_head' AND is_active AND user_id IS NOT NULL LIMIT 1;

  -- The new role is storable and assignable at a school.
  IF NOT ('school_counselor_associate' = ANY (procurements.sms_school_assignable_roles())) THEN
    RAISE EXCEPTION 'FAIL: school_counselor_associate not assignable';
  END IF;

  -- Super admin saves, updates and resets.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_super.user_id, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM procurements.role_menu_access_save(
    '[{"user_type":"teacher","item_key":"/teacher/mps","is_enabled":false},
      {"user_type":"school_counselor_associate","item_key":"/health","is_enabled":true}]'::jsonb);
  SELECT count(*) INTO v_n FROM procurements.sms_role_menu_access;
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL save: % rows', v_n; END IF;

  PERFORM procurements.role_menu_access_save(
    '[{"user_type":"teacher","item_key":"/teacher/mps","is_enabled":null}]'::jsonb);
  SELECT count(*) INTO v_n FROM procurements.sms_role_menu_access;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL reset: % rows', v_n; END IF;

  BEGIN
    PERFORM procurements.role_menu_access_save(
      '[{"user_type":"super admin","item_key":"/home","is_enabled":false}]'::jsonb);
    RAISE EXCEPTION 'FAIL: super admin row accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RESET ROLE;

  -- A school head may read but not write.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_head.user_id, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM procurements.sms_role_menu_access;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL read as head: % rows', v_n; END IF;
  BEGIN
    PERFORM procurements.role_menu_access_save(
      '[{"user_type":"teacher","item_key":"/teacher/mps","is_enabled":false}]'::jsonb);
    RAISE EXCEPTION 'FAIL: head saved';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO procurements.sms_role_menu_access (user_type, item_key, is_enabled)
    VALUES ('teacher', '/teacher/mps', false);
    RAISE EXCEPTION 'FAIL: head inserted directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  RAISE NOTICE 'ok: role assignable; super admin saves/resets; super admin row refused; head read-only';
END $$;

ROLLBACK;
