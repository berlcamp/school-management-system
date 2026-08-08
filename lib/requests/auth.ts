/**
 * Caller identity for the Requests server actions.
 *
 * Every action in this module runs on the service-role client, which bypasses
 * RLS entirely — so the actions themselves are the only access control there
 * is. A server action is a public HTTP endpoint: anything it accepts as a
 * parameter is attacker-controlled. The acting staff member is therefore
 * resolved from the session cookie here and never taken from the client.
 *
 * Not a "use server" module on purpose — it exports types and sync helpers as
 * well as async ones, and it is only ever imported by server code.
 */

import { supabase2 } from "@/lib/supabase/admin";
import { getSupabaseClient } from "@/lib/supabase/server";

export interface RequestStaff {
  /** sms_users.id — what the client used to pass as `system_user_id`. */
  id: number;
  name: string;
  type: string;
  schoolId: number | null;
  /** Division-level staff act across every school. */
  isDivision: boolean;
}

/** Roles that may work the requests queue at a school. */
const STAFF_TYPES = [
  "school_head",
  "assistant_school_head",
  "admin",
  "registrar",
  "librarian",
  "super admin",
  "division_admin",
  "division_type",
];

const DIVISION_TYPES = ["super admin", "division_admin", "division_type"];

/**
 * The signed-in staff member, or null when there is no session, the profile is
 * deactivated, or the role has no business in this module (teachers, tutors).
 */
export async function getRequestStaff(): Promise<RequestStaff | null> {
  const supabase = await getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Read the staff row with the admin client: sms_users carries its own RLS and
  // this lookup must resolve regardless of how that policy is written.
  const { data } = await supabase2
    .from("sms_users")
    .select("id, name, type, school_id, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data || data.is_active === false) return null;
  if (!STAFF_TYPES.includes(data.type)) return null;

  return {
    id: data.id,
    name: data.name ?? "Staff",
    type: data.type,
    schoolId: data.school_id ?? null,
    isDivision: DIVISION_TYPES.includes(data.type),
  };
}

/**
 * Whether `staff` may act on a row belonging to `schoolId`.
 *
 * Division staff act anywhere. School staff act only on their own school —
 * and on unattributed rows (`school_id IS NULL`), which a public submission
 * produces when the LRN could not be resolved to a school and which would
 * otherwise be actionable by nobody.
 */
export function canActOnSchool(
  staff: RequestStaff,
  schoolId: number | null,
): boolean {
  if (staff.isDivision) return true;
  if (schoolId == null) return true;
  return staff.schoolId != null && String(staff.schoolId) === String(schoolId);
}
