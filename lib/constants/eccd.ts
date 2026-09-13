// ============================================================================
// PHILIPPINE EARLY CHILDHOOD DEVELOPMENT CHECKLIST — printed form text
// ============================================================================
// The fixed text of the issued trifold, in Cebuano, transcribed verbatim from
// the Division of Bayugan City form. Per the `kinderProgress.ts` convention the
// instrument's own wording lives here and the school's data stays in the
// database: the domains, their checklist items and the raw -> scaled mapping are
// all editable at /settings/eccd and are never hard-coded.
// ============================================================================

/**
 * The division line of the issued letterhead. `sms_schools` carries a region and
 * a district (e.g. "Bayugan North District") but nothing holds a division name,
 * and the system serves exactly one division, so the form's own wording is
 * reproduced — the same call migration 172's Kindergarten Progress Report makes.
 */
export const ECCD_DIVISION = "Division of Bayugan City";

/** Title block on the cover panel. */
export const ECCD_FORM_TITLE = "PHILIPPINE EARLY CHILDHOOD DEVELOPMENT CHECKLIST";

/** The paragraph addressed to the parent, under the learner details. */
export const ECCD_PARENT_INTRO =
  "Ang Philippine Early Childhood Development Checklist maoy basehan sa abilidad, " +
  "kinaiya, kahibalo sa batang nagpangidaron og 4.11 ka tuig hangtud 5.11 ka tuig. " +
  "Kini maoy giya sa pag-ila sa inyong anak, og mahatagan sa saktong pag-atiman ug " +
  "matudloan, magiyahan sa ilang pagtubo ug paglambo.";

/** Lead-in above the per-domain item counts. */
export const ECCD_CONTENTS_INTRO =
  "Ang matag palid naglangkob sa lain-lain nga ang-ang sa paglambo nga may mga " +
  "nahitukma nga puntos.";

/** Closing line under the per-domain item counts. */
export const ECCD_CONTENTS_OUTRO =
  "Kada aytem nga na obserbahan gilista kini ka duha sa usa ka tuig, sugod sa tuig " +
  "ug katapusan sa tuig.";

/** "Mga Han-ay" — where the observation came from. */
export const ECCD_SOURCE_LEGEND: { code: string; text: string }[] = [
  { code: "P", text: "anaa o mabuhat sa bata" },
  { code: "O", text: "naobserbahan o nakita nga anaa sa bata ang katakos" },
  { code: "R", text: "report gikan sa ginikanan bahin sa abilidad sa bata" },
];

/** "Iskor" — what a mark in the semester column means. */
export const ECCD_SCORE_LEGEND: { code: string; text: string }[] = [
  { code: "(/)", text: "kaya o mabuhat sa bata" },
  { code: "(-)", text: "dili mabuhat o dili motubag" },
  { code: "(-9)", text: "dili gayod mabuhat sa bata" },
];

/**
 * Standard Score bands, printed on the inside panel beside the two
 * administrations. The band table is part of the form; the standard score
 * itself is written in by hand, because the scaled-sum -> standard-score
 * conversion is not held anywhere in the system.
 */
export const ECCD_STANDARD_SCORE_BANDS: {
  /** Printed back verbatim, irregular wording and all, per the 137/154 rule. */
  range: string;
  interpretation: string;
  min: number;
  max: number;
}[] = [
  { range: "69 and below", interpretation: "Suggest Significant Delay on Overall Development", min: -Infinity, max: 69 },
  { range: "70 - 79", interpretation: "Suggest Slight Delay on Overall Development", min: 70, max: 79 },
  { range: "80 - 119", interpretation: "Average Overall Development", min: 80, max: 119 },
  { range: "120 - 129", interpretation: "Suggest Slightly Advanced Development", min: 120, max: 129 },
  { range: "130 & above", interpretation: "Suggest Highly Advance Development", min: 130, max: Infinity },
];

/** The interpretation a Standard Score falls in, or "" if there is no score. */
export function eccdStandardScoreInterpretation(standardScore: number | null): string {
  if (standardScore === null || Number.isNaN(standardScore)) return "";
  return (
    ECCD_STANDARD_SCORE_BANDS.find((b) => standardScore >= b.min && standardScore <= b.max)
      ?.interpretation ?? ""
  );
}

/**
 * The four attendance rows, in the order the form prints them. Tardiness is not
 * recorded anywhere in the system, so that row prints empty for hand-entry
 * rather than a fabricated zero.
 */
export const ECCD_ATTENDANCE_ROWS = {
  classDays: "Adlaw nga Adunay Eskwela",
  present: "Adlaw nga Nagtungha",
  absent: "Adlaw nga Wala Magtungha",
  tardy: "Adlaw nga Naulahi sa Pagtungha",
} as const;

/**
 * Cebuano month initials for the attendance columns, aligned one-to-one with
 * `KINDER_ATTENDANCE_MONTHS` (June through April) so the two forms cannot drift.
 */
export const ECCD_MONTH_INITIALS = ["H", "H", "A", "S", "O", "N", "D", "E", "P", "M", "A"];

/** Cebuano month names, for the column tooltips / title attributes. */
export const ECCD_MONTH_NAMES = [
  "Hunyo", "Hulyo", "Agosto", "Septyembre", "Oktubre", "Nobyembre",
  "Disyembre", "Enero", "Pebrero", "Marso", "Abril",
];

// ============================================================================
// Age bands and the DepEd raw -> scaled conversion tables
// ============================================================================

export interface EccdAgeBand {
  /** Stored verbatim in `sms_eccd_scale_scores.age_band`. */
  id: string;
  label: string;
  /** Inclusive age range in whole months. 4.1 years is 49 months. */
  minMonths: number;
  maxMonths: number;
}

/**
 * The bands the issued conversion table is printed in. Free TEXT in the
 * database and validated here, per the 119/132 precedent: a DepEd revision that
 * re-cuts the bands is a change to this list, not a migration that invalidates
 * mappings a division has already entered.
 *
 * A learner outside every band is clamped to the nearest one. The checklist is
 * for 4.11 to 5.11 years, but a kindergartener who turns six before the second
 * administration is ordinary and the instrument still applies to them — which is
 * exactly what the sample card does, scoring a learner past 5.11 on the upper
 * band rather than leaving the card blank.
 */
export const ECCD_AGE_BANDS: EccdAgeBand[] = [
  { id: "4.1-5.0", label: "4.1 \u2013 5.0 years", minMonths: 49, maxMonths: 60 },
  { id: "5.1-5.11", label: "5.1 \u2013 5.11 years", minMonths: 61, maxMonths: 71 },
];

/**
 * DepEd's published raw -> scaled conversion, `band -> domain code -> raw score`.
 * Each array is indexed by raw score from 0; a `null` marks a raw score the
 * printed table leaves blank.
 *
 * This is reference data, not the mechanism. Nothing reads it at print time —
 * the scaled score always comes from `sms_eccd_scale_scores` as the division
 * entered it. It backs the "Load DepEd table" button on the Settings screen,
 * which fills the grid for review and saves nothing on its own, exactly as
 * migration 132's answer-key prefill does.
 *
 * Keyed by the domain codes seeded in migration 047. A school that renames a
 * domain keeps its mapping; one that adds a domain simply has no table to load.
 *
 * Transcribed from `Scaled_Score_Conversion_Tables.xlsx`, pages 1/4 and 2/4 of
 * the printed table, and checked against a completed card: every one of the ten
 * scaled scores on it reproduces exactly.
 */
export const ECCD_REFERENCE_SCALE_TABLE: Record<string, Record<string, (number | null)[]>> = {
  "4.1-5.0": {
    GM: [1, 1, 1, 1, 1, 1, 2, 4, 5, 7, 8, 10, 11, 13],
    FM: [1, 1, 1, 1, 2, 4, 5, 7, 9, 10, 12, 14],
    SH: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14],
    RL: [1, 1, 3, 6, 9, 11],
    EL: [2, 2, 2, 2, 2, 2, 5, 8, 11],
    COG: [1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 8, 9, 10, 11, 11, 12, 13, 13, 14, 15, 15, 16],
    SE: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13],
  },
  "5.1-5.11": {
    GM: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 7, 11],
    FM: [1, 1, 1, 1, 1, 1, 3, 5, 7, 8, 10, 12],
    SH: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 4, 6, 7, 9, 10, 12, 13],
    RL: [1, 1, 1, 4, 8, 11],
    EL: [5, 5, 5, 5, 5, 5, 5, 5, 11],
    COG: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    SE: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 5, 6, 7, 9, 10, 11, 13],
  },
};

/** The raw -> scaled table for one band and domain code, if DepEd publishes one. */
export function eccdReferenceTable(bandId: string, domainCode: string): (number | null)[] | undefined {
  return ECCD_REFERENCE_SCALE_TABLE[bandId]?.[domainCode];
}

/**
 * The scaled-sum -> Standard Score conversion, which the form prints beside the
 * two administrations and interprets through `ECCD_STANDARD_SCORE_BANDS`.
 *
 * EMPTY, deliberately. It is on pages 3/4 and 4/4 of the printed conversion
 * table, which are not in the workbook this was built from, and two known pairs
 * (a scaled sum of 52 reading 70, and 73 reading 101) do not determine a lookup
 * table. A developmental classification printed on a child's record is not a
 * figure to interpolate, so until the page arrives the card leaves the Standard
 * Score and its interpretation blank for hand-entry, which is how the issued
 * sample is filled in. Fill this in and the card computes both with no other
 * change.
 */
export const ECCD_STANDARD_SCORE_TABLE: Record<number, number> = {};
