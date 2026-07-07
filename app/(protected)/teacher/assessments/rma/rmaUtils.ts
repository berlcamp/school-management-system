import { bandLabelForScore } from "@/lib/constants";
import { RmaBand, RmaItem } from "@/types";

export type RmaScoreMap = Record<string, Record<string, number | null>>; // studentId -> itemId -> score

export function hasAnyScore(
  items: RmaItem[],
  studentScores: Record<string, number | null>,
): boolean {
  return items.some((it) => {
    const v = studentScores[it.id];
    return v !== undefined && v !== null;
  });
}

/** Raw total = sum of item scores (missing counts as 0). */
export function totalScore(
  items: RmaItem[],
  studentScores: Record<string, number | null>,
): number {
  return items.reduce(
    (sum, it) => sum + (Number(studentScores[it.id] ?? 0) || 0),
    0,
  );
}

/** Sum of item max scores (total possible). */
export function maxTotal(items: RmaItem[]): number {
  return items.reduce((sum, it) => sum + Number(it.max_score), 0);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Percentage of total possible. */
export function percentage(total: number, max: number): number {
  return max > 0 ? round2((total / max) * 100) : 0;
}

/** Mastery band label for a total, looked up on percentage. */
export function masteryForScore(
  bands: RmaBand[],
  total: number,
  max: number,
): string | null {
  const pct = percentage(total, max);
  return bandLabelForScore(
    bands.map((b) => ({
      min_score: Number(b.min_score),
      max_score: Number(b.max_score),
      label: b.label,
    })),
    pct,
  );
}
