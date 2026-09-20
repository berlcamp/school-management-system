// ============================================================================
// DepEd LETTERHEAD — the lines printed above the school's name on a form
// ============================================================================
// `sms_schools.region` is an optional field on Division Office -> Schools, and
// on all but a couple of rows it was never filled in. The SF9 / MATATAG card
// and the Grade 1 progress card printed `school.region || "Region ______"`, so
// the region line of the letterhead came out as a blank rule on every learner's
// card while the issued form carries the region spelled out.
//
// The system serves exactly one division, whose region does not change, so the
// form's own wording stands in when the column is empty -- the same call
// `ECCD_DIVISION` makes in `eccd.ts`, and the wording the 3-fold report card and
// the ECCD card already print.
//
// It is a FALLBACK, never a replacement: a school that has stored its own region
// prints that, so a school outside Caraga is never mislabelled by this.
// ============================================================================

/** The region line when the school has none of its own. */
export const DEPED_REGION = "CARAGA Administrative Region";

/** The letterhead's region line for a school: what it stored, else the division's. */
export function letterheadRegion(region: string | null | undefined): string {
  return region?.trim() || DEPED_REGION;
}
