"use client";

import { useAppSelector } from "@/lib/redux/hook";

/**
 * Roles allowed in the school head / admin level modules (Reports, Anecdotal,
 * Monitoring). Mirrors AppSidebar's `hasStaffAccess` — hiding a sidebar link is
 * not access control, so every page re-checks here.
 */
export const STAFF_MODULE_ROLES = [
  "school_head",
  "assistant_school_head",
  "super admin",
  "admin",
];

export function useStaffModuleAccess(): boolean {
  const user = useAppSelector((state) => state.user.user);
  return STAFF_MODULE_ROLES.includes(user?.type ?? "");
}
