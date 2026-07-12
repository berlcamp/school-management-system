/**
 * Constants & helpers for the ARAL intervention program.
 *
 * ARAL defines no levels of its own — eligibility is read from the diagnostic
 * RESULTS recorded by the Assessments module (CRLA / Phil-IRI / RMA / PABASA).
 * These helpers map each assessment's stored level to an ARAL target tier:
 *   - priority   → immediate intervention target
 *   - secondary  → enrolled only if resources permit (extra tutors / materials)
 *
 * Programs & sources:
 *   reading      Grades 1-3  CRLA · Grades 4-10 Phil-IRI · Grades 11-12 PABASA
 *   mathematics  Grades 1-10 RMA
 *   science      Grades 3-10 cross-tab: Phil-IRI (Frustration) ∩ RMA (Intervention)
 *   summer       Grades 1-10 learners still Priority/Secondary in Reading/Math at EoSY
 */
import {
  crlaEnrolmentRecommendation,
  philIriSuggestedStartGrade,
  PHILIRI_SCREENING_FRUSTRATION,
  PHILIRI_SCREENING_INSTRUCTIONAL,
  PHILIRI_SCREENING_NON_READER,
  RMA_LEVEL_CONSOLIDATION,
  RMA_LEVEL_INTERVENTION,
} from "./assessments";

export type AralProgram = "reading" | "mathematics" | "science" | "summer";
export type AralTier = "priority" | "secondary";
export type AralStatus = "enrolled" | "ongoing" | "completed" | "dropped";
export type AralSourceAssessment =
  | "crla"
  | "philiri"
  | "rma"
  | "pabasa"
  | "cross_tab"
  | "manual";

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Grade coverage per program.
export const ARAL_READING_GRADES = range(1, 12); // CRLA 1-3 · Phil-IRI 4-10 · PABASA 11-12
export const ARAL_MATH_GRADES = range(1, 10);
export const ARAL_SCIENCE_GRADES = range(3, 10);
export const ARAL_SUMMER_GRADES = range(1, 10);

export interface AralProgramInfo {
  value: AralProgram;
  label: string;
  subtitle: string;
  description: string;
  grades: number[];
}

export const ARAL_PROGRAMS: AralProgramInfo[] = [
  {
    value: "reading",
    label: "ARAL Reading",
    subtitle: "Reading intervention · Grades 1–12",
    description:
      "From CRLA (Grades 1–3), Phil-IRI screening (Grades 4–10) and PABASA (Grades 11–12).",
    grades: ARAL_READING_GRADES,
  },
  {
    value: "mathematics",
    label: "ARAL Mathematics",
    subtitle: "Numeracy intervention · Grades 1–10",
    description: "From RMA levelling — Intervention (priority) and Consolidation (secondary).",
    grades: ARAL_MATH_GRADES,
  },
  {
    value: "science",
    label: "ARAL Science",
    subtitle: "Science intervention · Grades 3–10",
    description:
      "Cross-tabulated: learners at Frustration (Phil-IRI) AND Intervention (RMA).",
    grades: ARAL_SCIENCE_GRADES,
  },
  {
    value: "summer",
    label: "ARAL Summer Program",
    subtitle: "Summer remediation · Grades 1–10",
    description:
      "Learners still in a Reading or Math target range at End-of-School-Year (EoSY).",
    grades: ARAL_SUMMER_GRADES,
  },
];

export function aralProgramLabel(program: string | null | undefined): string {
  if (!program) return "-";
  return ARAL_PROGRAMS.find((p) => p.value === program)?.label ?? program;
}

// ---------------------------------------------------------------------------
// Target tiers
// ---------------------------------------------------------------------------
export const ARAL_TIERS: { value: AralTier; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "secondary", label: "Secondary" },
];

/** Tailwind text colour for an ARAL target tier (matches pabasaLevelColor style). */
export function aralTierColor(tier: string | null | undefined): string {
  switch (tier) {
    case "priority":
      return "text-red-600 dark:text-red-400";
    case "secondary":
      return "text-amber-600 dark:text-amber-400";
    default:
      return "text-muted-foreground";
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
export const ARAL_STATUSES: { value: AralStatus; label: string }[] = [
  { value: "enrolled", label: "Enrolled" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

export function aralStatusLabel(status: string | null | undefined): string {
  if (!status) return "-";
  return ARAL_STATUSES.find((s) => s.value === status)?.label ?? status;
}

// ---------------------------------------------------------------------------
// Source assessment labels
// ---------------------------------------------------------------------------
export const ARAL_SOURCE_LABELS: Record<AralSourceAssessment, string> = {
  crla: "CRLA",
  philiri: "Phil-IRI",
  rma: "RMA",
  pabasa: "PABASA",
  cross_tab: "Cross-tab",
  manual: "Manual",
};

export function aralSourceLabel(source: string | null | undefined): string {
  if (!source) return "-";
  return ARAL_SOURCE_LABELS[source as AralSourceAssessment] ?? source;
}

// ---------------------------------------------------------------------------
// Eligibility resolvers — map a stored assessment level to an ARAL tier.
// Returns null when the level is outside every target range (not eligible).
// ---------------------------------------------------------------------------

/** CRLA reading profile → tier. Reuses the Refresher → Mandatory/Optional map. */
export function crlaTier(profileLabel: string | null | undefined): AralTier | null {
  const rec = crlaEnrolmentRecommendation(profileLabel);
  if (rec === "Mandatory") return "priority";
  if (rec === "Optional (encouraged)") return "secondary";
  return null;
}

/** Phil-IRI screening result → Reading tier. */
export function philiriReadingTier(
  screeningResult: string | null | undefined,
): AralTier | null {
  if (
    screeningResult === PHILIRI_SCREENING_NON_READER ||
    screeningResult === PHILIRI_SCREENING_FRUSTRATION
  )
    return "priority";
  if (screeningResult === PHILIRI_SCREENING_INSTRUCTIONAL) return "secondary";
  return null;
}

/** PABASA reading-readiness level → Reading tier (Average = priority). */
export function pabasaTier(readingLevel: string | null | undefined): AralTier | null {
  return readingLevel === "Average" ? "priority" : null;
}

/** RMA mastery label → Mathematics tier. */
export function rmaTier(masteryLabel: string | null | undefined): AralTier | null {
  if (masteryLabel === RMA_LEVEL_INTERVENTION) return "priority";
  if (masteryLabel === RMA_LEVEL_CONSOLIDATION) return "secondary";
  return null;
}

/** Whether a Phil-IRI screening result qualifies for the Science cross-tab. */
export function philiriScienceEligible(
  screeningResult: string | null | undefined,
): boolean {
  return (
    screeningResult === PHILIRI_SCREENING_NON_READER ||
    screeningResult === PHILIRI_SCREENING_FRUSTRATION
  );
}

/** Whether an RMA mastery label qualifies for the Science cross-tab. */
export function rmaScienceEligible(masteryLabel: string | null | undefined): boolean {
  return masteryLabel === RMA_LEVEL_INTERVENTION;
}

/** Which assessment feeds ARAL Reading for a given grade level. */
export function readingSourceForGrade(
  grade: number,
): "crla" | "philiri" | "pabasa" {
  if (grade <= 3) return "crla"; // CRLA — Key Stage 1 (Grades 1-3)
  if (grade <= 10) return "philiri"; // Phil-IRI — Key Stages 2 & 3 (Grades 4-10)
  return "pabasa"; // PABASA — Grades 11-12
}

// ---------------------------------------------------------------------------
// Suggested start grade — the instructional entry point for the intervention.
// Only Phil-IRI applies a grade-level-down (the DepEd "2-3 levels down" logic
// from the GST total, clamped to Grade 1). All other assessments (CRLA / PABASA
// / RMA / cross-tab) start at the learner's own grade level.
// ---------------------------------------------------------------------------

/**
 * Suggested starting grade for a learner's intervention. Phil-IRI applies a
 * grade-level-down; every other source starts at the learner's actual grade.
 * `gstTotal` (Phil-IRI GST score) sharpens the Phil-IRI estimate when known.
 */
export function suggestedStartGrade(
  source: string | null | undefined,
  sourceLevel: string | null | undefined,
  grade: number,
  gstTotal?: number | null,
): number | null {
  if (source === "philiri") {
    return philIriSuggestedStartGrade(grade, gstTotal ?? null);
  }
  return grade; // crla / rma / pabasa / cross_tab — start at the learner's grade
}
