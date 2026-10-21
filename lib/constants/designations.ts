import { isLoginDisabledUserType } from "@/lib/constants/userTypes";

/**
 * Staff designations (migration 216): a coordinator hat layered on a teacher
 * account. Not a role — `sms_users.type` is untouched; a designation takes
 * effect only at the school it was granted for.
 */
export const STAFF_DESIGNATIONS = [
  "aral_coordinator",
  "reading_coordinator",
  "department_head",
  "grade_level_coordinator",
] as const;

export type StaffDesignation = (typeof STAFF_DESIGNATIONS)[number];

export const DESIGNATION_LABELS: Record<StaffDesignation, string> = {
  aral_coordinator: "ARAL Coordinator",
  reading_coordinator: "Reading Coordinator",
  department_head: "Department Head",
  grade_level_coordinator: "Grade Level Coordinator",
};

/** What a designation must be scoped to when it is granted. */
export function designationNeeds(
  d: StaffDesignation,
): "subjects" | "grade_levels" | null {
  if (d === "department_head") return "subjects";
  if (d === "grade_level_coordinator") return "grade_levels";
  return null;
}

/** Login-disabled personnel records hold no account, so cannot be designated. */
export function canBeDesignated(type?: string | null): boolean {
  if (!type) return false;
  return !isLoginDisabledUserType(type);
}

const DESIGNATION_MANAGER_TYPES = [
  "school_head",
  "assistant_school_head",
  "admin",
  "super admin",
  "division_admin",
] as const;

export function canManageDesignations(type?: string | null): boolean {
  if (!type) return false;
  return (DESIGNATION_MANAGER_TYPES as readonly string[]).includes(type);
}

/**
 * App twin of SQL `sms_is_subject_roster` (migration 216 / 115's write
 * roster). A user with a designation who is NOT in this roster works in
 * "designee-only mode".
 */
export const SUBJECT_ROSTER_USER_TYPES = [
  "school_head",
  "assistant_school_head",
  "admin",
  "registrar",
  "division_admin",
  "super admin",
] as const;

export function isSubjectRosterRole(type?: string | null): boolean {
  if (!type) return false;
  return (SUBJECT_ROSTER_USER_TYPES as readonly string[]).includes(type);
}
