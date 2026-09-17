"use client";

import { useAppSelector } from "@/lib/redux/hook";
import {
  fetchSchoolCalendar,
  isCalendarUnset,
} from "@/lib/utils/schoolCalendar";
import { CalendarOff } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

/**
 * Shown where a school-day count is being derived from a school year that has
 * no calendar entries at all (migration 125).
 *
 * `resolveDay` falls back to "every Mon–Fri is a full class day" when nothing
 * covers a date, which is the right way for a calendar outage to degrade but is
 * invisible when the calendar was simply never set up: a June that opened on
 * the 8th reports 22 class days, August counts National Heroes Day, and SF2's
 * *No. of Days of Classes* and the report card inherit both. The count is still
 * produced — nothing is blocked — but the surface says where the number came
 * from.
 *
 * Who can act on it differs, so the message does: the roles migration 125's
 * write policies admit get a link to the page, and everyone else — a teacher,
 * who cannot reach School Settings at all — is told who to ask.
 */

/** The roles migration 125's INSERT policy admits, school-scoped or division. */
const CALENDAR_WRITE_ROLES = [
  "division_admin",
  "division_type",
  "super admin",
  "school_head",
  "assistant_school_head",
  "admin",
  "registrar",
];

export function SchoolCalendarNotice({
  schoolYear,
  className = "",
}: {
  schoolYear: string;
  className?: string;
}) {
  const userType = useAppSelector((state) => state.user.user?.type);
  const canManage = CALENDAR_WRITE_ROLES.includes(userType ?? "");

  return (
    <div
      className={`flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200 ${className}`}
    >
      <CalendarOff className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        <p>
          <span className="font-medium">
            No School Calendar entries for {schoolYear}.
          </span>{" "}
          Every weekday is being counted as a class day — including holidays and
          the days before classes opened. Class-day totals here, on SF2 and on
          the report card will read high until the calendar is set.
        </p>
        {canManage ? (
          <Link
            href="/settings/calendar"
            className="inline-block font-medium underline underline-offset-2"
          >
            Set the School Calendar
          </Link>
        ) : (
          <p>
            Ask your school head or registrar to set it in School Settings →
            School Calendar.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The same warning for a surface with nowhere to put a banner — a print action
 * behind a dropdown item. Advisory only: it never stops the print, because a
 * card with an approximate attendance block is still the card the adviser needs
 * today, and the count is wrong in the school's favour rather than silently
 * absent.
 */
export async function warnIfCalendarUnset(
  schoolId: string | number | null | undefined,
  schoolYear: string,
): Promise<void> {
  const entries = await fetchSchoolCalendar(schoolId, schoolYear);
  if (!isCalendarUnset(entries)) return;
  toast(
    `No School Calendar entries for ${schoolYear} — attendance on this form counts every weekday as a class day.`,
    { icon: "\u26A0\uFE0F", duration: 6000 },
  );
}
