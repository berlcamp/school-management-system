// Active-school override for super admins.
//
// Super admins can switch the school they are currently working in. The chosen
// school id is persisted in localStorage so it survives reloads (AuthGuard
// reloads the user from `sms_users` on every mount, which would otherwise reset
// `school_id` to the value stored in the database). The override only applies to
// the "super admin" role; all other roles always use their assigned school.

export const ACTIVE_SCHOOL_STORAGE_KEY = "sms_active_school_id";

/** Returns the overridden `sms_schools.id`, or null when none is set. */
export function getActiveSchoolOverride(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ACTIVE_SCHOOL_STORAGE_KEY);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

/** Persists the active school override (an `sms_schools.id`). */
export function setActiveSchoolOverride(schoolId: number | string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_SCHOOL_STORAGE_KEY, String(schoolId));
}

/** Removes the override so the user falls back to their assigned school. */
export function clearActiveSchoolOverride(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_SCHOOL_STORAGE_KEY);
}
