-- ============================================================================
-- Migration 158: the "security_guard" and "utility_worker" staff roles
-- ============================================================================
--
-- APPLY AFTER 139_volunteer_teacher_role (the current sms_users_type_check).
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
--
-- Every school in the division staffs a security guard and a utility worker,
-- and the Division Non-Teaching Personnel report (071/075) already has a
-- 'security' and a 'utility' category waiting for them — but sms_users.type is
-- CHECK-constrained (001 -> 011 -> 031 -> 067 -> 095 -> 102 -> 135 -> 139) and
-- neither value was legal, so the school had to file the person under `admin`
-- or `librarian` and then hand-correct the category, or leave them off the
-- roster entirely. The category has existed since 071; the role has not.
--
-- ---------------------------------------------------------------------------
-- These are personnel records, not logins
-- ---------------------------------------------------------------------------
--
-- Both roles follow the `accounting` precedent set in 135 exactly. They belong
-- on the plantilla and in the division's personnel count, but this system holds
-- nothing either of them works in and learner records are outside both
-- functions. The row exists so the school can count and report the person; it
-- must never become an account.
--
-- As with `accounting`, that rule is enforced in the app rather than in SQL
-- (`lib/constants/userTypes.ts` -> LOGIN_DISABLED_USER_TYPES, applied by the
-- OAuth callback and AuthGuard, both of which sign the session straight back
-- out). Sign-in is Google OAuth against Supabase Auth, which knows nothing of
-- sms_users.type, so there is no database seam to refuse it at. Widening this
-- constraint is what makes the value storable; it is not what makes it safe.
--
-- ---------------------------------------------------------------------------
-- What this migration deliberately does NOT change
-- ---------------------------------------------------------------------------
--
-- No RLS policy is widened. Every policy in the schema enumerates the roles it
-- admits and none names these two, so a guard or a utility worker lands with
-- exactly the access an unlisted role has always had — which, for a role that
-- cannot sign in, is none.
--
-- No DepEd personnel count moves on apply. 071's teaching summary, 112's SRC
-- and 118's teacher-learner ratio count the literal 'teacher'; the non-teaching
-- matrix counts staff_category_code, which the app defaults to 'security' /
-- 'utility' for these roles (DEFAULT_STAFF_CATEGORY). Both categories were
-- already seeded by 071 and already columns on that report — until a school
-- records someone under the new role, every figure is unchanged.
--
-- ---------------------------------------------------------------------------
-- Blast radius
-- ---------------------------------------------------------------------------
--
-- Replaces 1 CHECK constraint. Creates nothing, drops nothing, and modifies NO
-- ROWS — there is no DML in this file. Nobody can currently hold either role
-- (neither was a legal value before this), so no existing account changes
-- behaviour on apply. Idempotent; re-running is a no-op.
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_users DROP CONSTRAINT IF EXISTS sms_users_type_check;
ALTER TABLE procurements.sms_users ADD CONSTRAINT sms_users_type_check
  CHECK (type IN (
    'school_head',
    'assistant_school_head',
    'teacher',
    'volunteer_teacher',
    'registrar',
    'admin',
    'super admin',
    'division_admin',
    'division_type',
    'librarian',
    'tutor',
    'guidance_counselor',
    'school_nurse',
    'accounting',
    'security_guard',
    'utility_worker'
  ));

COMMENT ON COLUMN procurements.sms_users.type IS
  'Staff role. Legal values are fixed by sms_users_type_check; labels and login '
  'rules live in lib/constants/userTypes.ts. ''accounting'', ''security_guard'' '
  'and ''utility_worker'' are personnel records only and are refused at sign-in '
  'by the app. ''volunteer_teacher'' is a teacher with no plantilla item and may '
  'not enrol learners.';
