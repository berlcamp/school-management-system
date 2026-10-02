-- ============================================================================
-- 197 — School heads and admins may change a colleague's Staff Type
-- ============================================================================
--
-- 163's `sms_users_guard_type_change` closed a real hole — 001's blanket
-- `authenticated` UPDATE policy let anyone rewrite their own `type` from the
-- browser console — but it closed it for everybody below the division office.
-- Changing *another* person's `type` was admitted only for division-level
-- actors, so the Staff Type field on /staff failed with "You may not change
-- another user's role." for a school head and, after 196, for an admin too —
-- even though both may hand out that person's extra roles.
--
-- The guard now admits a school-level actor on exactly 196's remit, applied to
-- the primary role:
--   * the actor is `school_head`, `assistant_school_head` or `admin` (the roles
--     `sms_actor_may_assign_role` names);
--   * the target is someone else, at the school the actor is switched to, and
--     stays at it (OLD.school_id = NEW.school_id = actor's school), and is
--     assigned to it (134);
--   * BOTH the old and the new type are school roles a school head may hand
--     out (`sms_school_assignable_roles()`, 163) or one of the login-disabled
--     personnel roles (`accounting` 135, `security_guard` / `utility_worker`
--     158), which the Staff Type picker offers and which carry no access.
--     So nobody below the division office can make anyone a school head or
--     assistant school head, or demote one, or touch a division role.
--
-- A person changing their OWN type keeps 163's rule unchanged: only into a
-- role they hold (the header role switcher). Division actors and SQL outside
-- a user session stay unrestricted.
--
-- Same trigger, same function name and signature: CREATE OR REPLACE. One new
-- helper. No table, column, policy or DML. App-side twin: `canChangeStaffType()`
-- in lib/constants/userTypes.ts.
-- ============================================================================

/** Types a school-level actor may move a colleague's primary role between. */
CREATE OR REPLACE FUNCTION procurements.sms_school_staff_type_changeable(p_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = procurements, public
AS $$
  SELECT p_type = ANY (procurements.sms_school_assignable_roles())
      OR p_type IN ('accounting', 'security_guard', 'utility_worker');
$$;

GRANT EXECUTE ON FUNCTION procurements.sms_school_staff_type_changeable(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION procurements.sms_users_guard_type_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_actor_type      TEXT;
  v_actor_school_id BIGINT;
BEGIN
  IF NEW.type IS NOT DISTINCT FROM OLD.type THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR procurements.sms_actor_manages_users() THEN
    RETURN NEW;
  END IF;

  IF OLD.id IS DISTINCT FROM procurements.sms_current_user_row_id() THEN
    -- 197: a school head / assistant school head / admin changing a
    -- colleague's Staff Type at their own school, within the school roles.
    SELECT u.type, u.school_id INTO v_actor_type, v_actor_school_id
    FROM procurements.sms_users u
    WHERE u.user_id = auth.uid() AND u.is_active
    LIMIT 1;

    IF v_actor_type IN ('school_head', 'assistant_school_head', 'admin')
       AND v_actor_school_id IS NOT NULL
       AND OLD.school_id = v_actor_school_id
       AND NEW.school_id IS NOT DISTINCT FROM OLD.school_id
       AND procurements.sms_school_staff_type_changeable(OLD.type)
       AND procurements.sms_school_staff_type_changeable(NEW.type)
       AND procurements.sms_user_may_use_school(OLD.id, v_actor_school_id) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'You may not change another user''s role.';
  END IF;

  IF NEW.type IS NULL
     OR NOT procurements.sms_user_may_use_role(OLD.id, NEW.type, NEW.school_id) THEN
    RAISE EXCEPTION 'You do not hold that role at this school.';
  END IF;

  RETURN NEW;
END;
$$;
