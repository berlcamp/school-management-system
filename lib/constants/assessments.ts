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

// Phil-IRI reuses the same stored phase values (BoSY / MoSY / EoSY) but is
// labelled Pre-Test / Mid-Test / Post-Test throughout its own screens & PDF.
export const PHILIRI_PHASES: { value: AssessmentPhase; label: string }[] = [
  { value: "BoSY", label: "Pre-Test" },
  { value: "MoSY", label: "Mid-Test" },
  { value: "EoSY", label: "Post-Test" },
];

export function philIriPhaseLabel(phase: string | null | undefined): string {
  if (!phase) return "-";
  return PHILIRI_PHASES.find((p) => p.value === phase)?.label ?? phase;
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
// CRLA Part 2 — Record Form (Reading Fluency & Comprehension)
// ---------------------------------------------------------------------------

// Fluency "Observations" rubric (screenshot Part 2). Descriptions are editable
// per record form; these are the DepEd defaults seeded on creation.
export const CRLA_OBSERVATION_LEVELS: { level_no: number; description: string }[] = [
  { level_no: 1, description: "Reads word by word or lower" },
  { level_no: 2, description: "Reads words in chunks" },
  { level_no: 3, description: "Reads fluently but not observing punctuation marks" },
  { level_no: 4, description: "Reads fluently with proper expression" },
];

// Per-question mark on the record form: ✓ / ✗ / N/A.
export const CRLA_ANSWER_STATUSES = ["correct", "wrong", "na"] as const;
export type CrlaAnswerStatus = (typeof CRLA_ANSWER_STATUSES)[number];

export const CRLA_ANSWER_STATUS_LABELS: Record<CrlaAnswerStatus, string> = {
  correct: "✓",
  wrong: "✗",
  na: "N/A",
};

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
// Phil-IRI Group Screening Test — Class Reading Record (STCRR / Form 1B for
// English, TPPK / Form 1A for Filipino). Section advisers tally the number of
// correct responses per learner in three categories; a total of ≥14/20 means
// the learner need not take the full Phil-IRI.
// ---------------------------------------------------------------------------
export const PHILIRI_GST_LITERAL_MAX = 7;
export const PHILIRI_GST_INFERENTIAL_MAX = 7;
export const PHILIRI_GST_CRITICAL_MAX = 6;
export const PHILIRI_GST_TOTAL_MAX =
  PHILIRI_GST_LITERAL_MAX + PHILIRI_GST_INFERENTIAL_MAX + PHILIRI_GST_CRITICAL_MAX; // 20
export const PHILIRI_GST_PASS_THRESHOLD = 14;

// Grouping labels (also used by the division assessment reports rollup).
export const PHILIRI_RESULT_FOR_IRI = "For Phil-IRI (<14)";
export const PHILIRI_RESULT_NO_NEED = "No Phil-IRI (≥14)";

/** Screening result label from the 20-point total (null while unscored). */
export function philIriScreeningResult(total: number | null): string | null {
  if (total === null) return null;
  return total >= PHILIRI_GST_PASS_THRESHOLD
    ? PHILIRI_RESULT_NO_NEED
    : PHILIRI_RESULT_FOR_IRI;
}

// Bilingual column labels for the printed / on-screen Class Reading Record.
export interface PhilIriGstLabels {
  formTitle: string;
  formCode: string;
  testTaken: string;
  correctResponses: string;
  literal: string;
  inferential: string;
  critical: string;
  total: string;
  below: string;
  atOrAbove: string;
  note: string;
}

export const PHILIRI_GST_LABELS: Record<"English" | "Filipino", PhilIriGstLabels> = {
  English: {
    formTitle: "Screening Test Class Reading Record (STCRR)",
    formCode: "Phil-IRI Form 1B",
    testTaken: "Test Taken",
    correctResponses: "Number of Correct Responses",
    literal: "Literal",
    inferential: "Inferential",
    critical: "Critical",
    total: "Total Score",
    below: "Mark < 14",
    atOrAbove: "Mark ≥ 14",
    note: "Students with a total score of ≥ 14/20 need not take the Phil-IRI.",
  },
  Filipino: {
    formTitle: "Talaan ng Pangkatang Pagtatasa ng Klase (TPPK)",
    formCode: "Phil-IRI Form 1A",
    testTaken: "Nakuha ang Pagtatasa",
    correctResponses: "Bilang ng Tamang Sagot",
    literal: "Literal",
    inferential: "Paghihinuha",
    critical: "Kritikal",
    total: "Kabuuang Marka",
    below: "Markang < 14",
    atOrAbove: "Markang ≥ 14",
    note: "Ang mag-aaral na nagtamo ng kabuuang marka na ≥ 14/20 ay hindi na kailangang kumuha ng Phil-IRI.",
  },
};

export function philIriGstLabels(language: string): PhilIriGstLabels {
  return language === "Filipino"
    ? PHILIRI_GST_LABELS.Filipino
    : PHILIRI_GST_LABELS.English;
}

// ---------------------------------------------------------------------------
// Phil-IRI Individual Record Form (Form 3A Filipino / Form 3B English) — the
// per-learner oral reading test given to learners flagged by the screening.
// ---------------------------------------------------------------------------
export type PhilIriFormType = "screening" | "individual";

export const PHILIRI_FORM_TYPES: { value: PhilIriFormType; label: string }[] = [
  { value: "screening", label: "Group Screening (Class Reading Record)" },
  { value: "individual", label: "Individual Record Form (3A / 3B)" },
];

/** Individual-form code shown on the form, per language. */
export function philIriIndividualFormCode(language: string): string {
  return language === "Filipino" ? "Phil-IRI Form 3A" : "Phil-IRI Form 3B";
}

// Word-reading miscue types (Part B). Filipino gloss shown on Form 3A/3B.
export const PHILIRI_MISCUE_TYPES: {
  key: string;
  en: string;
  fil: string;
}[] = [
  { key: "mispronunciation", en: "Mispronunciation", fil: "Maling Bigkas" },
  { key: "omission", en: "Omission", fil: "Pagkakaltas" },
  { key: "substitution", en: "Substitution", fil: "Pagpapalit" },
  { key: "insertion", en: "Insertion", fil: "Pagsisingit" },
  { key: "repetition", en: "Repetition", fil: "Pag-uulit" },
  { key: "transposition", en: "Transposition", fil: "Pagpapalit ng lugar" },
  { key: "reversal", en: "Reversal", fil: "Paglilipat" },
];

// Standard number of comprehension questions on the individual record form.
export const PHILIRI_COMPREHENSION_QUESTIONS = 7;

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
