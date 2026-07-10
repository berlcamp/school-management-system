import {
  bandLabelForScore,
  RMA_LEVEL_CONSOLIDATION,
  RMA_LEVEL_ENHANCEMENT,
  RMA_LEVEL_INTERVENTION,
} from "@/lib/constants";
import { RmaBand, RmaItem, Student } from "@/types";

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

/** Levelling label for a total, looked up on percentage. */
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

/** Task column label — the division-defined item number (falls back to position). */
export function taskLabel(item: RmaItem, index: number): string {
  return String(item.item_no ?? index + 1);
}

/** Tailwind text colour for a KS1 levelling label. */
export function rmaLevelColor(label: string | null): string {
  switch (label) {
    case RMA_LEVEL_INTERVENTION:
      return "text-red-600 dark:text-red-400";
    case RMA_LEVEL_CONSOLIDATION:
      return "text-amber-600 dark:text-amber-400";
    case RMA_LEVEL_ENHANCEMENT:
      return "text-green-600 dark:text-green-400";
    default:
      return "text-muted-foreground";
  }
}

/** Split a roster into male / female groups, each sorted by last then first name. */
export function groupByGender(
  students: Student[],
  ascending = true,
): { male: Student[]; female: Student[] } {
  const byName = (a: Student, b: Student) => {
    const an = `${a.last_name} ${a.first_name}`.toLowerCase();
    const bn = `${b.last_name} ${b.first_name}`.toLowerCase();
    const cmp = an.localeCompare(bn);
    return ascending ? cmp : -cmp;
  };
  return {
    male: students.filter((s) => s.gender === "male").sort(byName),
    female: students.filter((s) => s.gender === "female").sort(byName),
  };
}

export interface RmaSummaryColumn {
  enrolment: number;
  assessed: number;
  intervention: number;
  consolidation: number;
  enhancement: number;
}

export interface RmaSummary {
  male: RmaSummaryColumn;
  female: RmaSummaryColumn;
  total: RmaSummaryColumn;
}

const emptyColumn = (): RmaSummaryColumn => ({
  enrolment: 0,
  assessed: 0,
  intervention: 0,
  consolidation: 0,
  enhancement: 0,
});

/** Live levelling summary for the active test period (Male / Female / Total). */
export function summaryByGender(
  students: Student[],
  items: RmaItem[],
  bands: RmaBand[],
  scores: RmaScoreMap,
  itemsMaxTotal: number,
): RmaSummary {
  const male = emptyColumn();
  const female = emptyColumn();

  students.forEach((s) => {
    const col = s.gender === "female" ? female : male;
    col.enrolment += 1;
    const studentScores = scores[s.id] || {};
    if (!hasAnyScore(items, studentScores)) return;
    col.assessed += 1;
    const label = masteryForScore(
      bands,
      totalScore(items, studentScores),
      itemsMaxTotal,
    );
    if (label === RMA_LEVEL_INTERVENTION) col.intervention += 1;
    else if (label === RMA_LEVEL_CONSOLIDATION) col.consolidation += 1;
    else if (label === RMA_LEVEL_ENHANCEMENT) col.enhancement += 1;
  });

  const total: RmaSummaryColumn = {
    enrolment: male.enrolment + female.enrolment,
    assessed: male.assessed + female.assessed,
    intervention: male.intervention + female.intervention,
    consolidation: male.consolidation + female.consolidation,
    enhancement: male.enhancement + female.enhancement,
  };

  return { male, female, total };
}
