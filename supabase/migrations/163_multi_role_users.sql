-- ============================================================================
-- 163. Multi-role users — the 134 model, one axis over
--
-- One person routinely holds several jobs in a small school: the Grade 5
-- adviser is also the school nurse; the school head still carries a Science
-- load. Until now `sms_users.type` was a single TEXT column, so that person had
-- to pick one job and lose the other's menu.
--
-- The only workaround — a second `sms_users` row on the same email — was
-- already known to be unsafe and is refused in the ARAL tutor flow: AuthGuard
-- resolves a login with `.eq("email").single()`, so a duplicate row locks BOTH
-- accounts out of the system.
--
-- THE MODEL — and the one thing to get right when reading the rest of the app:
--
--   `sms_user_roles`  = the set of (role, school) pairs this user MAY act as
--   `sms_users.type`  = the role they are acting as RIGHT NOW
--
-- This is migration 134's model applied to a second axis, and for the same
-- reason. `type` keeps its meaning exactly, one word narrower, which is why
-- none of the ~124 `u.type = / IN (...)` checks spread over 55 migration files
-- and 330 RLS policies needs touching, and why none of the ~171 client-side
-- `type === "..."` branches does either. They all still ask the same question.
-- Rewriting them against a live production database with no staging copy is
-- where the risk in this feature actually lives, so the design's whole purpose
-- is not to have to.
--
-- Roles are held per (role, school) PAIR rather than globally. A teacher at the
-- main school who is head of the annex is one row each, and the role switcher
-- only offers the roles valid at the school they are currently switched to.
-- Global roles were rejected: they would make a school head at one school
-- implicitly a school head at every school they are assigned to, which is
-- precisely the authority this table exists to be careful about.
--
-- Roles are SEQUENTIAL, not simultaneous — a teacher/school-head sees one menu
-- at a time and switches, rather than a union of both. That is deliberate, not
-- a shortcut: Instructional Supervision (121) has the school head *rating* the
-- teacher, and a merged session would let an observer edit their own COT rating
-- sheet.
--
-- WHO MAY ASSIGN. The division office, unrestricted, as it already does for
-- schools. And — new here, where 134 stopped at division-only — a school head
-- or assistant school head, for their own school's staff, from a restricted
-- set that excludes `school_head`, `assistant_school_head` and every division
-- role. Adding the nurse hat to a teacher is daily school business, not a
-- division ticket; promoting someone is not. That exclusion list is what stops
-- self-promotion, and it is enforced here rather than in the app, because the
-- anon key ships in the browser bundle (the 161 lesson).
--
-- Additive and idempotent throughout: one new table, four functions, two
-- triggers, one backfill. No column is dropped, no policy on an existing table
-- is replaced, no CHECK is widened, and the backfill only INSERTs — every user
-- keeps precisely the role they have today, so no menu, no policy and no report
-- moves when this is applied. Backing the feature out is a DELETE from one new
-- table (see the footer), not a migration.
--
-- One existing function IS replaced, in place and with an identical signature:
-- `sms_switch_active_school` (134), which must now also make sure the caller's
-- current role is one they hold at the destination. See section 6.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. The assignment table
--
-- `school_id` NULL means the role is held with no school — which is what a
-- division_admin / division_type row looks like. The backfill copies each
-- user's (type, school_id) verbatim rather than normalising division roles to
-- NULL, because the invariant everything else leans on is that a user's CURRENT
-- pair is always present in this table; a tidier NULL would break the guard in
-- section 5 for a super admin, whose sms_users.school_id is a real value.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_user_roles (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL,
  role       TEXT   NOT NULL,
  school_id  BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FKs added separately, per 116's lesson: CREATE TABLE IF NOT EXISTS silently
-- skips constraint declarations when the table already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_sms_user_roles_user'
      AND conrelid = 'procurements.sms_user_roles'::regclass
  ) THEN
    ALTER TABLE procurements.sms_user_roles
      ADD CONSTRAINT fk_sms_user_roles_user
      FOREIGN KEY (user_id) REFERENCES procurements.sms_users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_sms_user_roles_school'
      AND conrelid = 'procurements.sms_user_roles'::regclass
  ) THEN
    ALTER TABLE procurements.sms_user_roles
      ADD CONSTRAINT fk_sms_user_roles_school
      FOREIGN KEY (school_id) REFERENCES procurements.sms_schools(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Two PARTIAL unique indexes rather than one UNIQUE constraint: Postgres treats
-- NULLs as distinct, so a plain UNIQUE(user_id, role, school_id) would not stop
-- a division role being inserted twice. Same reasoning as 121's partial indexes
-- on sms_cot_observations, where observer_id is NULL on an agreement row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_user_roles_scoped_uniq
  ON procurements.sms_user_roles(user_id, role, school_id)
  WHERE school_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_user_roles_global_uniq
  ON procurements.sms_user_roles(user_id, role)
  WHERE school_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sms_user_roles_user_id
  ON procurements.sms_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_user_roles_school_id
  ON procurements.sms_user_roles(school_id);

COMMENT ON TABLE procurements.sms_user_roles IS
  'Roles a user may act as, per school. sms_users.type holds whichever of these is currently active.';

-- No CHECK on `role`. Free TEXT per the 119/132 precedent: the legal set stays
-- in exactly one place — sms_users_type_check, last widened by 158 — which the
-- switch functions below hit when they write sms_users.type. An illegal value
-- in this table therefore fails at switch time, and a future DepEd role never
-- has to be added to two constraints in lockstep.

-- ----------------------------------------------------------------------------
-- 2. Backfill — load-bearing
--
-- Every user keeps precisely the role they have today. Nothing becomes visible
-- to anybody on apply, and the switcher stays hidden for everyone, because it
-- only appears at two or more roles.
-- ----------------------------------------------------------------------------
INSERT INTO procurements.sms_user_roles (user_id, role, school_id)
SELECT u.id, u.type, u.school_id
FROM procurements.sms_users u
WHERE u.type IS NOT NULL
  AND (u.school_id IS NULL
       OR EXISTS (SELECT 1 FROM procurements.sms_schools s WHERE s.id = u.school_id))
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Helpers
--
-- sms_current_user_row_id() and sms_actor_manages_users() already exist from
-- 134 and are reused untouched.
-- ----------------------------------------------------------------------------

/**
 * True when (p_role, p_school_id) is one of p_user_id's assigned pairs.
 * IS NOT DISTINCT FROM so a NULL school (a division role) matches its own row
 * rather than nothing.
 */
CREATE OR REPLACE FUNCTION procurements.sms_user_may_use_role(
  p_user_id BIGINT, p_role TEXT, p_school_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role = p_role
      AND ur.school_id IS NOT DISTINCT FROM p_school_id
  );
$$;

/**
 * Roles a school head may hand out at their own school.
 *
 * The school staff roles a person can actually switch INTO, minus the two
 * appointments. `school_head` and `assistant_school_head` are excluded because
 * a school head must not be able to promote anyone, themselves included; the
 * division roles because they sit above the school entirely; and the
 * login-disabled roles (135/158: accounting, security_guard, utility_worker)
 * because a role nobody can switch into has no meaning in this set — those stay
 * a personnel record, set as the person's primary `type`.
 */
CREATE OR REPLACE FUNCTION procurements.sms_school_assignable_roles()
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['teacher', 'volunteer_teacher', 'registrar', 'admin',
               'librarian', 'guidance_counselor', 'school_nurse']::TEXT[];
$$;

/**
 * May the signed-in caller add or remove this exact assignment row?
 *
 * Division-level actors: anything, as they already may for school assignments.
 * A school head / assistant school head: only at the school they are currently
 * working in, only for staff assigned to that school, and only from the
 * restricted set above.
 */
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
     OR v_actor_type NOT IN ('school_head', 'assistant_school_head') THEN
    RETURN FALSE;
  END IF;

  -- A school head never grants a school-less role, and never reaches past the
  -- school they are currently switched to.
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

GRANT EXECUTE ON FUNCTION procurements.sms_user_may_use_role(BIGINT, TEXT, BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.sms_school_assignable_roles() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.sms_actor_may_assign_role(BIGINT, TEXT, BIGINT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. RLS on the assignment table
--
-- Readable by any signed-in user (the switcher has to list your own roles, and
-- /division/users lists everyone's). Writable only through the guard above — an
-- assignment row grants a menu and a set of policies, so 123's lesson applies:
-- it must not sit behind a blanket `authenticated` write.
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User roles are viewable by authenticated users" ON procurements.sms_user_roles;
CREATE POLICY "User roles are viewable by authenticated users"
  ON procurements.sms_user_roles FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "User roles are insertable by role assigners" ON procurements.sms_user_roles;
CREATE POLICY "User roles are insertable by role assigners"
  ON procurements.sms_user_roles FOR INSERT
  WITH CHECK (procurements.sms_actor_may_assign_role(user_id, role, school_id));

DROP POLICY IF EXISTS "User roles are updatable by role assigners" ON procurements.sms_user_roles;
CREATE POLICY "User roles are updatable by role assigners"
  ON procurements.sms_user_roles FOR UPDATE
  USING (procurements.sms_actor_may_assign_role(user_id, role, school_id))
  WITH CHECK (procurements.sms_actor_may_assign_role(user_id, role, school_id));

DROP POLICY IF EXISTS "User roles are deletable by role assigners" ON procurements.sms_user_roles;
CREATE POLICY "User roles are deletable by role assigners"
  ON procurements.sms_user_roles FOR DELETE
  USING (procurements.sms_actor_may_assign_role(user_id, role, school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_user_roles TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_user_roles_id_seq TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Guards
-- ----------------------------------------------------------------------------

/**
 * A user may only move themselves between their assigned roles.
 *
 * The twin of 134's sms_users_guard_school_change, and it closes the same hole:
 * 001's blanket `authenticated` UPDATE policy on sms_users still lets any
 * signed-in user rewrite their own `type` from the browser console. Fires only
 * when `type` actually changes. Division-level actors are unrestricted, and so
 * is SQL run outside a user session (auth.uid() IS NULL), which is what
 * migrations and the admin client use.
 *
 * Reads NEW.school_id, not OLD: sms_switch_active_context moves both columns in
 * one statement, and the pair has to be validated against the destination.
 */
CREATE OR REPLACE FUNCTION procurements.sms_users_guard_type_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF NEW.type IS NOT DISTINCT FROM OLD.type THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR procurements.sms_actor_manages_users() THEN
    RETURN NEW;
  END IF;

  IF OLD.id IS DISTINCT FROM procurements.sms_current_user_row_id() THEN
    RAISE EXCEPTION 'You may not change another user''s role.';
  END IF;

  IF NEW.type IS NULL
     OR NOT procurements.sms_user_may_use_role(OLD.id, NEW.type, NEW.school_id) THEN
    RAISE EXCEPTION 'You do not hold that role at this school.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_users_guard_type_change ON procurements.sms_users;
CREATE TRIGGER sms_users_guard_type_change
  BEFORE UPDATE OF type ON procurements.sms_users
  FOR EACH ROW EXECUTE FUNCTION procurements.sms_users_guard_type_change();

/**
 * Never delete the row a user is currently acting under.
 *
 * The invariant every other piece here leans on is that a user's active
 * (type, school_id) is always present in this table. Without this, a school
 * head removing the "teacher" hat from someone who is signed in AS a teacher
 * would leave them unable to switch back to a role they are already using.
 * Their session keeps working either way — RLS reads sms_users.type directly —
 * so this is about keeping the two in step, not about revoking access.
 *
 * Drop the primary role by changing the person's `type` on /staff instead.
 */
CREATE OR REPLACE FUNCTION procurements.sms_user_roles_guard_active_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_is_active BOOLEAN;
BEGIN
  -- Let a cascade through. Both FKs are ON DELETE CASCADE, and referential
  -- actions fire after the parent row is gone, so a missing parent means the
  -- school (or the user) is being deleted and there is nothing here to protect
  -- — without this, deleting a school would be blocked by its own cascade.
  IF OLD.school_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM procurements.sms_schools s WHERE s.id = OLD.school_id
     ) THEN
    RETURN OLD;
  END IF;

  SELECT TRUE INTO v_is_active
  FROM procurements.sms_users u
  WHERE u.id = OLD.user_id
    AND u.type = OLD.role
    AND u.school_id IS NOT DISTINCT FROM OLD.school_id
  LIMIT 1;

  IF v_is_active THEN
    RAISE EXCEPTION
      'That is the role this user is currently working under. Change their primary role first.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sms_user_roles_guard_active_delete ON procurements.sms_user_roles;
CREATE TRIGGER sms_user_roles_guard_active_delete
  BEFORE DELETE ON procurements.sms_user_roles
  FOR EACH ROW EXECUTE FUNCTION procurements.sms_user_roles_guard_active_delete();

-- ----------------------------------------------------------------------------
-- 6. The switches
--
-- SECURITY DEFINER so the caller needs no UPDATE grant on their own row beyond
-- these narrow paths; each re-checks assignment itself rather than leaning on
-- the trigger, so the error message is the useful one.
-- ----------------------------------------------------------------------------

/**
 * Move the signed-in user to another of their roles at their current school.
 *
 * Refuses the login-disabled roles outright (135/158). AuthGuard signs those
 * straight back out, so switching into one would strand the user outside the
 * app with no way back in — a switch that cannot be undone from the UI it was
 * made in.
 */
CREATE OR REPLACE FUNCTION procurements.sms_switch_active_role(p_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_user_id   BIGINT;
  v_school_id BIGINT;
BEGIN
  v_user_id := procurements.sms_current_user_row_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not signed in.';
  END IF;

  IF p_type IS NULL THEN
    RAISE EXCEPTION 'A role is required.';
  END IF;

  IF p_type IN ('accounting', 'security_guard', 'utility_worker') THEN
    RAISE EXCEPTION 'That role has no access to this system.';
  END IF;

  SELECT u.school_id INTO v_school_id
  FROM procurements.sms_users u WHERE u.id = v_user_id;

  IF NOT procurements.sms_user_may_use_role(v_user_id, p_type, v_school_id) THEN
    RAISE EXCEPTION 'You do not hold that role at this school.';
  END IF;

  UPDATE procurements.sms_users SET type = p_type WHERE id = v_user_id;

  RETURN p_type;
END;
$$;

COMMENT ON FUNCTION procurements.sms_switch_active_role(TEXT) IS
  'Moves the signed-in user to another of their assigned roles by rewriting sms_users.type. Rejects any role not in sms_user_roles for their active school.';

/**
 * Move to another assigned school AND role in one statement.
 *
 * Needed because the two columns are validated as a pair: setting them in two
 * UPDATEs leaves a window in which the (school, role) combination is one the
 * user does not hold, and RLS would read it.
 */
CREATE OR REPLACE FUNCTION procurements.sms_switch_active_context(
  p_school_id BIGINT, p_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_user_id BIGINT;
BEGIN
  v_user_id := procurements.sms_current_user_row_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not signed in.';
  END IF;

  IF p_school_id IS NULL THEN
    RAISE EXCEPTION 'A school is required.';
  END IF;

  IF p_type IS NULL THEN
    RAISE EXCEPTION 'A role is required.';
  END IF;

  IF p_type IN ('accounting', 'security_guard', 'utility_worker') THEN
    RAISE EXCEPTION 'That role has no access to this system.';
  END IF;

  IF NOT procurements.sms_user_may_use_school(v_user_id, p_school_id) THEN
    RAISE EXCEPTION 'You are not assigned to that school.';
  END IF;

  IF NOT procurements.sms_user_may_use_role(v_user_id, p_type, p_school_id) THEN
    RAISE EXCEPTION 'You do not hold that role at that school.';
  END IF;

  UPDATE procurements.sms_users
     SET school_id = p_school_id, type = p_type
   WHERE id = v_user_id;

  RETURN p_type;
END;
$$;

COMMENT ON FUNCTION procurements.sms_switch_active_context(BIGINT, TEXT) IS
  'Moves the signed-in user to an assigned (school, role) pair in one write, so the pair is never momentarily invalid.';

/**
 * 134's school switch, body replaced, signature identical.
 *
 * It must now also make sure the caller's CURRENT role is one they hold at the
 * destination, and raise naming the roles they do hold there rather than
 * silently promoting or demoting them — which school-only switching would
 * otherwise do the moment a two-school user held different roles at each.
 * The client catches this and re-calls sms_switch_active_context with a chosen
 * role.
 */
CREATE OR REPLACE FUNCTION procurements.sms_switch_active_school(p_school_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
DECLARE
  v_user_id BIGINT;
  v_type    TEXT;
  v_roles   TEXT;
BEGIN
  v_user_id := procurements.sms_current_user_row_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not signed in.';
  END IF;

  IF p_school_id IS NULL THEN
    RAISE EXCEPTION 'A school is required.';
  END IF;

  IF NOT procurements.sms_user_may_use_school(v_user_id, p_school_id) THEN
    RAISE EXCEPTION 'You are not assigned to that school.';
  END IF;

  SELECT u.type INTO v_type FROM procurements.sms_users u WHERE u.id = v_user_id;

  IF NOT procurements.sms_user_may_use_role(v_user_id, v_type, p_school_id) THEN
    SELECT string_agg(ur.role, ', ' ORDER BY ur.role) INTO v_roles
    FROM procurements.sms_user_roles ur
    WHERE ur.user_id = v_user_id AND ur.school_id = p_school_id;

    IF v_roles IS NULL THEN
      RAISE EXCEPTION 'You hold no role at that school.';
    END IF;

    RAISE EXCEPTION 'Choose the role to work in at that school: %', v_roles;
  END IF;

  UPDATE procurements.sms_users
     SET school_id = p_school_id
   WHERE id = v_user_id;

  RETURN p_school_id;
END;
$$;

COMMENT ON FUNCTION procurements.sms_switch_active_school(BIGINT) IS
  'Moves the signed-in user to one of their assigned schools. Rejects any school not in sms_user_schools, and any move that would leave them in a role they do not hold there.';

GRANT EXECUTE ON FUNCTION procurements.sms_switch_active_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sms_switch_active_context(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION procurements.sms_switch_active_school(BIGINT) TO authenticated;

-- ----------------------------------------------------------------------------
-- Verification (read-only) — run these AFTER applying:
--
--   -- 1. Backfill correctness. Every user's ACTIVE pair must be in the table.
--   --    MUST return 0. Everything else here leans on this invariant.
--   SELECT count(*) FROM procurements.sms_users u
--   WHERE u.type IS NOT NULL
--     AND NOT procurements.sms_user_may_use_role(u.id, u.type, u.school_id);
--
--   -- 2. Anyone holding more than one role — the list to spot-check in the UI.
--   --    Immediately after applying this must be empty.
--   SELECT u.id, u.name, u.type AS active, count(*) AS roles
--   FROM procurements.sms_users u
--   JOIN procurements.sms_user_roles ur ON ur.user_id = u.id
--   GROUP BY u.id, u.name, u.type HAVING count(*) > 1;
--
--   -- 3. No role outside the legal set (158's constraint). MUST return 0.
--   SELECT count(*) FROM procurements.sms_user_roles ur
--   WHERE ur.role NOT IN (
--     'school_head', 'assistant_school_head', 'teacher', 'volunteer_teacher',
--     'registrar', 'admin', 'super admin', 'division_admin', 'division_type',
--     'librarian', 'tutor', 'guidance_counselor', 'school_nurse', 'accounting',
--     'security_guard', 'utility_worker');
--
-- Backing out (no migration needed):
--   DROP TRIGGER IF EXISTS sms_users_guard_type_change ON procurements.sms_users;
--   DELETE FROM procurements.sms_user_roles;   -- after dropping the delete guard
-- No existing row is ever rewritten by this migration, so there is nothing to
-- restore. sms_switch_active_school's pre-163 body is in migration 134.
-- ----------------------------------------------------------------------------
