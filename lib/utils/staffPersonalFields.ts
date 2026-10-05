/**
 * Which personal fields the /staff modal may write (migration 198).
 *
 * Position and sex are the employee's own to keep on /profile, so the staff
 * modal writes neither — writing null would erase what the person entered.
 * The exception is a login-disabled role (accounting, security guard, utility
 * worker): they cannot reach /profile, Staff by Position and the Non-Teaching
 * Personnel figures still count them, so the school records both for them.
 */

import { isLoginDisabledUserType } from "@/lib/constants";

export function staffPersonalFields(
  type: string | null | undefined,
  input: { position?: string | null; gender?: string | null },
): { position?: string | null; gender?: string | null } {
  if (!isLoginDisabledUserType(type)) return {};
  return {
    position: input.position?.trim() || null,
    gender: input.gender || null,
  };
}
