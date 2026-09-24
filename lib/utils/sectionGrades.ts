// Every learner's grades in one section, folded into the card's own rows.
//
// Shared by the Grades Matrix (SectionGradesMatrixModal) and the Grade Slip
// (GradeSlipModal) so the figure on the slip and the figure in the grid cannot
// disagree — and both go through `buildCardSubjectRows`, as SF9 and the report
// card do, so MAPEH (153/155) and EPP/TLE (174) fold into one parent counting
// once, and a Madrasah/ALS subject counts not at all (076/128, invariant 15).

import { isShsGrade } from "@/lib/constants/shs";
import { supabase } from "@/lib/supabase/client";
import {
  buildCardSubjectRows,
  type CardSubjectRow,
  type MapehSourceRow,
} from "@/lib/utils/mapeh";

/**
 * A graded subject the section sits. A subset of `Subject` — everything
 * `buildCardSubjectRows` needs to fold the tagged learning areas, plus the
 * roster flag (migration 179) that decides who takes it.
 */
export interface SectionGradeSubject {
  id: string;
  code: string;
  name: string;
  is_madrasah?: boolean | null;
  selective_enrolment?: boolean | null;
  mapeh_component?: string | null;
  tle_component?: string | null;
  comm_component?: string | null;
  units?: number | null;
  shs_category?: string | null;
}

/** grading_period → grade, for one (learner, subject). */
export type PeriodMap = Record<number, number | null>;

export interface SectionGrades {
  /** Keyed by `sectionGradeKey(studentId, subjectId)`. */
  periodsByCell: Map<string, PeriodMap>;
  /**
   * Subjects carrying grades in this section that are not in the list the
   * caller passed — dropped from the timetable after grades were encoded.
   * Their marks must still show, else they vanish from the grid and the slip.
   */
  extraSubjects: SectionGradeSubject[];
  /** Selective subject id → the learners who take it (migration 179). */
  rosterBySubjectId: Map<string, Set<string>>;
}

interface GradeFetchRow {
  student_id: string;
  subject_id: string;
  grading_period: number;
  grade: number;
  subject: SectionGradeSubject | SectionGradeSubject[] | null;
}

/**
 * PostgREST caps a single response at 1000 rows. A section of 45 learners
 * across a dozen subjects and four quarters is well past that, so the grades
 * are paged rather than fetched in one call — the silent truncation would
 * read as "the teacher has not encoded yet".
 */
const PAGE_SIZE = 1000;

export const sectionGradeKey = (studentId: string, subjectId: string) =>
  `${studentId}::${subjectId}`;

function normalizeSubject(
  raw: SectionGradeSubject | SectionGradeSubject[] | null,
): SectionGradeSubject | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

/** Every grade in the section, whoever encoded it, plus selective rosters. */
export async function fetchSectionGrades(
  sectionId: string,
  schoolYear: string,
  subjects: SectionGradeSubject[],
  periodValues: number[],
): Promise<SectionGrades> {
  const rows: GradeFetchRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("sms_grades")
      .select(
        "student_id, subject_id, grading_period, grade, subject:sms_subjects!sms_grades_subject_id_fkey(id, code, name, is_madrasah, selective_enrolment, mapeh_component, tle_component, comm_component, units, shs_category)",
      )
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .order("student_id", { ascending: true })
      .order("subject_id", { ascending: true })
      .order("grading_period", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as GradeFetchRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const periodsByCell = new Map<string, PeriodMap>();
  const known = new Set(subjects.map((s) => String(s.id)));
  const extraSubjects: SectionGradeSubject[] = [];

  for (const raw of rows) {
    const sid = String(raw.subject_id);
    const key = sectionGradeKey(String(raw.student_id), sid);
    if (!periodsByCell.has(key)) periodsByCell.set(key, {});
    const periods = periodsByCell.get(key)!;
    if (periodValues.includes(raw.grading_period)) {
      periods[raw.grading_period] = Number(raw.grade);
    }

    const sub = normalizeSubject(raw.subject);
    if (sub && !known.has(sid) && !extraSubjects.some((e) => e.id === sid)) {
      extraSubjects.push({ ...sub, id: sid });
    }
  }

  // Selective subjects (migration 179) are measured against their own roster,
  // never the section's: a 12-learner EPP/TLE group counted out of 45 reads as
  // permanently under-encoded, which is the exact bug migration 179 had to
  // repair in the Grade Monitoring RPC.
  const selective = [...subjects, ...extraSubjects].filter(
    (s) => s.selective_enrolment === true,
  );
  const rosterBySubjectId = new Map<string, Set<string>>();
  if (selective.length > 0) {
    const { data: rosterRows, error: rosterError } = await supabase
      .from("sms_student_subjects")
      .select("student_id, subject_id")
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .in(
        "subject_id",
        selective.map((s) => s.id),
      );
    if (rosterError) throw new Error(rosterError.message);
    for (const r of rosterRows ?? []) {
      const sid = String(r.subject_id);
      if (!rosterBySubjectId.has(sid)) rosterBySubjectId.set(sid, new Set());
      rosterBySubjectId.get(sid)!.add(String(r.student_id));
    }
    // An encoded grade is the stronger evidence of enrolment than the roster
    // table — the rule TeacherGradeEntryTable already applies.
    for (const raw of rows) {
      const sid = String(raw.subject_id);
      if (rosterBySubjectId.has(sid)) {
        rosterBySubjectId.get(sid)!.add(String(raw.student_id));
      }
    }
  }

  extraSubjects.sort((a, b) => a.code.localeCompare(b.code));
  return { periodsByCell, extraSubjects, rosterBySubjectId };
}

/** The caller's subjects plus any extras, in subject-code order. */
export function sectionGradeColumns(
  subjects: SectionGradeSubject[],
  extraSubjects: SectionGradeSubject[],
): SectionGradeSubject[] {
  const seen = new Set(subjects.map((s) => String(s.id)));
  return [
    ...subjects.map((s) => ({ ...s, id: String(s.id) })),
    ...extraSubjects.filter((e) => !seen.has(e.id)),
  ].sort((a, b) => a.code.localeCompare(b.code));
}

/** Whether this learner takes this subject at all (migration 179). */
export function learnerTakesSubject(
  grades: Pick<SectionGrades, "rosterBySubjectId">,
  studentId: string,
  subject: SectionGradeSubject,
): boolean {
  if (subject.selective_enrolment !== true) return true;
  return grades.rosterBySubjectId.get(subject.id)?.has(studentId) ?? false;
}

/**
 * The card's own rows for one learner. A final grade is a figure for the whole
 * year, not a running average of the periods encoded so far — the rule
 * generateReportCard applies — so `final` stays null until every period is in.
 */
export function learnerCardRows(
  grades: SectionGrades,
  columns: SectionGradeSubject[],
  studentId: string,
  gradeLevel: number | null,
  periodCount: number,
): CardSubjectRow[] {
  const sourceRows: MapehSourceRow[] = columns
    .filter((subject) => learnerTakesSubject(grades, studentId, subject))
    .map((subject) => {
      const periods =
        grades.periodsByCell.get(sectionGradeKey(studentId, subject.id)) ?? {};
      return {
        name: subject.name,
        code: subject.code,
        is_madrasah: subject.is_madrasah === true,
        mapeh_component: subject.mapeh_component ?? null,
        tle_component: subject.tle_component ?? null,
        comm_component: subject.comm_component ?? null,
        units: subject.units ?? null,
        shs_category: subject.shs_category ?? null,
        q1: periods[1] ?? null,
        q2: periods[2] ?? null,
        q3: periodCount >= 3 ? periods[3] ?? null : null,
        q4: periodCount >= 4 ? periods[4] ?? null : null,
      };
    });

  return buildCardSubjectRows(sourceRows, {
    gradeLevel,
    groupByShsCategory: isShsGrade(gradeLevel),
    requirePeriods: periodCount,
  });
}
