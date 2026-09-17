/**
 * Philippine national holidays, as a starting point for a school year's
 * calendar (migration 125).
 *
 * The calendar is the authoritative school-day denominator for the attendance
 * grid, SF2's "No. of Days of Classes" and report card attendance, and with no
 * entry for a date every weekday counts as a full class day. Typing the same
 * fifteen national holidays into every school every June is what kept that
 * happening, so this generates them.
 *
 * **A starting point, never the authority.** The exact dates each year are
 * fixed by presidential proclamation, which routinely moves an observance to
 * the nearest Monday, adds a special non-working day for an election or a papal
 * visit, and drops one that fell out of favour. The seeder therefore only ever
 * ADDS dates a school has not already covered and never edits or deletes an
 * entry — the school head reconciles the list against that year's proclamation
 * and the DepEd school calendar memo, and a wrong row is removed like any other.
 *
 * **Eid'l Fitr and Eid'l Adha are deliberately absent.** Both are regular
 * holidays, but they follow the Islamic lunar calendar and their civil dates
 * are proclaimed only weeks ahead on the sighting of the moon — there is no
 * formula to put them here, and guessing at one would write a wrong date into
 * a denominator that feeds a signed form. They are entered by hand.
 *
 * Holy Week is the one movable set that IS computable: Maundy Thursday, Good
 * Friday and Black Saturday hang off Western (Gregorian) Easter, which the
 * Philippines observes.
 */

/** Regular holidays are the ones fixed by statute; the rest are proclaimed. */
export type HolidayKind = "regular" | "special";

export interface HolidaySeed {
  /** YYYY-MM-DD */
  date: string;
  title: string;
  kind: HolidayKind;
}

function isoOf(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function iso(year: number, month: number, day: number): string {
  return isoOf(new Date(year, month - 1, day));
}

/** Easter Sunday (Meeus/Jones/Butcher, Gregorian). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function shift(from: Date, days: number): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
}

/** National Heroes Day is the last Monday of August, not a fixed date. */
function lastMondayOfAugust(year: number): Date {
  const aug31 = new Date(year, 7, 31);
  // getDay(): 0 = Sunday. Rebase so Monday = 0, then step back that many days.
  return new Date(year, 7, 31 - ((aug31.getDay() + 6) % 7));
}

/** Every national holiday of one calendar year, in date order. */
export function philippineHolidaysForYear(year: number): HolidaySeed[] {
  const easter = easterSunday(year);

  const seeds: HolidaySeed[] = [
    { date: iso(year, 1, 1), title: "New Year's Day", kind: "regular" },
    { date: isoOf(shift(easter, -3)), title: "Maundy Thursday", kind: "regular" },
    { date: isoOf(shift(easter, -2)), title: "Good Friday", kind: "regular" },
    { date: isoOf(shift(easter, -1)), title: "Black Saturday", kind: "special" },
    { date: iso(year, 4, 9), title: "Araw ng Kagitingan", kind: "regular" },
    { date: iso(year, 5, 1), title: "Labor Day", kind: "regular" },
    { date: iso(year, 6, 12), title: "Independence Day", kind: "regular" },
    { date: iso(year, 8, 21), title: "Ninoy Aquino Day", kind: "special" },
    { date: isoOf(lastMondayOfAugust(year)), title: "National Heroes Day", kind: "regular" },
    { date: iso(year, 11, 1), title: "All Saints' Day", kind: "special" },
    { date: iso(year, 11, 30), title: "Bonifacio Day", kind: "regular" },
    { date: iso(year, 12, 8), title: "Feast of the Immaculate Conception", kind: "special" },
    { date: iso(year, 12, 25), title: "Christmas Day", kind: "regular" },
    { date: iso(year, 12, 30), title: "Rizal Day", kind: "regular" },
    { date: iso(year, 12, 31), title: "Last Day of the Year", kind: "special" },
  ];

  return seeds.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Every national holiday falling inside a school year's window (June 1 of the
 * starting year through May 31 of the ending one), in date order.
 */
export function philippineHolidaysForSchoolYear(schoolYear: string): HolidaySeed[] {
  const [startYear, endYear] = schoolYear.split("-").map(Number);
  if (!startYear || !endYear) return [];

  const windowStart = iso(startYear, 6, 1);
  const windowEnd = iso(endYear, 5, 31);

  return [
    ...philippineHolidaysForYear(startYear),
    ...philippineHolidaysForYear(endYear),
  ]
    .filter((h) => h.date >= windowStart && h.date <= windowEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
}
