// The one rule for approved additional points on a FINAL grade (migration 239).
// Points on a term grade (240, semester 11-14) are already in sms_grades and
// are never added here. Final points are added to a subject's FINAL grade, never
// to a period, and never past 100. The SQL
// twin is students_gpa_for_grade. Pure, so server code can import it.

import { MAX_FINAL_GRADE } from "@/lib/constants/gradeAdjustments";

/** semester (0 = whole year, 1 / 2 = old-curriculum SHS) → approved points */
export type SemesterPoints = Record<number, number>;

export interface AdjustmentRow {
  student_id: string | number;
  subject_id: string | number;
  school_year: string;
  semester: number;
  points: number;
}

export type AdjustmentMap = Map<string, SemesterPoints>;

const keyOf = (
  studentId: string | number,
  subjectId: string | number,
  schoolYear: string,
) => `${studentId}::${subjectId}::${schoolYear}`;

export function adjustmentMap(rows: AdjustmentRow[]): AdjustmentMap {
  const map: AdjustmentMap = new Map();
  for (const r of rows) {
    const key = keyOf(r.student_id, r.subject_id, r.school_year);
    map.set(key, { ...map.get(key), [Number(r.semester)]: Number(r.points) });
  }
  return map;
}

/**
 * What a mean over `periods` gains. A whole-year adjustment adds its points;
 * a semester's adds them to that semester's periods, so it counts in full on
 * a semester final and proportionally on a mean across both.
 */
export function pointsFor(
  map: AdjustmentMap | undefined,
  studentId: string | number,
  subjectId: string | number,
  schoolYear: string,
  periods: number[],
): number {
  const own = map?.get(keyOf(studentId, subjectId, schoolYear));
  if (!own || periods.length === 0) return 0;
  const total = periods.reduce(
    (sum, p) => sum + (own[0] ?? 0) + (own[p <= 2 ? 1 : 2] ?? 0),
    0,
  );
  return total / periods.length;
}

export function withPoints(final: number, points: number): number;
export function withPoints(final: number | null, points: number): number | null;
export function withPoints(final: number | null, points: number): number | null {
  if (final === null || points === 0) return final;
  return Math.min(MAX_FINAL_GRADE, final + points);
}
