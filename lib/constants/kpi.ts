/**
 * Key Performance Indicators — DepEd Memorandum, 12 October 2022,
 * "Guide in Computing Key Performance Indicators" (PS-EMISD, as of July 2022).
 *
 * Every constant here is quoted from that memo. Where the memo is silent the
 * code says so rather than inventing a DepEd standard.
 */

/** Official school ages follow the K-6-4-2 framework of RA 10533 (memo p. 2). */
export type KpiPopulationKey =
  | "population_age_5"
  | "population_age_6"
  | "population_ages_6_11"
  | "population_ages_5_11"
  | "population_ages_12_15"
  | "population_ages_16_17"
  | "population_ages_12_17"
  | "population_ages_5_17";

export interface KpiLevel {
  key: string;
  label: string;
  short: string;
  /** Grade levels making up the level. 0 = Kindergarten. */
  grades: number[];
  /** Official school age band, inclusive — the NER numerator's age filter. */
  ageMin: number;
  ageMax: number;
  /** Column in sms_kpi_reference holding the PSA projected population. */
  populationKey: KpiPopulationKey;
}

/** The seven levels the memo tabulates GER and NER for (pp. 3–6). */
export const KPI_LEVELS: KpiLevel[] = [
  {
    key: "kinder",
    label: "Kindergarten",
    short: "Kinder",
    grades: [0],
    ageMin: 5,
    ageMax: 5,
    populationKey: "population_age_5",
  },
  {
    key: "elementary",
    label: "Elementary (Grades 1–6)",
    short: "Elem",
    grades: [1, 2, 3, 4, 5, 6],
    ageMin: 6,
    ageMax: 11,
    populationKey: "population_ages_6_11",
  },
  {
    key: "kinder_to_g6",
    label: "Kindergarten to Grade 6",
    short: "K–G6",
    grades: [0, 1, 2, 3, 4, 5, 6],
    ageMin: 5,
    ageMax: 11,
    populationKey: "population_ages_5_11",
  },
  {
    key: "jhs",
    label: "Junior High School (Grades 7–10)",
    short: "JHS",
    grades: [7, 8, 9, 10],
    ageMin: 12,
    ageMax: 15,
    populationKey: "population_ages_12_15",
  },
  {
    key: "shs",
    label: "Senior High School (Grades 11–12)",
    short: "SHS",
    grades: [11, 12],
    ageMin: 16,
    ageMax: 17,
    populationKey: "population_ages_16_17",
  },
  {
    key: "secondary",
    label: "Secondary (Grades 7–12)",
    short: "JHS–SHS",
    grades: [7, 8, 9, 10, 11, 12],
    ageMin: 12,
    ageMax: 17,
    populationKey: "population_ages_12_17",
  },
  {
    key: "k_to_12",
    label: "Kindergarten to Grade 12",
    short: "K–G12",
    grades: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    ageMin: 5,
    ageMax: 17,
    populationKey: "population_ages_5_17",
  },
];

/** Human label for a population column, for the reference-data form. */
export const KPI_POPULATION_LABELS: Record<KpiPopulationKey, string> = {
  population_age_5: "Age 5",
  population_age_6: "Age 6",
  population_ages_6_11: "Ages 6–11",
  population_ages_5_11: "Ages 5–11",
  population_ages_12_15: "Ages 12–15",
  population_ages_16_17: "Ages 16–17",
  population_ages_12_17: "Ages 12–17",
  population_ages_5_17: "Ages 5–17",
};

/** Intake is measured at the two school-entrance grades only (memo pp. 7–8). */
export interface KpiIntakeLevel {
  key: string;
  label: string;
  gradeLevel: number;
  /** Official school-entrance age — the NIR's age filter. */
  officialAge: number;
  populationKey: KpiPopulationKey;
}

export const KPI_INTAKE_LEVELS: KpiIntakeLevel[] = [
  {
    key: "kinder",
    label: "Kindergarten",
    gradeLevel: 0,
    officialAge: 5,
    populationKey: "population_age_5",
  },
  {
    key: "grade_1",
    label: "Grade 1",
    gradeLevel: 1,
    officialAge: 6,
    populationKey: "population_age_6",
  },
];

/** The four transitions the memo computes (pp. 8–9). */
export interface KpiTransition {
  key: string;
  label: string;
  /** Grade enrolled in the PREVIOUS school year (the denominator). */
  fromGrade: number;
  /** Grade whose new entrants this year form the numerator. */
  toGrade: number;
}

export const KPI_TRANSITIONS: KpiTransition[] = [
  { key: "k_to_g1", label: "Kindergarten to Grade 1", fromGrade: 0, toGrade: 1 },
  { key: "g3_to_g4", label: "Grade 3 to Grade 4", fromGrade: 3, toGrade: 4 },
  {
    key: "g6_to_g7",
    label: "Elementary to Junior High School (Grade 6 to 7)",
    fromGrade: 6,
    toGrade: 7,
  },
  {
    key: "g10_to_g11",
    label: "Junior High to Senior High School (Grade 10 to 11)",
    fromGrade: 10,
    toGrade: 11,
  },
];

/**
 * Education cycles for the efficiency indicators. `lagYears` is how far back
 * the old-method cohort starts: the memo's CSR/CompR divide current enrollment
 * in the final grade by the entry-grade enrollment that many years earlier
 * (memo pp. 16–17).
 */
export interface KpiCycle {
  key: string;
  label: string;
  /** Grades of the cycle in order, entry grade first. */
  grades: number[];
  entryGrade: number;
  finalGrade: number;
  lagYears: number;
  /**
   * True when the final grade ends in graduation rather than completion —
   * Grades 6 and 12 graduate, Grade 10 produces "completers" (memo p. 11).
   */
  graduates: boolean;
}

export const KPI_CYCLES: KpiCycle[] = [
  {
    key: "elementary",
    label: "Elementary (Grades 1–6)",
    grades: [1, 2, 3, 4, 5, 6],
    entryGrade: 1,
    finalGrade: 6,
    lagYears: 5,
    graduates: true,
  },
  {
    key: "jhs",
    label: "Junior High School (Grades 7–10)",
    grades: [7, 8, 9, 10],
    entryGrade: 7,
    finalGrade: 10,
    lagYears: 3,
    graduates: false,
  },
  {
    key: "secondary",
    label: "Junior High to Senior High School (Grades 7–12)",
    grades: [7, 8, 9, 10, 11, 12],
    entryGrade: 7,
    finalGrade: 12,
    lagYears: 5,
    graduates: true,
  },
];

/**
 * Repetitions a learner may make within a cycle before the reconstructed-cohort
 * model treats them as a school leaver. The memo generates these figures from
 * the UNESCO Institute for Statistics (UIS) template, whose reconstructed
 * cohort model caps repetition; the template's own default of 3 is used here.
 * Changing it changes the coefficient of efficiency and years input per
 * graduate, and nothing else.
 */
export const KPI_COHORT_MAX_REPETITIONS = 3;

/** Notional cohort size the reconstructed cohort model follows (UIS: 1,000). */
export const KPI_COHORT_SIZE = 1000;

/** Gender Parity Index interpretation (memo p. 21). */
export function interpretGpi(gpi: number | null): string {
  if (gpi === null || !Number.isFinite(gpi)) return "—";
  if (gpi < 0.97) return "Disparity in favor of males";
  if (gpi <= 1.03) return "Parity between sexes";
  return "Disparity in favor of females";
}

/** Inter-Quartile Ratio interpretation (memo p. 22). */
export function interpretIqr(iqr: number | null): string {
  if (iqr === null || !Number.isFinite(iqr)) return "—";
  if (iqr < 1) return "Resources are equitably distributed";
  if (iqr <= 1.3) return "Resources are equitably distributed";
  return `Q1 schools hold ${iqr.toFixed(2)}× the resources of Q4 schools`;
}

/**
 * The memo requires at least eight schools for a true IQR (p. 22): "A list of
 * below 8 schools cannot generate a true IQR."
 */
export const KPI_IQR_MIN_SCHOOLS = 8;

/**
 * Ideal years input per graduate is the cycle length itself — six years for
 * both elementary and secondary in the memo's wording (p. 14). Anything higher
 * means repetition and school leaving are consuming pupil-years.
 */
export function idealYearsInput(cycle: KpiCycle): number {
  return cycle.grades.length;
}

/**
 * Governance levels at which each indicator may be computed, per the memo's
 * applicability tables (pp. 9, 14–15, 18–19).
 *   "yes"           — computed at that level
 *   "discretionary" — the memo's word: permitted at school level but the
 *                     Department reports the reconstructed-cohort figure
 *   "no"            — not computed at that level, and why
 */
export type KpiApplicability = "yes" | "discretionary" | "no";

export interface KpiIndicatorMeta {
  key: string;
  label: string;
  school: KpiApplicability;
  /** Shown when `school` is not "yes" — the memo's own reason. */
  schoolNote?: string;
}

export const KPI_INDICATOR_META: Record<string, KpiIndicatorMeta> = {
  ger: {
    key: "ger",
    label: "Gross Enrollment Rate",
    school: "no",
    schoolNote:
      "Not computed at school level — PSA projected population is published per division, not per school. A school figure uses the catchment population entered in Reference Data and is indicative only.",
  },
  ner: {
    key: "ner",
    label: "Net Enrollment Rate",
    school: "no",
    schoolNote:
      "Not computed at school level — PSA projected population is published per division, not per school. A school figure uses the catchment population entered in Reference Data and is indicative only.",
  },
  gir: {
    key: "gir",
    label: "Gross Intake Rate",
    school: "no",
    schoolNote:
      "Not computed at school level — depends on the projected population of school-entrance age.",
  },
  nir: {
    key: "nir",
    label: "Net Intake Rate",
    school: "no",
    schoolNote:
      "Not computed at school level — depends on the projected population of school-entrance age.",
  },
  transition: {
    key: "transition",
    label: "Transition Rate",
    school: "no",
    schoolNote:
      "Not computed at school level — learners transition between schools, so a single school's figure is distorted by migration.",
  },
  promotion: {
    key: "promotion",
    label: "Promotion Rate / Graduation Rate",
    school: "discretionary",
    schoolNote:
      "Reconstructed-cohort figures are not computed at school level (vulnerable to learner migration); the old-method figure below is discretionary at school level.",
  },
  repetition: {
    key: "repetition",
    label: "Repetition Rate",
    school: "yes",
  },
  school_leaver: {
    key: "school_leaver",
    label: "School Leaver Rate",
    school: "no",
    schoolNote:
      "Not computed at school level — a learner who leaves this school may have enrolled in another.",
  },
  cohort_survival: {
    key: "cohort_survival",
    label: "Cohort Survival Rate",
    school: "discretionary",
    schoolNote:
      "Computation at school level is discretionary; the Department reports the reconstructed-cohort figure.",
  },
  completion: {
    key: "completion",
    label: "Completion Rate",
    school: "discretionary",
    schoolNote:
      "Computation at school level is discretionary; the Department reports the reconstructed-cohort figure.",
  },
  coefficient_efficiency: {
    key: "coefficient_efficiency",
    label: "Coefficient of Efficiency",
    school: "no",
    schoolNote:
      "Not computed at school level — derived from the reconstructed cohort, which learner migration distorts at a single school.",
  },
  years_input: {
    key: "years_input",
    label: "Years Input per Graduate",
    school: "no",
    schoolNote:
      "Not computed at school level — derived from the reconstructed cohort.",
  },
  simple_dropout: {
    key: "simple_dropout",
    label: "Simple Dropout Rate",
    school: "yes",
  },
  ratios: {
    key: "ratios",
    label: "Ratio and Proportion",
    school: "yes",
  },
  iqr: {
    key: "iqr",
    label: "Inter-Quartile Ratio",
    school: "no",
    schoolNote:
      "Not computed at school level — the IQR compares schools, and needs at least eight of them.",
  },
};
