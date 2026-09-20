// Is the school this user works in still switched on?
//
// A super admin can deactivate a school from Division Office → Schools. A
// deactivated school keeps every one of its rows — nothing is deleted and
// nothing is archived — but its staff are turned away at the door, the same way
// an inactive `sms_users` row and a login-disabled role (migrations 135/158)
// already are: the OAuth callback refuses the session before it reaches a
// protected page, and `AuthGuard` refuses it again for a session that arrives
// any other way.
//
// Reactivating the school restores everyone without a migration, which is the
// point of a flag rather than a deletion.

import { isDivisionUserType } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";

/**
 * True when this user must be turned away because their school is deactivated.
 *
 * Never true for a division-office role: they oversee every school, and the
 * super admin who deactivated one has to stay able to sign back in and undo it.
 * Never true for a user with no school either — `SchoolIdGuard` owns that case.
 *
 * A failed read answers false on purpose. A network blip or an RLS change must
 * not lock an entire school out of its own system; the gate only fires on a row
 * that is actually there and actually says `is_active = false`.
 */
export async function isSchoolInactiveForUser(
  type?: string | null,
  schoolId?: number | string | null,
): Promise<boolean> {
  if (isDivisionUserType(type)) return false;
  if (schoolId === null || schoolId === undefined || schoolId === "") {
    return false;
  }

  const id = Number(schoolId);
  if (!Number.isFinite(id)) return false;

  const { data, error } = await supabase
    .from("sms_schools")
    .select("is_active")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return false;
  return data.is_active === false;
}
