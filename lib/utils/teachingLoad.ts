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

export interface TeacherLoadResult {
  loads: TeacherLoad[];
  /**
   * Load-carrying rows that point at a user who is not staff of this school —
   * a stale schedule or advisory row left behind by a reassigned teacher, or an
   * ARAL assignment linked to another school's account. Excluded from `loads`;
   * surfaced as a count so the stale rows can be cleaned up rather than hidden.
   */
  outsideStaffCount: number;
}

/**
 * Builds the per-teacher weekly load for one school and school year, sorted by
 * weekly total (heaviest first).
 *
 * Any teacher with a schedule, an advisory class, or an ARAL group appears —
 * a teacher can carry load without a single scheduled subject — **provided they
 * are staff of this school**. The three source queries are scoped by
 * `school_id`, but that scopes the *rows*, not who they point at: a teacher
 * reassigned to another school leaves their schedule and advisory rows behind,
 * and an ARAL assignment can be linked to an account belonging elsewhere. Such
 * a user would otherwise be listed here as though they taught at this school,
 * which is what a school head reported seeing. The Advisory widget on the same
 * dashboard has always applied this intersection; this is the same rule.
 *
 * Note: sms_aral_tutors carries no school_year (migration 102), so ARAL
 * equivalents reflect current assignments regardless of the year requested.
 */
export async function fetchTeacherLoads(
  schoolId: string | number,
  schoolYear: string,
): Promise<TeacherLoadResult> {
  // Names keyed by user id. Includes every staff type (not just teachers) so
  // ARAL tutors — who may be type "tutor" — resolve to a name. This map doubles
  // as the roster of who legitimately belongs to the school.
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
    // Temporary schedule (no teacher yet) counts toward nobody's load
    if (sch.teacher_id == null) return;
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

  // Only this school's own staff are listed. Anyone else carrying load here is
  // a stale row, counted so the dashboard can say so instead of silently
  // dropping it — an advisory class whose adviser has left still needs one.
  const ownStaffIds = Array.from(teacherIdsWithLoad).filter((id) =>
    teacherNames.has(id),
  );
  const outsideStaffCount = teacherIdsWithLoad.size - ownStaffIds.length;

  const loads = ownStaffIds
    .map((teacherId) => ({
      teacherId,
      teacherName: teacherNames.get(teacherId) || "Unknown",
      minutes: loadMap.get(teacherId) || [0, 0, 0, 0, 0, 0, 0],
      advisorySections: advisoryCountByTeacher.get(teacherId) || 0,
      aralGroups: aralCountByTeacher.get(teacherId) || 0,
    }))
    .sort((a, b) => teacherWeeklyTotal(b) - teacherWeeklyTotal(a));

  return { loads, outsideStaffCount };
}
