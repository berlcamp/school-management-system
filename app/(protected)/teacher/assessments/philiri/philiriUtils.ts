import {
  comprehensionLevel,
  overallReadingLevel,
  wordReadingLevel,
} from "@/lib/constants";

export interface PhilIriComputed {
  wordReadingScore: number | null;
  comprehensionScore: number | null;
  wordReadingLevel: string | null;
  comprehensionLevel: string | null;
  overallReadingLevel: string | null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compute Phil-IRI scores + reading levels from a learner's miscues and the
 * number of correctly answered comprehension questions.
 */
export function computePhilIri(
  wordCount: number,
  miscues: number | null,
  correctCount: number,
  totalQuestions: number,
): PhilIriComputed {
  const wordReadingScore =
    miscues === null || wordCount <= 0
      ? null
      : round2(((wordCount - miscues) / wordCount) * 100);
  const comprehensionScore =
    totalQuestions <= 0 ? null : round2((correctCount / totalQuestions) * 100);

  const wr = wordReadingScore === null ? null : wordReadingLevel(wordReadingScore);
  const comp =
    comprehensionScore === null ? null : comprehensionLevel(comprehensionScore);

  let overall: string | null = null;
  if (wr && comp) overall = overallReadingLevel(wr, comp);
  else overall = wr ?? comp ?? null;

  return {
    wordReadingScore,
    comprehensionScore,
    wordReadingLevel: wr,
    comprehensionLevel: comp,
    overallReadingLevel: overall,
  };
}
