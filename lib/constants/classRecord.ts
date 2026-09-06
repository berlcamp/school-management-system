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
 * The updated K-to-10 E-Class Record table (workbook sheet HELPER, B8:D48) —
 * mirror of SQL `sms_transmute_grade_matatag`.
 *
 * The passing floor moved: an Initial Grade of 70.00 now transmutes to 75,
 * where DO 8 put that at 60.00. Steps are ~1.18 above the pass mark and ~4.66
 * below it, so a low Initial Grade is lifted far less than it used to be.
 *
 * One deliberate divergence from the workbook. Its Term Grade cell resolves
 * the band with INDEX(D8:D48, MATCH(IG, B8:B48, -1) + 1), which lands one band
 * low when the Initial Grade is *exactly* a listed minimum: IG 71.18 returns
 * 75, while the same sheet's IG(Min.)/IG(Max.) columns band 71.18-72.35 as 76.
 * This table reproduces the published bands, which is the artifact DepEd
 * documents and a teacher reads. Every non-boundary value agrees exactly.
 */
export const MATATAG_TRANSMUTATION_TABLE: TransmutationTable = [
  [99.5, 100], [98.32, 99], [97.14, 98], [95.96, 97], [94.78, 96],
  [93.6, 95], [92.42, 94], [91.24, 93], [90.06, 92], [88.88, 91],
  [87.7, 90], [86.52, 89], [85.34, 88], [84.16, 87], [82.98, 86],
  [81.8, 85], [80.62, 84], [79.44, 83], [78.26, 82], [77.08, 81],
  [75.9, 80], [74.72, 79], [73.54, 78], [72.36, 77], [71.18, 76],
  [70.0, 75], [65.34, 74], [60.67, 73], [56.01, 72], [51.34, 71],
  [46.67, 70], [42.01, 69], [37.34, 68], [32.68, 67], [28.01, 66],
  [23.35, 65], [18.68, 64], [14.01, 63], [9.35, 62], [4.68, 61],
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
