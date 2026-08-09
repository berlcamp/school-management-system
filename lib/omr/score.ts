/**
 * Score a decoded answer sheet against an exam's answer key.
 *
 * The output feeds three places at once, which is why it carries both a tally
 * and a per-item trail:
 *   - `correctItems` is what migration 101's item analysis already consumes, so
 *     a scanned result and a hand-encoded one are the same shape downstream;
 *   - `outcomes` is what the printed learner slip shows (their answer beside
 *     the key), and what a distractor analysis reads;
 *   - `points` respects per-item weighting, which the item-number tally cannot.
 *
 * An unkeyed item is not a wrong answer. Items the teacher has not keyed — an
 * essay, a question pulled after printing — are excluded from the denominator
 * entirely, rather than quietly counting against every learner.
 */

import { BLANK, MULTI_MARK } from "./decode";
import type { ItemSpec } from "./layout";

export interface AnswerKeyItem {
  itemNumber: number;
  /** null = not keyed; excluded from scoring rather than marked wrong. */
  correctAnswer: string | null;
  points: number;
  choiceCount: number;
}

export type ItemStatus =
  | "correct"
  | "wrong"
  | "blank"
  | "unresolved"
  | "unkeyed";

export interface ItemOutcome {
  itemNumber: number;
  /** What the learner marked: a letter, "" for blank, "?" for a multi-mark. */
  response: string;
  correctAnswer: string | null;
  status: ItemStatus;
  points: number;
  earned: number;
}

export interface SheetScore {
  /** Item numbers answered correctly — the input to the item analysis. */
  correctItems: number[];
  correctCount: number;
  /** Keyed items only. */
  scorableCount: number;
  points: number;
  maxPoints: number;
  /** Score as a percentage of the keyed items, 0–100, 2 dp. */
  percentage: number;
  outcomes: ItemOutcome[];
}

/** Upper-case, trimmed; "" and "?" pass through as themselves. */
export function normalizeResponse(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

/**
 * Score one sheet. `answers` is positional against `key` (answers[i] answers
 * key[i]) — the same order the sheet layout was built in. A short array is
 * treated as trailing blanks rather than an error, so a partially decoded sheet
 * still scores what it did read.
 */
export function scoreAnswers(
  answers: string[],
  key: AnswerKeyItem[],
): SheetScore {
  const outcomes: ItemOutcome[] = key.map((item, index) => {
    const response = normalizeResponse(answers[index]);
    const correctAnswer = item.correctAnswer
      ? normalizeResponse(item.correctAnswer)
      : null;

    let status: ItemStatus;
    if (!correctAnswer) status = "unkeyed";
    else if (response === MULTI_MARK) status = "unresolved";
    else if (response === BLANK) status = "blank";
    else status = response === correctAnswer ? "correct" : "wrong";

    return {
      itemNumber: item.itemNumber,
      response,
      correctAnswer,
      status,
      points: item.points,
      earned: status === "correct" ? item.points : 0,
    };
  });

  const scorable = outcomes.filter((o) => o.status !== "unkeyed");
  const correct = outcomes.filter((o) => o.status === "correct");
  const maxPoints = scorable.reduce((sum, o) => sum + o.points, 0);
  const points = correct.reduce((sum, o) => sum + o.earned, 0);

  return {
    correctItems: correct.map((o) => o.itemNumber),
    correctCount: correct.length,
    scorableCount: scorable.length,
    points: round2(points),
    maxPoints: round2(maxPoints),
    percentage: maxPoints > 0 ? round2((points / maxPoints) * 100) : 0,
    outcomes,
  };
}

/**
 * Item numbers a sheet is scored against — the keyed ones, in order. This is
 * the `total_items` snapshot on the result row and the item list the analysis
 * runs over, so both come from one place.
 */
export function scorableItemNumbers(key: AnswerKeyItem[]): number[] {
  return key.filter((k) => k.correctAnswer).map((k) => k.itemNumber);
}

/**
 * Sheet geometry for a key. Every item gets a printed row, keyed or not: a
 * learner still answers an item whose key the teacher has not typed yet, and
 * throwing the row away would shift every item below it out of alignment.
 */
export function itemSpecsFromKey(key: AnswerKeyItem[]): ItemSpec[] {
  return key.map((k) => ({
    itemNumber: k.itemNumber,
    choiceCount: k.choiceCount,
  }));
}

/** Items needing a human decision before the result is trustworthy. */
export function itemsNeedingReview(score: SheetScore): number[] {
  return score.outcomes
    .filter((o) => o.status === "unresolved")
    .map((o) => o.itemNumber);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
