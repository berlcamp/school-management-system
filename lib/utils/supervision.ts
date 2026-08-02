/**
 * Shared formatting and calendar helpers for the Instructional Supervision
 * module — used by both the School Head board and the teacher's own view.
 */
import {
  CAREER_STAGES,
  indicatorText,
  SUPERVISION_TYPE_LABELS,
  termLabel,
  type CareerStage,
} from "@/lib/constants/supervision";
import type { CalendarEvent } from "@/lib/utils/calendar";
import type { SupervisionSchedule } from "@/types";

/** "Jul 13, 2026, 8:20 AM" — the format used everywhere a slot is displayed. */
export function formatSlot(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Date only, e.g. "Jul 13, 2026". */
export function formatSlotDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Time only, e.g. "8:20 AM" — what the COT time fields print. */
export function formatSlotTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * A `<input type="date">` value for a timestamp, in LOCAL time.
 *
 * Not `iso.slice(0, 10)`: a 7:00 a.m. Manila observation is stored as the
 * previous day in UTC, so slicing the ISO string would date the COT form a day
 * early for every observation before 8:00 a.m.
 */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A `datetime-local` input value for an existing timestamp.
 *
 * Built from the LOCAL clock parts rather than `toISOString().slice(0,16)`,
 * which would silently shift the shown time by the UTC offset — an 8:20 a.m.
 * observation in Manila would come back as 12:20 a.m.
 */
export function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Inverse of `toDatetimeLocal`: local input value → ISO timestamp, or null. */
export function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export interface ScheduleEventContext {
  teacherName: string;
  observerNames: string[];
  schoolName?: string | null;
}

/**
 * The calendar event for an approved observation.
 *
 * The UID is derived from the schedule id so re-importing the .ics after a
 * reschedule updates the existing entry instead of leaving a stale duplicate.
 * When no end time was set, `buildIcs` / `googleCalendarUrl` default to one
 * hour, which matches the one-period slots the plans use.
 */
export function scheduleToCalendarEvent(
  schedule: SupervisionSchedule,
  context: ScheduleEventContext,
): CalendarEvent {
  const stage = CAREER_STAGES[schedule.career_stage as CareerStage];
  const lines = [
    `Teacher observed: ${context.teacherName}`,
    `Type: ${SUPERVISION_TYPE_LABELS[schedule.supervision_type]}`,
    `${termLabel(schedule.term)} · Observation ${schedule.observation_round}`,
    schedule.class_label ? `Class: ${schedule.class_label}` : "",
    context.observerNames.length
      ? `Observer/s: ${context.observerNames.join(", ")}`
      : "",
    schedule.focus_kra ? `Focus KRA: ${schedule.focus_kra}` : "",
    schedule.focus_indicator
      ? `Focus indicator: ${schedule.focus_indicator} — ${indicatorText(schedule.focus_indicator)}`
      : "",
    stage ? `COT scale: ${stage.minRating}–${stage.maxRating} (${stage.formLabel})` : "",
    schedule.pre_conference_at
      ? `Pre-conference: ${formatSlot(schedule.pre_conference_at)}`
      : "",
    schedule.notes ? `Notes: ${schedule.notes}` : "",
  ].filter(Boolean);

  return {
    uid: `supervision-${schedule.id}@sms.deped`,
    title: `Classroom Observation — ${context.teacherName}`,
    description: lines.join("\n"),
    location: context.schoolName ?? null,
    start: new Date(schedule.observation_at),
    end: schedule.observation_end_at ? new Date(schedule.observation_end_at) : null,
  };
}

/** The pre-conference as its own calendar event, when one was scheduled. */
export function preConferenceEvent(
  schedule: SupervisionSchedule,
  context: ScheduleEventContext,
): CalendarEvent | null {
  if (!schedule.pre_conference_at) return null;
  return {
    uid: `supervision-pre-${schedule.id}@sms.deped`,
    title: `Pre-Observation Conference — ${context.teacherName}`,
    description: [
      `Ahead of the classroom observation on ${formatSlot(schedule.observation_at)}.`,
      context.observerNames.length
        ? `Observer/s: ${context.observerNames.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    location: context.schoolName ?? null,
    start: new Date(schedule.pre_conference_at),
    end: null,
  };
}
