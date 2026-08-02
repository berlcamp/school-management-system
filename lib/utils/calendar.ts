/**
 * Calendar export for approved observation schedules.
 *
 * Two no-credential paths, deliberately chosen over a Google Calendar API
 * integration: the API route needs a Google Cloud project, an OAuth consent
 * screen, per-user token storage and refresh handling, none of which a school
 * can set up on its own.
 *
 *   1. An "Add to Google Calendar" TEMPLATE url — one click, opens the event
 *      pre-filled in the user's own calendar, works for any Google account.
 *   2. A downloadable .ics — the same event as a standards-compliant invite, so
 *      it also imports into Outlook, Apple Calendar and Google via file import,
 *      and can carry several events at once.
 *
 * Neither can silently write to someone else's calendar, which is why the
 * schedule board tracks `calendar_exported_at` as advisory only.
 */

export interface CalendarEvent {
  /** Stable identifier — used as the .ics UID so re-imports update, not duplicate. */
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  /** Defaults to one hour after `start` when omitted. */
  end?: Date | null;
}

const HOUR_MS = 60 * 60 * 1000;

function eventEnd(event: CalendarEvent): Date {
  return event.end ?? new Date(event.start.getTime() + HOUR_MS);
}

/** UTC basic format: 20260713T002000Z — what both Google and iCalendar want. */
function toUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * A one-click "Add to Google Calendar" url. Google renders the event form
 * pre-filled; the user still confirms, so nothing is written without consent.
 */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toUtcStamp(event.start)}/${toUtcStamp(eventEnd(event))}`,
  });
  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Escape a value for an iCalendar text field. Order matters: the backslash must
 * be escaped first or it would double-escape the sequences added after it.
 */
function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a content line to the 75-octet limit RFC 5545 imposes. Long DESCRIPTION
 * lines are the usual cause of an .ics that Outlook silently refuses.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

/** A VCALENDAR document holding one or more events. */
export function buildIcs(events: CalendarEvent[], stamp: Date = new Date()): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SMS//Instructional Supervision//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsEscape(event.uid)}`,
      `DTSTAMP:${toUtcStamp(stamp)}`,
      `DTSTART:${toUtcStamp(event.start)}`,
      `DTEND:${toUtcStamp(eventEnd(event))}`,
      `SUMMARY:${icsEscape(event.title)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
    if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  // CRLF line endings are required by RFC 5545, not merely conventional.
  return lines.map(foldLine).join("\r\n");
}

/** Trigger a browser download of the given events as one .ics file. */
export function downloadIcs(events: CalendarEvent[], filename: string): void {
  const blob = new Blob([buildIcs(events)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
