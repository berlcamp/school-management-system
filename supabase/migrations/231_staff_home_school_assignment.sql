-- ============================================================================
-- 231 — A staff member's home school is always one of their assigned schools
-- ============================================================================
--
-- Symptom: a school head / admin editing a staff member on /staff got
--   "new row violates row-level security policy for table sms_user_roles"
-- whenever the save added a role row (changed the Staff Type, or ticked an
-- "Also works as" role).
--
-- Cause: 134 backfilled `sms_user_schools` once, from `sms_users.school_id`.
-- Nothing has kept it in step since. /division/users writes assignments
-- itself, but /staff — where a school adds its own people — inserts the
-- `sms_users` row only, and `sms_user_schools` is writable by division actors
-- alone, so it cannot. Every staff member a school added after 134 therefore
-- has a `school_id` and no assignment there. 163's
-- `sms_actor_may_assign_role` ends with `sms_user_may_use_school(target,
-- school)`, which reads `sms_user_schools` only, so the role INSERT is
-- refused. (197's type-change guard asks the same question, so changing such
-- a person's Staff Type is refused too.) 71 such users on the local clone,
-- all created August 2026.
--
-- Fix:
--   1. `sms_users_ensure_home_school` — AFTER INSERT OR UPDATE OF school_id,
--      SECURITY DEFINER: adds (id, school_id) to `sms_user_schools` if missing.
--      Self-service school changes are already confined to the assigned set
--      by 134's guard, so for them this is a no-op; a division actor moving
--      someone gets the assignment they would have ticked anyway.
--      /division/users' `syncUserSchools` reads the set after its own
--      sms_users write, so it sees the row and does not insert it twice.
--   2. Backfill the missing rows — 134's statement, verbatim.
--
-- Nothing is removed and no access is widened beyond what 134 itself meant:
-- the person's active school was always supposed to be in their set.
--
-- Pre-apply count (rows the backfill will insert):
--   SELECT count(*)
--   FROM procurements.sms_users u
--   WHERE u.school_id IS NOT NULL
--     AND EXISTS (SELECT 1 FROM procurements.sms_schools s WHERE s.id = u.school_id)
--     AND NOT EXISTS (SELECT 1 FROM procurements.sms_user_schools us
--                     WHERE us.user_id = u.id AND us.school_id = u.school_id);
--
-- Only DML: the backfill. Tests: supabase/tests/231_staff_home_school_assignment.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION procurements.sms_users_ensure_home_school()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = procurements, public
AS $$
BEGIN
  IF NEW.school_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM procurements.sms_schools s WHERE s.id = NEW.school_id) THEN
    INSERT INTO procurements.sms_user_schools (user_id, school_id)
    VALUES (NEW.id, NEW.school_id)
    ON CONFLICT (user_id, school_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION procurements.sms_users_ensure_home_school() FROM PUBLIC;
REVOKE ALL ON FUNCTION procurements.sms_users_ensure_home_school() FROM anon, authenticated;

DROP TRIGGER IF EXISTS sms_users_ensure_home_school ON procurements.sms_users;
CREATE TRIGGER sms_users_ensure_home_school
  AFTER INSERT OR UPDATE OF school_id ON procurements.sms_users
  FOR EACH ROW
  EXECUTE FUNCTION procurements.sms_users_ensure_home_school();

-- Backfill (134 section 2, verbatim).
INSERT INTO procurements.sms_user_schools (user_id, school_id)
SELECT u.id, u.school_id
FROM procurements.sms_users u
WHERE u.school_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM procurements.sms_schools s WHERE s.id = u.school_id)
ON CONFLICT (user_id, school_id) DO NOTHING;
