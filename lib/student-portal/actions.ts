"use server";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabase2 } from "@/lib/supabase/admin";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";

const COOKIE_NAME = "student_portal_session";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

export interface StudentSessionPayload {
  studentId: string;
  lrn: string;
  studentName: string;
  exp: number;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.STUDENT_PORTAL_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "STUDENT_PORTAL_JWT_SECRET environment variable is not set",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function verifyStudent(
  lrn: string,
  dateOfBirth: string,
): Promise<{ error?: string; success?: boolean }> {
  const trimmedLrn = lrn?.trim() ?? "";
  if (!trimmedLrn) {
    return { error: "LRN is required" };
  }

  const trimmedDob = dateOfBirth?.trim() ?? "";
  if (!trimmedDob) {
    return { error: "Date of birth is required" };
  }

  const { data: student, error } = await supabase2
    .from("sms_students")
    .select("id, lrn, first_name, middle_name, last_name, date_of_birth")
    .eq("lrn", trimmedLrn)
    .maybeSingle();

  if (error) {
    console.error("Student verification error:", error);
    return { error: "An error occurred. Please try again." };
  }

  if (!student) {
    return { error: "Invalid LRN" };
  }

  const dbDobRaw = student.date_of_birth;
  const dbDob =
    typeof dbDobRaw === "string"
      ? dbDobRaw.split("T")[0]
      : dbDobRaw
        ? `${dbDobRaw.getFullYear()}-${String(dbDobRaw.getMonth() + 1).padStart(2, "0")}-${String(dbDobRaw.getDate()).padStart(2, "0")}`
        : "";
  if (dbDob !== trimmedDob) {
    return { error: "Invalid LRN or date of birth" };
  }

  const studentName = [student.last_name, student.first_name, student.middle_name]
    .filter(Boolean)
    .join(", ");

  const token = await new SignJWT({
    studentId: String(student.id),
    lrn: student.lrn,
    studentName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .setIssuedAt()
    .sign(getJwtSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return { success: true };
}

export async function getStudentSession(): Promise<StudentSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      studentId: String(payload.studentId),
      lrn: String(payload.lrn),
      studentName: String(payload.studentName),
      exp: Number(payload.exp),
    };
  } catch {
    return null;
  }
}

export async function logoutStudent(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  redirect("/student-portal");
}

export interface SubjectGrades {
  subjectId: string;
  subjectName: string;
  q1: number | null;
  q2: number | null;
  q3: number | null;
  q4: number | null;
}

export interface SchoolYearGrades {
  schoolYear: string;
  subjects: SubjectGrades[];
}

export async function getStudentGrades(
  studentId: string,
): Promise<SchoolYearGrades[]> {
  const { data: grades, error } = await supabase2
    .from("sms_grades")
    .select("subject_id, school_year, grading_period, grade")
    .eq("student_id", studentId);

  if (error) {
    console.error("getStudentGrades error:", error);
    return [];
  }

  const subjectIds = [
    ...new Set((grades ?? []).map((r) => String(r.subject_id))),
  ];
  const subjectNames = new Map<string, string>();

  if (subjectIds.length > 0) {
    const { data: subjects } = await supabase2
      .from("sms_subjects")
      .select("id, name")
      .in("id", subjectIds);
    for (const s of subjects ?? []) {
      subjectNames.set(String(s.id), s.name ?? "Unknown");
    }
  }

  const bySchoolYear = new Map<string, Map<string, SubjectGrades>>();

  for (const row of grades ?? []) {
    const subjectId = String(row.subject_id);
    const subjectName = subjectNames.get(subjectId) ?? "Unknown";
    const sy = String(row.school_year);
    const period = Number(row.grading_period);
    const grade = Number(row.grade);

    if (!bySchoolYear.has(sy)) {
      bySchoolYear.set(sy, new Map());
    }
    const subjectMap = bySchoolYear.get(sy)!;

    if (!subjectMap.has(subjectId)) {
      subjectMap.set(subjectId, {
        subjectId,
        subjectName,
        q1: null,
        q2: null,
        q3: null,
        q4: null,
      });
    }
    const subj = subjectMap.get(subjectId)!;
    if (period === 1) subj.q1 = grade;
    else if (period === 2) subj.q2 = grade;
    else if (period === 3) subj.q3 = grade;
    else if (period === 4) subj.q4 = grade;
  }

  const result: SchoolYearGrades[] = [];

  for (const [sy, subjectMap] of bySchoolYear.entries()) {
    if (subjectMap.size > 0) {
      result.push({
        schoolYear: sy,
        subjects: Array.from(subjectMap.values()).sort((a, b) =>
          a.subjectName.localeCompare(b.subjectName),
        ),
      });
    }
  }

  result.sort((a, b) => b.schoolYear.localeCompare(a.schoolYear));
  return result;
}

// ============================================================================
// EVALUATIONS
// ============================================================================

export interface TeacherInfo {
  teacherId: string;
  teacherName: string;
}

export interface EvaluationWithQuestions {
  id: string;
  title: string;
  description?: string | null;
  school_year: string;
  questions: { id: string; question_text: string; order_number: number }[];
}

export async function getStudentTeachers(
  studentId: string,
): Promise<TeacherInfo[]> {
  const schoolYear = getCurrentSchoolYear();

  // Get student's current enrollment
  const { data: enrollment } = await supabase2
    .from("sms_enrollments")
    .select("section_id, school_id")
    .eq("student_id", studentId)
    .eq("school_year", schoolYear)
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (!enrollment?.section_id) return [];

  // Get subject schedules for that section
  const { data: schedules } = await supabase2
    .from("sms_subject_schedules")
    .select("teacher_id")
    .eq("section_id", enrollment.section_id)
    .eq("school_year", schoolYear);

  if (!schedules || schedules.length === 0) return [];

  const teacherIds = [...new Set(schedules.map((s) => String(s.teacher_id)))];

  const { data: teachers } = await supabase2
    .from("sms_users")
    .select("id, name")
    .in("id", teacherIds)
    .eq("is_active", true);

  return (teachers || []).map((t) => ({
    teacherId: String(t.id),
    teacherName: t.name || "Unknown Teacher",
  }));
}

export async function getActiveStudentEvaluations(
  studentId: string,
): Promise<EvaluationWithQuestions[]> {
  const schoolYear = getCurrentSchoolYear();

  // Get student's school from enrollment
  const { data: enrollment } = await supabase2
    .from("sms_enrollments")
    .select("school_id")
    .eq("student_id", studentId)
    .eq("school_year", schoolYear)
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (!enrollment?.school_id) return [];

  const { data: evals } = await supabase2
    .from("sms_evaluations")
    .select("*")
    .eq("school_id", enrollment.school_id)
    .eq("type", "student_to_teacher")
    .eq("is_active", true)
    .eq("school_year", schoolYear);

  if (!evals || evals.length === 0) return [];

  const result: EvaluationWithQuestions[] = [];

  for (const ev of evals) {
    const { data: questions } = await supabase2
      .from("sms_evaluation_questions")
      .select("id, question_text, order_number")
      .eq("evaluation_id", ev.id)
      .order("order_number");

    result.push({
      id: String(ev.id),
      title: ev.title,
      description: ev.description,
      school_year: ev.school_year,
      questions: (questions || []).map((q) => ({
        id: String(q.id),
        question_text: q.question_text,
        order_number: q.order_number,
      })),
    });
  }

  return result;
}

export async function getStudentSubmittedEvaluations(
  studentId: string,
  evaluationId: string,
): Promise<string[]> {
  const { data } = await supabase2
    .from("sms_evaluation_responses")
    .select("evaluatee_id")
    .eq("evaluation_id", evaluationId)
    .eq("respondent_type", "student")
    .eq("respondent_id", studentId);

  if (!data) return [];

  return [...new Set(data.map((r) => String(r.evaluatee_id)))];
}

export async function submitStudentEvaluation(
  studentId: string,
  evaluationId: string,
  evaluateeId: string,
  ratings: { questionId: string; rating: number }[],
): Promise<{ success?: boolean; error?: string }> {
  // Validate evaluation exists and is active
  const { data: evaluation } = await supabase2
    .from("sms_evaluations")
    .select("id, is_active, type, school_year, school_id")
    .eq("id", evaluationId)
    .maybeSingle();

  if (!evaluation) return { error: "Evaluation not found" };
  if (!evaluation.is_active) return { error: "Evaluation is no longer active" };
  if (evaluation.type !== "student_to_teacher")
    return { error: "Invalid evaluation type" };

  // Check if already submitted for this evaluatee
  const { count } = await supabase2
    .from("sms_evaluation_responses")
    .select("*", { count: "exact", head: true })
    .eq("evaluation_id", evaluationId)
    .eq("respondent_type", "student")
    .eq("respondent_id", studentId)
    .eq("evaluatee_id", evaluateeId);

  if (count && count > 0) {
    return { error: "You have already submitted this evaluation" };
  }

  const responses = ratings.map((r) => ({
    evaluation_id: evaluationId,
    question_id: r.questionId,
    respondent_type: "student" as const,
    respondent_id: parseInt(studentId),
    evaluatee_id: parseInt(evaluateeId),
    rating: r.rating,
    school_year: evaluation.school_year,
    school_id: evaluation.school_id,
  }));

  const { error } = await supabase2
    .from("sms_evaluation_responses")
    .insert(responses);

  if (error) {
    console.error("submitStudentEvaluation error:", error);
    if (error.code === "23505") {
      return { error: "You have already submitted this evaluation" };
    }
    return { error: "Failed to submit evaluation" };
  }

  return { success: true };
}

export { getCurrentSchoolYear, getSchoolYearOptions };
