import { bandLabelForScore } from "@/lib/constants";
import { CrlaBand, CrlaMaterialTask } from "@/types";

export type CrlaScoreMap = Record<string, Record<string, number | null>>; // studentId -> taskId -> score

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
