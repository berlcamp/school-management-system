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

const encoder = new TextEncoder();

/** UTF-8 length. `"—".length` is 1 but it occupies 3 octets on the wire. */
function octets(value: string): number {
  return encoder.encode(value).length;
}

/**
 * Fold a content line to the 75-OCTET limit RFC 5545 imposes. Long DESCRIPTION
 * lines are the usual cause of an .ics that Outlook silently refuses.
 *
 * Counting by octets rather than by `String.length` is not pedantry here: the
 * descriptions this module builds are full of em dashes and middots, so a
 * 75-character line routinely runs to 90 octets. Splitting is done by code
 * point so a fold can never land inside a multi-byte sequence or between the
 * halves of a surrogate pair.
 */
function foldLine(line: string): string {
  if (octets(line) <= 75) return line;

  const parts: string[] = [];
  let current = "";
  // 75 for the first line; continuations spend one octet on the leading space.
  let limit = 75;

  for (const char of line) {
    if (octets(current) + octets(char) > limit) {
      parts.push(current);
      current = char;
      limit = 74;
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);

  return parts.map((p, i) => (i === 0 ? p : ` ${p}`)).join("\r\n");
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
  // CRLF line endings are required by RFC 5545, not merely conventional, and
  // every content line is terminated — including the last.
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
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
