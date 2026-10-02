import { describe, expect, it } from "vitest";
import {
  formatScheduleTerms,
  normaliseScheduleTerms,
  scheduleCoversPeriod,
  scheduleTermsOverlap,
} from "../scheduleTerms";
import { getGradingPeriods } from "../schoolYear";

const TERMS = getGradingPeriods("2026-2027"); // T1..T3
const QUARTERS = getGradingPeriods("2025-2026"); // Q1..Q4

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
