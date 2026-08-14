-- ============================================================================
-- 134. Multi-school user assignment + active-school switching
--
-- A staff member can be assigned to more than one school (a teacher who serves
-- two barangay schools, a registrar covering an annex). Until now `sms_users`
-- carried exactly one `school_id`, so such a person needed two logins.
--
-- THE MODEL — and the one thing to get right when reading the rest of the app:
--
--   `sms_user_schools`   = the set of schools this user MAY work in
--   `sms_users.school_id` = the school they are working in RIGHT NOW
--
-- `school_id` keeps its meaning as "the school whose data I am acting on", so
-- every one of the ~50 client queries that filter on it, and every RLS policy
-- that binds to it (037/115 subjects, 038 record requests, 057 record access,
-- 078/094 storage, 123 supervision, 129 requests, 131 enrollments), keeps
-- working untouched. Switching schools rewrites that one column via the RPC
-- below; nothing else in the system has to learn about the join table.
--
-- The alternative — a client-side "active school" override like the super
-- admin's localStorage one (094/113/115) — was rejected here: that override
-- only works because super admin sits in the *full-access* branch of every
-- policy. A school_head with two schools has no such branch, so an override
-- the database cannot see would 403 them out of subjects, enrolment, requests,
-- supervision and storage the moment they switched.
--
-- Consequence worth stating plainly: while a two-school teacher is switched to
-- school B, school A's staff pickers (section adviser, subject teacher) do not
-- list them, because those read `sms_users.school_id`. Already-saved
-- assignments are unaffected — they hold the user's id, not their school.
--
-- Also closes a pre-existing hole: 001's blanket
-- `USING (auth.role() = 'authenticated')` UPDATE policy on `sms_users` let any
-- signed-in user set their own `school_id` to any school from the browser
-- console. The guard trigger here confines a self-service change to the user's
-- assigned set (division-level actors and service_role are unrestricted).
--
-- Additive and idempotent throughout: one new table, one trigger, one RPC.
-- No column is dropped and no existing row is rewritten — the backfill only
-- INSERTs, so every user keeps the school they have today.
-- ============================================================================

SET search_path TO procurements, public;

-- ----------------------------------------------------------------------------
-- 1. The assignment table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurements.sms_user_schools (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL,
  school_id  BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FKs added separately, per 116's lesson: CREATE TABLE IF NOT EXISTS silently
-- skips constraint declarations when the table already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_sms_user_schools_user'
      AND conrelid = 'procurements.sms_user_schools'::regclass
  ) THEN
    ALTER TABLE procurements.sms_user_schools
      ADD CONSTRAINT fk_sms_user_schools_user
      FOREIGN KEY (user_id) REFERENCES procurements.sms_users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_sms_user_schools_school'
      AND conrelid = 'procurements.sms_user_schools'::regclass
  ) THEN
    ALTER TABLE procurements.sms_user_schools
      ADD CONSTRAINT fk_sms_user_schools_school
      FOREIGN KEY (school_id) REFERENCES procurements.sms_schools(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_sms_user_schools_user_school'
      AND conrelid = 'procurements.sms_user_schools'::regclass
  ) THEN
    ALTER TABLE procurements.sms_user_schools
      ADD CONSTRAINT uq_sms_user_schools_user_school UNIQUE (user_id, school_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sms_user_schools_user_id
  ON procurements.sms_user_schools(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_user_schools_school_id
  ON procurements.sms_user_schools(school_id);

COMMENT ON TABLE procurements.sms_user_schools IS
  'Schools a user may work in. sms_users.school_id holds whichever of these is currently active.';

-- ----------------------------------------------------------------------------
-- 2. Backfill — every user keeps the school they have today
-- ----------------------------------------------------------------------------
INSERT INTO procurements.sms_user_schools (user_id, school_id)
SELECT u.id, u.school_id
FROM procurements.sms_users u
WHERE u.school_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM procurements.sms_schools s WHERE s.id = u.school_id)
ON CONFLICT (user_id, school_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Helpers
-- ----------------------------------------------------------------------------

/** The sms_users.id of the signed-in caller, or NULL outside a user session. */
CREATE OR REPLACE FUNCTION procurements.sms_current_user_row_id()
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT id FROM procurements.sms_users WHERE user_id = auth.uid() LIMIT 1;
$$;

/**
 * Division-level actors, who may assign anyone to any school. Mirrors
 * `sms_actor_is_division` (123) but includes `division_type`, since the users
 * screen at /division/users is reached by that role family too.
 */
CREATE OR REPLACE FUNCTION procurements.sms_actor_manages_users()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = procurements, public
AS $$
  SELECT COALESCE(
    (SELECT u.type IN ('super admin', 'division_admin', 'division_type')
       FROM procurements.sms_users u
      WHERE u.user_id = auth.uid() AND u.is_active
      LIMIT 1),
    FALSE);
$$;

/** True when p_school_id is one of p_user_id's assigned schools. */
CREATE OR REPLACE FUNCTION procurements.sms_user_may_use_school(
  p_user_id BIGINT, p_school_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = procurements, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurements.sms_user_schools us
    WHERE us.user_id = p_user_id AND us.school_id = p_school_id
  );
$$;

GRANT EXECUTE ON FUNCTION procurements.sms_current_user_row_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.sms_actor_manages_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION procurements.sms_user_may_use_school(BIGINT, BIGINT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. RLS on the assignment table
--
-- Readable by any signed-in user (the switcher has to list your own schools,
-- and /division/users lists everyone's). Writable only by the roles that
-- manage users — an assignment row grants access to a school's data, so 123's
-- lesson applies: it must not sit behind a blanket `authenticated` write.
-- ----------------------------------------------------------------------------
ALTER TABLE procurements.sms_user_schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User schools are viewable by authenticated users" ON procurements.sms_user_schools;
CREATE POLICY "User schools are viewable by authenticated users"
  ON procurements.sms_user_schools FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "User schools are insertable by user managers" ON procurements.sms_user_schools;
CREATE POLICY "User schools are insertable by user managers"
  ON procurements.sms_user_schools FOR INSERT
  WITH CHECK (procurements.sms_actor_manages_users());

DROP POLICY IF EXISTS "User schools are updatable by user managers" ON procurements.sms_user_schools;
CREATE POLICY "User schools are updatable by user managers"
  ON procurements.sms_user_schools FOR UPDATE
  USING (procurements.sms_actor_manages_users())
  WITH CHECK (procurements.sms_actor_manages_users());

DROP POLICY IF EXISTS "User schools are deletable by user managers" ON procurements.sms_user_schools;
CREATE POLICY "User schools are deletable by user managers"
  ON procurements.sms_user_schools FOR DELETE
  USING (procurements.sms_actor_manages_users());

GRANT SELECT, INSERT, UPDATE, DELETE ON procurements.sms_user_schools TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE procurements.sms_user_schools_id_seq TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Guard: a user may only move themselves between their assigned schools
--
-- Fires only when school_id actually changes. Division-level actors are
-- unrestricted (they are the ones who set assignments in the first place), and
-- so is service_role / SQL run outside a user session (auth.uid() IS NULL),
-- which is what migrations and the admin client use.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sms_users_guard_school_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF NEW.school_id IS NOT DISTINCT FROM OLD.school_id THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR procurements.sms_actor_manages_users() THEN
    RETURN NEW;
  END IF;

  -- Anyone else may only rewrite their OWN row, and only to a school they are
  -- assigned to.
  IF OLD.id IS DISTINCT FROM procurements.sms_current_user_row_id() THEN
    RAISE EXCEPTION 'You may not change another user''s school.';
  END IF;

  IF NEW.school_id IS NULL
     OR NOT procurements.sms_user_may_use_school(OLD.id, NEW.school_id) THEN
    RAISE EXCEPTION 'You are not assigned to that school.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_users_guard_school_change ON procurements.sms_users;
CREATE TRIGGER sms_users_guard_school_change
  BEFORE UPDATE OF school_id ON procurements.sms_users
  FOR EACH ROW EXECUTE FUNCTION procurements.sms_users_guard_school_change();

-- ----------------------------------------------------------------------------
-- 6. The switch itself
--
-- SECURITY DEFINER so the caller needs no UPDATE grant on their own row beyond
-- this one narrow path; it re-checks assignment itself rather than leaning on
-- the trigger, so the error message is the useful one.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION procurements.sms_switch_active_school(p_school_id BIGINT)
RETURNS BIGINT
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

  IF NOT procurements.sms_user_may_use_school(v_user_id, p_school_id) THEN
    RAISE EXCEPTION 'You are not assigned to that school.';
  END IF;

  UPDATE procurements.sms_users
     SET school_id = p_school_id
   WHERE id = v_user_id;

  RETURN p_school_id;
END;
$$;

COMMENT ON FUNCTION procurements.sms_switch_active_school(BIGINT) IS
  'Moves the signed-in user to one of their assigned schools by rewriting sms_users.school_id. Rejects any school not in sms_user_schools.';

GRANT EXECUTE ON FUNCTION procurements.sms_switch_active_school(BIGINT) TO authenticated;

-- ----------------------------------------------------------------------------
-- Verification (read-only):
--
--   -- users assigned to more than one school
--   SELECT u.id, u.name, u.school_id AS active, count(*) AS assigned
--   FROM procurements.sms_users u
--   JOIN procurements.sms_user_schools us ON us.user_id = u.id
--   GROUP BY u.id, u.name, u.school_id HAVING count(*) > 1;
--
--   -- anyone whose active school is not in their assigned set (should be 0)
--   SELECT count(*) FROM procurements.sms_users u
--   WHERE u.school_id IS NOT NULL
--     AND NOT procurements.sms_user_may_use_school(u.id, u.school_id);
-- ----------------------------------------------------------------------------
