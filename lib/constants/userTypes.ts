/**
 * `sms_users.type` — the staff roles, their labels, and which of them may sign
 * in.
 *
 * This lives in the app rather than being read back from the CHECK constraint
 * (migration 135) on purpose: the database only needs to know a value is legal,
 * while the label and the login rule are application behaviour. Follows the
 * `lib/constants/subjects.ts` precedent.
 */

/** Roles a school may assign to its own staff, in the order the pickers show. */
export const SCHOOL_STAFF_USER_TYPES = [
  "school_head",
  "assistant_school_head",
  "teacher",
  "registrar",
  "admin",
  "librarian",
  "guidance_counselor",
  "school_nurse",
  "accounting",
] as const;

export type SchoolStaffUserType = (typeof SCHOOL_STAFF_USER_TYPES)[number];

/** What the division office may assign — its own role first, then the school
 *  roles, matching how the Users page has always ordered the picker. */
export const DIVISION_ASSIGNABLE_USER_TYPES = [
  "division_type",
  ...SCHOOL_STAFF_USER_TYPES,
] as const;

export type DivisionAssignableUserType =
  (typeof DIVISION_ASSIGNABLE_USER_TYPES)[number];

/** Human-readable label for any `sms_users.type` value, including the
 *  division-only ones that no picker offers. */
export const USER_TYPE_LABELS: Record<string, string> = {
  school_head: "School Head",
  assistant_school_head: "Assistant School Principal",
  teacher: "Teacher",
  registrar: "Registrar",
  admin: "Admin",
  librarian: "Librarian",
  guidance_counselor: "Guidance Counselor",
  school_nurse: "School Nurse",
  accounting: "Accounting",
  "super admin": "Super Admin",
  division_admin: "Division Admin",
  division_type: "Division User",
  tutor: "Tutor",
};

/**
 * Roles that exist as a staff record but hold no account in this system.
 *
 * Accounting personnel belong on the plantilla and in the Division
 * Non-Teaching Personnel report, but the system carries no financial module for
 * them and learner records are outside their function — so the row is a
 * personnel record only, never a login. Enforced in the OAuth callback and in
 * `AuthGuard`, both of which sign the session straight back out, mirroring how
 * an inactive `sms_users` row is already handled.
 */
export const LOGIN_DISABLED_USER_TYPES = ["accounting"] as const;

/** True when this role may hold a staff record but must not reach the app. */
export function isLoginDisabledUserType(type?: string | null): boolean {
  if (!type) return false;
  return (LOGIN_DISABLED_USER_TYPES as readonly string[]).includes(type);
}

/** Shown on the unverified screen when a blocked role tries to sign in. */
export const NO_PORTAL_ACCESS_MESSAGE =
  "Your role does not have access to the School Management System. Please contact your school head if you believe this is an error.";

/**
 * Staff category to fall back on when the role implies one and nobody picked
 * it. Only the roles added in migration 135 are listed: the pre-existing ones
 * keep their "leave it blank" behaviour so no saved record changes meaning.
 * Feeds the Division Non-Teaching Personnel report.
 */
export const DEFAULT_STAFF_CATEGORY: Partial<Record<string, string>> = {
  guidance_counselor: "guidance",
  school_nurse: "health",
  accounting: "admin",
};
