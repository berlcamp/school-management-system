import { bandLabelForScore } from "@/lib/constants";
import { CrlaBand, CrlaMaterialTask } from "@/types";

export type CrlaScoreMap = Record<string, Record<string, number | null>>; // studentId -> taskId -> score

// When Task 1 (the first task) scores this or higher, Task 2 is auto-awarded
// full marks. Totals above the manual threshold need the Reading Profile picked
// by hand (based on the Part 2 fluency passage) rather than auto-banded.
export const CRLA_TASK1_AUTOFILL_THRESHOLD = 7;
export const CRLA_MANUAL_PROFILE_THRESHOLD = 16;

/**
 * Apply the Task-1 → Task-2 auto-fill rule: if the first task's score is
 * >= CRLA_TASK1_AUTOFILL_THRESHOLD, the second task is treated as full marks.
 * Returns the (possibly overridden) score map for a single learner.
 */
export function effectiveScores(
  tasks: CrlaMaterialTask[],
  studentScores: Record<string, number | null>,
): Record<string, number | null> {
  if (tasks.length < 2) return studentScores;
  const t1 = Number(studentScores[tasks[0].id] ?? NaN);
  if (Number.isFinite(t1) && t1 >= CRLA_TASK1_AUTOFILL_THRESHOLD) {
    return { ...studentScores, [tasks[1].id]: Number(tasks[1].max_score) };
  }
  return studentScores;
}

/** Whether the learner has any task score entered. */
export function hasAnyScore(
  tasks: CrlaMaterialTask[],
  studentScores: Record<string, number | null>,
): boolean {
  return tasks.some((t) => {
    const v = studentScores[t.id];
    return v !== undefined && v !== null;
  });
}

/** Raw total = sum of task scores (missing counts as 0). */
export function totalScore(
  tasks: CrlaMaterialTask[],
  studentScores: Record<string, number | null>,
): number {
  return tasks.reduce((sum, t) => sum + (Number(studentScores[t.id] ?? 0) || 0), 0);
}

/** Reading-profile label for a raw total, or null when out of range. */
export function profileForScore(bands: CrlaBand[], total: number): string | null {
  return bandLabelForScore(
    bands.map((b) => ({
      min_score: Number(b.min_score),
      max_score: Number(b.max_score),
      label: b.label,
    })),
    total,
  );
}
