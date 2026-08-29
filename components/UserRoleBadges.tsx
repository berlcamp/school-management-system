"use client";

import { USER_TYPE_LABELS } from "@/lib/constants";

/**
 * Every role a person may work as, active one first (migration 163).
 *
 * The active role — `sms_users.type`, which is what every RLS policy and every
 * client gate actually reads — carries the solid badge; the rest are the jobs
 * they can switch into from the header, shown muted so the distinction between
 * "is" and "may be" survives at a glance.
 *
 * Shared by the division Users list and the school Staff list so the two cannot
 * drift.
 */
export function UserRoleBadges({
  activeType,
  roles,
}: {
  activeType: string | null | undefined;
  roles: string[];
}) {
  const label = (role: string) => USER_TYPE_LABELS[role] ?? role;

  const others = roles
    .filter((role) => role !== activeType)
    .sort((a, b) => label(a).localeCompare(label(b)));

  if (!activeType && others.length === 0) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {activeType && (
        <span
          title="Currently working as"
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary"
        >
          {label(activeType)}
        </span>
      )}
      {others.map((role) => (
        <span
          key={role}
          title="Can switch to this role"
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground"
        >
          {label(role)}
        </span>
      ))}
    </div>
  );
}
