import { bandLabelForScore } from "@/lib/constants";
import { CrlaBand, CrlaMaterialTask } from "@/types";

export type CrlaScoreMap = Record<string, Record<string, number | null>>; // studentId -> taskId -> score

// CRLA comes in two shapes, distinguished by task count:
//
// 3-task branching flow (every grade + language except Grade 3 English),
// keyed off task ordinal position: 0 = Task 1, 1 = Task 2L, 2 = Task 2H.
//  • Task 1 scores 0–6  → Task 2L is inputable; Task 2H is disabled (n/a).
//  • Task 1 scores 7–10 → Task 2L is auto-awarded full marks (locked);
//                          Task 2H becomes inputable.
//  • Task 2H scores 7–10 → the learner's Part 2 Record Form should be filled.
// The Reading Profile is auto-banded from the 0–30 total.
//
// 2-task flat form (Grade 3 English only — see isCrlaTwoTaskForm): Task 1 and
// Task 2 are both always inputable, nothing is gated or auto-awarded, and
// every learner gets a Part 2 Record Form. Banded from the 0–20 total.
export const CRLA_TASK1_AUTOFILL_THRESHOLD = 7;
export const CRLA_TASK2H_RECORDFORM_THRESHOLD = 7;

/** The reduced Grade 3 English form: two tasks, no branch. */
export function isFlatForm(tasks: CrlaMaterialTask[]): boolean {
  return tasks.length < 3;
}

/** Task 1 score >= the Task-2L auto-fill / Task-2H unlock threshold. */
function task1PassedGate(
  tasks: CrlaMaterialTask[],
  studentScores: Record<string, number | null>,
): boolean {
  if (tasks.length < 1) return false;
  const t1 = Number(studentScores[tasks[0].id] ?? NaN);
  return Number.isFinite(t1) && t1 >= CRLA_TASK1_AUTOFILL_THRESHOLD;
}

/** Whether Task 2L is auto-filled (and locked) for this learner. */
export function isTask2LAutoFilled(
  tasks: CrlaMaterialTask[],
  studentScores: Record<string, number | null>,
): boolean {
  return !isFlatForm(tasks) && task1PassedGate(tasks, studentScores);
}

/** Whether Task 2H is inputable for this learner. */
export function isTask2HEnabled(
  tasks: CrlaMaterialTask[],
  studentScores: Record<string, number | null>,
): boolean {
  return !isFlatForm(tasks) && task1PassedGate(tasks, studentScores);
}

/**
 * Whether the learner's Part 2 Record Form should be filled: always on the
 * flat form, and on the branching flow once Task 2H reaches the threshold.
 */
export function needsRecordForm(
  tasks: CrlaMaterialTask[],
  studentScores: Record<string, number | null>,
): boolean {
  if (isFlatForm(tasks)) return true;
  if (!isTask2HEnabled(tasks, studentScores)) return false;
  const t2h = Number(studentScores[tasks[2].id] ?? NaN);
  return Number.isFinite(t2h) && t2h >= CRLA_TASK2H_RECORDFORM_THRESHOLD;
}

/**
 * Apply the branching rules to produce the scores that actually count toward
 * the total for a single learner:
 *   • Task 1 >= 7 → Task 2L is full marks (Task 2H stays as entered).
 *   • Task 1 <  7 → Task 2H is n/a (contributes 0; Task 2L stays as entered).
 * The flat form has no branch — every score counts exactly as entered.
 */
export function effectiveScores(
  tasks: CrlaMaterialTask[],
  studentScores: Record<string, number | null>,
): Record<string, number | null> {
  if (isFlatForm(tasks)) return studentScores;

  if (task1PassedGate(tasks, studentScores)) {
    return { ...studentScores, [tasks[1].id]: Number(tasks[1].max_score) };
  }
  return { ...studentScores, [tasks[2].id]: null };
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
