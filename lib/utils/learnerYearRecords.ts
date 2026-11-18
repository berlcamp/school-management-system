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
// Senior High (Grades 11–12) is NOT widened: a learner sits in one section per
// semester, so a sibling section is usually the other semester's, and reading
// it would add that semester's subjects and attendance to a learner who never
// moved (migration 234 leaves SHS GPA alone for the same reason). The
// old-curriculum semester blocks on the report card are the one exception —
// they read siblings by period pair, which keeps the semesters apart.
//
// Tie rule (identical in SQL, migration 234's students_gpa_for_grade): for one
// key the PRIMARY section's row wins — the section being printed — otherwise
// the sibling with the lowest section id. Never an average, never both.

import { isShsGrade } from "@/lib/constants/shs";
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

/**
 * One grade per (subject, period). A 0 means "not encoded yet"
 * (students_gpa_for_grade excludes it the same way), so an encoded grade
 * anywhere beats a 0 in the current section, and a 0 left in an earlier
 * section adds nothing. The current section's own 0 is kept, exactly as the
 * card read it before.
 */
export function pickGrades<
  T extends {
    section_id: string | number;
    subject_id: string | number;
    grading_period: string | number;
    grade: string | number;
  },
>(rows: T[], primarySectionId: string): T[] {
  const keyOf = (r: T) => `${r.subject_id}:${r.grading_period}`;
  const primary = String(primarySectionId);
  const encoded = pickPrimaryPerKey(
    rows.filter((r) => Number(r.grade) > 0),
    keyOf,
    primary,
  );
  const taken = new Set(encoded.map(keyOf));
  const ownZeros = rows.filter(
    (r) =>
      Number(r.grade) <= 0 &&
      String(r.section_id) === primary &&
      !taken.has(keyOf(r)),
  );
  return [...encoded, ...ownZeros];
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
  return pickGrades(rows, args.primarySectionId).sort(
    (a, b) => a.grading_period - b.grading_period,
  );
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

/**
 * The primary section plus its siblings, de-duplicated — never empty. A Senior
 * High section is its own only sibling (see the header).
 */
export async function siblingSectionsOf(args: {
  sectionId: string;
  schoolId: string | number;
  schoolYear: string;
  gradeLevel: number;
}): Promise<string[]> {
  if (isShsGrade(args.gradeLevel)) return [String(args.sectionId)];
  const siblings = await fetchSiblingSectionIds(args);
  return [...new Set([String(args.sectionId), ...siblings])];
}

export interface LearnerYearForCard {
  /** The sections read — the printed one and its siblings. */
  sectionIds: string[];
  grades: LearnerYearGrade[];
  attendance: LearnerYearAttendance[];
  remarks: Record<number, string>;
}

/** Everything the report card / SF9 needs from the learner's year, in one call. */
export async function fetchLearnerYearForCard(args: {
  schoolId: string | number;
  studentId: string;
  sectionId: string;
  schoolYear: string;
  gradeLevel: number;
}): Promise<LearnerYearForCard> {
  const sectionIds = await siblingSectionsOf(args);
  const scope: LearnerYearArgs = {
    studentId: args.studentId,
    schoolYear: args.schoolYear,
    sectionIds,
    primarySectionId: String(args.sectionId),
  };
  const [grades, attendance, remarks] = await Promise.all([
    fetchLearnerYearGrades(scope),
    fetchLearnerYearAttendance(scope),
    fetchLearnerYearRemarks(scope),
  ]);
  return { sectionIds, grades, attendance, remarks };
}

/**
 * The sibling sections of a section, resolved from the section's OWN school and
 * grade level (not the viewer's active school). Senior High: itself only.
 */
export async function siblingSectionsOfSection(
  sectionId: string,
  schoolYear: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("sms_sections")
    .select("school_id, grade_level")
    .eq("id", Number(sectionId));
  if (error) throw new Error(error.message);
  const section = data?.[0];
  if (!section) return [String(sectionId)];
  return siblingSectionsOf({
    sectionId,
    schoolId: section.school_id,
    schoolYear,
    gradeLevel: Number(section.grade_level),
  });
}

export interface LearnerYearGradeRow extends LearnerYearGrade {
  student_id: string;
}

/** Learner ids per `.in()` — keeps the request URL well under its limit. */
const LEARNER_CHUNK = 200;
/** PostgREST's per-response row cap. */
const PAGE_SIZE = 1000;

/**
 * The year's grades of a section's learners — each learner's earlier section
 * included, one per (learner, subject, period) on the rule above. For the
 * screens that compute a final grade or general average for a whole section
 * (Promote / Retain, SF5). Only the learners passed are read.
 */
export async function fetchYearGradesForLearners(args: {
  sectionId: string;
  schoolYear: string;
  learnerIds: string[];
}): Promise<LearnerYearGradeRow[]> {
  if (args.learnerIds.length === 0) return [];
  const sectionIds = await siblingSectionsOfSection(args.sectionId, args.schoolYear);

  const rows: LearnerYearGradeRow[] = [];
  for (let i = 0; i < args.learnerIds.length; i += LEARNER_CHUNK) {
    const chunk = args.learnerIds.slice(i, i + LEARNER_CHUNK).map(Number);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("sms_grades")
        .select("student_id, subject_id, section_id, grading_period, grade")
        .in("student_id", chunk)
        .eq("school_year", args.schoolYear)
        .in("section_id", sectionIds.map(Number))
        .order("student_id", { ascending: true })
        .order("subject_id", { ascending: true })
        .order("grading_period", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        rows.push({
          student_id: String(row.student_id),
          subject_id: String(row.subject_id),
          section_id: String(row.section_id),
          grading_period: Number(row.grading_period),
          grade: Number(row.grade),
        });
      }
      if (!data || data.length < PAGE_SIZE) break;
    }
  }

  const byLearner = new Map<string, LearnerYearGradeRow[]>();
  for (const row of rows) {
    if (!byLearner.has(row.student_id)) byLearner.set(row.student_id, []);
    byLearner.get(row.student_id)!.push(row);
  }
  return [...byLearner.values()].flatMap((own) =>
    pickGrades(own, String(args.sectionId)).sort(
      (a, b) =>
        a.subject_id.localeCompare(b.subject_id) || a.grading_period - b.grading_period,
    ),
  );
}
