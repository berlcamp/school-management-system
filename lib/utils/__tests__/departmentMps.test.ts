import { describe, expect, it } from "vitest";
import {
  buildCoverage,
  coverageTotals,
  periodColumns,
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
