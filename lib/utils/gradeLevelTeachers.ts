/**
 * "Grade Level Teachers" data, shared by the SDO report page and its
 * printable.
 *
 * The roster is derived by migration 156's RPC from the two places the system
 * records a teaching assignment — section advisorship and subject schedules —
 * because `sms_users` has no grade level and a teacher's grade is a property
 * of the work, not of the personnel record.
 */

import { getGradeLevelLabel } from "@/lib/constants";
import { getLearningAreaLabel } from "@/lib/constants/learningAreas";
import { USER_TYPE_LABELS } from "@/lib/constants/userTypes";
import { supabase } from "@/lib/supabase/client";

/** One (school, grade level, teacher) row, exactly as the RPC returns it. */
export interface GradeLevelTeacherRow {
  school_id: number;
  school_name: string;
  grade_level: number;
  teacher_id: number;
  teacher_name: string;
  user_type: string | null;
  teacher_position: string | null;
  learning_area: string | null;
  teacher_gender: string | null;
  employee_id: string | null;
  teacher_is_active: boolean;
  is_adviser: boolean;
  advisory_sections: string[] | null;
  subject_names: string[] | null;
  section_names: string[] | null;
  schedule_count: number;
}

/** Rows of one grade level, in the order they print. */
export interface GradeLevelTeacherGroup {
  gradeLevel: number;
  label: string;
  rows: GradeLevelTeacherRow[];
}

/** "All grade levels" — the sentinel the grade filter uses. */
export const ALL_GRADE_LEVELS = "all";

export function roleLabel(type: string | null | undefined): string {
  if (!type) return "—";
  return USER_TYPE_LABELS[type] ?? type;
}

export function learningAreaLabel(code: string | null | undefined): string {
  return code ? getLearningAreaLabel(code) : "—";
}

export function sexLabel(gender: string | null | undefined): string {
  if (gender === "male") return "M";
  if (gender === "female") return "F";
  return "—";
}

/** "Grade 5 - Sampaguita, Rosal" — empty string when the teacher advises none. */
export function listOrDash(values: string[] | null | undefined): string {
  const items = (values ?? []).filter(Boolean);
  return items.length > 0 ? items.join(", ") : "—";
}

/**
 * Fetches the roster for one school year, grouped by grade level in ascending
 * order. A null `schoolId` is the division-wide scope (migration 157) and a
 * null `gradeLevel` every grade.
 */
export async function fetchGradeLevelTeachers(
  schoolId: string | number | null,
  schoolYear: string,
  gradeLevel: number | null,
): Promise<GradeLevelTeacherGroup[]> {
  const { data, error } = await supabase.rpc("division_grade_level_teachers", {
    p_school_id: schoolId === null ? null : Number(schoolId),
    p_school_year: schoolYear,
    p_grade_level: gradeLevel,
  });

  if (error) throw new Error(error.message);

  return groupByGradeLevel((data as GradeLevelTeacherRow[]) ?? []);
}

export function groupByGradeLevel(
  rows: GradeLevelTeacherRow[],
): GradeLevelTeacherGroup[] {
  const byLevel = new Map<number, GradeLevelTeacherRow[]>();
  rows.forEach((r) => {
    const level = Number(r.grade_level);
    const bucket = byLevel.get(level);
    if (bucket) bucket.push(r);
    else byLevel.set(level, [r]);
  });

  return Array.from(byLevel.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([gradeLevel, groupRows]) => ({
      gradeLevel,
      label: getGradeLevelLabel(gradeLevel),
      rows: groupRows,
    }));
}
