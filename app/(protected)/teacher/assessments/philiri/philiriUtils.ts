import {
  comprehensionLevel,
  isPhilIriScreeningEnrichment,
  overallReadingLevel,
  philIriScreeningResult,
  wordReadingLevel,
  PHILIRI_QUESTION_TYPES,
  PHILIRI_SCREENING_NON_READER,
  type PhilIriLevel,
  type PhilIriQuestionType,
} from "@/lib/constants";
import type { PhilIriComprehensionAnswer } from "@/types";

export interface PhilIriScreening {
  total: number | null;
  result: string | null;
}

/**
 * Tailwind badge classes for a GST screening reading level:
 * Non-Reader → red, Frustration → amber, Instructional/Independent → green.
 */
export function screeningLevelBadgeClass(result: string | null): string {
  if (result === null) return "";
  if (result === PHILIRI_SCREENING_NON_READER) return "bg-red-100 text-red-800";
  if (isPhilIriScreeningEnrichment(result)) return "bg-green-100 text-green-800";
  return "bg-amber-100 text-amber-800";
}

/**
 * Sum the per-category correct responses (Literal / Inferential / Critical) into
 * the Group Screening Test total and derive the screening result. The pass
 * threshold depends on the section grade (≥14/20 for Grades 3-6, ≥28/40 for
 * Grades 7-10). Returns a null total until at least one category has been scored.
 */
export function computeScreening(
  literal: number | null,
  inferential: number | null,
  critical: number | null,
  gradeLevel?: number | null,
): PhilIriScreening {
  if (literal === null && inferential === null && critical === null) {
    return { total: null, result: null };
  }
  const total = (literal ?? 0) + (inferential ?? 0) + (critical ?? 0);
  return { total, result: philIriScreeningResult(total, gradeLevel) };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface PhilIriIndividual {
  totalMiscues: number | null;
  wordReadingScore: number | null; // %
  wordReadingLevel: PhilIriLevel | null;
  comprehensionScore: number | null; // %
  comprehensionLevel: PhilIriLevel | null;
  overallReadingLevel: PhilIriLevel | null;
  readingRate: number | null; // words per minute
}

/**
 * Compute the Individual Record Form (3A/3B) results: total miscues → word
 * reading %, raw comprehension → comprehension %, reading time → reading rate,
 * and the derived reading levels (overall = the more severe of the two).
 */
export function computeIndividual(
  wordCount: number,
  miscueCounts: Record<string, number | null | undefined>,
  comprehensionRaw: number | null,
  comprehensionTotal: number,
  readingTimeSeconds: number | null,
): PhilIriIndividual {
  const miscueValues = Object.values(miscueCounts).filter(
    (v): v is number => typeof v === "number",
  );
  const totalMiscues = miscueValues.length > 0 ? miscueValues.reduce((a, b) => a + b, 0) : null;

  const wordReadingScore =
    totalMiscues === null || wordCount <= 0
      ? null
      : round2(((wordCount - totalMiscues) / wordCount) * 100);
  const comprehensionScore =
    comprehensionRaw === null || comprehensionTotal <= 0
      ? null
      : round2((comprehensionRaw / comprehensionTotal) * 100);
  const readingRate =
    readingTimeSeconds && readingTimeSeconds > 0 && wordCount > 0
      ? round2((wordCount * 60) / readingTimeSeconds)
      : null;

  const wr = wordReadingScore === null ? null : wordReadingLevel(wordReadingScore);
  const comp =
    comprehensionScore === null ? null : comprehensionLevel(comprehensionScore);
  let overall: PhilIriLevel | null = null;
  if (wr && comp) overall = overallReadingLevel(wr, comp);
  else overall = wr ?? comp ?? null;

  return {
    totalMiscues,
    wordReadingScore,
    wordReadingLevel: wr,
    comprehensionScore,
    comprehensionLevel: comp,
    overallReadingLevel: overall,
    readingRate,
  };
}

export interface PhilIriPassageRead {
  grade: number;
  overallLevel: PhilIriLevel | null;
}

export interface PhilIriFinalProfile {
  grade: number | null;
  profile: PhilIriLevel | null;
  label: string;
}

/**
 * Interpret a learner's ladder of graded-passage reads into the FINAL reading
 * profile (grade level + profile). Phil-IRI placement uses the highest grade at
 * which the learner is Instructional as their reading level; a learner who is
 * Independent everywhere places at the highest Independent grade; a learner who
 * frustrates on every passage places (with Frustration) at the lowest grade
 * tested. Reads with no computed overall level are ignored.
 */
export function deriveFinalProfile(
  reads: PhilIriPassageRead[],
): PhilIriFinalProfile {
  const scored = reads.filter((r) => r.overallLevel !== null);
  if (scored.length === 0) {
    return { grade: null, profile: null, label: "Not yet assessed" };
  }

  const gradesOf = (level: PhilIriLevel) =>
    scored.filter((r) => r.overallLevel === level).map((r) => r.grade);

  const instructional = gradesOf("Instructional");
  const independent = gradesOf("Independent");

  if (instructional.length > 0) {
    const grade = Math.max(...instructional);
    return { grade, profile: "Instructional", label: `Grade ${grade} — Instructional` };
  }
  if (independent.length > 0) {
    const grade = Math.max(...independent);
    return { grade, profile: "Independent", label: `Grade ${grade} — Independent` };
  }
  // All Frustration.
  const grade = Math.min(...scored.map((r) => r.grade));
  return { grade, profile: "Frustration", label: `Frustration below Grade ${grade}` };
}

// ---------------------------------------------------------------------------
// Individual Summary Record (ISR / Form 4) — Summary of Comprehension Responses
// ---------------------------------------------------------------------------

export interface PhilIriTypeScore {
  correct: number;
  total: number;
}

export interface PhilIriIsrRow {
  grade: number;
  title: string;
  answers: PhilIriComprehensionAnswer[]; // ordered q1..qn
  byType: Record<PhilIriQuestionType, PhilIriTypeScore>;
  rawCorrect: number;
  totalQuestions: number;
  comprehensionScore: number | null; // %
  readingLevel: PhilIriLevel | null; // comprehension-based level
}

/** Count answers marked correct (correct === true). */
export function rawCorrectOf(
  answers: Record<string, PhilIriComprehensionAnswer>,
): number {
  return Object.values(answers).filter((a) => a?.correct === true).length;
}

/**
 * Tally per-type Literal / Inferential / Critical sub-scores (correct / total)
 * across a passage's comprehension answers, for the ISR's "Score per Type of
 * Question" column.
 */
export function isrTypeScores(
  answers: Record<string, PhilIriComprehensionAnswer>,
): Record<PhilIriQuestionType, PhilIriTypeScore> {
  const acc = {
    literal: { correct: 0, total: 0 },
    inferential: { correct: 0, total: 0 },
    critical: { correct: 0, total: 0 },
  } as Record<PhilIriQuestionType, PhilIriTypeScore>;
  Object.values(answers).forEach((a) => {
    if (!a || !PHILIRI_QUESTION_TYPES.includes(a.type)) return;
    acc[a.type].total += 1;
    if (a.correct === true) acc[a.type].correct += 1;
  });
  return acc;
}
