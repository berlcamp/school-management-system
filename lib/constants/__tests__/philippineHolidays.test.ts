import { describe, expect, it } from "vitest";
import {
  philippineHolidaysForSchoolYear,
  philippineHolidaysForYear,
} from "@/lib/constants/philippineHolidays";

const dateOf = (holidays: { date: string; title: string }[], title: string) =>
  holidays.find((h) => h.title === title)?.date;

describe("philippineHolidaysForYear", () => {
  it("places the fixed-date holidays", () => {
    const h = philippineHolidaysForYear(2026);
    expect(dateOf(h, "New Year's Day")).toBe("2026-01-01");
    expect(dateOf(h, "Independence Day")).toBe("2026-06-12");
    expect(dateOf(h, "Bonifacio Day")).toBe("2026-11-30");
    expect(dateOf(h, "Rizal Day")).toBe("2026-12-30");
  });

  it("hangs Holy Week off Gregorian Easter", () => {
    // Easter 2026 is April 5; 2027 is March 28.
    const y26 = philippineHolidaysForYear(2026);
    expect(dateOf(y26, "Maundy Thursday")).toBe("2026-04-02");
    expect(dateOf(y26, "Good Friday")).toBe("2026-04-03");
    expect(dateOf(y26, "Black Saturday")).toBe("2026-04-04");

    const y27 = philippineHolidaysForYear(2027);
    expect(dateOf(y27, "Good Friday")).toBe("2027-03-26");
  });

  it("puts National Heroes Day on the last Monday of August", () => {
    expect(dateOf(philippineHolidaysForYear(2026), "National Heroes Day")).toBe(
      "2026-08-31", // a Monday
    );
    expect(dateOf(philippineHolidaysForYear(2027), "National Heroes Day")).toBe(
      "2027-08-30",
    );
  });

  it("returns them in date order", () => {
    const dates = philippineHolidaysForYear(2026).map((h) => h.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("leaves out the lunar holidays, which are proclaimed and not computable", () => {
    const titles = philippineHolidaysForYear(2026).map((h) => h.title);
    expect(titles.some((t) => t.includes("Eid"))).toBe(false);
  });
});

describe("philippineHolidaysForSchoolYear", () => {
  const sy = philippineHolidaysForSchoolYear("2026-2027");

  it("keeps only the June–May window of the school year", () => {
    const dates = sy.map((h) => h.date);
    expect(dates.every((d) => d >= "2026-06-01" && d <= "2027-05-31")).toBe(true);
    // The starting year's January is the PREVIOUS school year's.
    expect(dates).not.toContain("2026-01-01");
    expect(dates).toContain("2027-01-01");
    // Independence Day falls in the opening month, not the closing one.
    expect(dates).toContain("2026-06-12");
    expect(dates).not.toContain("2027-06-12");
  });

  it("covers both halves of the school year in one ordered list", () => {
    const dates = sy.map((h) => h.date);
    expect([...dates].sort()).toEqual(dates);
    expect(dateOf(sy, "Christmas Day")).toBe("2026-12-25");
    expect(dateOf(sy, "Labor Day")).toBe("2027-05-01");
  });
});
