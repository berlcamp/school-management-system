/**
 * Teaching load calculation shared by the School Dashboard widget and the
 * Reports module's "Teaching Load (minutes per day)" report.
 *
 * DepEd counts a teacher's weekly load as actual class minutes (from the
 * subject schedule) plus fixed equivalents for ancillary assignments.
 */

import { supabase } from "@/lib/supabase/client";

export interface TeacherLoad {
  teacherId: string;
  teacherName: string;
  /** Minutes of teaching load indexed by day-of-week (0=Sun .. 6=Sat). */
  minutes: number[];
  /** Number of sections this teacher advises (advisorship = 60 min/day × 5 days). */
  advisorySections: number;
  /** Number of ARAL groups assigned to this teacher (30 min/day × 5 days). */
  aralGroups: number;
}

// DepEd load equivalents (minutes per day) for ancillary assignments.
// Applied across the 5-day school week (Mon–Fri).
export const ADVISORSHIP_MINUTES_PER_DAY = 60;
export const ARAL_MINUTES_PER_DAY = 30;

/** School week shown in the teaching-load table (Mon–Fri). */
export const WEEKDAYS = [
  { idx: 1, label: "Mon" },
  { idx: 2, label: "Tue" },
  { idx: 3, label: "Wed" },
  { idx: 4, label: "Thu" },
  { idx: 5, label: "Fri" },
];

export const timeToMinutes = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Weekly advisorship / ARAL minutes = per-day rate × number of school days.
export const advisorshipWeeklyMinutes = (t: TeacherLoad): number =>
  t.advisorySections * ADVISORSHIP_MINUTES_PER_DAY * WEEKDAYS.length;

export const aralWeeklyMinutes = (t: TeacherLoad): number =>
  t.aralGroups * ARAL_MINUTES_PER_DAY * WEEKDAYS.length;

/** Total weekly load = teaching minutes (Mon–Fri) + advisorship + ARAL. */
export const teacherWeeklyTotal = (t: TeacherLoad): number =>
  WEEKDAYS.reduce((s, d) => s + (t.minutes[d.idx] || 0), 0) +
  advisorshipWeeklyMinutes(t) +
  aralWeeklyMinutes(t);

/**
 * Builds the per-teacher weekly load for one school and school year, sorted by
 * weekly total (heaviest first).
 *
 * Any teacher with a schedule, an advisory class, or an ARAL group appears —
 * a teacher can carry load without a single scheduled subject.
 *
 * Note: sms_aral_tutors carries no school_year (migration 102), so ARAL
 * equivalents reflect current assignments regardless of the year requested.
 */
export async function fetchTeacherLoads(
  schoolId: string | number,
  schoolYear: string,
): Promise<TeacherLoad[]> {
  // Names keyed by user id. Includes every staff type (not just teachers) so
  // ARAL tutors — who may be type "tutor" — resolve to a name.
  const teacherNames = new Map<string, string>();
  const { data: staffData } = await supabase
    .from("sms_users")
    .select("id, name")
    .eq("school_id", schoolId)
    .neq("type", "division_admin")
    .neq("type", "division_type");
  staffData?.forEach((u) => teacherNames.set(String(u.id), u.name));

  // Advisory sections for the requested year.
  const advisoryCountByTeacher = new Map<string, number>();
  const { data: sections } = await supabase
    .from("sms_sections")
    .select("section_adviser_id")
    .eq("school_id", Number(schoolId))
    .eq("school_year", schoolYear);
  sections?.forEach((s) => {
    if (!s.section_adviser_id) return;
    const aid = String(s.section_adviser_id);
    advisoryCountByTeacher.set(aid, (advisoryCountByTeacher.get(aid) || 0) + 1);
  });

  // Teaching minutes per weekday from the subject schedule.
  const { data: schedules } = await supabase
    .from("sms_subject_schedules")
    .select("teacher_id, days_of_week, start_time, end_time")
    .eq("school_id", schoolId)
    .eq("school_year", schoolYear);

  const loadMap = new Map<string, number[]>();
  schedules?.forEach((sch) => {
    const tid = String(sch.teacher_id);
    const duration = timeToMinutes(sch.end_time) - timeToMinutes(sch.start_time);
    if (duration <= 0) return;
    if (!loadMap.has(tid)) loadMap.set(tid, [0, 0, 0, 0, 0, 0, 0]);
    const arr = loadMap.get(tid)!;
    (sch.days_of_week || []).forEach((d: number) => {
      if (d >= 0 && d < 7) arr[d]! += duration;
    });
  });

  // ARAL assignments per teacher → ARAL load (30 min each).
  const { data: aralTutors } = await supabase
    .from("sms_aral_tutors")
    .select("user_id")
    .eq("school_id", Number(schoolId));
  const aralCountByTeacher = new Map<string, number>();
  aralTutors?.forEach((t) => {
    const uid = String(t.user_id);
    aralCountByTeacher.set(uid, (aralCountByTeacher.get(uid) || 0) + 1);
  });

  const teacherIdsWithLoad = new Set<string>([
    ...loadMap.keys(),
    ...advisoryCountByTeacher.keys(),
    ...aralCountByTeacher.keys(),
  ]);

  // Resolve any names the school-scoped staff query missed (e.g. an ARAL tutor
  // whose sms_users.school_id differs) by fetching them directly.
  const missingNameIds = Array.from(teacherIdsWithLoad).filter(
    (id) => !teacherNames.has(id),
  );
  if (missingNameIds.length > 0) {
    const { data: extraUsers } = await supabase
      .from("sms_users")
      .select("id, name")
      .in("id", missingNameIds.map(Number));
    extraUsers?.forEach((u) => teacherNames.set(String(u.id), u.name));
  }

  return Array.from(teacherIdsWithLoad)
    .map((teacherId) => ({
      teacherId,
      teacherName: teacherNames.get(teacherId) || "Unknown",
      minutes: loadMap.get(teacherId) || [0, 0, 0, 0, 0, 0, 0],
      advisorySections: advisoryCountByTeacher.get(teacherId) || 0,
      aralGroups: aralCountByTeacher.get(teacherId) || 0,
    }))
    .sort((a, b) => teacherWeeklyTotal(b) - teacherWeeklyTotal(a));
}
