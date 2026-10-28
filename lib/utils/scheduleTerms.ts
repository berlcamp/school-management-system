/**
 * Which grading periods a subject schedule applies to (migration 223).
 *
 * `sms_subject_schedules.grading_periods` is NULL for the whole school year —
 * every row before 223 — or the periods it is taught in, so a subject can pass
 * from Teacher A (T1–T2) to Teacher B (T3). The two rules below are the whole
 * model; migration 223 writes the same two inline in SQL. Change one, change
 * the other.
 */

import {
  getGradingPeriodsForSection,
  gradingPeriodsOfSemester,
} from "@/lib/utils/schoolYear";

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

/** One tickable choice on the schedule form: a term, a quarter, or an old-SHS semester. */
export interface ScheduleTermOption {
  label: string;
  short: string;
  periods: number[];
}

/**
 * The choices a section's schedule can be limited to. Old-curriculum SHS is
 * semestral, so it offers 1st / 2nd Semester (periods 1-2 / 3-4); everything
 * else one option per grading period. Values stay grading periods 1-4.
 */
export function scheduleTermOptions(
  schoolYear: string,
  shsCurriculum?: string | null,
): ScheduleTermOption[] {
  if (shsCurriculum === "old") {
    return [
      { label: "1st Semester", short: "1st Sem", periods: [...gradingPeriodsOfSemester(1)] },
      { label: "2nd Semester", short: "2nd Sem", periods: [...gradingPeriodsOfSemester(2)] },
    ];
  }
  return getGradingPeriodsForSection(schoolYear, shsCurriculum).map((p) => ({
    label: p.label,
    short: p.short,
    periods: [p.value],
  }));
}

/** Periods strictly before `period`. */
export function periodsBefore(period: number, allPeriods: number[]): number[] {
  return allPeriods.filter((p) => p < period);
}

/** Periods from `period` onwards. */
export function periodsFrom(period: number, allPeriods: number[]): number[] {
  return allPeriods.filter((p) => p >= period);
}

/** "" (whole year), "2nd Sem", "T3 only", "T1–T2", "T1, T3". */
export function formatScheduleTerms(
  terms: ScheduleTerms | undefined,
  options: ScheduleTermOption[],
): string {
  if (terms == null || terms.length === 0) return "";
  const sorted = [...terms].sort((a, b) => a - b);
  const whole = options.find(
    (o) =>
      o.periods.length > 1 &&
      o.periods.length === sorted.length &&
      o.periods.every((p, i) => p === sorted[i]),
  );
  if (whole) return whole.short;
  const short = (p: number) =>
    options.find((o) => o.periods.length === 1 && o.periods[0] === p)?.short ??
    `P${p}`;
  if (sorted.length === 1) return `${short(sorted[0]!)} only`;
  const contiguous = sorted.every((p, i) => i === 0 || p === sorted[i - 1]! + 1);
  return contiguous
    ? `${short(sorted[0]!)}–${short(sorted[sorted.length - 1]!)}`
    : sorted.map(short).join(", ");
}
