import { supabase } from "@/lib/supabase/client";

/**
 * School calendar exceptions (migration 125).
 *
 * The single source of truth for "was there class on this date?", shared by the
 * monthly attendance grid, SF2 and the report card so the three can never
 * disagree about a learner's denominator.
 */

export type CalendarDayType = "holiday" | "no_class" | "suspension" | "class_day";
export type CalendarPeriod = "whole" | "am" | "pm";

export interface SchoolCalendarDay {
  id: string;
  /** NULL = division-wide, inherited by every school */
  school_id: string | null;
  school_year: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  day_type: CalendarDayType;
  period: CalendarPeriod;
  title: string;
}

export const CALENDAR_DAY_TYPE_LABELS: Record<CalendarDayType, string> = {
  holiday: "Holiday",
  no_class: "No classes",
  suspension: "Class suspension",
  class_day: "Class day (make-up)",
};

export const CALENDAR_PERIOD_LABELS: Record<CalendarPeriod, string> = {
  whole: "Whole day",
  am: "AM only",
  pm: "PM only",
};

/** A `class_day` entry declares that classes ARE held; everything else blocks. */
export function isBlockingType(type: CalendarDayType): boolean {
  return type !== "class_day";
}

/** Resolved state of one calendar date for one school. */
export interface ResolvedDay {
  date: string; // YYYY-MM-DD
  /** Classes held in the morning session */
  am: boolean;
  /** Classes held in the afternoon session */
  pm: boolean;
  /** Entry that closed the day (or opened it, for a make-up); undefined on an ordinary weekday */
  reason?: SchoolCalendarDay;
}

/** True when the day carries no session at all. */
export function isNonClassDay(day: ResolvedDay): boolean {
  return !day.am && !day.pm;
}

/** Sessions held on the day, as a day-count contribution (1, 0.5 or 0). */
export function sessionWeight(day: ResolvedDay): number {
  return (day.am ? 0.5 : 0) + (day.pm ? 0.5 : 0);
}

/**
 * Fetches the calendar in scope for one school: its own entries plus every
 * division-wide entry. Returns [] on error so a calendar outage degrades to the
 * old Mon–Fri behaviour rather than blanking out attendance entry.
 */
export async function fetchSchoolCalendar(
  schoolId: string | number | null | undefined,
  schoolYear: string
): Promise<SchoolCalendarDay[]> {
  let query = supabase
    .from("sms_school_calendar_days")
    .select("id, school_id, school_year, start_date, end_date, day_type, period, title")
    .eq("school_year", schoolYear)
    .order("start_date");

  // PostgREST `or` with a null check: division-wide rows plus this school's own.
  query =
    schoolId == null
      ? query.is("school_id", null)
      : query.or(`school_id.is.null,school_id.eq.${Number(schoolId)}`);

  const { data, error } = await query;
  if (error) {
    console.error("Failed to fetch school calendar:", error);
    return [];
  }
  return (data ?? []) as SchoolCalendarDay[];
}

function coversDate(entry: SchoolCalendarDay, date: string): boolean {
  // ISO dates compare correctly as strings; avoids Date's UTC-parsing traps.
  return entry.start_date <= date && date <= entry.end_date;
}

function appliesToSession(entry: SchoolCalendarDay, session: "am" | "pm"): boolean {
  return entry.period === "whole" || entry.period === session;
}

/**
 * Resolves one date against the calendar.
 *
 * Precedence, per session: a `class_day` entry covering the session wins over
 * any blocking entry (a make-up class held on a declared holiday, or a Saturday
 * session). Otherwise any blocking entry closes that session. With no entry at
 * all, Mon–Fri are class days and weekends are not.
 */
export function resolveDay(entries: SchoolCalendarDay[], date: string): ResolvedDay {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  const isWeekday = dow >= 1 && dow <= 5;

  const covering = entries.filter((e) => coversDate(e, date));
  const resolved: ResolvedDay = { date, am: isWeekday, pm: isWeekday };

  (["am", "pm"] as const).forEach((session) => {
    const applicable = covering.filter((e) => appliesToSession(e, session));
    const opener = applicable.find((e) => e.day_type === "class_day");
    if (opener) {
      resolved[session] = true;
      resolved.reason ??= opener;
      return;
    }
    const blocker = applicable.find((e) => isBlockingType(e.day_type));
    if (blocker) {
      resolved[session] = false;
      // A blocking reason is more useful to show than an opening one.
      if (!resolved.reason || resolved.reason.day_type === "class_day") {
        resolved.reason = blocker;
      }
    }
  });

  return resolved;
}

/**
 * Every date in the month that carries at least one session, resolved.
 *
 * Includes weekends when a `class_day` entry puts a make-up session on one, and
 * excludes weekdays closed by a holiday. This — not "count the weekdays" — is
 * the school-day denominator.
 */
export function getSchoolDaysInMonth(
  yearMonth: string, // YYYY-MM
  entries: SchoolCalendarDay[]
): ResolvedDay[] {
  const [year, month] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  const days: ResolvedDay[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${mm}-${String(d).padStart(2, "0")}`;
    const resolved = resolveDay(entries, date);
    if (resolved.am || resolved.pm) days.push(resolved);
  }
  return days;
}

/**
 * Every weekday of the month plus any weekend make-up day, resolved — including
 * the closed ones. The attendance grid renders these so an adviser can see
 * *why* a column is shaded instead of finding it silently missing.
 */
export function getCalendarDaysInMonth(
  yearMonth: string, // YYYY-MM
  entries: SchoolCalendarDay[]
): ResolvedDay[] {
  const [year, month] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  const days: ResolvedDay[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${mm}-${String(d).padStart(2, "0")}`;
    const dow = new Date(year, month - 1, d).getDay();
    const resolved = resolveDay(entries, date);
    const isWeekend = dow === 0 || dow === 6;
    // Weekends stay out of the grid unless a make-up class puts one there.
    if (isWeekend && !resolved.am && !resolved.pm) continue;
    days.push(resolved);
  }
  return days;
}

/** Number of school days in the month, counting a half-day suspension as 0.5. */
export function countSchoolDays(days: ResolvedDay[]): number {
  return days.reduce((sum, day) => sum + sessionWeight(day), 0);
}

/** Lookup keyed by date, for callers that resolve one day at a time. */
export function indexResolvedDays(days: ResolvedDay[]): Map<string, ResolvedDay> {
  return new Map(days.map((day) => [day.date, day]));
}

/** Short label for a shaded column, e.g. "Holiday — Bonifacio Day". */
export function describeDay(day: ResolvedDay): string {
  if (!day.reason) return "";
  const type = CALENDAR_DAY_TYPE_LABELS[day.reason.day_type];
  return day.reason.title ? `${type} — ${day.reason.title}` : type;
}
