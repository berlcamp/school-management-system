import { assignableRolesFor } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";

const table = "sms_user_roles";

/**
 * A user's roles at one school (migration 163).
 *
 * `sms_user_roles` holds the (role, school) pairs a person MAY act as;
 * `sms_users.type` holds whichever one they are acting as right now. Every
 * access decision in the system reads `type`, which is why this table can be
 * added without touching a single RLS policy — see the migration header.
 */
export const fetchUserRoles = async (
  userId: string | number,
  schoolId: string | number | null,
): Promise<string[]> => {
  let query = supabase
    .from(table)
    .select("role")
    .eq("user_id", Number(userId));

  query =
    schoolId == null
      ? query.is("school_id", null)
      : query.eq("school_id", Number(schoolId));

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return Array.from(new Set((data ?? []).map((r) => String(r.role)))).sort(
    (a, b) => a.localeCompare(b),
  );
};

/**
 * Brings a user's role set at one school in line with the picker.
 *
 * Diffed rather than wiped-and-rewritten, so an unchanged role keeps its row
 * (and its created_at) and a save that touches nothing writes nothing — the
 * same shape as `syncUserSchools` in `/division/users/AddModal.tsx`, which
 * exists for migration 134's assignment table.
 *
 * **Only roles inside the actor's remit are touched.** A school head may hand
 * out the school roles but not `school_head` itself, so if they set someone's
 * primary role to one they cannot assign, that row is left exactly as it is
 * rather than attempted and refused by RLS. The consequence, stated plainly:
 * a person promoted to school head by another school head holds `type =
 * 'school_head'` without a matching row here, so they cannot switch away and
 * back to it until the division office adds the row. Their access is
 * unaffected — RLS reads `type`, not this table.
 */
export const syncUserRoles = async ({
  userId,
  schoolId,
  primaryRole,
  extraRoles,
  actorType,
}: {
  userId: string | number;
  schoolId: string | number | null;
  /** Omitted when syncing a school the person is not currently working in. */
  primaryRole?: string | null;
  extraRoles: string[];
  actorType: string | null | undefined;
}): Promise<void> => {
  const manageable = new Set(assignableRolesFor(actorType));
  if (manageable.size === 0) return;

  const wanted = new Set(
    [...(primaryRole ? [primaryRole] : []), ...extraRoles].filter((role) =>
      manageable.has(role),
    ),
  );

  const existing = new Set(
    (await fetchUserRoles(userId, schoolId)).filter((role) =>
      manageable.has(role),
    ),
  );

  const toRemove = [...existing].filter((role) => !wanted.has(role));
  const toAdd = [...wanted].filter((role) => !existing.has(role));

  if (toRemove.length > 0) {
    let del = supabase
      .from(table)
      .delete()
      .eq("user_id", Number(userId))
      .in("role", toRemove);

    del =
      schoolId == null
        ? del.is("school_id", null)
        : del.eq("school_id", Number(schoolId));

    const { error } = await del;
    if (error) throw new Error(error.message);
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from(table).insert(
      toAdd.map((role) => ({
        user_id: Number(userId),
        role,
        school_id: schoolId == null ? null : Number(schoolId),
      })),
    );
    if (error) throw new Error(error.message);
  }
};
