// Grade 1 workbook — the pure pieces shared by the section's Grade 1 workbook
// page (/teacher/sections/[id]/grade1) and the Grade 1 PDF generators.
//
// The issued "[Grade 1] ECR, PACE Form, and SF9" workbook enters PACE ratings
// on class-summary sheets — one column per competency, one row per learner —
// and prints them out on the per-learner PACE form. Both views here read and
// write the same `sms_pace_ratings` rows (migration 180); this module only
// decides which columns a sheet has and how a few derived figures (age,
// monthly attendance) are computed, so the screen and the paper cannot drift.

import { GRADE1_ATTENDANCE_MONTHS } from "@/lib/constants/pace";
import {
  countSchoolDays,
  getSchoolDaysInMonth,
  schoolDaysHeldThrough,
  sessionWeight,
  todayIso,
  type SchoolCalendarDay,
} from "@/lib/utils/schoolCalendar";
import type { PaceArea, PaceCompetency, PaceTerm } from "@/types";

// ---------------------------------------------------------------------------
// Class-summary rating columns
// ---------------------------------------------------------------------------

export interface RatingColumn {
  competency: PaceCompetency;
  /** Header label as the sheet prints it: "12", or "20a" for a lettered sub-item. */
  label: string;
  /** The term this column records. */
  term: PaceTerm;
}

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
  isRated: (studentId: string, competencyId: string, term: PaceTerm) => boolean,
): { rated: number; total: number } {
  let rated = 0;
  for (const c of columns) {
    for (const id of learnerIds) if (isRated(id, String(c.competency.id), c.term)) rated += 1;
  }
  return { rated, total: columns.length * learnerIds.length };
}

/** How many cells one learner's PACE form has across the year. */
export function rateableCellsPerLearner(competencies: PaceCompetency[]): number {
  return competencies.reduce((n, c) => n + (c.is_heading ? 0 : (c.terms ?? []).length), 0);
}

/**
 * The rating columns of one sheet, grouped under their strand headings (and,
 * on a by-term sheet, their term). Only competencies rated in the sheet's term
 * get a column, so the grid never offers a cell the PACE form leaves blank.
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
      current.columns.push({ competency: c, label, term });
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

/**
 * Attendance per month on exactly the rules the attendance grid, SF2, the
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
): MonthAttendance[] {
  const [startYear, endYear] = schoolYear.split("-").map(Number);
  const byDate = new Map(records.map((r) => [r.date, r]));

  return GRADE1_ATTENDANCE_MONTHS.map(({ term, month, yearOffset, label }) => {
    const year = yearOffset === 0 ? startYear : endYear;
    const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
    const days = schoolDaysHeldThrough(getSchoolDaysInMonth(yearMonth, calendar), through);

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

    return { term, label, classDays: countSchoolDays(days), present, absent };
  });
}

/** Whole numbers print bare; a half-day shows its .5. A zero prints blank. */
export function fmtDays(value: number): string {
  if (!value) return "";
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}
