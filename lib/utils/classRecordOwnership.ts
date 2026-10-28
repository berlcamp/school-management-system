/**
 * Who owns a class record when a subject changes hands part-way through the
 * year (migration 223). `sms_class_records.teacher_id` stamps the grades the
 * record posts, so a teacher who opened an empty Term 3 record before handing
 * the subject over must not leave the new teacher posting under their name.
 */

/**
 * The covering teacher takes over a record only when it is still empty and its
 * owner no longer covers that term. A record with any score is never moved, and
 * an owner who still covers the term (team teaching) keeps it.
 */
export function shouldTakeOverRecord(args: {
  openerId: number;
  ownerId: number | null;
  ownerCoversPeriod: boolean;
  hasScores: boolean;
  openerCovers: boolean;
}): boolean {
  return (
    args.openerCovers &&
    args.ownerId !== args.openerId &&
    !args.ownerCoversPeriod &&
    !args.hasScores
  );
}
