import {
  comprehensionLevel,
  overallReadingLevel,
  philIriScreeningResult,
  wordReadingLevel,
  type PhilIriLevel,
} from "@/lib/constants";

export interface PhilIriScreening {
  total: number | null;
  result: string | null;
}

/**
 * Sum the per-category correct responses (Literal / Inferential / Critical) into
 * the 20-point Group Screening Test total and derive the screening result.
 * Returns a null total until at least one category has been scored.
 */
export function computeScreening(
  literal: number | null,
  inferential: number | null,
  critical: number | null,
): PhilIriScreening {
  if (literal === null && inferential === null && critical === null) {
    return { total: null, result: null };
  }
  const total = (literal ?? 0) + (inferential ?? 0) + (critical ?? 0);
  return { total, result: philIriScreeningResult(total) };
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
