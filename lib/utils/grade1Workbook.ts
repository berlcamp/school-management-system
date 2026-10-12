// Grade 1 workbook — the pure pieces shared by the section's Grade 1 workbook
// page (/teacher/sections/[id]/grade1) and the Grade 1 PDF generators.
//
// The issued "[Grade 1] ECR, PACE Form, and SF9" workbook enters PACE ratings
// on class-summary sheets — one column per competency, one row per learner —
// and prints them out on the per-learner PACE form. Both views here read and
// write the same `sms_pace_ratings` rows (migration 180); this module only
// decides which columns a sheet has and how a few derived figures (age,
// monthly attendance) are computed, so the screen and the paper cannot drift.
//
// Since migration 205 a Reading and Literacy / Language competency is rated on
// one coloured square per macro skill, so a column is a (competency, term,
// skill) — the workbook's class-summary sheets give each square its own
// column under the competency number.

import { GRADE1_ATTENDANCE_MONTHS, ratingSlots } from "@/lib/constants/pace";
import type { TermDates } from "@/lib/utils/termDates";
import {
  countSchoolDays,
  getSchoolDaysInMonth,
  schoolDaysHeldThrough,
  sessionWeight,
  todayIso,
  type SchoolCalendarDay,
} from "@/lib/utils/schoolCalendar";
import type { PaceArea, PaceCompetency, PaceMacroSkill, PaceTerm } from "@/types";

// ---------------------------------------------------------------------------
// Class-summary rating columns
// ---------------------------------------------------------------------------

export interface RatingColumn {
  competency: PaceCompetency;
  /** Header label as the sheet prints it: "12", or "20a" for a lettered sub-item. */
  label: string;
  /** The term this column records. */
  term: PaceTerm;
  /** The macro-skill square, or null for a competency rated as a whole. */
  skill: PaceMacroSkill | null;
}

/** The key one rating is held under on screen: learner, competency, term, square. */
export const ratingKey = (
  studentId: string,
  competencyId: string,
  term: PaceTerm,
  skill: PaceMacroSkill | null = null,
) => `${studentId}:${competencyId}:${term}:${skill ?? ""}`;

export interface RatingColumnGroup {
  /** Strand heading ("Phonological Awareness"), or "" when none precedes it. */
  strand: string;
  /** For a by-term area's single sheet, the term heading above the strand. */
  term: PaceTerm;
  columns: RatingColumn[];
}

/** One tab of the workbook that holds a rating grid. */
export interface RatingSheet {
  key: string;
  title: string;
  area: PaceArea;
  /** The terms this sheet covers: one for a continuous area, all three for by-term. */
  terms: PaceTerm[];
}

const SUB_ITEM = /^\s*([a-z])\.\s/i;

/**
 * The workbook sheet an area's ratings for one term live on: a continuous area
 * (Reading and Literacy, Language) has one sheet per term, because its one list
 * is rated across terms; a by-term area (Mathematics, GMRC, Makabansa) has a
 * single TERM 1-3 sheet, because each competency belongs to exactly one term.
 * The screen shows one term at a time either way and names the sheet, so an
 * adviser moving between the app and the workbook finds the same page.
 */
export function ratingSheetFor(area: PaceArea, term: PaceTerm): RatingSheet {
  return {
    key: `${area.code}-T${term}`,
    title:
      area.mode === "continuous"
        ? `TERM ${term} ${area.name.toUpperCase()}`
        : `TERM 1-3 ${area.name.toUpperCase()}`,
    area,
    terms: [term],
  };
}

/** Cells on a sheet and how many hold a rating, for the progress counts. */
export function countRatedCells(
  columns: RatingColumn[],
  learnerIds: string[],
  isRated: (studentId: string, competencyId: string, term: PaceTerm, skill: PaceMacroSkill | null) => boolean,
): { rated: number; total: number } {
  let rated = 0;
  for (const c of columns) {
    for (const id of learnerIds) if (isRated(id, String(c.competency.id), c.term, c.skill)) rated += 1;
  }
  return { rated, total: columns.length * learnerIds.length };
}

/** How many squares one learner's PACE form has across the year. */
export function rateableCellsPerLearner(competencies: PaceCompetency[]): number {
  return competencies.reduce(
    (n, c) => n + ratingSlots(c).reduce((m, slot) => m + slot.terms.length, 0),
    0,
  );
}

/**
 * The rating columns of one sheet, grouped under their strand headings (and,
 * on a by-term sheet, their term). Only squares rated in the sheet's term get
 * a column — a competency rated on Listening and Speaking gets two, side by
 * side under one number — so the grid never offers a cell the PACE form
 * greys out.
 *
 * Sub-items carry no `item_number` (the form prints "a." in the description),
 * so their label is built from the last numbered item: "20a", "20b".
 */
export function buildRatingColumns(
  competencies: PaceCompetency[],
  sheet: RatingSheet,
): RatingColumnGroup[] {
  const items = competencies
    .filter((c) => String(c.area_id) === String(sheet.area.id))
    .sort((a, b) => a.sort_order - b.sort_order);

  const groups: RatingColumnGroup[] = [];
  let strand = "";
  let parentNumber = "";

  for (const term of sheet.terms) {
    strand = "";
    parentNumber = "";
    let current: RatingColumnGroup | null = null;

    for (const c of items) {
      if (c.is_heading) {
        strand = c.description;
        current = null;
        continue;
      }
      if (c.item_number) parentNumber = c.item_number;

      const inTerm =
        sheet.area.mode === "continuous"
          ? (c.terms ?? []).includes(term)
          : (c.terms ?? []).includes(term) && (c.term_group ?? term) === term;
      if (!inTerm) continue;

      const letter = (SUB_ITEM.exec(c.description)?.[1] ?? "").toLowerCase();
      // A numbered item that is itself sub-item "a." (the form prints "22"
      // beside "a. oneself and family") opens a lettered run: "22a", as the
      // class-summary sheet heads it.
      const label = c.item_number
        ? `${c.item_number}${letter === "a" ? "a" : ""}`
        : `${parentNumber}${letter}`;

      if (!current || current.strand !== strand || current.term !== term) {
        current = { strand, term, columns: [] };
        groups.push(current);
      }
      for (const slot of ratingSlots(c)) {
        if (slot.terms.includes(term)) current.columns.push({ competency: c, label, term, skill: slot.skill });
      }
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Age
// ---------------------------------------------------------------------------

/** Age in whole years and leftover months on a reference date, as the card prints it. */
export function ageYearsMonths(
  dob: string | null | undefined,
  refDate: string,
): { years: string; months: string } {
  if (!dob) return { years: "", months: "" };
  const [by, bm, bd] = String(dob).slice(0, 10).split("-").map(Number);
  const [ry, rm, rd] = refDate.split("-").map(Number);
  if (!by || !ry) return { years: "", months: "" };

  let years = ry - by;
  let months = rm - bm;
  if (rd < bd) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return { years: "", months: "" };
  return { years: String(years), months: String(months) };
}

/** The two reference dates the card computes BoSY / EoSY age against. */
export function grade1AgeReferenceDates(schoolYear: string): { bosy: string; eosy: string } {
  const [startYear, endYear] = schoolYear.split("-");
  return { bosy: `${startYear}-06-01`, eosy: `${endYear}-03-31` };
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export interface MonthAttendance {
  term: PaceTerm;
  /** Stable per row: "2026-09" or, for a month split across terms, "2026-09-T2". */
  key: string;
  label: string;
  classDays: number;
  present: number;
  absent: number;
}

export interface AttendanceRecord {
  date: string;
  am_present: boolean | null;
  pm_present: boolean | null;
}

/** One row of the card's attendance record: a month, or the part of one inside a term. */
export interface AttendanceRow {
  key: string;
  term: PaceTerm;
  label: string;
  /** "YYYY-MM" */
  yearMonth: string;
  /** Inclusive date bounds within the month this row counts. */
  from: string;
  to: string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The term a date falls in, given the first days of Terms 2 and 3. */
export function termOfDate(date: string, termDates: TermDates): PaceTerm {
  if (date >= termDates.term3_start) return 3;
  if (date >= termDates.term2_start) return 2;
  return 1;
}

/**
 * The rows of the attendance record, June to April. With term dates, a month a
 * boundary falls inside becomes one row per term (the issued card's two
 * September rows); without them each month is one row under its default term.
 */
export function grade1AttendanceRows(
  schoolYear: string,
  termDates: TermDates | null = null,
  calendar: SchoolCalendarDay[] = [],
): AttendanceRow[] {
  const [startYear, endYear] = schoolYear.split("-").map(Number);
  const rows: AttendanceRow[] = [];
  for (const { term, month, yearOffset, label } of GRADE1_ATTENDANCE_MONTHS) {
    const year = yearOffset === 0 ? startYear : endYear;
    const yearMonth = `${year}-${pad2(month)}`;
    const lastDay = new Date(year, month, 0).getDate();
    const first = `${yearMonth}-01`;
    const last = `${yearMonth}-${pad2(lastDay)}`;
    if (!termDates) {
      rows.push({ key: yearMonth, term, label, yearMonth, from: first, to: last });
      continue;
    }
    const startTerm = termOfDate(first, termDates);
    const endTerm = termOfDate(last, termDates);
    if (startTerm === endTerm) {
      rows.push({ key: yearMonth, term: startTerm, label, yearMonth, from: first, to: last });
      continue;
    }
    const starts: Record<PaceTerm, string> = { 1: first, 2: termDates.term2_start, 3: termDates.term3_start };
    const parts: AttendanceRow[] = [];
    for (let t = startTerm; t <= endTerm; t++) {
      const from = t === startTerm ? first : starts[t as PaceTerm];
      const nextStart = t < 3 ? starts[(t + 1) as PaceTerm] : null;
      const to = t === endTerm || !nextStart ? last : prevDay(nextStart);
      // A term starting on Monday 4 January must not leave a Term 2 row for
      // a New Year holiday nobody could have attended.
      if (getSchoolDaysInMonth(yearMonth, calendar).some((day) => day.date >= from && day.date <= to)) {
        parts.push({ key: `${yearMonth}-T${t}`, term: t as PaceTerm, label, yearMonth, from, to });
      }
    }
    if (parts.length === 1) parts[0] = { ...parts[0], key: yearMonth, from: first, to: last };
    rows.push(...parts);
  }
  return rows;
}

function prevDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d - 1);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/**
 * Attendance per row on exactly the rules the attendance grid, SF2, the
 * report card and the Kindergarten card already use (migration 125): the
 * school calendar supplies the class-day denominator, and a date with no saved
 * row counts as present for every session held, because an adviser records
 * absences only.
 *
 * Stops at `through` (today by default), exactly as the report card does: that
 * rule is right for a day the school has held and wrong for every day it has
 * not. Months still entirely ahead total zero; the current month counts as far
 * as the days already sat.
 */
export function aggregateGrade1Attendance(
  records: AttendanceRecord[],
  calendar: SchoolCalendarDay[],
  schoolYear: string,
  through: string = todayIso(),
  termDates: TermDates | null = null,
): MonthAttendance[] {
  const byDate = new Map(records.map((r) => [r.date, r]));

  return grade1AttendanceRows(schoolYear, termDates, calendar).map(({ key, term, label, yearMonth, from, to }) => {
    const days = schoolDaysHeldThrough(getSchoolDaysInMonth(yearMonth, calendar), through).filter(
      (day) => day.date >= from && day.date <= to,
    );

    let present = 0;
    let absent = 0;
    days.forEach((day) => {
      const weight = sessionWeight(day);
      const record = byDate.get(day.date);
      const value = record
        ? (day.am && record.am_present ? 0.5 : 0) + (day.pm && record.pm_present ? 0.5 : 0)
        : weight;
      present += value;
      absent += weight - value;
    });

    return { term, key, label, classDays: countSchoolDays(days), present, absent };
  });
}

/** Whole numbers print bare; a half-day shows its .5. A zero prints blank. */
export function fmtDays(value: number): string {
  if (!value) return "";
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}
