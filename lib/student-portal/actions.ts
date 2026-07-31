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

/** Returns null if not configured (avoids throwing from server actions → HTTP 500). */
function getJwtSecretBytes(): Uint8Array | null {
  const secret = process.env.STUDENT_PORTAL_JWT_SECRET;
  if (!secret?.trim()) {
    return null;
  }
  return new TextEncoder().encode(secret);
}

export async function verifyStudent(
  lrn: string,
  code: string,
): Promise<{ error?: string; success?: boolean }> {
  const jwtSecret = getJwtSecretBytes();
  if (!jwtSecret) {
    console.error(
      "Student portal: STUDENT_PORTAL_JWT_SECRET is missing or empty",
    );
    return {
      error:
        "Sign-in is temporarily unavailable. Please contact your school if this continues.",
    };
  }

  try {
    const trimmedLrn = lrn?.trim() ?? "";
    if (!trimmedLrn) {
      return { error: "LRN is required" };
    }

    const trimmedCode = code?.trim() ?? "";
    if (!trimmedCode) {
      return { error: "Code is required" };
    }

    const { data: student, error } = await supabase2
      .from("sms_students")
      .select("id, lrn, first_name, middle_name, last_name, portal_code")
      .eq("lrn", trimmedLrn)
      .maybeSingle();

    if (error) {
      console.error("Student verification error:", error);
      return { error: "An error occurred. Please try again." };
    }

    if (!student) {
      return { error: "Invalid LRN" };
    }

    const dbCode = (student.portal_code ?? "").trim();
    if (!dbCode) {
      return {
        error:
          "No sign-in code has been set for this LRN yet. Please ask your section adviser for your code.",
      };
    }
    if (dbCode.toUpperCase() !== trimmedCode.toUpperCase()) {
      return { error: "Invalid LRN or code" };
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
      .sign(jwtSecret);

    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return { success: true };
  } catch (err) {
    console.error("verifyStudent unexpected error:", err);
    return { error: "An error occurred. Please try again." };
  }
}

export async function getStudentSession(): Promise<StudentSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return null;

  const jwtSecret = getJwtSecretBytes();
  if (!jwtSecret) {
    console.error(
      "Student portal: STUDENT_PORTAL_JWT_SECRET is missing; session cannot be verified",
    );
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, jwtSecret);
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
// CLASS RECORD BREAKDOWN (per subject + grading period)
// ============================================================================

export interface ClassRecordBreakdownItem {
  label: string;
  maxScore: number;
  weight: number | null; // per-item weight % (ST items only)
  rawScore: number | null; // null = not yet entered
}

export interface ClassRecordBreakdownComponent {
  key: "WW" | "PT" | "ST";
  title: string;
  weight: number; // component weight %
  items: ClassRecordBreakdownItem[];
  ps: number | null; // percentage score
  ws: number | null; // weighted score (ps * weight%)
}

export interface ClassRecordBreakdown {
  subjectName: string;
  schoolYear: string;
  gradingPeriod: number;
  useTransmutation: boolean;
  isPosted: boolean;
  components: ClassRecordBreakdownComponent[];
  initialGrade: number;
  termGrade: number;
  postedGrade: number | null; // grade of record from sms_grades
}

const COMPONENT_META: {
  key: "WW" | "PT" | "ST";
  title: string;
  weightField: "ww_weight" | "pt_weight" | "st_weight";
}[] = [
  { key: "WW", title: "Written / Oral Works", weightField: "ww_weight" },
  { key: "PT", title: "Product / Performance Tasks", weightField: "pt_weight" },
  { key: "ST", title: "Summative Tests & Term Exams", weightField: "st_weight" },
];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// DepEd DO 8, s.2015 transmutation table (mirror of SQL sms_transmute_grade).
const TRANSMUTATION_TABLE: [number, number][] = [
  [100, 100], [98.4, 99], [96.8, 98], [95.2, 97], [93.6, 96], [92.0, 95],
  [90.4, 94], [88.8, 93], [87.2, 92], [85.6, 91], [84.0, 90], [82.4, 89],
  [80.8, 88], [79.2, 87], [77.6, 86], [76.0, 85], [74.4, 84], [72.8, 83],
  [71.2, 82], [69.6, 81], [68.0, 80], [66.4, 79], [64.8, 78], [63.2, 77],
  [61.6, 76], [60.0, 75], [56.0, 74], [52.0, 73], [48.0, 72], [44.0, 71],
  [40.0, 70], [36.0, 69], [32.0, 68], [28.0, 67], [24.0, 66], [20.0, 65],
  [16.0, 64], [12.0, 63], [8.0, 62], [4.0, 61],
];

function transmute(initial: number): number {
  for (const [threshold, grade] of TRANSMUTATION_TABLE) {
    if (initial >= threshold) return grade;
  }
  return 60;
}

/**
 * The teacher's class-record breakdown backing one posted grade, or null when
 * the grade was not posted from a class record (e.g. entered directly).
 *
 * Mirrors the SQL/teacher computation exactly:
 *   WW/PT PS = SUM(raw)/SUM(max)*100 (missing raw = 0)
 *   ST   PS = SUM((raw/max*100)*weight)/SUM(weight) (fixed ST1/ST2/TE)
 *   WS      = PS * component weight%
 *   Initial = sum of the three WS
 *   Term    = transmuted Initial when enabled, else rounded.
 */
export async function getStudentClassRecordBreakdown(
  studentId: string,
  subjectId: string,
  schoolYear: string,
  gradingPeriod: number,
): Promise<ClassRecordBreakdown | null> {
  // The posted grade row carries the section that identifies the class record.
  const { data: gradeRow, error: gradeErr } = await supabase2
    .from("sms_grades")
    .select("section_id, grade")
    .eq("student_id", studentId)
    .eq("subject_id", subjectId)
    .eq("school_year", schoolYear)
    .eq("grading_period", gradingPeriod)
    .maybeSingle();

  if (gradeErr || !gradeRow?.section_id) return null;

  const { data: record, error: recordErr } = await supabase2
    .from("sms_class_records")
    .select(
      "id, subject_id, ww_weight, pt_weight, st_weight, use_transmutation, is_posted",
    )
    .eq("subject_id", subjectId)
    .eq("section_id", gradeRow.section_id)
    .eq("school_year", schoolYear)
    .eq("grading_period", gradingPeriod)
    .maybeSingle();

  if (recordErr || !record) return null;

  const { data: items } = await supabase2
    .from("sms_class_record_items")
    .select("id, component, label, max_score, weight, position")
    .eq("class_record_id", record.id)
    .order("position");

  const itemList = items ?? [];
  const itemIds = itemList.map((i) => String(i.id));

  const scoreByItem = new Map<string, number | null>();
  if (itemIds.length > 0) {
    const { data: scores } = await supabase2
      .from("sms_class_record_scores")
      .select("item_id, raw_score")
      .eq("student_id", studentId)
      .in("item_id", itemIds);
    for (const s of scores ?? []) {
      scoreByItem.set(
        String(s.item_id),
        s.raw_score === null ? null : Number(s.raw_score),
      );
    }
  }

  let subjectName = "Unknown";
  const { data: subject } = await supabase2
    .from("sms_subjects")
    .select("name")
    .eq("id", subjectId)
    .maybeSingle();
  if (subject?.name) subjectName = subject.name;

  const components: ClassRecordBreakdownComponent[] = COMPONENT_META.map(
    (meta) => {
      const compItems = itemList
        .filter((i) => i.component === meta.key)
        .sort((a, b) => Number(a.position) - Number(b.position));

      const weight = Number(record[meta.weightField]);

      let seq = 0;
      const breakdownItems: ClassRecordBreakdownItem[] = compItems.map((i) => {
        seq += 1;
        const raw = scoreByItem.has(String(i.id))
          ? scoreByItem.get(String(i.id))!
          : null;
        return {
          label: i.label?.trim() || `${meta.key}${seq}`,
          maxScore: Number(i.max_score),
          weight: i.weight === null ? null : Number(i.weight),
          rawScore: raw,
        };
      });

      let ps: number | null = null;
      if (compItems.length > 0) {
        if (meta.key === "ST") {
          const totalWeight = breakdownItems.reduce(
            (sum, it) => sum + (it.weight ?? 0),
            0,
          );
          if (totalWeight > 0) {
            const weighted = breakdownItems.reduce((sum, it) => {
              const itemPS =
                it.maxScore > 0 ? ((it.rawScore ?? 0) / it.maxScore) * 100 : 0;
              return sum + itemPS * (it.weight ?? 0);
            }, 0);
            ps = round2(weighted / totalWeight);
          }
        } else {
          const maxTotal = breakdownItems.reduce(
            (sum, it) => sum + it.maxScore,
            0,
          );
          if (maxTotal > 0) {
            const rawTotal = breakdownItems.reduce(
              (sum, it) => sum + (it.rawScore ?? 0),
              0,
            );
            ps = round2((rawTotal / maxTotal) * 100);
          }
        }
      }

      const ws = ps === null ? null : round2((ps * weight) / 100);

      return {
        key: meta.key,
        title: meta.title,
        weight,
        items: breakdownItems,
        ps,
        ws,
      };
    },
  );

  const initialGrade = round2(
    components.reduce((sum, c) => sum + (c.ws ?? 0), 0),
  );
  const termGrade = record.use_transmutation
    ? transmute(initialGrade)
    : Math.round(initialGrade);

  return {
    subjectName,
    schoolYear,
    gradingPeriod,
    useTransmutation: record.use_transmutation,
    isPosted: record.is_posted,
    components,
    initialGrade,
    termGrade,
    postedGrade: gradeRow.grade === null ? null : Number(gradeRow.grade),
  };
}

// ============================================================================
// EVALUATIONS
// ============================================================================

export interface TeacherInfo {
  teacherId: string;
  teacherName: string;
}

// A person a student can evaluate (a teacher, or a school head)
export interface EvaluateeInfo {
  id: string;
  name: string;
}

export interface EvaluationWithQuestions {
  id: string;
  title: string;
  description?: string | null;
  school_year: string;
  type: "student_to_teacher" | "student_to_principal";
  /** People the student evaluates under this questionnaire */
  evaluatees: EvaluateeInfo[];
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

  // Temporary schedules have no teacher — there is nobody to evaluate
  const teacherIds = [
    ...new Set(
      schedules
        .filter((s) => s.teacher_id != null)
        .map((s) => String(s.teacher_id)),
    ),
  ];
  if (teacherIds.length === 0) return [];

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
    .in("type", ["student_to_teacher", "student_to_principal"])
    .eq("is_active", true)
    .eq("school_year", schoolYear);

  if (!evals || evals.length === 0) return [];

  // Teachers are shared across all student_to_teacher evaluations; fetch once.
  const hasTeacherEval = evals.some((e) => e.type === "student_to_teacher");
  const teacherEvaluatees: EvaluateeInfo[] = hasTeacherEval
    ? (await getStudentTeachers(studentId)).map((t) => ({
        id: t.teacherId,
        name: t.teacherName,
      }))
    : [];

  // Resolve any specific school heads referenced by student_to_principal evals
  const headIds = [
    ...new Set(
      evals
        .filter((e) => e.type === "student_to_principal" && e.evaluatee_id)
        .map((e) => String(e.evaluatee_id)),
    ),
  ];
  const headNameMap = new Map<string, string>();
  if (headIds.length > 0) {
    const { data: heads } = await supabase2
      .from("sms_users")
      .select("id, name")
      .in("id", headIds)
      .eq("is_active", true);
    for (const h of heads || []) {
      headNameMap.set(String(h.id), h.name || "School Head");
    }
  }

  const result: EvaluationWithQuestions[] = [];

  for (const ev of evals) {
    const { data: questions } = await supabase2
      .from("sms_evaluation_questions")
      .select("id, question_text, order_number")
      .eq("evaluation_id", ev.id)
      .order("order_number");

    let evaluatees: EvaluateeInfo[] = [];
    if (ev.type === "student_to_teacher") {
      evaluatees = teacherEvaluatees;
    } else if (ev.type === "student_to_principal" && ev.evaluatee_id) {
      const id = String(ev.evaluatee_id);
      evaluatees = [{ id, name: headNameMap.get(id) || "School Head" }];
    }

    result.push({
      id: String(ev.id),
      title: ev.title,
      description: ev.description,
      school_year: ev.school_year,
      type: ev.type,
      evaluatees,
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
  remarks?: string,
): Promise<{ success?: boolean; error?: string }> {
  // Validate evaluation exists and is active
  const { data: evaluation } = await supabase2
    .from("sms_evaluations")
    .select("id, is_active, type, school_year, school_id")
    .eq("id", evaluationId)
    .maybeSingle();

  if (!evaluation) return { error: "Evaluation not found" };
  if (!evaluation.is_active) return { error: "Evaluation is no longer active" };
  if (
    evaluation.type !== "student_to_teacher" &&
    evaluation.type !== "student_to_principal"
  )
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

  const responses = ratings.map((r, index) => ({
    evaluation_id: evaluationId,
    question_id: r.questionId,
    respondent_type: "student" as const,
    respondent_id: parseInt(studentId),
    evaluatee_id: parseInt(evaluateeId),
    rating: r.rating,
    school_year: evaluation.school_year,
    school_id: evaluation.school_id,
    // Store remarks only on the first row to avoid repetition
    ...(index === 0 && remarks ? { remarks } : {}),
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
