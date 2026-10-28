import { describe, expect, it } from "vitest";
import {
  formatScheduleTerms,
  normaliseScheduleTerms,
  periodsBefore,
  periodsFrom,
  scheduleTermOptions,
  scheduleCoversPeriod,
  scheduleTermsOverlap,
} from "../scheduleTerms";
const TERMS = scheduleTermOptions("2026-2027"); // T1..T3
const QUARTERS = scheduleTermOptions("2025-2026"); // Q1..Q4
const OLD_SHS = scheduleTermOptions("2026-2027", "old");

describe("normaliseScheduleTerms", () => {
  it("is null when nothing or everything is ticked", () => {
    expect(normaliseScheduleTerms([], [1, 2, 3])).toBeNull();
    expect(normaliseScheduleTerms([3, 1, 2], [1, 2, 3])).toBeNull();
  });
  it("sorts, de-duplicates and drops periods the section does not have", () => {
    expect(normaliseScheduleTerms([3, 1, 3, 4], [1, 2, 3])).toEqual([1, 3]);
  });
});

describe("scheduleCoversPeriod", () => {
  it("whole year covers every period", () => {
    expect(scheduleCoversPeriod(null, 2)).toBe(true);
    expect(scheduleCoversPeriod(undefined, 4)).toBe(true);
  });
  it("part year covers only its periods", () => {
    expect(scheduleCoversPeriod([3], 3)).toBe(true);
    expect(scheduleCoversPeriod([3], 1)).toBe(false);
  });
});

describe("scheduleTermsOverlap", () => {
  it("whole year overlaps everything", () => {
    expect(scheduleTermsOverlap(null, [3])).toBe(true);
    expect(scheduleTermsOverlap([1], undefined)).toBe(true);
  });
  it("disjoint terms do not overlap", () => {
    expect(scheduleTermsOverlap([1, 2], [3])).toBe(false);
    expect(scheduleTermsOverlap([1, 2], [2, 3])).toBe(true);
  });
});

describe("formatScheduleTerms", () => {
  it("is empty for the whole year", () => {
    expect(formatScheduleTerms(null, TERMS)).toBe("");
  });
  it("names a single period", () => {
    expect(formatScheduleTerms([3], TERMS)).toBe("T3 only");
  });
  it("joins a contiguous run with an en dash", () => {
    expect(formatScheduleTerms([1, 2], TERMS)).toBe("T1–T2");
    expect(formatScheduleTerms([2, 3, 4], QUARTERS)).toBe("Q2–Q4");
  });
  it("lists a broken run", () => {
    expect(formatScheduleTerms([1, 3], TERMS)).toBe("T1, T3");
  });
});

describe("scheduleTermOptions", () => {
  it("offers two semesters on the old SHS curriculum", () => {
    expect(OLD_SHS.map((o) => o.periods)).toEqual([[1, 2], [3, 4]]);
    expect(OLD_SHS.map((o) => o.label)).toEqual(["1st Semester", "2nd Semester"]);
  });
  it("offers one option per period otherwise", () => {
    expect(scheduleTermOptions("2026-2027", "strengthened").map((o) => o.short)).toEqual(["T1", "T2", "T3"]);
    expect(QUARTERS.map((o) => o.periods)).toEqual([[1], [2], [3], [4]]);
  });
});

describe("formatScheduleTerms with semesters", () => {
  it("names a semester", () => {
    expect(formatScheduleTerms([3, 4], OLD_SHS)).toBe("2nd Sem");
    expect(formatScheduleTerms([1, 2], OLD_SHS)).toBe("1st Sem");
  });
});

describe("periodsBefore / periodsFrom", () => {
  it("split the period list at a period", () => {
    expect(periodsBefore(3, [1, 2, 3])).toEqual([1, 2]);
    expect(periodsFrom(3, [1, 2, 3, 4])).toEqual([3, 4]);
  });
});
