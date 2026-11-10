-- ============================================================================
-- 232 — School Counselor Associate role + Role Permissions (menu access)
-- ============================================================================
--
-- 1. `school_counselor_associate` joins `sms_users_type_check`
--    (… → 214 → 222 → this). DepEd's School Counselor Associate I item does
--    guidance work, so the role gets the guidance counselor's menu (Anecdotal
--    Record, Manifestation Tagging, Learner Cardex, Absenteeism over the whole
--    school roster). That is app-layer: no RLS policy names
--    `guidance_counselor`, so none needs the new value. Label, staff category
--    ("guidance") and menu live in `lib/constants/userTypes.ts` /
--    `lib/nav/buildNavSections.ts`.
--    `sms_school_assignable_roles()` (163) gains it, so a school head / admin
--    may set it as a Staff Type (197) or an extra role (196) at their school.
--
-- 2. `sms_role_menu_access` — the Role Permissions matrix a super admin edits
--    at Division Office → Role Permissions (`/division/permissions`). One row
--    per (staff type, menu page) that DIFFERS from the app's built-in menu:
--    `is_enabled` TRUE adds the page to that staff type's menu, FALSE removes
--    it and blocks the page (`MenuAccessGuard`). **No row = the built-in
--    default**, so nothing changes on apply, and "reset" is a DELETE.
--    `item_key` is the page's URL, app-validated against the menu catalogue
--    (119/132 precedent); `user_type` is CHECKed against nothing but
--    `super admin`, which always sees everything and cannot be narrowed.
--    **Menu and page only** — what each role may read or write in the
--    database is unchanged; the RLS policies still decide that.
--    SELECT open to authenticated (every user reads their own type's rows to
--    draw the menu); writes by the active super admin only
--    (`sms_role_menu_actor_is_super_admin`, its own helper rather than 214's
--    `sms_actor_is_super_admin`, which the local clone lacks and which does
--    not check `is_active`), through `role_menu_access_save`, which applies a
--    whole matrix save in one transaction.
--
-- 3. 222's three RESTRICTIVE sbfp_viewer policies on the new table (its
--    part 4 must be re-run for tables created after it).
--
-- No DML. Tests: supabase/tests/232_role_menu_access.sql
-- ============================================================================

-- 1. Role ---------------------------------------------------------------------
ALTER TABLE procurements.sms_users DROP CONSTRAINT IF EXISTS sms_users_type_check;
ALTER TABLE procurements.sms_users ADD CONSTRAINT sms_users_type_check CHECK (
  type = ANY (ARRAY[
    'school_head', 'assistant_school_head', 'teacher', 'volunteer_teacher',
    'registrar', 'admin', 'super admin', 'division_admin', 'division_type',
    'librarian', 'tutor', 'guidance_counselor', 'school_nurse', 'accounting',
    'security_guard', 'utility_worker', 'qa', 'region_account', 'sbfp_viewer',
    'school_counselor_associate'
  ]::text[])
);

CREATE OR REPLACE FUNCTION procurements.sms_school_assignable_roles()
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['teacher', 'volunteer_teacher', 'registrar', 'admin',
               'librarian', 'guidance_counselor', 'school_nurse',
               'school_counselor_associate']::TEXT[];
$$;

-- 2. Role Permissions -----------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sms_role_menu_actor_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT COALESCE(
    (SELECT u.type = 'super admin' AND u.is_active
       FROM procurements.sms_users u WHERE u.user_id = auth.uid() LIMIT 1),
    FALSE);
$$;

REVOKE ALL ON FUNCTION procurements.sms_role_menu_actor_is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sms_role_menu_actor_is_super_admin() TO authenticated;

CREATE TABLE IF NOT EXISTS procurements.sms_role_menu_access (
  user_type  TEXT NOT NULL CHECK (user_type <> 'super admin' AND btrim(user_type) <> ''),
  item_key   TEXT NOT NULL CHECK (item_key LIKE '/%'),
  is_enabled BOOLEAN NOT NULL,
  updated_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_type, item_key)
);

ALTER TABLE procurements.sms_role_menu_access ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON procurements.sms_role_menu_access TO authenticated;

DROP POLICY IF EXISTS role_menu_access_select ON procurements.sms_role_menu_access;
CREATE POLICY role_menu_access_select ON procurements.sms_role_menu_access
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS role_menu_access_insert ON procurements.sms_role_menu_access;
CREATE POLICY role_menu_access_insert ON procurements.sms_role_menu_access
  FOR INSERT TO authenticated
  WITH CHECK (procurements.sms_role_menu_actor_is_super_admin());

DROP POLICY IF EXISTS role_menu_access_update ON procurements.sms_role_menu_access;
CREATE POLICY role_menu_access_update ON procurements.sms_role_menu_access
  FOR UPDATE TO authenticated
  USING (procurements.sms_role_menu_actor_is_super_admin())
  WITH CHECK (procurements.sms_role_menu_actor_is_super_admin());

DROP POLICY IF EXISTS role_menu_access_delete ON procurements.sms_role_menu_access;
CREATE POLICY role_menu_access_delete ON procurements.sms_role_menu_access
  FOR DELETE TO authenticated
  USING (procurements.sms_role_menu_actor_is_super_admin());

-- p_changes: [{"user_type": "...", "item_key": "/...", "is_enabled": true|false|null}, ...]
-- null = back to the built-in default (the row is deleted).
-- SECURITY INVOKER: the policies above decide; the check here only turns a
-- silent no-op into a message.
CREATE OR REPLACE FUNCTION procurements.role_menu_access_save(p_changes JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  v_change  JSONB;
  v_type    TEXT;
  v_key     TEXT;
  v_actor   BIGINT;
BEGIN
  IF NOT procurements.sms_role_menu_actor_is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin may change role permissions.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' THEN
    RAISE EXCEPTION 'There are no changes to save.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT u.id INTO v_actor FROM procurements.sms_users u
  WHERE u.user_id = auth.uid() LIMIT 1;

  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    v_type := v_change ->> 'user_type';
    v_key  := v_change ->> 'item_key';
    IF v_type IS NULL OR v_key IS NULL THEN
      RAISE EXCEPTION 'Each change needs a staff type and a page.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_change -> 'is_enabled' IS NULL OR jsonb_typeof(v_change -> 'is_enabled') = 'null' THEN
      DELETE FROM procurements.sms_role_menu_access
      WHERE user_type = v_type AND item_key = v_key;
    ELSE
      INSERT INTO procurements.sms_role_menu_access (user_type, item_key, is_enabled, updated_by, updated_at)
      VALUES (v_type, v_key, (v_change ->> 'is_enabled')::BOOLEAN, v_actor, now())
      ON CONFLICT (user_type, item_key) DO UPDATE
        SET is_enabled = EXCLUDED.is_enabled,
            updated_by = EXCLUDED.updated_by,
            updated_at = EXCLUDED.updated_at;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION procurements.role_menu_access_save(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.role_menu_access_save(JSONB) TO authenticated;

-- 3. 222's write refusal for the SBFP Viewer -------------------------------------
DROP POLICY IF EXISTS sbfp_viewer_no_insert ON procurements.sms_role_menu_access;
CREATE POLICY sbfp_viewer_no_insert ON procurements.sms_role_menu_access AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (NOT (SELECT procurements.sms_actor_is_sbfp_viewer()));
DROP POLICY IF EXISTS sbfp_viewer_no_update ON procurements.sms_role_menu_access;
CREATE POLICY sbfp_viewer_no_update ON procurements.sms_role_menu_access AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (NOT (SELECT procurements.sms_actor_is_sbfp_viewer()));
DROP POLICY IF EXISTS sbfp_viewer_no_delete ON procurements.sms_role_menu_access;
CREATE POLICY sbfp_viewer_no_delete ON procurements.sms_role_menu_access AS RESTRICTIVE
  FOR DELETE TO authenticated USING (NOT (SELECT procurements.sms_actor_is_sbfp_viewer()));
