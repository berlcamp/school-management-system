-- ============================================================================
-- ADD "guidance_counselor", "school_nurse" AND "accounting" STAFF ROLES
-- ============================================================================
-- Three non-teaching roles a school already staffs but could not record here,
-- because sms_users.type is CHECK-constrained (001 -> 011 -> 031 -> 067 -> 095
-- -> 102) and the constraint is the only place the legal set is written down.
--
-- This migration ONLY widens that constraint. It grants nothing: every RLS
-- policy in the schema enumerates the roles it admits, and none of them names
-- these three, so a new user lands with exactly the access an unlisted role has
-- always had. What each role sees is decided in the app:
--
--   guidance_counselor -> Anecdotal Record, Learner Cardex, Manifestation
--                         Tagging (AppSidebar + useAdvisoryLearners)
--   school_nurse       -> Learner Health / SF8, and may encode it —
--                         sms_learner_health RLS is plain `authenticated`
--                         (023), so the adviser-only rule is app-layer and is
--                         widened in HealthEntryTable, not here
--   accounting         -> NOTHING. See below.
--
-- ---------------------------------------------------------------------------
-- Accounting is a personnel record, not a login
-- ---------------------------------------------------------------------------
-- Accounting staff belong on the plantilla and in the Division Non-Teaching
-- Personnel report, but this system holds no financial module and learner
-- records are outside their function. The row therefore exists so the school
-- can count and report the person; it must never become an account.
--
-- That rule is enforced in the app (`lib/constants/userTypes.ts` ->
-- LOGIN_DISABLED_USER_TYPES, applied by the OAuth callback and AuthGuard, both
-- of which sign the session straight back out) rather than in SQL, for the same
-- reason the existing `is_active = false` block lives there: sign-in is Google
-- OAuth against Supabase Auth, which knows nothing of sms_users.type, so there
-- is no database seam to refuse it at. Widening this constraint is what makes
-- the value storable; it is not what makes it safe.
-- ============================================================================

SET search_path TO procurements, public;

ALTER TABLE procurements.sms_users DROP CONSTRAINT IF EXISTS sms_users_type_check;
ALTER TABLE procurements.sms_users ADD CONSTRAINT sms_users_type_check
  CHECK (type IN (
    'school_head',
    'assistant_school_head',
    'teacher',
    'registrar',
    'admin',
    'super admin',
    'division_admin',
    'division_type',
    'librarian',
    'tutor',
    'guidance_counselor',
    'school_nurse',
    'accounting'
  ));

COMMENT ON COLUMN procurements.sms_users.type IS
  'Staff role. Legal values are fixed by sms_users_type_check; labels and login '
  'rules live in lib/constants/userTypes.ts. ''accounting'' is a personnel '
  'record only and is refused at sign-in by the app.';
