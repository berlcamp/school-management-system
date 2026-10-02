-- ============================================================================
-- 196 — School `admin` may edit a colleague's extra roles
-- ============================================================================
--
-- 163 let a school head / assistant school head hand out extra roles ("Also
-- works as" on /staff) at their own school, and nobody else at school level.
-- Schools asked for their `admin` to do it too — the admin officer is usually
-- the one keeping the staff list.
--
-- `admin` joins the actor list in `sms_actor_may_assign_role` and gets exactly
-- the school head's remit, nothing wider:
--   * only at the school they are currently switched to;
--   * only for staff assigned to that school (134);
--   * only from `sms_school_assignable_roles()` — so `school_head`,
--     `assistant_school_head`, `qa` and every division role stay out of reach,
--     and an admin can no more promote anyone than a school head can.
--
-- Same signature, so CREATE OR REPLACE; the four policies on sms_user_roles
-- that call it (163) pick the change up untouched. One function replaced; no
-- table, column, policy, trigger or DML. The app-side twin is
-- `assignableRolesFor()` in lib/constants/userTypes.ts — keep the two in step.
-- ============================================================================

CREATE OR REPLACE FUNCTION procurements.sms_actor_may_assign_role(
  p_target_user_id BIGINT, p_role TEXT, p_school_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_actor_type      TEXT;
  v_actor_school_id BIGINT;
BEGIN
  IF procurements.sms_actor_manages_users() THEN
    RETURN TRUE;
  END IF;

  SELECT u.type, u.school_id INTO v_actor_type, v_actor_school_id
  FROM procurements.sms_users u
  WHERE u.user_id = auth.uid() AND u.is_active
  LIMIT 1;

  IF v_actor_type IS NULL
     OR v_actor_type NOT IN ('school_head', 'assistant_school_head', 'admin') THEN
    RETURN FALSE;
  END IF;

  -- Never a school-less role, and never past the school they are switched to.
  IF p_school_id IS NULL
     OR v_actor_school_id IS NULL
     OR p_school_id <> v_actor_school_id THEN
    RETURN FALSE;
  END IF;

  IF NOT (p_role = ANY (procurements.sms_school_assignable_roles())) THEN
    RETURN FALSE;
  END IF;

  -- The target must be somebody who works at this school (134's assignment set).
  RETURN procurements.sms_user_may_use_school(p_target_user_id, p_school_id);
END;
$$;

GRANT EXECUTE ON FUNCTION procurements.sms_actor_may_assign_role(BIGINT, TEXT, BIGINT) TO authenticated, service_role;
