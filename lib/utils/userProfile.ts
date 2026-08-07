/**
 * Helpers for presenting the signed-in user: role label and avatar.
 *
 * The avatar picture comes from the user's Google account — Supabase copies it
 * into the auth user's metadata on OAuth sign-in (`avatar_url`, with `picture`
 * as the raw Google claim). It therefore exists only for the CURRENT user:
 * `sms_users` has no avatar column, which is why staff and division lists still
 * render initials for everyone else.
 */

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-pink-500",
];

/** Stable placeholder colour for a name, used behind the initials fallback. */
export function getAvatarColor(name: string): string {
  if (!name) return "bg-gray-500";
  const index = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

/** First + last initial, e.g. "Juan Dela Cruz" -> "JC". */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * The Google profile photo held in the Supabase auth metadata, or "" when the
 * account has none. Radix's `AvatarImage` falls back to the initials on both an
 * empty src and a failed load, so "" needs no special handling at the call site.
 */
export function googleAvatarUrl(
  metadata: Record<string, unknown> | undefined | null
): string {
  if (!metadata) return "";
  for (const key of ["avatar_url", "picture"] as const) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

const USER_TYPE_LABELS: Record<string, string> = {
  school_head: "School Head",
  assistant_school_head: "Assistant School Principal",
  "super admin": "Super Admin",
  division_admin: "Division Admin",
  division_type: "Division User",
  teacher: "Teacher",
  registrar: "Registrar",
  admin: "Admin",
  librarian: "Librarian",
  tutor: "Tutor",
};

/** Human-readable role label for an `sms_users.type` value. */
export function formatUserType(type?: string | null): string {
  if (!type) return "";
  return (
    USER_TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1)
  );
}
