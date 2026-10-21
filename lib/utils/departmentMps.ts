import { isTermBasedSchoolYear } from "@/lib/utils/schoolYear";
import type { MpsGroup } from "@/lib/utils/mpsAggregate";

export type { MpsGroup };

/** Term 1-3 from SY 2026-2027 (TERM_SYSTEM_START_SY), Q1-Q4 before. */
export function periodColumns(
  schoolYear: string
): { period: number; label: string }[] {
  return isTermBasedSchoolYear(schoolYear)
    ? [1, 2, 3].map((n) => ({ period: n, label: `Term ${n}` }))
    : [1, 2, 3, 4].map((n) => ({ period: n, label: `Q${n}` }));
}

export type CoverageCell = number | "missing" | "future";

export type CoverageRow = {
  subjectId: string;
  subjectName: string;
  gradeLevel: number;
  sectionId: string;
  sectionName: string;
  teachers: string[];
  cells: Record<number, CoverageCell>;
};

export type CoverageSchedule = {
  subject_id: string;
  subject_name: string;
  grade_level: number;
  section_id: string;
  section_name: string;
  teacher_name: string | null;
};

/**
 * One row per scheduled subject × section; a cell per grading period holding
 * the MPS, "missing" (a period already under way with no result) or "future".
 */
export function buildCoverage(input: {
  schedules: CoverageSchedule[];
  mps: MpsGroup[];
  schoolYear: string;
  currentPeriod: number;
}): CoverageRow[] {
  const columns = periodColumns(input.schoolYear);
  const rows = new Map<string, CoverageRow>();

  for (const s of input.schedules) {
    const key = `${s.subject_id}__${s.section_id}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        subjectId: s.subject_id,
        subjectName: s.subject_name,
        gradeLevel: s.grade_level,
        sectionId: s.section_id,
        sectionName: s.section_name,
        teachers: [],
        cells: {},
      };
      rows.set(key, row);
    }
    if (s.teacher_name && !row.teachers.includes(s.teacher_name)) {
      row.teachers.push(s.teacher_name);
    }
  }

  for (const row of rows.values()) {
    for (const { period } of columns) {
      if (period > input.currentPeriod) {
        row.cells[period] = "future";
        continue;
      }
      const matches = input.mps.filter(
        (g) =>
          g.period === period &&
          g.sectionId === row.sectionId &&
          (g.subjectId != null
            ? g.subjectId === row.subjectId
            : g.subjectName === row.subjectName &&
              g.gradeLevel === row.gradeLevel)
      );
      row.cells[period] =
        matches.length > 0
          ? matches.reduce((a, g) => a + g.mps, 0) / matches.length
          : "missing";
    }
  }

  return Array.from(rows.values());
}

/** Encoded / expected / missing cells for one period, and the mean of the encoded MPS. */
export function coverageTotals(
  rows: CoverageRow[],
  period: number
): { encoded: number; expected: number; missing: number; average: number | null } {
  const values: number[] = [];
  let missing = 0;
  for (const r of rows) {
    const cell = r.cells[period];
    if (typeof cell === "number") values.push(cell);
    else if (cell === "missing") missing += 1;
  }
  return {
    encoded: values.length,
    expected: values.length + missing,
    missing,
    average:
      values.length > 0 ? values.reduce((a, v) => a + v, 0) / values.length : null,
  };
}

/**
 * The grading period under way. A past school year is fully under way (last
 * column), a future one has not started (first). Within the current year the
 * stored term dates (migration 205) decide: Term 1 before `term2_start`,
 * Term 2 before `term3_start`, else Term 3. With no dates set in a term-based
 * year it falls back to the calendar: Term 1 June-August, Term 2
 * September-December, Term 3 January-May (a date before June of the year's own
 * start year counts as Term 1). A quarter-based year, which has no term dates,
 * falls back to the last column.
 */
export function resolveCurrentPeriod(
  schoolYear: string,
  currentSchoolYear: string,
  today: Date,
  termDates: { term2_start: string; term3_start: string } | null = null
): number {
  const columns = periodColumns(schoolYear);
  const last = columns[columns.length - 1].period;
  const start = parseInt(schoolYear.split("-")[0], 10);
  const currentStart = parseInt(currentSchoolYear.split("-")[0], 10);
  if (start < currentStart) return last;
  if (start > currentStart) return 1;
  if (columns.length !== 3) return last;
  if (!termDates) {
    const month = today.getMonth() + 1;
    if (today.getFullYear() <= start) return month <= 8 ? 1 : 2;
    return month <= 5 ? 3 : 2;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (iso < termDates.term2_start) return 1;
  if (iso < termDates.term3_start) return 2;
  return 3;
}

/** Rows with at least one missing cell, optionally limited to one subject. */
export function filterCoverageRows(
  rows: CoverageRow[],
  opts: { subjectId: string; missingOnly: boolean }
): CoverageRow[] {
  return rows.filter(
    (r) =>
      (opts.subjectId === "" || r.subjectId === opts.subjectId) &&
      (!opts.missingOnly || Object.values(r.cells).includes("missing"))
  );
}
