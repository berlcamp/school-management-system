// ============================================================================
// PHILIPPINE EARLY CHILDHOOD DEVELOPMENT CHECKLIST — printed form text
// ============================================================================
// The fixed text of the issued trifold, in Cebuano, transcribed verbatim from
// the Division of Bayugan City form. Per the `kinderProgress.ts` convention the
// instrument's own wording lives here and the school's data stays in the
// database: the domains and their checklist items are editable at /settings/eccd
// and are never hard-coded. The raw -> scaled and scaled-sum -> standard-score
// conversions are DepEd's published tables, held below and not editable.
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
 * itself is looked up from the scaled sum through `ECCD_STANDARD_SCORE_TABLE`.
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
  /** Matches the keys of `ECCD_REFERENCE_SCALE_TABLE`. */
  id: string;
  label: string;
  /** Inclusive age range in whole months. 4.1 years is 49 months. */
  minMonths: number;
  maxMonths: number;
}

/**
 * The bands the issued conversion table is printed in. A DepEd revision that
 * re-cuts the bands is a change to this list and to the table below.
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
 * This IS the mechanism: the entry grid and the printed card both convert
 * through it (`eccdScaledScore` in lib/utils/eccdScale.ts), and /settings/eccd
 * shows it read-only. `sms_eccd_scale_scores` (059/186) is no longer read — its
 * rows were migration 059's placeholder defaults, not DepEd's table, and an
 * editable copy of a fixed published norm only offered ways to get it wrong.
 * A domain is converted only while its code and active item count still match
 * the table; otherwise it prints blank for hand-entry.
 *
 * Keyed by the domain codes seeded in migration 047. A school that renames a
 * domain keeps its mapping; one that adds a domain simply has no table to load.
 *
 * Transcribed from `Scaled_Score_Conversion_Tables.xlsx`, pages 1/4 and 2/4 of
 * the printed table, and checked against a completed card: every one of the ten
 * scaled scores on it reproduces exactly. Cross-checked against
 * `ECD_Scaled_and_Standard_Scores.xlsx`, which agrees on every column but one:
 * Socio-Emotional at 4.1-5.0, where the earlier transcription skipped scaled 6
 * and read raw 18-24 one point high. That column follows the later file.
 */
export const ECCD_REFERENCE_SCALE_TABLE: Record<string, Record<string, (number | null)[]>> = {
  "4.1-5.0": {
    GM: [1, 1, 1, 1, 1, 1, 2, 4, 5, 7, 8, 10, 11, 13],
    FM: [1, 1, 1, 1, 2, 4, 5, 7, 9, 10, 12, 14],
    SH: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14],
    RL: [1, 1, 3, 6, 9, 11],
    EL: [2, 2, 2, 2, 2, 2, 5, 8, 11],
    COG: [1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 8, 9, 10, 11, 11, 12, 13, 13, 14, 15, 15, 16],
    SE: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
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
 * Transcribed from the "Standard Scores" sheet of
 * `ECD_Scaled_and_Standard_Scores.xlsx` ("TABLE OF STANDARD SCORES", developed
 * by BCES – K-DAC 2017): every sum from 29 to 98, no gaps. It reproduces both
 * pairs read off the completed card (52 -> 70, 73 -> 101). A sum outside the
 * table has no entry and the card leaves the Standard Score and its
 * interpretation blank for hand-entry: a developmental classification printed
 * on a child's record is not a figure to extrapolate.
 */
export const ECCD_STANDARD_SCORE_TABLE: Record<number, number> = {
  29: 37, 30: 38, 31: 40, 32: 41, 33: 43, 34: 44, 35: 45, 36: 47, 37: 48, 38: 50,
  39: 51, 40: 53, 41: 54, 42: 56, 43: 57, 44: 59, 45: 60, 46: 62, 47: 64, 48: 65,
  49: 66, 50: 67, 51: 69, 52: 70, 53: 72, 54: 73, 55: 75, 56: 76, 57: 78, 58: 79,
  59: 81, 60: 82, 61: 84, 62: 85, 63: 86, 64: 88, 65: 89, 66: 91, 67: 92, 68: 94,
  69: 95, 70: 97, 71: 98, 72: 100, 73: 101, 74: 103, 75: 104, 76: 105, 77: 107, 78: 108,
  79: 110, 80: 111, 81: 113, 82: 114, 83: 116, 84: 117, 85: 119, 86: 120, 87: 122, 88: 123,
  89: 124, 90: 126, 91: 127, 92: 129, 93: 130, 94: 132, 95: 133, 96: 135, 97: 136, 98: 138,
};
