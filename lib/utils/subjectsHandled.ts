/**
 * "Subjects Handled by Teacher" data, shared by the report page and its
 * printable. One row per subject schedule, grouped by teacher.
 */

import { supabase } from "@/lib/supabase/client";
import { formatScheduleTerms, scheduleCoversPeriod } from "@/lib/utils/scheduleTerms";
import { getGradingPeriods } from "@/lib/utils/schoolYear";
import { timeToMinutes } from "@/lib/utils/teachingLoad";

export interface SubjectHandledRow {
  scheduleId: string;
  subjectName: string;
  gradeLevel: number;
  sectionId: string;
  sectionName: string;
  /** days_of_week values (0=Sun .. 6=Sat) */
  days: number[];
  startTime: string;
  endTime: string;
  roomName: string;
  minutesPerWeek: number;
  learners: number;
  /** "" for a whole-year row, else e.g. "T3 only" (198). */
  termsLabel: string;
}

export interface TeacherSubjects {
  teacherId: string;
  teacherName: string;
  rows: SubjectHandledRow[];
  totalMinutesPerWeek: number;
}

const DAY_LABELS = ["Sun", "M", "T", "W", "Th", "F", "Sat"];

/** "M,W,F" from [1,3,5]. */
export function formatDays(days: number[]): string {
  return (days || [])
    .filter((d) => d >= 0 && d < 7)
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d])
    .join(",");
}

/** "07:30" from "07:30:00". */
export function formatTime(t: string): string {
  const [h, m] = (t || "").split(":");
  if (!h) return "";
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m ?? "00"} ${suffix}`;
}

interface ScheduleQueryRow {
  id: number;
  teacher_id: number | null; // NULL = "Temporary" schedule, no teacher assigned
  section_id: number;
  days_of_week: number[] | null;
  start_time: string;
  end_time: string;
  grading_periods: number[] | null;
  sms_subjects: { name: string } | null;
  sms_sections: { name: string; grade_level: number } | null;
  sms_rooms: { name: string } | null;
  sms_users: { name: string; is_active: boolean | null } | null;
}

/**
 * Fetches every scheduled subject for one school/school year, grouped by
 * teacher. Teachers with no schedule for the year are omitted. Only rows that
 * apply in `gradingPeriod` are listed (198).
 */
export async function fetchSubjectsHandled(
  schoolId: string | number,
  schoolYear: string,
  gradingPeriod = 1,
): Promise<TeacherSubjects[]> {
  const { data, error } = await supabase
    .from("sms_subject_schedules")
    .select(
      `id, teacher_id, section_id, days_of_week, start_time, end_time, grading_periods,
       sms_subjects ( name ),
       sms_sections ( name, grade_level ),
       sms_rooms ( name ),
       sms_users ( name, is_active )`,
    )
    .eq("school_id", schoolId)
    .eq("school_year", schoolYear);

  if (error) throw error;
  const schedules = ((data ?? []) as unknown as ScheduleQueryRow[]).filter((s) =>
    scheduleCoversPeriod(s.grading_periods, gradingPeriod),
  );
  if (schedules.length === 0) return [];

  // Learner counts per section in one batched query rather than per row.
  const sectionIds = Array.from(
    new Set(schedules.map((s) => Number(s.section_id))),
  );
  const { data: enrollments } = await supabase
    .from("sms_enrollments")
    .select("section_id")
    .in("section_id", sectionIds)
    .eq("school_year", schoolYear)
    .eq("status", "approved");

  const learnersBySection = new Map<string, number>();
  enrollments?.forEach((e) => {
    const sid = String(e.section_id);
    learnersBySection.set(sid, (learnersBySection.get(sid) || 0) + 1);
  });

  const periods = getGradingPeriods(schoolYear);
  const byTeacher = new Map<string, TeacherSubjects>();
  schedules.forEach((sch) => {
    // Temporary schedule (no teacher yet) is handled by nobody
    if (sch.teacher_id == null) return;
    // Inactive staff (set Inactive on /staff) are left off the report
    if (sch.sms_users?.is_active === false) return;
    const teacherId = String(sch.teacher_id);
    const days = sch.days_of_week || [];
    const duration = timeToMinutes(sch.end_time) - timeToMinutes(sch.start_time);
    const minutesPerWeek = duration > 0 ? duration * days.length : 0;

    if (!byTeacher.has(teacherId)) {
      byTeacher.set(teacherId, {
        teacherId,
        teacherName: sch.sms_users?.name || "Unknown",
        rows: [],
        totalMinutesPerWeek: 0,
      });
    }
    const group = byTeacher.get(teacherId)!;
    group.rows.push({
      scheduleId: String(sch.id),
      subjectName: sch.sms_subjects?.name || "—",
      gradeLevel: sch.sms_sections?.grade_level ?? 0,
      sectionId: String(sch.section_id),
      sectionName: sch.sms_sections?.name || "—",
      days,
      startTime: sch.start_time,
      endTime: sch.end_time,
      roomName: sch.sms_rooms?.name || "—",
      minutesPerWeek,
      learners: learnersBySection.get(String(sch.section_id)) || 0,
      termsLabel: formatScheduleTerms(sch.grading_periods, periods),
    });
    group.totalMinutesPerWeek += minutesPerWeek;
  });

  return Array.from(byTeacher.values())
    .map((g) => ({
      ...g,
      rows: g.rows.sort(
        (a, b) =>
          a.gradeLevel - b.gradeLevel ||
          a.sectionName.localeCompare(b.sectionName) ||
          a.startTime.localeCompare(b.startTime),
      ),
    }))
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName));
}
