-- =============================================================================
-- 221: Feeding Program (SBFP) on/off switch — super admin only.
--
-- The same shape as 218's Help Desk switch: one row in `sms_sbfp_settings`,
-- changed only through `sbfp_set_enabled`, which refuses anyone but the active
-- `super admin` (invariant 12). A super admin flips it at Division Office →
-- Feeding Program Settings.
--
-- **The default is ON, unlike 218's**, because the module is already in use:
-- the 153/160 rule is that nothing moves on apply, and for a live module that
-- means it stays visible. Turning it off hides every menu link and the /sbfp
-- page, and the database refuses every direct write to the sms_sbfp_* tables
-- ("The Feeding Program is turned off."). **Nothing is deleted** — reads stay
-- governed by the 209–220 policies, and turning it back on resumes exactly.
--
-- Enforcement is a statement-level BEFORE trigger on each sms_sbfp_* table
-- rather than an edit to the 209–220 helper functions, so no existing policy,
-- function or trigger is replaced. It fires only for:
--   * requests carrying an `anon` / `authenticated` JWT — service_role and
--     maintenance sessions (no JWT) are not blocked; and
--   * top-level statements (`pg_trigger_depth() = 1`) — an FK cascade from
--     deleting a learner, section or school runs as an RI trigger at depth 2,
--     so housekeeping elsewhere is never refused because SBFP is off.
--
-- New tables, functions and triggers; the only DML is the settings row.
-- Tests: supabase/tests/221_sbfp_switch.sql (one transaction, rolled back).
-- =============================================================================

CREATE TABLE IF NOT EXISTS procurements.sms_sbfp_settings (
  id         BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by BIGINT REFERENCES procurements.sms_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO procurements.sms_sbfp_settings (id) VALUES (TRUE)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE procurements.sms_sbfp_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sbfp settings select" ON procurements.sms_sbfp_settings;
CREATE POLICY "sbfp settings select" ON procurements.sms_sbfp_settings
  FOR SELECT TO authenticated
  USING (TRUE);
REVOKE ALL ON procurements.sms_sbfp_settings FROM anon, authenticated, PUBLIC;
GRANT SELECT ON procurements.sms_sbfp_settings TO authenticated;
GRANT ALL ON procurements.sms_sbfp_settings TO service_role;

-- A missing row reads as ON, matching the default.
CREATE OR REPLACE FUNCTION procurements.sbfp_enabled()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
  SELECT COALESCE((SELECT is_enabled FROM sms_sbfp_settings WHERE id), TRUE);
$$;

CREATE OR REPLACE FUNCTION procurements.sbfp_set_enabled(p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  v_me BIGINT;
BEGIN
  SELECT u.id INTO v_me FROM sms_users u
   WHERE u.user_id = auth.uid()
     AND u.type = 'super admin'
     AND u.is_active IS NOT FALSE
     AND u.deleted_at IS NULL
   LIMIT 1;
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Only a super admin can turn the Feeding Program on or off.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO sms_sbfp_settings (id, is_enabled, updated_by, updated_at)
  VALUES (TRUE, COALESCE(p_enabled, TRUE), v_me, now())
  ON CONFLICT (id) DO UPDATE
    SET is_enabled = EXCLUDED.is_enabled,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION procurements.sbfp_assert_enabled_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'procurements', 'public'
AS $$
DECLARE
  v_role TEXT := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  IF pg_trigger_depth() = 1
     AND v_role IN ('anon', 'authenticated')
     AND NOT sbfp_enabled() THEN
    RAISE EXCEPTION 'The Feeding Program is turned off.' USING ERRCODE = 'SB001';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION procurements.sbfp_assert_enabled_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurements.sbfp_set_enabled(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION procurements.sbfp_set_enabled(BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION procurements.sbfp_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION procurements.sbfp_enabled() TO authenticated, service_role;

-- Every SBFP data table (209, 212, 220), and any added later under the same
-- prefix when this file is re-run. The settings table itself is excluded.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'procurements'
       AND c.relkind = 'r'
       AND c.relname LIKE 'sms\_sbfp\_%'
       AND c.relname <> 'sms_sbfp_settings'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS sbfp_assert_enabled ON procurements.%I', t);
    EXECUTE format(
      'CREATE TRIGGER sbfp_assert_enabled BEFORE INSERT OR UPDATE OR DELETE ON procurements.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION procurements.sbfp_assert_enabled_trigger()', t);
  END LOOP;
END $$;
