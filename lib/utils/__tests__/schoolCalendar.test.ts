import { describe, expect, it } from "vitest";
import {
  countSchoolDays,
  getCalendarDaysInMonth,
  getSchoolDaysInMonth,
  resolveDay,
  SchoolCalendarDay,
} from "@/lib/utils/schoolCalendar";

const entry = (o: Partial<SchoolCalendarDay>): SchoolCalendarDay => ({
  id: "1",
  school_id: "1",
  school_year: "2026-2027",
  start_date: "2026-08-03",
  end_date: "2026-08-03",
  day_type: "holiday",
  period: "whole",
  title: "test",
  ...o,
});

describe("resolveDay", () => {
  it("treats an ordinary weekday as a full class day", () => {
    const d = resolveDay([], "2026-08-05"); // Wednesday
    expect(d).toMatchObject({ am: true, pm: true });
  });

  it("treats a weekend as no class", () => {
    expect(resolveDay([], "2026-08-08")).toMatchObject({ am: false, pm: false }); // Saturday
  });

  it("closes both sessions on a whole-day holiday", () => {
    const d = resolveDay([entry({ start_date: "2026-08-05", end_date: "2026-08-05" })], "2026-08-05");
    expect(d).toMatchObject({ am: false, pm: false });
    expect(d.reason?.title).toBe("test");
  });

  it("closes only the PM on an afternoon suspension", () => {
    const d = resolveDay(
      [entry({ start_date: "2026-08-05", end_date: "2026-08-05", day_type: "suspension", period: "pm" })],
      "2026-08-05"
    );
    expect(d).toMatchObject({ am: true, pm: false });
  });

  it("applies a multi-day range to every date inside it, inclusive", () => {
    const week = [entry({ start_date: "2026-08-03", end_date: "2026-08-14", day_type: "no_class" })];
    expect(resolveDay(week, "2026-08-03")).toMatchObject({ am: false, pm: false }); // first day
    expect(resolveDay(week, "2026-08-14")).toMatchObject({ am: false, pm: false }); // last day
    expect(resolveDay(week, "2026-08-17")).toMatchObject({ am: true, pm: true }); // after
    expect(resolveDay(week, "2026-07-31")).toMatchObject({ am: true, pm: true }); // before
  });

  it("lets a class_day override a holiday covering the same date", () => {
    const rows = [
      entry({ start_date: "2026-08-05", end_date: "2026-08-05", school_id: null }),
      entry({ id: "2", start_date: "2026-08-05", end_date: "2026-08-05", day_type: "class_day", title: "make-up" }),
    ];
    expect(resolveDay(rows, "2026-08-05")).toMatchObject({ am: true, pm: true });
  });

  it("puts a Saturday make-up class into the calendar", () => {
    const rows = [entry({ start_date: "2026-08-08", end_date: "2026-08-08", day_type: "class_day" })];
    expect(resolveDay(rows, "2026-08-08")).toMatchObject({ am: true, pm: true });
  });
});

describe("month helpers", () => {
  // August 2026: 21 weekdays (Aug 1 is a Saturday).
  it("counts every weekday when the calendar is empty", () => {
    const days = getSchoolDaysInMonth("2026-08", []);
    expect(days).toHaveLength(21);
    expect(countSchoolDays(days)).toBe(21);
  });

  it("drops the opening fortnight and one holiday", () => {
    const rows = [
      entry({ start_date: "2026-08-03", end_date: "2026-08-14", day_type: "no_class", title: "Enrolment" }),
      entry({ id: "2", start_date: "2026-08-21", end_date: "2026-08-21", title: "Ninoy Aquino Day" }),
    ];
    // 21 weekdays - 10 enrolment weekdays - 1 holiday = 10
    expect(countSchoolDays(getSchoolDaysInMonth("2026-08", rows))).toBe(10);
  });

  it("counts a half-day suspension as 0.5", () => {
    const rows = [
      entry({ start_date: "2026-08-05", end_date: "2026-08-05", day_type: "suspension", period: "pm" }),
    ];
    expect(countSchoolDays(getSchoolDaysInMonth("2026-08", rows))).toBe(20.5);
  });

  it("keeps closed weekdays as grid columns but not weekends", () => {
    const rows = [entry({ start_date: "2026-08-21", end_date: "2026-08-21" })];
    const grid = getCalendarDaysInMonth("2026-08", rows);
    expect(grid).toHaveLength(21); // all weekdays, holiday included
    expect(grid.find((d) => d.date === "2026-08-21")).toMatchObject({ am: false, pm: false });
    expect(grid.find((d) => d.date === "2026-08-08")).toBeUndefined(); // plain Saturday
  });

  it("adds a Saturday make-up to the grid", () => {
    const rows = [entry({ start_date: "2026-08-08", end_date: "2026-08-08", day_type: "class_day" })];
    const grid = getCalendarDaysInMonth("2026-08", rows);
    expect(grid).toHaveLength(22);
    expect(countSchoolDays(grid)).toBe(22);
  });
});
