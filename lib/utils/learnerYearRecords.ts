// One learner's school year, read across every section they sat in.
//
// A learner moved to another section mid-year (Enrollment → Change section,
// which is 183's `correct_enrollment`) leaves their earlier quarters, attendance
// days and term remarks keyed to the section they were encoded in. Nothing is
// moved or copied — 183's rule: a silent re-point would invent a record. So
// every reader that builds ONE learner's year (report card / SF9, grade slip,
// grades matrix) widens its read from "this section" to the SIBLING sections —
// same school, same school year, same grade level — and keeps one row per key.
//
// Sibling, never wider:
//   * not another school — an in-system transferee's origin records stay
//     behind the record-request flow (invariant 8);
//   * not another grade level — a learner corrected out of a mis-clicked
//     Promote must not carry the wrong grade's rows onto the card.
//
// Tie rule (identical in SQL, migration 234's students_gpa_for_grade): for one
// key the PRIMARY section's row wins — the section being printed — otherwise
// the sibling with the lowest section id. Never an average, never both.

import { supabase } from "@/lib/supabase/client";

/** One row per key: the primary section's, else the lowest section id's. */
export function pickPrimaryPerKey<T extends { section_id: string | number }>(
  rows: T[],
  keyOf: (row: T) => string,
  primarySectionId: string,
): T[] {
  const primary = String(primarySectionId);
  const rank = (row: T): number =>
    String(row.section_id) === primary ? -Infinity : Number(row.section_id);

  const chosen = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    const held = chosen.get(key);
    if (!held || rank(row) < rank(held)) chosen.set(key, row);
  }
  return [...chosen.values()];
}

/** Sections of the same school, school year and grade level. */
export async function fetchSiblingSectionIds(args: {
  schoolId: string | number;
  schoolYear: string;
  gradeLevel: number;
}): Promise<string[]> {
  const { data, error } = await supabase
    .from("sms_sections")
    .select("id")
    .eq("school_id", Number(args.schoolId))
    .eq("school_year", args.schoolYear)
    .eq("grade_level", args.gradeLevel);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String(row.id));
}

export interface LearnerYearArgs {
  studentId: string;
  schoolYear: string;
  /** The sibling sections, the primary among them. */
  sectionIds: string[];
  /** The section being printed — it wins every clash. */
  primarySectionId: string;
}

export interface LearnerYearGrade {
  subject_id: string;
  section_id: string;
  grading_period: number;
  grade: number;
}

export interface LearnerYearAttendance {
  date: string;
  section_id: string;
  am_present: boolean;
  pm_present: boolean;
}

/** Every grade the learner holds in the sibling sections, one per subject and period. */
export async function fetchLearnerYearGrades(
  args: LearnerYearArgs,
): Promise<LearnerYearGrade[]> {
  const { data, error } = await supabase
    .from("sms_grades")
    .select("subject_id, section_id, grading_period, grade")
    .eq("student_id", Number(args.studentId))
    .eq("school_year", args.schoolYear)
    .in("section_id", args.sectionIds.map(Number));
  if (error) throw new Error(error.message);

  const rows: LearnerYearGrade[] = (data ?? []).map((row) => ({
    subject_id: String(row.subject_id),
    section_id: String(row.section_id),
    grading_period: Number(row.grading_period),
    grade: Number(row.grade),
  }));
  return pickPrimaryPerKey(
    rows,
    (r) => `${r.subject_id}:${r.grading_period}`,
    args.primarySectionId,
  ).sort((a, b) => a.grading_period - b.grading_period);
}

/** Every attendance row in the sibling sections, one per date. */
export async function fetchLearnerYearAttendance(
  args: LearnerYearArgs,
): Promise<LearnerYearAttendance[]> {
  const { data, error } = await supabase
    .from("sms_attendance")
    .select("date, section_id, am_present, pm_present")
    .eq("student_id", Number(args.studentId))
    .eq("school_year", args.schoolYear)
    .in("section_id", args.sectionIds.map(Number));
  if (error) throw new Error(error.message);

  const rows: LearnerYearAttendance[] = (data ?? []).map((row) => ({
    date: String(row.date),
    section_id: String(row.section_id),
    am_present: !!row.am_present,
    pm_present: !!row.pm_present,
  }));
  return pickPrimaryPerKey(rows, (r) => r.date, args.primarySectionId);
}

/**
 * The adviser's per-term comments (migration 182), one per term. A failed read
 * must not lose the card, so it logs and returns none — the card's behaviour.
 */
export async function fetchLearnerYearRemarks(
  args: LearnerYearArgs,
): Promise<Record<number, string>> {
  const { data, error } = await supabase
    .from("sms_report_card_remarks")
    .select("term, section_id, remarks")
    .eq("student_id", Number(args.studentId))
    .eq("school_year", args.schoolYear)
    .in("section_id", args.sectionIds.map(Number));
  if (error) {
    console.error("Report card remarks:", error);
    return {};
  }

  const rows = (data ?? []).map((row) => ({
    term: Number(row.term),
    section_id: String(row.section_id),
    remarks: (row.remarks as string | null) ?? "",
  }));
  const out: Record<number, string> = {};
  for (const row of pickPrimaryPerKey(rows, (r) => String(r.term), args.primarySectionId)) {
    out[row.term] = row.remarks;
  }
  return out;
}

/** The primary section plus its siblings, de-duplicated — never empty. */
export async function siblingSectionsOf(args: {
  sectionId: string;
  schoolId: string | number;
  schoolYear: string;
  gradeLevel: number;
}): Promise<string[]> {
  const siblings = await fetchSiblingSectionIds(args);
  return [...new Set([String(args.sectionId), ...siblings])];
}
