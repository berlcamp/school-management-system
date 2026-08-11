/**
 * Enrollment lifecycle constants — single source of truth.
 *
 * Keep this file in sync with the lifecycle values defined in
 * supabase/migrations/050_promotion_graduated_status.sql and
 * 057_transfer_two_stage_approval.sql.
 */

/**
 * Lifecycle statuses that mean "this enrollment is finished" — no further
 * grade entry, edits, or status transitions should be allowed.
 *
 * `retained` is intentionally NOT terminal: a retained student is still in
 * the section for the rest of the school year, just not advancing.
 *
 * `pending_transfer` / `pending_review` are intentionally NOT terminal:
 * the destination school still needs to act on them.
 */
export const TERMINAL_ENROLLMENT_STATUSES = [
  "promoted",
  "graduated",
  "completed",
  "transferred_out",
  "dropped",
] as const;

export type TerminalEnrollmentStatus =
  (typeof TERMINAL_ENROLLMENT_STATUSES)[number];

export function isTerminalEnrollmentStatus(
  status: string | null | undefined,
): boolean {
  return (
    !!status &&
    (TERMINAL_ENROLLMENT_STATUSES as readonly string[]).includes(status)
  );
}

/**
 * Grade levels that graduate (rather than promote) at the end of the year.
 *
 * Grade 6: end of elementary
 * Grade 10: end of junior high (DepEd K-12)
 * Grade 12: end of senior high
 *
 * NOTE: This is currently a flat list because `sms_schools` has no
 * `school_level` column. When that column is added, this should become
 * a function `getTerminalGradesForSchool(school)` so that an elementary
 * school treats Grade 6 as graduation while a JHS does not. See review
 * item #9.
 */
export const TERMINAL_GRADES = [6, 10, 12] as const;

export function isTerminalGrade(gradeLevel: number): boolean {
  return (TERMINAL_GRADES as readonly number[]).includes(gradeLevel);
}

/**
 * Which lifecycle status a manual "Change Status" action may move to.
 *
 * Before this table the modal offered all eight statuses from every state, so
 * a Grade 3 row could be marked `graduated`, a `promoted` row kept the section
 * it was promoted out of, and `pending_transfer` — which belongs to the record
 * request state machine — could be set by hand, desynchronising the transfer.
 *
 * Rules encoded here:
 *  - `pending_transfer` is machine-owned. It is the target of no transition:
 *    only enroll_student_with_record_request sets it, and only
 *    respond_to_record_request / cancel_record_request clear it.
 *  - `graduated` is additionally gated on grade level — see TERMINAL_GRADES.
 *  - The end-of-year outcomes (`promoted` / `retained` / `graduated`) are
 *    reachable from `active` only; the server-side promotion-deadline trigger
 *    (migration 062) still has the final say on timing.
 *  - `completed` is the way back from a wrongly recorded outcome, which is
 *    also the escape hatch the graduation lock (126) leaves open.
 *  - `dropped` and `transferred_out` are reversible to `active` — a learner
 *    who comes back, or a transfer that was entered on the wrong record.
 */
export const ENROLLMENT_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  active: ["promoted", "retained", "graduated", "completed", "dropped", "transferred_out"],
  promoted: ["completed", "active", "retained"],
  retained: ["completed", "active", "promoted"],
  graduated: ["completed"],
  completed: ["active", "promoted", "retained", "graduated"],
  dropped: ["active"],
  transferred_out: ["active"],
  // Machine-owned: the transfer RPCs move these out again.
  pending_transfer: [],
  pending_review: [],
};

/**
 * Manual status targets available for one enrollment, given where it is now
 * and the grade level it is in. Returns [] for a machine-owned state.
 */
export function getAllowedStatusTransitions(
  currentStatus: string | null | undefined,
  gradeLevel: number | null | undefined,
): string[] {
  if (!currentStatus) return [];
  const allowed = ENROLLMENT_STATUS_TRANSITIONS[currentStatus] ?? [];
  return allowed.filter(
    (status) =>
      status !== "graduated" ||
      (gradeLevel != null && isTerminalGrade(gradeLevel)),
  );
}

/**
 * Statuses that mean the learner is no longer sitting in the section, so the
 * enrollment must not be counted on that section's roster. `promoted` is the
 * case the audit called out: a promoted row still counts against the section
 * it was promoted out of.
 *
 * This is a *read-side* filter, deliberately. The obvious-looking alternative
 * — nulling `section_id` when the status changes — cannot work: the column is
 * NOT NULL (migration 001), and it is the only record of where the learner
 * sat, so clearing it would leave `transferred_out → active` (and
 * `cancel_record_request`, which performs the same reversion server-side)
 * putting the learner back with no section to go back to.
 */
export const OFF_ROSTER_ENROLLMENT_STATUSES = [
  "promoted",
  "graduated",
  "completed",
  "transferred_out",
  "dropped",
] as const;

export function isOffRoster(status: string | null | undefined): boolean {
  return (
    !!status &&
    (OFF_ROSTER_ENROLLMENT_STATUSES as readonly string[]).includes(status)
  );
}
