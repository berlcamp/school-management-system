/**
 * Constants & helpers for the DepEd diagnostic assessments:
 *   - CRLA    (Comprehensive Rapid Literacy Assessment)  Grades 1-3, per language
 *   - Phil-IRI (Philippine Informal Reading Inventory)   Grades 3-10, per language
 *   - RMA     (Rapid Mathematics Assessment)             Grades 1-10
 *
 * Division admins author the materials; section advisers record per-student
 * scores three times a year (BoSY / MoSY / EoSY).
 */

export type AssessmentType = "CRLA" | "PHIL_IRI" | "RMA";

// ---------------------------------------------------------------------------
// Administration phases (Beginning / Middle / End of School Year)
// ---------------------------------------------------------------------------
export type AssessmentPhase = "BoSY" | "MoSY" | "EoSY";

export const ASSESSMENT_PHASES: { value: AssessmentPhase; label: string }[] = [
  { value: "BoSY", label: "Beginning of SY (BoSY)" },
  { value: "MoSY", label: "Middle of SY (MoSY)" },
  { value: "EoSY", label: "End of SY (EoSY)" },
];

export const ASSESSMENT_PHASE_VALUES = ASSESSMENT_PHASES.map((p) => p.value);

export function getAssessmentPhaseLabel(phase: string | null | undefined): string {
  if (!phase) return "-";
  return ASSESSMENT_PHASES.find((p) => p.value === phase)?.label ?? phase;
}

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------
export const CRLA_LANGUAGES = ["English", "Filipino", "Mother Tongue"] as const;
export type CrlaLanguage = (typeof CRLA_LANGUAGES)[number];

export const PHILIRI_LANGUAGES = ["English", "Filipino"] as const;
export type PhilIriLanguage = (typeof PHILIRI_LANGUAGES)[number];

// ---------------------------------------------------------------------------
// Grade-level coverage per assessment
// ---------------------------------------------------------------------------
export const CRLA_GRADES = [1, 2, 3];
export const PHILIRI_GRADES = [3, 4, 5, 6, 7, 8, 9, 10];
export const RMA_GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// ---------------------------------------------------------------------------
// CRLA — reading-profile bands. Lookup is on the RAW total score.
// Defaults mirror the DepEd Grade 3 English scoresheet (20-point total).
// ---------------------------------------------------------------------------
export interface AssessmentBandSeed {
  min_score: number;
  max_score: number;
  label: string;
}

export const CRLA_DEFAULT_BANDS: AssessmentBandSeed[] = [
  { min_score: 0, max_score: 0, label: "Full Refresher" },
  { min_score: 1, max_score: 10, label: "Moderate Refresher" },
  { min_score: 11, max_score: 16, label: "Light Refresher" },
  { min_score: 17, max_score: 20, label: "Grade Ready" },
];

export const CRLA_DEFAULT_TASKS: { label: string; task_type: string; max_score: number }[] = [
  { label: "Task 1", task_type: "letters", max_score: 10 },
  { label: "Words", task_type: "words", max_score: 10 },
];

// ---------------------------------------------------------------------------
// Phil-IRI — reading levels (Phil-IRI Manual 2018). Word-reading level is based
// on the miscue percentage; comprehension level on the comprehension percentage.
// ---------------------------------------------------------------------------
export type PhilIriLevel = "Independent" | "Instructional" | "Frustration";

const PHILIRI_LEVEL_SEVERITY: Record<PhilIriLevel, number> = {
  Frustration: 0,
  Instructional: 1,
  Independent: 2,
};

/** Word-reading level from word-reading score % (≥97 Ind, 90-96 Inst, ≤89 Frus). */
export function wordReadingLevel(pct: number): PhilIriLevel {
  if (pct >= 97) return "Independent";
  if (pct >= 90) return "Instructional";
  return "Frustration";
}

/** Comprehension level from comprehension score % (≥80 Ind, 59-79 Inst, ≤58 Frus). */
export function comprehensionLevel(pct: number): PhilIriLevel {
  if (pct >= 80) return "Independent";
  if (pct >= 59) return "Instructional";
  return "Frustration";
}

/** Overall reading level = the more severe (lower) of the two component levels. */
export function overallReadingLevel(
  word: PhilIriLevel,
  comp: PhilIriLevel,
): PhilIriLevel {
  return PHILIRI_LEVEL_SEVERITY[word] <= PHILIRI_LEVEL_SEVERITY[comp]
    ? word
    : comp;
}

export const PHILIRI_QUESTION_TYPES = ["literal", "inferential", "critical"] as const;
export type PhilIriQuestionType = (typeof PHILIRI_QUESTION_TYPES)[number];

// ---------------------------------------------------------------------------
// RMA — math domains + mastery bands. Lookup is on the PERCENTAGE of the total
// possible score (mastery level).
// ---------------------------------------------------------------------------
export const RMA_DOMAINS = [
  "Number Sense",
  "Operations",
  "Geometry",
  "Measurement",
  "Patterns & Algebra",
  "Statistics & Probability",
] as const;
export type RmaDomain = (typeof RMA_DOMAINS)[number];

export const RMA_DEFAULT_BANDS: AssessmentBandSeed[] = [
  { min_score: 0, max_score: 49, label: "Not Proficient" },
  { min_score: 50, max_score: 74, label: "Low Proficient" },
  { min_score: 75, max_score: 84, label: "Nearly Proficient" },
  { min_score: 85, max_score: 100, label: "Proficient" },
];

/** Find the band label whose [min_score, max_score] contains `score` (inclusive). */
export function bandLabelForScore(
  bands: { min_score: number; max_score: number; label: string }[],
  score: number,
): string | null {
  const match = bands.find((b) => score >= b.min_score && score <= b.max_score);
  return match ? match.label : null;
}
