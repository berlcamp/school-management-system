import { describe, expect, it } from "vitest";
import {
  buildCoverage,
  coverageTotals,
  filterCoverageRows,
  periodColumns,
  resolveCurrentPeriod,
  type CoverageRow,
} from "@/lib/utils/departmentMps";
import type { MpsGroup } from "@/lib/utils/mpsAggregate";

const sched = (over: Partial<Parameters<typeof buildCoverage>[0]["schedules"][number]> = {}) => ({
  subject_id: "5",
  subject_name: "Mathematics",
  grade_level: 7,
  section_id: "100",
  section_name: "7-A",
  teacher_name: "Ana" as string | null,
  ...over,
});
const group = (over: Partial<MpsGroup> = {}): MpsGroup => ({
  subjectName: "Mathematics",
  subjectId: "5",
  sectionId: "100",
  gradeLevel: 7,
  period: 1,
  mps: 80,
  ...over,
});

describe("periodColumns", () => {
  it("is three terms from 2026-2027", () => {
    expect(periodColumns("2026-2027").map((c) => c.label)).toEqual(["Term 1", "Term 2", "Term 3"]);
  });
  it("is four quarters before that", () => {
    expect(periodColumns("2025-2026").map((c) => c.label)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
  });
});

describe("buildCoverage", () => {
  const base = { schoolYear: "2026-2027", currentPeriod: 3 };

  it("collapses schedule blocks of one subject+section into one row, listing each teacher once", () => {
    const rows = buildCoverage({
      ...base,
      mps: [],
      schedules: [sched(), sched(), sched({ teacher_name: "Ben" })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].teachers).toEqual(["Ana", "Ben"]);
  });

  it("ignores null teacher names", () => {
    const rows = buildCoverage({ ...base, mps: [], schedules: [sched({ teacher_name: null })] });
    expect(rows[0].teachers).toEqual([]);
  });

  it("matches by name + grade when the group has no subjectId", () => {
    const rows = buildCoverage({
      ...base,
      schedules: [sched()],
      mps: [group({ subjectId: null, mps: 71 })],
    });
    expect(rows[0].cells[1]).toBe(71);
  });

  it("does not match a null-subjectId group of a different grade", () => {
    const rows = buildCoverage({
      ...base,
      schedules: [sched()],
      mps: [group({ subjectId: null, gradeLevel: 8 })],
    });
    expect(rows[0].cells[1]).toBe("missing");
  });

  it("does not match another section", () => {
    const rows = buildCoverage({ ...base, schedules: [sched()], mps: [group({ sectionId: "999" })] });
    expect(rows[0].cells[1]).toBe("missing");
  });

  it("marks encoded, missing and future periods", () => {
    const rows = buildCoverage({
      schoolYear: "2026-2027",
      currentPeriod: 2,
      schedules: [sched()],
      mps: [group({ period: 1, mps: 84 })],
    });
    expect(rows[0].cells).toEqual({ 1: 84, 2: "missing", 3: "future" });
  });
});

describe("coverageTotals", () => {
  const row = (cells: CoverageRow["cells"], id: string): CoverageRow => ({
    subjectId: "5",
    subjectName: "Mathematics",
    gradeLevel: 7,
    sectionId: id,
    sectionName: id,
    teachers: [],
    cells,
  });
  it("counts encoded, expected and missing for a period", () => {
    const rows = [row({ 1: 80 }, "a"), row({ 1: 90 }, "b"), row({ 1: "missing" }, "c")];
    expect(coverageTotals(rows, 1)).toEqual({ encoded: 2, expected: 3, missing: 1, average: 85 });
  });
  it("leaves future periods out of expected and average is null when nothing is encoded", () => {
    const rows = [row({ 3: "future" }, "a")];
    expect(coverageTotals(rows, 3)).toEqual({ encoded: 0, expected: 0, missing: 0, average: null });
  });
});


describe("resolveCurrentPeriod", () => {
  const dates = { term2_start: "2026-09-14", term3_start: "2026-12-07" };
  const sy = "2026-2027";
  it("handles past and future years", () => {
    const d = new Date(2026, 9, 21);
    expect(resolveCurrentPeriod("2025-2026", sy, d, dates)).toBe(4);
    expect(resolveCurrentPeriod("2027-2028", sy, d, dates)).toBe(1);
  });
  it("uses stored term dates in the current year", () => {
    expect(resolveCurrentPeriod(sy, sy, new Date(2026, 8, 13), dates)).toBe(1);
    expect(resolveCurrentPeriod(sy, sy, new Date(2026, 8, 14), dates)).toBe(2);
    expect(resolveCurrentPeriod(sy, sy, new Date(2026, 11, 6), dates)).toBe(2);
    expect(resolveCurrentPeriod(sy, sy, new Date(2026, 11, 7), dates)).toBe(3);
  });
  it("falls back to calendar months in the current term-based year without dates", () => {
    expect(resolveCurrentPeriod(sy, sy, new Date(2026, 5, 15), null)).toBe(1);
    expect(resolveCurrentPeriod(sy, sy, new Date(2026, 7, 31), null)).toBe(1);
    expect(resolveCurrentPeriod(sy, sy, new Date(2026, 8, 1), null)).toBe(2);
    expect(resolveCurrentPeriod(sy, sy, new Date(2026, 9, 21), null)).toBe(2);
    expect(resolveCurrentPeriod(sy, sy, new Date(2026, 11, 31), null)).toBe(2);
    expect(resolveCurrentPeriod(sy, sy, new Date(2027, 0, 4), null)).toBe(3);
    expect(resolveCurrentPeriod(sy, sy, new Date(2027, 4, 31), null)).toBe(3);
    // Before June of the start year the new year has not reached Term 2.
    expect(resolveCurrentPeriod(sy, sy, new Date(2026, 4, 20), null)).toBe(1);
  });
  it("keeps the last column for past years and quarter-based years without dates", () => {
    expect(resolveCurrentPeriod("2026-2027", "2027-2028", new Date(2027, 9, 1), null)).toBe(3);
    expect(resolveCurrentPeriod("2024-2025", "2024-2025", new Date(2024, 6, 1), null)).toBe(4);
  });
});

describe("filterCoverageRows", () => {
  const row = (id: string, cell: "missing" | number): CoverageRow => ({
    subjectId: id, subjectName: id, gradeLevel: 7, sectionId: "1", sectionName: "A",
    teachers: [], cells: { 1: cell },
  });
  it("filters by subject and missing", () => {
    const rows = [row("1", 80), row("2", "missing")];
    expect(filterCoverageRows(rows, { subjectId: "", missingOnly: true })).toHaveLength(1);
    expect(filterCoverageRows(rows, { subjectId: "1", missingOnly: false })).toHaveLength(1);
  });
});
