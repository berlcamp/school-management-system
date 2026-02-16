import { SubjectSchedule } from "@/types";

export interface ScheduleConflict {
  type: "room" | "teacher" | "section";
  message: string;
  conflictingSchedule?: SubjectSchedule;
}

/** Normalize time from HH:mm or HH:mm:ss to HH:mm for consistent comparison */
function normalizeTime(time: string): string {
  if (!time) return time;
  return time.split(":").slice(0, 2).join(":");
}

/**
 * Check if two time ranges overlap
 * @param start1 Start time of first range (HH:mm or HH:mm:ss format)
 * @param end1 End time of first range (HH:mm or HH:mm:ss format)
 * @param start2 Start time of second range (HH:mm or HH:mm:ss format)
 * @param end2 End time of second range (HH:mm or HH:mm:ss format)
 * @returns true if the time ranges overlap
 */
export function isTimeOverlapping(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
): boolean {
  const s1 = normalizeTime(start1);
  const e1 = normalizeTime(end1);
  const s2 = normalizeTime(start2);
  const e2 = normalizeTime(end2);

  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  };

  const start1Minutes = timeToMinutes(s1);
  const end1Minutes = timeToMinutes(e1);
  const start2Minutes = timeToMinutes(s2);
  const end2Minutes = timeToMinutes(e2);

  return start1Minutes < end2Minutes && end1Minutes > start2Minutes;
}

/** Normalize ID for comparison (handles string vs number from form vs DB) */
function normalizeId(id: string | number | undefined | null): string {
  if (id == null) return "";
  return String(id);
}

/**
 * Check if two day arrays have any common days
 * @param days1 First array of day numbers (0-6)
 * @param days2 Second array of day numbers (0-6)
 * @returns true if there's at least one common day
 */
export function hasCommonDays(days1: number[], days2: number[]): boolean {
  return days1.some((day) => days2.includes(day));
}

export interface ScheduleConflictLookups {
  rooms?: Array<{ id: string; name: string }>;
  teachers?: Array<{ id: string; name: string }>;
  sections?: Array<{ id: string; name: string }>;
}

/**
 * Check for schedule conflicts.
 * All criteria are checked: room, teacher, section, days of week, start/end time, school year.
 *
 * @param schedule The schedule to check
 * @param existingSchedules Array of existing schedules to check against
 * @param excludeId Optional ID to exclude from conflict check (for updates)
 * @param lookups Optional lookup maps for room/teacher/section names (enriches messages)
 * @returns Array of conflict objects
 */
export function checkScheduleConflicts(
  schedule: {
    room_id: string | number;
    teacher_id: string | number;
    section_id: string | number;
    days_of_week: number[];
    start_time: string;
    end_time: string;
    school_year: string;
  },
  existingSchedules: SubjectSchedule[],
  excludeId?: string,
  lookups?: ScheduleConflictLookups,
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  const scheduleRoomId = normalizeId(schedule.room_id);
  const scheduleTeacherId = normalizeId(schedule.teacher_id);
  const scheduleSectionId = normalizeId(schedule.section_id);
  const scheduleSchoolYear = schedule.school_year?.trim() ?? "";

  // Filter out the schedule being updated
  const schedulesToCheck = excludeId
    ? existingSchedules.filter((s) => String(s.id) !== String(excludeId))
    : existingSchedules;

  // Filter to same school year (required for conflict)
  const sameYearSchedules = schedulesToCheck.filter(
    (s) => (s.school_year ?? "").trim() === scheduleSchoolYear,
  );

  const getRoomName = (id: string) =>
    lookups?.rooms?.find((r) => normalizeId(r.id) === id)?.name ?? `Room ${id}`;
  const getTeacherName = (id: string) =>
    lookups?.teachers?.find((t) => normalizeId(t.id) === id)?.name ?? `Teacher ${id}`;
  const getSectionName = (id: string) =>
    lookups?.sections?.find((s) => normalizeId(s.id) === id)?.name ?? `Section ${id}`;

  for (const existing of sameYearSchedules) {
    const existingRoomId = normalizeId(existing.room_id);
    const existingTeacherId = normalizeId(existing.teacher_id);
    const existingSectionId = normalizeId(existing.section_id);

    // 1. Check days of week overlap
    if (!hasCommonDays(schedule.days_of_week, existing.days_of_week ?? [])) {
      continue;
    }

    // 2. Check start/end time overlap
    const existingStart = normalizeTime(existing.start_time ?? "");
    const existingEnd = normalizeTime(existing.end_time ?? "");
    const scheduleStart = normalizeTime(schedule.start_time);
    const scheduleEnd = normalizeTime(schedule.end_time);

    if (
      !isTimeOverlapping(scheduleStart, scheduleEnd, existingStart, existingEnd)
    ) {
      continue;
    }

    const daysStr = formatDays(existing.days_of_week ?? []);
    const timeStr = formatTimeRange(existingStart, existingEnd);
    const yearStr = existing.school_year ?? scheduleSchoolYear;

    // 3. Room conflict
    if (existingRoomId === scheduleRoomId) {
      conflicts.push({
        type: "room",
        message: `${getRoomName(existingRoomId)} is already in use on ${daysStr}, ${timeStr}, SY ${yearStr}`,
        conflictingSchedule: existing,
      });
    }

    // 4. Teacher conflict
    if (existingTeacherId === scheduleTeacherId) {
      conflicts.push({
        type: "teacher",
        message: `${getTeacherName(existingTeacherId)} is already scheduled on ${daysStr}, ${timeStr}, SY ${yearStr}`,
        conflictingSchedule: existing,
      });
    }

    // 5. Section conflict
    if (existingSectionId === scheduleSectionId) {
      conflicts.push({
        type: "section",
        message: `${getSectionName(existingSectionId)} is already scheduled on ${daysStr}, ${timeStr}, SY ${yearStr}`,
        conflictingSchedule: existing,
      });
    }
  }

  return conflicts;
}

/**
 * Format day numbers array to readable string
 * @param days Array of day numbers (0=Sunday, 1=Monday, ..., 6=Saturday)
 * @returns Formatted string like "Mon, Wed, Fri"
 */
export function formatDays(days: number[]): string {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days
    .sort()
    .map((day) => dayNames[day])
    .join(", ");
}

/**
 * Format time range for display
 * @param startTime Start time (HH:mm format)
 * @param endTime End time (HH:mm format)
 * @returns Formatted string like "08:30 - 10:15"
 */
export function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime} - ${endTime}`;
}

/**
 * Get day name from day number
 * @param day Day number (0-6)
 * @returns Day name
 */
export function getDayName(day: number): string {
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return dayNames[day] || "Unknown";
}
