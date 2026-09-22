import { ResolvedDay, sessionWeight } from "@/lib/utils/schoolCalendar";

/**
 * DepEd attendance scoring for one learner on one day.
 *
 * The AM/PM split (migration 044) records a session at a time, but the SF2 form
 * counts *days*: its legend marks a learner who missed one session as tardy
 * ("half shaded = Upper for Late Comer, Lower for Cutting Classes") and counts
 * them PRESENT for the whole day, with the tardiness carried as its own tally.
 *
 * Scoring the day as half present instead — which SF2 did until this module —
 * leaves Days Present + Days Absent short of the No. of Days of Classes by 0.5
 * for every tardy mark, and the missing half appears in no column on the sheet.
 *
 * The invariant this exists to hold: `present + absent === sessionWeight(day)`,
 * always, so a learner's two totals reconcile to the month's class-day count.
 */

/** One `sms_attendance` row, as the form reads it: true = that session attended. */
export interface SessionRecord {
  am: boolean;
  pm: boolean;
}

export interface DayScore {
  /** Sessions actually sat: 1, 0.5, or 0. Kept for reference, never totalled. */
  attended: number;
  /** Days credited present — a whole day even when only one session was sat. */
  present: number;
  /** Days credited absent — the whole day, only when no session was sat. */
  absent: number;
  /** 1 when some but not all of the day's sessions were sat. */
  tardy: number;
  /** Which session was missed, for the form's upper/lower half shading. */
  missed: "am" | "pm" | null;
}

/**
 * Scores one day.
 *
 * `record` undefined means no saved row, which the entry grid treats as present
 * for every session held — an adviser records absences only.
 */
export function scoreAttendanceDay(
  day: ResolvedDay,
  record: SessionRecord | undefined
): DayScore {
  const weight = sessionWeight(day);
  if (weight === 0) {
    return { attended: 0, present: 0, absent: 0, tardy: 0, missed: null };
  }

  // Sessions the school never held cannot be attended or missed, whatever a
  // stale row happens to say about them.
  const attended = record
    ? (day.am && record.am ? 0.5 : 0) + (day.pm && record.pm ? 0.5 : 0)
    : weight;

  if (attended === 0) {
    return { attended, present: 0, absent: weight, tardy: 0, missed: null };
  }
  if (attended < weight) {
    return {
      attended,
      present: weight,
      absent: 0,
      tardy: 1,
      missed: day.am && record && !record.am ? "am" : "pm",
    };
  }
  return { attended, present: weight, absent: 0, tardy: 0, missed: null };
}
