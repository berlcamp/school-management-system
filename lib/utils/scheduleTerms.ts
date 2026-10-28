/**
 * Which grading periods a subject schedule applies to (migration 222).
 *
 * `sms_subject_schedules.grading_periods` is NULL for the whole school year —
 * every row before 222 — or the periods it is taught in, so a subject can pass
 * from Teacher A (T1–T2) to Teacher B (T3). The two rules below are the whole
 * model; migration 222 writes the same two inline in SQL. Change one, change
 * the other.
 */

import type { GradingPeriodOption } from "@/lib/utils/schoolYear";

/** NULL = whole school year. */
export type ScheduleTerms = number[] | null;

/** What the form saves: sorted, de-duplicated, and NULL when nothing or everything is ticked. */
export function normaliseScheduleTerms(
  selected: number[],
  allPeriods: number[],
): ScheduleTerms {
  const picked = Array.from(new Set(selected))
    .filter((p) => allPeriods.includes(p))
    .sort((a, b) => a - b);
  if (picked.length === 0 || picked.length === allPeriods.length) return null;
  return picked;
}

/** covers(row, p): the row applies in period p. */
export function scheduleCoversPeriod(
  terms: ScheduleTerms | undefined,
  period: number,
): boolean {
  return terms == null || terms.includes(period);
}

/** overlap(a, b): two rows can clash only when they share a period. */
export function scheduleTermsOverlap(
  a: ScheduleTerms | undefined,
  b: ScheduleTerms | undefined,
): boolean {
  if (a == null || b == null) return true;
  return a.some((p) => b.includes(p));
}

/** "" (whole year), "T3 only", "T1–T2", "T1, T3". */
export function formatScheduleTerms(
  terms: ScheduleTerms | undefined,
  periods: GradingPeriodOption[],
): string {
  if (terms == null || terms.length === 0) return "";
  const short = (p: number) =>
    periods.find((o) => o.value === p)?.short ?? `P${p}`;
  const sorted = [...terms].sort((a, b) => a - b);
  if (sorted.length === 1) return `${short(sorted[0]!)} only`;
  const contiguous = sorted.every((p, i) => i === 0 || p === sorted[i - 1]! + 1);
  return contiguous
    ? `${short(sorted[0]!)}–${short(sorted[sorted.length - 1]!)}`
    : sorted.map(short).join(", ");
}
