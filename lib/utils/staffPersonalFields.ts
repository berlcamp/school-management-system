/**
 * Which personal fields the /staff modal writes.
 *
 * Position is written for everyone: the school may record it here, and the
 * employee may also keep it on /profile (the modal opens on the saved value, so
 * an untouched save keeps it). Sex stays the employee's own on /profile
 * (migration 198), so the modal writes it only for a login-disabled role
 * (accounting, security guard, utility worker), who cannot reach /profile.
 */

import { isLoginDisabledUserType } from "@/lib/constants";

export function staffPersonalFields(
  type: string | null | undefined,
  input: { position?: string | null; gender?: string | null },
): { position: string | null; gender?: string | null } {
  const position = input.position?.trim() || null;
  if (!isLoginDisabledUserType(type)) return { position };
  return { position, gender: input.gender || null };
}
