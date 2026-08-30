-- ============================================================================
-- 169. Saved reports: the author comes from the session, not from the client
-- ============================================================================
--
-- THE BUG
-- -------
-- Saving a report failed with "new row violates row-level security policy for
-- table sms_report_definitions". 167's INSERT policy is
-- `owner_id = sms_current_user_row_id()` and the builder sent `owner_id` from
-- the browser's Redux user, so the save succeeded only when those two agreed.
-- They do not always agree, for two independent reasons:
--
-- 1. THE CLIENT SHOULD NEVER HAVE BEEN ASKED. A row's author is a fact about
--    the session, and 130/135 already settled this for enrolment: identity
--    comes from auth.uid() and `enrolled_by` / `approved_by` are OVERWRITTEN
--    with the resolved caller. A saved report is the same shape of thing and
--    should have followed that precedent from the start.
--
-- 2. THE TWO HALVES OF THE APP IDENTIFY A USER DIFFERENTLY.
--    `AuthGuard` resolves the personnel row by EMAIL:
--        .from("sms_users").eq("email", session.user.email).eq("is_active", true)
--    `sms_current_user_row_id()` (134/163) resolves it by `user_id = auth.uid()`.
--    On this database 379 of 1,537 active users have a NULL `user_id`.
--    AuthGuard backfills it on first login, but that write is fire-and-forget
--    and the Redux user is set from the row as it was read, so a session can
--    hold a perfectly good `system_user_id` that the SQL helper cannot resolve
--    at all — it returns NULL, and NULL never equals anything.
--
-- WHAT THIS DOES
-- --------------
-- * `sms_session_user_id()` — resolves the caller's personnel row the way the
--   application actually does: by `user_id = auth.uid()` first, falling back to
--   the JWT's email for a row whose `user_id` has not been backfilled. An exact
--   user_id match always wins.
-- * A BEFORE INSERT trigger sets `owner_id` from it, ignoring whatever the
--   client sent, and RAISES a sentence a human can act on when the session
--   cannot be resolved — rather than the opaque RLS refusal.
-- * A BEFORE UPDATE trigger pins `owner_id` to its old value, so an author
--   cannot be reassigned by an update either.
-- * 167's three policies and `can_manage_report_definition` move onto the new
--   resolver.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ----------------------------------
-- **`sms_current_user_row_id()` is left exactly as it is.** Widening it would
-- silently change who may call `sms_switch_active_school` and
-- `sms_switch_active_role` (134/163) — that is a decision about role and school
-- switching authority, not a bug fix for saved reports, and it is not this
-- migration's to make. The 379 NULL `user_id` rows are also left alone:
-- backfilling them is a data repair with its own blast radius (it decides which
-- auth account owns which personnel record by email), and it should be looked
-- at on its own.
--
-- WHAT THIS TOUCHES
-- -----------------
-- Only objects created by 167, all of which are new and hold no production
-- rows. No other table, policy, trigger or function is altered.
--
-- ROWS AFFECTED: 0.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The resolver — AuthGuard's rule, in SQL
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.sms_session_user_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT u.id
  FROM procurements.sms_users u
  WHERE u.is_active
    AND u.deleted_at IS NULL
    AND (
      u.user_id = auth.uid()
      -- AuthGuard matches on email and backfills user_id afterwards; until
      -- that lands, email is the only thing tying the session to the row.
      OR (u.user_id IS NULL AND lower(u.email) = lower(auth.jwt() ->> 'email'))
    )
  -- An exact user_id match always beats an email fallback.
  ORDER BY (u.user_id = auth.uid()) DESC NULLS LAST, u.id
  LIMIT 1;
$$;

COMMENT ON FUNCTION procurements.sms_session_user_id() IS
  'The caller''s sms_users row, resolved the way AuthGuard resolves it: by '
  'user_id, falling back to the JWT email for a row whose user_id has not been '
  'backfilled. Distinct from sms_current_user_row_id() (134/163), which is '
  'user_id-only and governs school/role switching.';

GRANT EXECUTE ON FUNCTION procurements.sms_session_user_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. The author is written, not accepted
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.sms_report_definitions_set_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Whatever the client sent is discarded (the 130/135 rule).
    NEW.owner_id := procurements.sms_session_user_id();

    IF NEW.owner_id IS NULL THEN
      RAISE EXCEPTION
        'Your sign-in could not be matched to a personnel record, so this '
        'report cannot be saved. Ask the division office to check your user '
        'account.';
    END IF;
  ELSE
    -- An update never reassigns the author.
    NEW.owner_id := OLD.owner_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_report_definitions_set_owner
  ON procurements.sms_report_definitions;
CREATE TRIGGER sms_report_definitions_set_owner
  BEFORE INSERT OR UPDATE ON procurements.sms_report_definitions
  FOR EACH ROW EXECUTE FUNCTION procurements.sms_report_definitions_set_owner();

-- ---------------------------------------------------------------------------
-- 3. Policies move onto the new resolver
--
-- The INSERT check now holds by construction, because the trigger has already
-- written the value it compares — it stays as a backstop, not as the thing the
-- client has to satisfy.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION procurements.can_manage_report_definition(
  p_owner_id BIGINT,
  p_is_shared BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT
    p_owner_id = procurements.sms_session_user_id()
    OR (
      COALESCE(p_is_shared, FALSE)
      AND EXISTS (
        SELECT 1 FROM procurements.sms_users u
        WHERE u.id = procurements.sms_session_user_id()
          AND u.type IN ('division_admin', 'super admin')
      )
    );
$$;

DROP POLICY IF EXISTS "Report definitions are viewable by owner or division"
  ON procurements.sms_report_definitions;
CREATE POLICY "Report definitions are viewable by owner or division"
  ON procurements.sms_report_definitions
  FOR SELECT TO authenticated
  USING (
    owner_id = procurements.sms_session_user_id()
    OR is_division_shared
  );

DROP POLICY IF EXISTS "Report definitions are insertable by their author"
  ON procurements.sms_report_definitions;
CREATE POLICY "Report definitions are insertable by their author"
  ON procurements.sms_report_definitions
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = procurements.sms_session_user_id());
