// ============================================================================
// ECCD raw -> scaled score lookup
// ============================================================================
// Shared by the teacher's entry grid and the printed trifold so the two cannot
// drift, which is how the screen and the card would otherwise come to disagree
// about a learner's scaled score.
// ============================================================================

import { ECCD_AGE_BANDS, type EccdAgeBand } from "@/lib/constants/eccd";
import type { EccdScaleScore } from "@/types";

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

/**
 * The scaled score for a raw score, as the division entered it at
 * /settings/eccd.
 *
 * A row banded to the learner's age wins; an unbanded row (`age_band IS NULL`,
 * which is every row predating migration 186) is the fallback, so a division
 * that has not yet entered banded mappings keeps exactly the behaviour it had.
 * An unmapped raw score returns "" — the teacher writes it in from the printed
 * conversion table, which is better than a guessed developmental score.
 */
export function eccdScaledScore(
  scaleScores: EccdScaleScore[],
  domainId: string,
  rawScore: number,
  bandId: string | null,
): string {
  const forDomain = scaleScores.filter(
    (s) => String(s.domain_id) === String(domainId) && s.raw_score === rawScore,
  );

  const banded = bandId ? forDomain.find((s) => s.age_band === bandId) : undefined;
  const hit = banded ?? forDomain.find((s) => !s.age_band);
  return hit ? String(Number(hit.scale_score)) : "";
}
