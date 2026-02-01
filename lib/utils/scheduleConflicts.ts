import { SubjectSchedule } from "@/types";

export interface ScheduleConflict {
  type: "room" | "teacher" | "section";
  message: string;
  conflictingSchedule?: SubjectSchedule;
}

/**
 * Check if two time ranges overlap
 * @param start1 Start time of first range (HH:mm format)
 * @param end1 End time of first range (HH:mm format)
 * @param start2 Start time of second range (HH:mm format)
 * @param end2 End time of second range (HH:mm format)
 * @returns true if the time ranges overlap
 */
export function isTimeOverlapping(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
): boolean {
  // Convert HH:mm to minutes for easier comparison
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const start1Minutes = timeToMinutes(start1);
  const end1Minutes = timeToMinutes(end1);
  const start2Minutes = timeToMinutes(start2);
  const end2Minutes = timeToMinutes(end2);

  // Check if ranges overlap: start1 < end2 AND end1 > start2
  return start1Minutes < end2Minutes && end1Minutes > start2Minutes;
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

/**
 * Check for schedule conflicts
 * @param schedule The schedule to check
 * @param existingSchedules Array of existing schedules to check against
 * @param excludeId Optional ID to exclude from conflict check (for updates)
 * @returns Array of conflict objects
 */
export function checkScheduleConflicts(
  schedule: {
    room_id: string;
    teacher_id: string;
    section_id: string;
    days_of_week: number[];
    start_time: string;
    end_time: string;
    school_year: string;
  },
  existingSchedules: SubjectSchedule[],
  excludeId?: string,
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  // Filter out the schedule being updated
  const schedulesToCheck = excludeId
    ? existingSchedules.filter((s) => s.id !== excludeId)
    : existingSchedules;

  // Filter to same school year
  const sameYearSchedules = schedulesToCheck.filter(
    (s) => s.school_year === schedule.school_year,
  );

  for (const existing of sameYearSchedules) {
    // Check if days overlap
    if (!hasCommonDays(schedule.days_of_week, existing.days_of_week)) {
      continue; // No common days, no conflict
    }

    // Check if times overlap
    if (
      !isTimeOverlapping(
        schedule.start_time,
        schedule.end_time,
        existing.start_time,
        existing.end_time,
      )
    ) {
      continue; // Times don't overlap, no conflict
    }

    // Check room conflict
    if (existing.room_id === schedule.room_id) {
      conflicts.push({
        type: "room",
        message: `Room is already scheduled at this time on ${formatDays(
          existing.days_of_week,
        )}`,
        conflictingSchedule: existing,
      });
    }

    // Check teacher conflict
    if (existing.teacher_id === schedule.teacher_id) {
      conflicts.push({
        type: "teacher",
        message: `Teacher is already scheduled at this time on ${formatDays(
          existing.days_of_week,
        )}`,
        conflictingSchedule: existing,
      });
    }

    // Check section conflict
    if (existing.section_id === schedule.section_id) {
      conflicts.push({
        type: "section",
        message: `Section is already scheduled at this time on ${formatDays(
          existing.days_of_week,
        )}`,
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
