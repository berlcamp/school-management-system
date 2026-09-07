// Class record grading scheme — transmutation tables, descriptors and the
// per-learning-area component weights (migration 173).
//
// DepEd reissued the K-to-10 Electronic Class Record ("K to 10 (Updated)").
// The component maths is unchanged and 080/081 already reproduce it exactly:
//
//   WW / PT   PS = SUM(raw) / SUM(HPS) x 100
//   EX        PS = SUM( (raw_i / HPS_i x 100) x weight_i ) / SUM(weight_i)
//               with the fixed ST1 / ST2 / TE set weighted 30 / 30 / 40
//   WS        = PS x the component's weight
//   Initial   = WS(WW) + WS(PT) + WS(EX)
//
// What changed is everything downstream of the Initial Grade — the
// transmutation table, whether transmutation happens at all, the descriptors,
// and the weights, which now differ per learning area.
//
// Both schemes live here side by side because a term grade is posted into
// sms_grades, printed on a class record and read back in the student portal:
// a record opened under the old rules has to keep resolving under them. Which
// scheme a record uses is stored on the record row (`grading_scheme`) and is
// never re-derived from the school year — the 121 `career_stage` rule.

export type ClassRecordGradingScheme = "legacy" | "matatag";

/** Default for a newly opened record; mirrors the column DEFAULT in 173. */
export const DEFAULT_GRADING_SCHEME: ClassRecordGradingScheme = "matatag";

// ============================================================================
// TRANSMUTATION
// ============================================================================

/**
 * A transmutation table as `[minimum Initial Grade, transmuted grade]`, in
 * descending order — the first row whose minimum the Initial Grade reaches
 * wins, which is how the workbook's IG(Min.) / IG(Max.) bands read.
 */
export type TransmutationTable = readonly (readonly [number, number])[];

/** DepEd Order No. 8, s. 2015 — mirror of SQL `sms_transmute_grade`. */
export const LEGACY_TRANSMUTATION_TABLE: TransmutationTable = [
  [100, 100], [98.4, 99], [96.8, 98], [95.2, 97], [93.6, 96], [92.0, 95],
  [90.4, 94], [88.8, 93], [87.2, 92], [85.6, 91], [84.0, 90], [82.4, 89],
  [80.8, 88], [79.2, 87], [77.6, 86], [76.0, 85], [74.4, 84], [72.8, 83],
  [71.2, 82], [69.6, 81], [68.0, 80], [66.4, 79], [64.8, 78], [63.2, 77],
  [61.6, 76], [60.0, 75], [56.0, 74], [52.0, 73], [48.0, 72], [44.0, 71],
  [40.0, 70], [36.0, 69], [32.0, 68], [28.0, 67], [24.0, 66], [20.0, 65],
  [16.0, 64], [12.0, 63], [8.0, 62], [4.0, 61],
];

/**
 * DepEd's issued MATATAG transmutation table — mirror of SQL
 * `sms_transmute_grade_matatag` (migration 176).
 *
 * The passing floor is an Initial Grade of 70.00, where DO 8, s.2015 put it at
 * 60.00, and everything below 40.00 is a 60. Bands are transcribed from the
 * issued document verbatim, irregular widths and all: 3.00 points wide at the
 * pass band, 1.50 at 96.00-97.49, 15.00 at 39.99-25.00.
 *
 * This supersedes the table on the HELPER sheet of the E-Class Record
 * workbook, which migration 173 was built from. The two agree only at the pass
 * mark and at 84.00 -> 86, and differ by up to eight points elsewhere; the
 * issued table is the one that governs.
 *
 * The last two printed rows both read 60 (39.99-25.00, and 24.99-0.00 marked
 * "default minimum"). The 25.00 band is kept as a row so the table on screen
 * has the same rows as the paper; TRANSMUTATION_FLOOR covers the rest.
 */
export const MATATAG_TRANSMUTATION_TABLE: TransmutationTable = [
  [99.5, 100], [97.5, 99], [96.0, 98], [95.0, 97], [94.0, 96],
  [93.0, 95], [92.0, 94], [91.0, 93], [90.0, 92], [89.0, 91],
  [88.0, 90], [87.0, 89], [86.0, 88], [85.0, 87], [84.0, 86],
  [83.0, 85], [82.0, 84], [81.0, 83], [80.0, 82], [79.0, 81],
  [78.0, 80], [77.0, 79], [76.0, 78], [75.0, 77], [73.0, 76],
  [70.0, 75], // the pass mark
  [68.0, 74], [66.0, 73], [64.0, 72], [62.0, 71], [60.0, 70],
  [58.0, 69], [56.0, 68], [54.0, 67], [52.0, 66], [50.0, 65],
  [48.0, 64], [46.0, 63], [43.0, 62], [40.0, 61], [25.0, 60],
];

export function transmutationTableFor(
  scheme: ClassRecordGradingScheme
): TransmutationTable {
  return scheme === "matatag"
    ? MATATAG_TRANSMUTATION_TABLE
    : LEGACY_TRANSMUTATION_TABLE;
}

/** The lowest grade either table can produce — a floor, not a computed value. */
export const TRANSMUTATION_FLOOR = 60;

export function transmuteGrade(
  initial: number,
  scheme: ClassRecordGradingScheme
): number {
  for (const [threshold, grade] of transmutationTableFor(scheme)) {
    if (initial >= threshold) return grade;
  }
  return TRANSMUTATION_FLOOR;
}

/**
 * Whether the scheme transmutes unconditionally. The updated ECR has no
 * toggle — its Term Grade cell is an unconditional table lookup — so
 * `use_transmutation` only means anything on a legacy record.
 */
export function alwaysTransmutes(scheme: ClassRecordGradingScheme): boolean {
  return scheme === "matatag";
}

// ============================================================================
// DESCRIPTORS
// ============================================================================

export interface DescriptorBand {
  /** Inclusive lower bound of the band. */
  min: number;
  label: string;
  /** The band as printed on the legend, e.g. "90-100". */
  range: string;
  /** DepEd's General Description column; empty on the legacy bands. */
  description: string;
}

/** DO 8, s. 2015 descriptors, highest band first. */
export const LEGACY_DESCRIPTOR_BANDS: readonly DescriptorBand[] = [
  { min: 90, label: "Outstanding", range: "90-100", description: "" },
  { min: 85, label: "Very Satisfactory", range: "85-89", description: "" },
  { min: 80, label: "Satisfactory", range: "80-84", description: "" },
  { min: 75, label: "Fairly Satisfactory", range: "75-79", description: "" },
  {
    min: Number.NEGATIVE_INFINITY,
    label: "Did Not Meet Expectations",
    range: "Below 75",
    description: "",
  },
];

/** Updated K-to-10 ECR descriptors (workbook sheet HELPER, F8:H48). */
export const MATATAG_DESCRIPTOR_BANDS: readonly DescriptorBand[] = [
  {
    min: 90,
    label: "Advancing",
    range: "90-100",
    description:
      "Consistently demonstrates skills and understanding that meet or exceed standards with independence, flexibility, and depth.",
  },
  {
    min: 80,
    label: "Benchmarking",
    range: "80-89",
    description:
      "Demonstrates expected grade-level skills and understanding competently and independently.",
  },
  {
    min: 75,
    label: "Connecting",
    range: "75-79",
    description:
      "Demonstrates sufficient understanding and application of grade-level standards with occasional guidance and support.",
  },
  {
    min: 65,
    label: "Developing",
    range: "65-74",
    description:
      "Demonstrates partial understanding and inconsistent application of skills, requires targeted support and scaffolding.",
  },
  {
    min: Number.NEGATIVE_INFINITY,
    label: "Emerging",
    range: "60-64",
    description:
      "Does not yet demonstrate foundational skills and understanding; requires intensive support.",
  },
];

export function descriptorBandsFor(
  scheme: ClassRecordGradingScheme
): readonly DescriptorBand[] {
  return scheme === "matatag"
    ? MATATAG_DESCRIPTOR_BANDS
    : LEGACY_DESCRIPTOR_BANDS;
}

export function gradeDescriptor(
  grade: number,
  scheme: ClassRecordGradingScheme
): string {
  const bands = descriptorBandsFor(scheme);
  return (bands.find((b) => grade >= b.min) ?? bands[bands.length - 1]).label;
}

// ============================================================================
// COMPONENTS
// ============================================================================

export type ClassRecordComponentKey = "WW" | "PT" | "ST";

/**
 * Component headings. The third component is titled "Summative Tests & Term
 * Exams" on the old form and "Examinations (EXs)" on the updated one; its
 * database key stays `ST` either way, because renaming it would rewrite every
 * item row for a caption.
 */
export function componentTitle(
  key: ClassRecordComponentKey,
  scheme: ClassRecordGradingScheme
): string {
  if (key === "WW") return "Written / Oral Works (WWs)";
  if (key === "PT") return "Product / Performance Tasks (PTs)";
  return scheme === "matatag"
    ? "Examinations (EXs)"
    : "Summative Tests & Term Exams";
}

// ============================================================================
// WEIGHTS PER LEARNING AREA
// ============================================================================

export interface ClassRecordWeightPreset {
  id: string;
  label: string;
  /** The learning areas the workbook prescribes these weights for. */
  note: string;
  ww: number;
  pt: number;
  st: number;
}

/**
 * The weights the updated workbooks carry in their HIGHEST POSSIBLE SCORE row.
 * They are per learning area, which the single 20/50/30 default could not say:
 *
 *   Science, Math, English, Filipino, Araling Panlipunan   20 / 50 / 30
 *   EPP-TLE                                                20 / 60 / 20
 *   Music and Arts, PE and Health                          20 / 60 / 20
 *
 * A preset only *suggests* — the weights stay editable per record, the way
 * `suggestCareerStage()` suggests a career stage the School Head can override.
 */
export const CLASS_RECORD_WEIGHT_PRESETS: readonly ClassRecordWeightPreset[] = [
  {
    id: "core",
    label: "Core learning areas — 20 / 50 / 30",
    note: "Science, Mathematics, English, Filipino, Araling Panlipunan",
    ww: 20,
    pt: 50,
    st: 30,
  },
  {
    id: "tle",
    label: "EPP / TLE — 20 / 60 / 20",
    note: "Edukasyong Pantahanan at Pangkabuhayan, Technology and Livelihood Education",
    ww: 20,
    pt: 60,
    st: 20,
  },
  {
    id: "mapeh",
    label: "MAPEH — 20 / 60 / 20",
    note: "Music and Arts, Physical Education and Health",
    ww: 20,
    pt: 60,
    st: 20,
  },
];

export const DEFAULT_WEIGHT_PRESET = CLASS_RECORD_WEIGHT_PRESETS[0];

// ============================================================================
// FORM LAYOUT — WEIGHTED BLOCKS (migration 175)
// ============================================================================

/**
 * `standard` is 080's three weighted components: Written Works, Performance
 * Tasks, Examinations. `gmrc` is the six weighted blocks the updated GMRC /
 * Values Education workbook prints, stored in `sms_class_record_blocks`.
 */
export type ClassRecordFormLayout = "standard" | "gmrc";

export const DEFAULT_FORM_LAYOUT: ClassRecordFormLayout = "standard";

export interface ClassRecordBlockSeed {
  code: string;
  /** Which printed group the block nests under, and how its PS is computed. */
  component: ClassRecordComponentKey;
  label: string;
  weight: number;
  position: number;
}

/**
 * The GMRC / Values Education form, exactly as the updated workbook weights it
 * (sheet TERM 1, row 16): 10 / 10 | 10 / 10 / 30 | 30.
 *
 * The two Written Works domains and the three Performance Tasks domains sum to
 * the 20 and 50 the core form gives those components, so GMRC is not a
 * different weighting of the learning area — it is the same one, subdivided.
 */
export const GMRC_BLOCKS: readonly ClassRecordBlockSeed[] = [
  { code: "WW_COG", component: "WW", label: "Cognitive Domain", weight: 10, position: 0 },
  { code: "WW_AFF", component: "WW", label: "Affective Domain", weight: 10, position: 1 },
  { code: "PT_COG", component: "PT", label: "Cognitive Domain", weight: 10, position: 2 },
  { code: "PT_AFF", component: "PT", label: "Affective Domain", weight: 10, position: 3 },
  { code: "PT_BEH", component: "PT", label: "Behavioral Domain", weight: 30, position: 4 },
  { code: "EX", component: "ST", label: "Examinations", weight: 30, position: 5 },
];

/** The seeds for a layout. `standard` has none — its three columns say it all. */
export function blockSeedsFor(
  layout: ClassRecordFormLayout
): readonly ClassRecordBlockSeed[] {
  return layout === "gmrc" ? GMRC_BLOCKS : [];
}

export const CLASS_RECORD_FORM_LAYOUTS: {
  value: ClassRecordFormLayout;
  label: string;
  note: string;
}[] = [
  {
    value: "standard",
    label: "Standard — 3 components",
    note: "Written / Oral Works, Product / Performance Tasks, Examinations",
  },
  {
    value: "gmrc",
    label: "GMRC / Values Education — 6 domains",
    note: "Written Works and Performance Tasks split into Cognitive, Affective and Behavioral domains",
  },
];

/**
 * GMRC / Values Education prints on its own six-domain form. Recognised from
 * the subject name because nothing in the schema records a learning area —
 * a suggestion at record creation only, which the teacher can change while the
 * record is still empty (migration 175 guards the switch once scores exist).
 */
export function isGmrcLearningArea(subjectName: string): boolean {
  const n = subjectName.toLowerCase();
  return (
    /\bgmrc\b/.test(n) ||
    n.includes("values education") ||
    n.includes("edukasyon sa pagpapakatao") ||
    /\besp\b/.test(n)
  );
}

/** The form a subject most likely wants — a suggestion, never a lock. */
export function suggestFormLayout(subjectName: string): ClassRecordFormLayout {
  return isGmrcLearningArea(subjectName) ? "gmrc" : "standard";
}

/**
 * The preset a subject most likely wants. MAPEH is a stored fact (migration
 * 155's `mapeh_component`); EPP-TLE has no marker anywhere in the schema, so it
 * is read off the subject name. Wrong guesses cost nothing — the teacher sees
 * the weights and can change them.
 */
export function suggestWeightPreset(subject: {
  name: string;
  mapehComponent?: string | null;
}): ClassRecordWeightPreset {
  if (subject.mapehComponent) {
    return CLASS_RECORD_WEIGHT_PRESETS.find((p) => p.id === "mapeh")!;
  }
  const n = subject.name.toLowerCase();
  const isTle =
    /\bt\.?l\.?e\.?\b/.test(n) ||
    /\bepp\b/.test(n) ||
    n.includes("technology and livelihood") ||
    n.includes("edukasyong pantahanan");
  if (isTle) return CLASS_RECORD_WEIGHT_PRESETS.find((p) => p.id === "tle")!;
  return DEFAULT_WEIGHT_PRESET;
}

/** The preset matching a record's weights exactly, or null for a custom split. */
export function matchWeightPreset(
  ww: number,
  pt: number,
  st: number
): ClassRecordWeightPreset | null {
  return (
    CLASS_RECORD_WEIGHT_PRESETS.find(
      (p) => p.ww === ww && p.pt === pt && p.st === st
    ) ?? null
  );
}
