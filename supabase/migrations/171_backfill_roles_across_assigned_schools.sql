-- ============================================================================
-- 171. Backfill roles across every assigned school — 163's missing half
--
-- THE BUG. A user assigned to two schools (134) cannot switch between them
-- since 163 was applied. `sms_switch_active_school` now refuses a move that
-- would leave the caller in a role they do not hold at the destination, and
-- 163's backfill wrote exactly ONE row per user — their ACTIVE (type,
-- school_id) pair. So a school admin working at school A holds `admin` at A and
-- nothing at B, and the switch raises:
--
--     You hold no role at that school.
--
-- which the header switcher can only turn into a red toast: unlike the sibling
-- refusal ("Choose the role to work in at that school: …"), there is no role to
-- offer, so the user is simply stuck at the school they happen to be in.
--
-- WHY THIS IS A REGRESSION, not a policy. Before 163 a user had exactly one
-- `type` and it applied at every school they were assigned to — switching
-- school carried the role along. 163's model is right (a role is held per
-- school), but its backfill under-states what every existing multi-school user
-- already had, and the invariant its own verification block checks — that a
-- user's ACTIVE pair is present — is silent about the schools they are not
-- currently standing in. This restores the pre-163 reach and nothing more.
--
-- WHAT IT WRITES. For every (user, assigned school) pair in `sms_user_schools`
-- with no row yet, one row carrying the user's CURRENT `sms_users.type`. Only
-- the primary role travels: roles granted per school after 163 (the nurse hat a
-- school head added at their own school) stay where they were granted, which is
-- the whole point of holding roles per school.
--
-- Additive and idempotent: INSERT … ON CONFLICT DO NOTHING against the two
-- partial unique indexes 163 created, no UPDATE, no DELETE, no schema change,
-- no function or policy replaced. Re-runnable; a second run writes nothing.
--
-- Going forward this needs no code change: `/division/users` already writes the
-- role set to every school in the picker (`saveRoles` → `syncUserRoles`), so
-- only assignments made before 163 are short.
-- ============================================================================

SET search_path TO procurements, public;

INSERT INTO procurements.sms_user_roles (user_id, role, school_id)
SELECT DISTINCT us.user_id, u.type, us.school_id
FROM procurements.sms_user_schools us
JOIN procurements.sms_users u ON u.id = us.user_id
WHERE u.type IS NOT NULL
  AND us.school_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM procurements.sms_schools s WHERE s.id = us.school_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM procurements.sms_user_roles ur
    WHERE ur.user_id = us.user_id
      AND ur.role = u.type
      AND ur.school_id IS NOT DISTINCT FROM us.school_id
  )
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- Verification (read-only) — run these AFTER applying:
--
--   -- 1. Every assigned school must now offer the user's primary role.
--   --    MUST return 0.
--   SELECT count(*)
--   FROM procurements.sms_user_schools us
--   JOIN procurements.sms_users u ON u.id = us.user_id
--   WHERE u.type IS NOT NULL
--     AND NOT procurements.sms_user_may_use_role(us.user_id, u.type, us.school_id);
--
--   -- 2. 163's own invariant still holds. MUST return 0.
--   SELECT count(*) FROM procurements.sms_users u
--   WHERE u.type IS NOT NULL
--     AND NOT procurements.sms_user_may_use_role(u.id, u.type, u.school_id);
--
--   -- 3. Who this touched — the multi-school users, and what they now hold.
--   SELECT u.id, u.name, u.type AS active,
--          (SELECT count(*) FROM procurements.sms_user_schools us WHERE us.user_id = u.id) AS schools,
--          (SELECT count(*) FROM procurements.sms_user_roles  ur WHERE ur.user_id = u.id) AS roles
--   FROM procurements.sms_users u
--   WHERE (SELECT count(*) FROM procurements.sms_user_schools us WHERE us.user_id = u.id) > 1
--   ORDER BY u.id;
--
-- Backing out: DELETE the rows this added (nothing else changed). They are
-- identifiable as (user_id, sms_users.type, school_id) triples whose school is
-- not the user's active one — but note that removing a role a user is currently
-- working under is refused by 163's sms_user_roles_guard_active_delete, which
-- is the correct behaviour.
-- ----------------------------------------------------------------------------
