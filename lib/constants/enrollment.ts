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
