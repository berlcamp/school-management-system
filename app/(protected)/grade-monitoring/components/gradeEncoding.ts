/**
 * Shared types + status rules for Grade Monitoring.
 *
 * Rows come from the `get_grade_encoding_status` RPC (migration 107): one row
 * per subject + section + grading period, already aggregated in SQL.
 */

/** One row exactly as returned by the RPC. */
export interface EncodingStatusRow {
  subject_id: number;
  subject_name: string;
  is_madrasah: boolean;
  section_id: number;
  section_name: string;
  grade_level: number;
  assigned_teachers: string[];
  grading_period: number;
  expected_learners: number;
  encoded_learners: number;
  encoders: string[];
  last_encoded_at: string | null;
}

export type EncodingState = "complete" | "partial" | "not_started" | "no_learners";

export interface PeriodCell {
  state: EncodingState;
  expected: number;
  encoded: number;
}

/** RPC rows for one subject+section, collapsed into a per-period grid row. */
export interface EncodingGridRow {
  key: string;
  subjectName: string;
  isMadrasah: boolean;
  sectionName: string;
  gradeLevel: number;
  assignedTeachers: string[];
  encoders: string[];
  lastEncodedAt: string | null;
  periods: Record<number, PeriodCell>;
}

/** Per-teacher rollup across every subject/section/period they are assigned. */
export interface TeacherSummaryRow {
  key: string;
  teacherName: string;
  assignments: number;
  complete: number;
  partial: number;
  notStarted: number;
  lastEncodedAt: string | null;
}

export const STATE_LABEL: Record<EncodingState, string> = {
  complete: "Complete",
  partial: "Partial",
  not_started: "Not started",
  no_learners: "No learners",
};

export const STATE_CLASS: Record<EncodingState, string> = {
  complete: "bg-green-50 text-green-700 border-green-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
  not_started: "bg-red-50 text-red-700 border-red-200",
  no_learners: "bg-muted text-muted-foreground border-border",
};

/**
 * A section with no learners is not a teacher's fault, so it is held apart from
 * "not started" rather than counted as an outstanding task.
 */
export function encodingState(expected: number, encoded: number): EncodingState {
  if (expected === 0) return "no_learners";
  if (encoded === 0) return "not_started";
  return encoded >= expected ? "complete" : "partial";
}

function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

/** Collapse RPC rows into one grid row per subject+section. */
export function toGridRows(rows: EncodingStatusRow[]): EncodingGridRow[] {
  const groups = new Map<string, EncodingGridRow>();

  for (const r of rows) {
    const key = `${r.subject_id}__${r.section_id}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        subjectName: r.subject_name,
        isMadrasah: r.is_madrasah,
        sectionName: r.section_name,
        gradeLevel: r.grade_level,
        assignedTeachers: r.assigned_teachers ?? [],
        encoders: [],
        lastEncodedAt: null,
        periods: {},
      };
      groups.set(key, g);
    }
    g.periods[r.grading_period] = {
      state: encodingState(r.expected_learners, r.encoded_learners),
      expected: r.expected_learners,
      encoded: r.encoded_learners,
    };
    for (const name of r.encoders ?? []) {
      if (!g.encoders.includes(name)) g.encoders.push(name);
    }
    g.lastEncodedAt = laterOf(g.lastEncodedAt, r.last_encoded_at);
  }

  return Array.from(groups.values()).sort(
    (a, b) =>
      a.gradeLevel - b.gradeLevel ||
      a.sectionName.localeCompare(b.sectionName) ||
      a.subjectName.localeCompare(b.subjectName)
  );
}

/**
 * Roll grid rows up per assigned teacher. A team-taught subject counts once for
 * each teacher assigned to it, since each of them owes the grades.
 */
export function toTeacherRows(rows: EncodingGridRow[]): TeacherSummaryRow[] {
  const groups = new Map<string, TeacherSummaryRow>();

  for (const row of rows) {
    const teachers = row.assignedTeachers.length
      ? row.assignedTeachers
      : ["(no teacher assigned)"];

    for (const teacherName of teachers) {
      let g = groups.get(teacherName);
      if (!g) {
        g = {
          key: teacherName,
          teacherName,
          assignments: 0,
          complete: 0,
          partial: 0,
          notStarted: 0,
          lastEncodedAt: null,
        };
        groups.set(teacherName, g);
      }
      g.assignments += 1;
      g.lastEncodedAt = laterOf(g.lastEncodedAt, row.lastEncodedAt);
      for (const cell of Object.values(row.periods)) {
        if (cell.state === "complete") g.complete += 1;
        else if (cell.state === "partial") g.partial += 1;
        else if (cell.state === "not_started") g.notStarted += 1;
      }
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.teacherName.localeCompare(b.teacherName)
  );
}

export function formatLastEncoded(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
