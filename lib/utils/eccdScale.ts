// ============================================================================
// ECCD raw -> scaled score lookup
// ============================================================================
// Shared by the teacher's entry grid and the printed trifold so the two cannot
// drift, which is how the screen and the card would otherwise come to disagree
// about a learner's scaled score.
// ============================================================================

import {
  ECCD_AGE_BANDS,
  ECCD_REFERENCE_SCALE_TABLE,
  eccdReferenceTable,
  type EccdAgeBand,
} from "@/lib/constants/eccd";

/**
 * Whole months between a birth date and a reference date. String-split rather
 * than `new Date()`, per the Kindergarten Progress Report, so a timezone cannot
 * move the birthday across a month boundary and re-band the learner.
 */
export function eccdAgeInMonths(
  dob: string | null | undefined,
  refIso: string,
): number | null {
  if (!dob) return null;
  const [by, bm, bd] = dob.slice(0, 10).split("-").map(Number);
  const [ry, rm, rd] = refIso.slice(0, 10).split("-").map(Number);
  if (!by || !bm || !bd || !ry || !rm || !rd) return null;
  let months = (ry - by) * 12 + (rm - bm);
  if (rd < bd) months -= 1;
  return months < 0 ? null : months;
}

/**
 * The conversion-table band a learner falls in on a given date.
 *
 * Clamped to the nearest band rather than returning nothing: the checklist runs
 * 4.11 to 5.11 years, but a kindergartener who turns six before the second
 * administration is ordinary, and the issued sample card scores exactly such a
 * learner on the upper band instead of leaving the row blank.
 */
export function eccdAgeBandFor(
  dob: string | null | undefined,
  refIso: string,
): EccdAgeBand | null {
  const months = eccdAgeInMonths(dob, refIso);
  if (months === null || ECCD_AGE_BANDS.length === 0) return null;

  const bands = [...ECCD_AGE_BANDS].sort((a, b) => a.minMonths - b.minMonths);
  const hit = bands.find((b) => months >= b.minMonths && months <= b.maxMonths);
  if (hit) return hit;
  return months < bands[0].minMonths ? bands[0] : bands[bands.length - 1];
}

// ----------------------------------------------------------------------------
// Scoring off the published table
// ----------------------------------------------------------------------------
// The conversion is DepEd's normed table, which holds only for the official
// checklist: a raw score is compared with how children did on exactly those
// items. So a domain is scored only while it still IS the official domain —
// its code is one of the seven and its active item count is what the table
// expects. A domain that has drifted prints blank for hand-entry rather than a
// figure converted against items it no longer has.

/** The seven official domain codes, in the order the table publishes them. */
export const ECCD_OFFICIAL_DOMAIN_CODES: string[] = Object.keys(
  Object.values(ECCD_REFERENCE_SCALE_TABLE)[0] ?? {},
);

/** Codes are typed at /settings/eccd, so " gm" must still find GM's table. */
function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * How many items the published table expects for a domain code — the highest
 * raw score it converts — or null for a code it does not publish. Every band
 * tops out at the same count (asserted in the tests), so the first is read.
 */
export function eccdOfficialItemCount(code: string): number | null {
  const table = eccdReferenceTable(ECCD_AGE_BANDS[0]?.id ?? "", normalizeCode(code));
  return table ? table.length - 1 : null;
}

/** Why a domain can or cannot be scored, worded for the settings screen. */
export type EccdDomainScoring = { scored: true } | { scored: false; reason: string };

export function eccdDomainScoring(code: string, activeItemCount: number): EccdDomainScoring {
  const expected = eccdOfficialItemCount(code);
  if (expected === null) {
    return {
      scored: false,
      reason: `"${code}" is not one of the official domain codes (${ECCD_OFFICIAL_DOMAIN_CODES.join(", ")}), so DepEd publishes no table for it.`,
    };
  }
  if (activeItemCount !== expected) {
    return {
      scored: false,
      reason: `${activeItemCount} active item${activeItemCount === 1 ? "" : "s"}; the DepEd table expects ${expected}.`,
    };
  }
  return { scored: true };
}

/**
 * The scaled score for a raw score, read off DepEd's published table for the
 * learner's age band. "" — written in by hand — when the domain no longer
 * matches the official checklist, when there is no band (no birth date), or
 * when the raw score is off the table.
 */
export function eccdScaledScore(
  code: string,
  activeItemCount: number,
  rawScore: number,
  bandId: string | null,
): string {
  if (!bandId || !eccdDomainScoring(code, activeItemCount).scored) return "";
  const value = eccdReferenceTable(bandId, normalizeCode(code))?.[rawScore];
  return value === undefined || value === null ? "" : String(value);
}

/** One domain as the sum needs it: its code, active item count and raw score. */
export interface EccdDomainResult {
  code: string;
  activeItemCount: number;
  rawScore: number;
}

/**
 * The sum of scaled scores, which the Standard Score table converts. It is only
 * meaningful over all seven official domains, so it is "" unless every one is
 * present and scored: a partial sum reads as a developmental delay the child
 * does not have. A domain outside the seven is not part of the norm and is
 * left out of the sum, not counted against it.
 */
export function eccdScaledSum(domains: EccdDomainResult[], bandId: string | null): string {
  let total = 0;
  for (const code of ECCD_OFFICIAL_DOMAIN_CODES) {
    const domain = domains.find((d) => normalizeCode(d.code) === code);
    if (!domain) return "";
    const scaled = eccdScaledScore(domain.code, domain.activeItemCount, domain.rawScore, bandId);
    if (scaled === "") return "";
    total += Number(scaled);
  }
  return String(total);
}
