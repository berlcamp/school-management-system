// SF9 — Learner's Progress Report Card.
//
// SF9 and the MATATAG report card are the same issued document reached from two
// places: Reports / Teacher School Forms print it per learner, the section page
// prints it from PrintCardModal. This module had its own flat one-column table
// predating the DepEd reissue, so the two surfaces printed different forms for
// the same learner and the same grades.
//
// So SF9 no longer draws anything. It resolves the learner's section and hands
// off to `generateReportCardPrint({ design: "matatag" })` — the two-panel
// "Learner's Performance Report" — which means the form can never drift between
// the two entry points again, and SF9 inherits without restating them:
//
//   * the learning-area roster, not the list of subjects that happen to carry a
//     grade. `fetchGradeLevelSubjectRows` lists the grade level's active
//     subjects, and a subject flagged `selective_enrolment` (migration 179 —
//     Madrasah, ALS, an SPA strand) appears only for the learners actually
//     enrolled in it through `sms_student_subjects`. A learner is never handed a
//     card carrying a subject they do not take, nor one missing a learning area
//     nobody has encoded yet;
//   * the period columns, from `getGradingPeriods(schoolYear)` — three terms
//     from SY 2026-2027, four quarters before it;
//   * MAPEH (153/155) and EPP/TLE (174) folded into one computed parent row
//     counting once toward the general average;
//   * the attendance grid, the performance descriptors, the per-term teacher's
//     comments and parent signature lines, and the two transfer certificates.
//
// Grade 1 is the one exception, and it is not a variant of the same form: its
// issued card is a different instrument — portrait, narrative, no numeric
// grades at all, with the PACE competency pages attached behind it (migration
// 180). SF9 branches on the section's grade level and hands that one off to
// `generateGrade1ProgressCardPrint` instead. The branch is on the SECTION's
// grade level rather than the learner's age or enrollment row, because the
// card belongs to the class the learner sits in.

import { generateGrade1ProgressCardPrint } from "@/lib/pdf/generateGrade1Reports";
import { generateReportCardPrint } from "@/lib/pdf/generateReportCard";
import { supabase } from "@/lib/supabase/client";

export interface Sf9Params {
  schoolId: string;
  studentId: string;
  schoolYear: string;
  /**
   * The section to print for. Optional: a caller whose learner list is drawn
   * from one section already knows it, and passing it keeps SF9 on that section
   * when a learner carries more than one approved enrollment for the year.
   * Omitted, it is resolved from the learner's own enrollment below.
   */
  sectionId?: string;
}

/** The learner's section for the school year, on the rule SF9 has always used. */
async function resolveSectionId(
  studentId: string,
  schoolYear: string,
): Promise<string> {
  const { data: enrollments } = await supabase
    .from("sms_enrollments")
    .select("section_id")
    .eq("student_id", studentId)
    .eq("school_year", schoolYear)
    .eq("status", "approved")
    .limit(1);

  if (enrollments && enrollments.length > 0 && enrollments[0].section_id) {
    return String(enrollments[0].section_id);
  }

  const { data: student, error } = await supabase
    .from("sms_students")
    .select("current_section_id")
    .eq("id", studentId)
    .single();

  if (error || !student) throw new Error("Student not found");
  if (!student.current_section_id) {
    throw new Error("Student is not enrolled in any section for this school year");
  }
  return String(student.current_section_id);
}

export async function generateSf9Print(params: Sf9Params): Promise<void> {
  const { schoolId, studentId, schoolYear } = params;

  const sectionId =
    params.sectionId || (await resolveSectionId(studentId, schoolYear));

  const { data: section } = await supabase
    .from("sms_sections")
    .select("grade_level")
    .eq("id", sectionId)
    .single();

  if (Number(section?.grade_level) === 1) {
    return generateGrade1ProgressCardPrint({
      schoolId,
      studentId,
      sectionId,
      schoolYear,
    });
  }

  return generateReportCardPrint({
    schoolId,
    studentId,
    sectionId,
    schoolYear,
    design: "matatag",
  });
}
