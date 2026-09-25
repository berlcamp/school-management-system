/**
 * "Absenteeism" data, shared by the SDO report page, the school-level report
 * page and their printable.
 *
 * Migration 193's RPC scores every section on the SF2 rules and returns one
 * row per section, male and female. Everything above a section — grade level,
 * school, division — is those rows added up here, so every level of the report
 * agrees with the level beneath it.
 */

import { getGradeLevelLabel } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { scoreAttendanceDay } from "@/lib/utils/attendanceScoring";
import {
  fetchSchoolCalendar,
  resolveDay,
  ResolvedDay,
  schoolYearWindow,
  sessionWeight,
  todayIso,
} from "@/lib/utils/schoolCalendar";

/** One section, exactly as the RPC returns it. */
export interface AbsenteeismSectionRow {
  school_id: number;
  school_name: string;
  section_id: number;
  section_name: string;
  grade_level: number | null;
  adviser_name: string | null;
  class_days: number;
  enrolled_male: number;
  enrolled_female: number;
  absentees_male: number;
  absentees_female: number;
  chronic_male: number;
  chronic_female: number;
  days_absent_male: number;
  days_absent_female: number;
}

/** Figures for one sex (or the two added together). */
export interface AbsenteeismCounts {
  enrolled: number;
  absentees: number;
  chronic: number;
  daysAbsent: number;
  /** Learner-days the school held class for: the rate's denominator. */
  learnerDays: number;
}

export interface AbsenteeismFigures {
  male: AbsenteeismCounts;
  female: AbsenteeismCounts;
  total: AbsenteeismCounts;
}

export interface AbsenteeismSection extends AbsenteeismFigures {
  sectionId: number;
  name: string;
  adviser: string | null;
  classDays: number;
}

export interface AbsenteeismGrade extends AbsenteeismFigures {
  gradeLevel: number | null;
  label: string;
  sections: AbsenteeismSection[];
}

export interface AbsenteeismSchool extends AbsenteeismFigures {
  schoolId: number;
  name: string;
  classDays: number;
  grades: AbsenteeismGrade[];
}

export interface AbsenteeismReport extends AbsenteeismFigures {
  schools: AbsenteeismSchool[];
  /** Grade levels summed across every school — the division view by grade. */
  grades: AbsenteeismGrade[];
}

/** "Whole school year" — the sentinel the period filter uses. */
export const WHOLE_YEAR = "year";

/** Share of class days at or above which a learner counts as chronically absent. */
export const CHRONIC_THRESHOLD_PERCENT = 10;

const emptyCounts = (): AbsenteeismCounts => ({
  enrolled: 0,
  absentees: 0,
  chronic: 0,
  daysAbsent: 0,
  learnerDays: 0,
});

const emptyFigures = (): AbsenteeismFigures => ({
  male: emptyCounts(),
  female: emptyCounts(),
  total: emptyCounts(),
});

function addCounts(into: AbsenteeismCounts, from: AbsenteeismCounts) {
  into.enrolled += from.enrolled;
  into.absentees += from.absentees;
  into.chronic += from.chronic;
  into.daysAbsent += from.daysAbsent;
  into.learnerDays += from.learnerDays;
}

function addFigures(into: AbsenteeismFigures, from: AbsenteeismFigures) {
  addCounts(into.male, from.male);
  addCounts(into.female, from.female);
  addCounts(into.total, from.total);
}

function sectionFigures(r: AbsenteeismSectionRow): AbsenteeismFigures {
  const classDays = Number(r.class_days);
  const male: AbsenteeismCounts = {
    enrolled: r.enrolled_male,
    absentees: r.absentees_male,
    chronic: r.chronic_male,
    daysAbsent: Number(r.days_absent_male),
    learnerDays: r.enrolled_male * classDays,
  };
  const female: AbsenteeismCounts = {
    enrolled: r.enrolled_female,
    absentees: r.absentees_female,
    chronic: r.chronic_female,
    daysAbsent: Number(r.days_absent_female),
    learnerDays: r.enrolled_female * classDays,
  };
  const total = emptyCounts();
  addCounts(total, male);
  addCounts(total, female);
  return { male, female, total };
}

function gradeSort(a: number | null, b: number | null): number {
  return (a ?? 99) - (b ?? 99);
}

function gradeLabel(level: number | null): string {
  return level === null ? "No grade level" : getGradeLevelLabel(level);
}

/** Groups section rows into schools → grade levels → sections, with totals. */
export function buildAbsenteeismReport(
  rows: AbsenteeismSectionRow[],
): AbsenteeismReport {
  const report: AbsenteeismReport = {
    ...emptyFigures(),
    schools: [],
    grades: [],
  };
  const schools = new Map<number, AbsenteeismSchool>();
  const divisionGrades = new Map<string, AbsenteeismGrade>();

  for (const r of rows) {
    const figures = sectionFigures(r);
    const level = r.grade_level ?? null;
    const gradeKey = String(level);

    let school = schools.get(r.school_id);
    if (!school) {
      school = {
        ...emptyFigures(),
        schoolId: r.school_id,
        name: r.school_name,
        classDays: Number(r.class_days),
        grades: [],
      };
      schools.set(r.school_id, school);
    }

    let grade = school.grades.find((g) => g.gradeLevel === level);
    if (!grade) {
      grade = { ...emptyFigures(), gradeLevel: level, label: gradeLabel(level), sections: [] };
      school.grades.push(grade);
    }

    let divGrade = divisionGrades.get(gradeKey);
    if (!divGrade) {
      divGrade = { ...emptyFigures(), gradeLevel: level, label: gradeLabel(level), sections: [] };
      divisionGrades.set(gradeKey, divGrade);
    }

    grade.sections.push({
      ...figures,
      sectionId: r.section_id,
      name: r.section_name,
      adviser: r.adviser_name,
      classDays: Number(r.class_days),
    });
    addFigures(grade, figures);
    addFigures(divGrade, figures);
    addFigures(school, figures);
    addFigures(report, figures);
  }

  report.schools = [...schools.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  report.schools.forEach((s) => {
    s.grades.sort((a, b) => gradeSort(a.gradeLevel, b.gradeLevel));
    s.grades.forEach((g) =>
      g.sections.sort((a, b) => a.name.localeCompare(b.name)),
    );
  });
  report.grades = [...divisionGrades.values()].sort((a, b) =>
    gradeSort(a.gradeLevel, b.gradeLevel),
  );
  return report;
}

export async function fetchAbsenteeism(
  schoolId: string | number | null,
  schoolYear: string,
  range: { from: string | null; to: string | null },
): Promise<AbsenteeismReport> {
  const { data, error } = await supabase.rpc("division_absenteeism", {
    p_school_id: schoolId === null ? null : Number(schoolId),
    p_school_year: schoolYear,
    p_date_from: range.from,
    p_date_to: range.to,
  });
  if (error) throw new Error(error.message);
  return buildAbsenteeismReport((data ?? []) as AbsenteeismSectionRow[]);
}

/** Days absent over learner-days held, as a percentage; null with no class days. */
export function absenteeismRate(c: AbsenteeismCounts): number | null {
  return c.learnerDays > 0 ? (c.daysAbsent / c.learnerDays) * 100 : null;
}

export function formatRate(c: AbsenteeismCounts): string {
  const rate = absenteeismRate(c);
  return rate === null ? "—" : `${rate.toFixed(2)}%`;
}

/** Whole numbers print bare; half days print with one decimal. */
export function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Period options: the whole school year, then each month June → May. */
export function periodOptions(
  schoolYear: string,
): { value: string; label: string }[] {
  const [start, end] = schoolYear.split("-").map(Number);
  const options = [{ value: WHOLE_YEAR, label: "Whole school year" }];
  if (!start || !end) return options;
  for (let i = 0; i < 12; i++) {
    const month = ((5 + i) % 12) + 1; // 6..12, 1..5
    const year = month >= 6 ? start : end;
    const value = `${year}-${String(month).padStart(2, "0")}`;
    const label = new Date(year, month - 1, 1).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    options.push({ value, label });
  }
  return options;
}

/** The date window a period value stands for; nulls = the whole school year. */
export function periodRange(period: string): {
  from: string | null;
  to: string | null;
} {
  if (period === WHOLE_YEAR) return { from: null, to: null };
  const [year, month] = period.split("-").map(Number);
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${last}` };
}

/** One flat row per section, for CSV / Excel. */
export function absenteeismExportRows(
  report: AbsenteeismReport,
  showSchool: boolean,
): Record<string, string | number>[] {
  return report.schools.flatMap((s) =>
    s.grades.flatMap((g) =>
      g.sections.map((sec) => ({
        ...(showSchool ? { School: s.name } : {}),
        "Grade Level": g.label,
        Section: sec.name,
        Adviser: sec.adviser ?? "",
        "Class Days": sec.classDays,
        "Enrolled M": sec.male.enrolled,
        "Enrolled F": sec.female.enrolled,
        "Enrolled Total": sec.total.enrolled,
        "Learners Absent M": sec.male.absentees,
        "Learners Absent F": sec.female.absentees,
        "Learners Absent Total": sec.total.absentees,
        "Chronically Absent M": sec.male.chronic,
        "Chronically Absent F": sec.female.chronic,
        "Chronically Absent Total": sec.total.chronic,
        "Days Absent M": sec.male.daysAbsent,
        "Days Absent F": sec.female.daysAbsent,
        "Days Absent Total": sec.total.daysAbsent,
        "Absenteeism Rate M": formatRate(sec.male),
        "Absenteeism Rate F": formatRate(sec.female),
        "Absenteeism Rate Total": formatRate(sec.total),
      })),
    ),
  );
}

export const ABSENTEEISM_EXPORT_HEADERS = (showSchool: boolean): string[] => [
  ...(showSchool ? ["School"] : []),
  "Grade Level",
  "Section",
  "Adviser",
  "Class Days",
  "Enrolled M",
  "Enrolled F",
  "Enrolled Total",
  "Learners Absent M",
  "Learners Absent F",
  "Learners Absent Total",
  "Chronically Absent M",
  "Chronically Absent F",
  "Chronically Absent Total",
  "Days Absent M",
  "Days Absent F",
  "Days Absent Total",
  "Absenteeism Rate M",
  "Absenteeism Rate F",
  "Absenteeism Rate Total",
];

/** One printed/displayed line of an absenteeism table. */
export interface AbsenteeismTableRow {
  key: string;
  label: string;
  /** Secondary text beside the label — the adviser, on a section line. */
  detail?: string | null;
  kind: "row" | "subtotal" | "total";
  figures: AbsenteeismFigures;
}

/**
 * One school by grade level; with `withSections`, each grade's sections are
 * listed above the grade's subtotal line.
 */
export function schoolDetailRows(
  school: AbsenteeismSchool,
  withSections: boolean,
): AbsenteeismTableRow[] {
  const rows: AbsenteeismTableRow[] = [];
  for (const g of school.grades) {
    if (withSections) {
      g.sections.forEach((sec) =>
        rows.push({
          key: `${school.schoolId}-sec-${sec.sectionId}`,
          label: `${g.label} – ${sec.name}`,
          detail: sec.adviser,
          kind: "row",
          figures: sec,
        }),
      );
    }
    rows.push({
      key: `${school.schoolId}-grade-${g.gradeLevel}`,
      label: withSections ? `${g.label} Total` : g.label,
      kind: withSections ? "subtotal" : "row",
      figures: g,
    });
  }
  rows.push({
    key: `${school.schoolId}-total`,
    label: "School Total",
    kind: "total",
    figures: school,
  });
  return rows;
}

/** One line per school, then the division total. */
export function schoolSummaryRows(
  report: AbsenteeismReport,
): AbsenteeismTableRow[] {
  return [
    ...report.schools.map((s) => ({
      key: `school-${s.schoolId}`,
      label: s.name,
      kind: "row" as const,
      figures: s,
    })),
    { key: "division-total", label: "Division Total", kind: "total", figures: report },
  ];
}

/** One line per grade level across every school, then the division total. */
export function gradeSummaryRows(
  report: AbsenteeismReport,
): AbsenteeismTableRow[] {
  return [
    ...report.grades.map((g) => ({
      key: `grade-${g.gradeLevel}`,
      label: g.label,
      kind: "row" as const,
      figures: g,
    })),
    { key: "division-total", label: "Division Total", kind: "total", figures: report },
  ];
}

/** The measures every table prints, in column order, M / F / Total each. */
export const ABSENTEEISM_MEASURES: {
  key: string;
  label: string;
  value: (c: AbsenteeismCounts) => string;
}[] = [
  { key: "enrolled", label: "Enrolled", value: (c) => String(c.enrolled) },
  { key: "absentees", label: "Learners with Absences", value: (c) => String(c.absentees) },
  {
    key: "chronic",
    label: `Chronically Absent (≥${CHRONIC_THRESHOLD_PERCENT}% of days)`,
    value: (c) => String(c.chronic),
  },
  { key: "days", label: "Days Absent", value: (c) => formatDays(c.daysAbsent) },
  { key: "rate", label: "Absenteeism Rate", value: formatRate },
];

export const SEXES = [
  { key: "male", label: "M" },
  { key: "female", label: "F" },
  { key: "total", label: "T" },
] as const;

// ---------------------------------------------------------------------------
// Adviser level: one section, one line per learner.
//
// Scored in the browser with the very functions SF2 uses (resolveDay +
// scoreAttendanceDay) — one section's rows are few enough — so a learner's
// figure here is the figure on their SF2, and the sums agree with migration
// 193's section row.
// ---------------------------------------------------------------------------

/** SF2's instruction: home visitation for a learner absent 5 consecutive days. */
export const CONSECUTIVE_ABSENCE_ALERT = 5;

export interface LearnerAbsence {
  daysAbsent: number;
  tardy: number;
  /** Longest run of consecutive class days absent in the period. */
  longestStreak: number;
}

export interface SectionAbsences {
  /** Class days held in the period (a half-day session counts 0.5). */
  classDays: number;
  byStudent: Map<string, LearnerAbsence>;
}

/** Every date from `from` to `to` inclusive, as YYYY-MM-DD. */
function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const [y, m, d] = from.split("-").map(Number);
  const cur = new Date(y, m - 1, d);
  for (;;) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    if (iso > to) break;
    out.push(iso);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * The class days of the period that have been held: the school-year window,
 * narrowed by the period, stopping at today — the same window as 193.
 */
function heldClassDays(
  schoolYear: string,
  range: { from: string | null; to: string | null },
  calendar: Parameters<typeof resolveDay>[0],
): ResolvedDay[] {
  const window = schoolYearWindow(schoolYear);
  if (!window) return [];
  const from = range.from && range.from > window.start ? range.from : window.start;
  const today = todayIso();
  let to = range.to && range.to < window.end ? range.to : window.end;
  if (today < to) to = today;
  if (from > to) return [];
  return eachDate(from, to)
    .map((date) => resolveDay(calendar, date))
    .filter((day) => sessionWeight(day) > 0);
}

interface AttendanceRow {
  student_id: number | string;
  date: string;
  am_present: boolean | null;
  pm_present: boolean | null;
}

export async function fetchSectionAbsences(
  sectionId: string | number,
  schoolId: string | number | null,
  schoolYear: string,
  range: { from: string | null; to: string | null },
): Promise<SectionAbsences> {
  const calendar = await fetchSchoolCalendar(schoolId, schoolYear);
  const days = heldClassDays(schoolYear, range, calendar);
  const classDays = days.reduce((sum, d) => sum + sessionWeight(d), 0);
  const byStudent = new Map<string, LearnerAbsence>();
  if (days.length === 0) return { classDays, byStudent };

  // Only a row with a missed (or unrecorded) session can score an absence or a
  // tardy; a missing row is present. Paged: PostgREST caps a response at 1000.
  const rows: AttendanceRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("sms_attendance")
      .select("student_id, date, am_present, pm_present")
      .eq("section_id", Number(sectionId))
      .eq("school_year", schoolYear)
      .gte("date", days[0].date)
      .lte("date", days[days.length - 1].date)
      .or(
        "am_present.is.null,am_present.eq.false,pm_present.is.null,pm_present.eq.false",
      )
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as AttendanceRow[]));
    if (!data || data.length < PAGE) break;
  }

  // student → date → that day's absent weight
  const absentOn = new Map<string, Map<string, number>>();
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  for (const r of rows) {
    const day = dayByDate.get(r.date);
    if (!day) continue; // a row on a closed date counts for nothing (125)
    const score = scoreAttendanceDay(day, {
      am: r.am_present ?? false,
      pm: r.pm_present ?? false,
    });
    const id = String(r.student_id);
    const entry = byStudent.get(id) ?? { daysAbsent: 0, tardy: 0, longestStreak: 0 };
    entry.daysAbsent += score.absent;
    entry.tardy += score.tardy;
    byStudent.set(id, entry);
    if (score.absent > 0) {
      const dates = absentOn.get(id) ?? new Map<string, number>();
      dates.set(r.date, score.absent);
      absentOn.set(id, dates);
    }
  }

  // Consecutive CLASS days: a holiday or weekend between two absences does
  // not break the run, since nobody could attend it.
  for (const [id, dates] of absentOn) {
    let run = 0;
    let best = 0;
    for (const day of days) {
      if (dates.has(day.date)) {
        run += 1;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
    byStudent.get(id)!.longestStreak = best;
  }

  return { classDays, byStudent };
}

/** True when the learner meets the chronic-absence line for the period. */
export function isChronicallyAbsent(
  daysAbsent: number,
  classDays: number,
): boolean {
  return daysAbsent > 0 && daysAbsent >= (CHRONIC_THRESHOLD_PERCENT / 100) * classDays;
}

export function learnerRate(daysAbsent: number, classDays: number): string {
  return classDays > 0 ? `${((daysAbsent / classDays) * 100).toFixed(2)}%` : "—";
}
